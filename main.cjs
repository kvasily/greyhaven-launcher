// The Greyhaven launcher (Electron). One window: first the launcher's own page (app/: news, the
// shard's status, Play), then the game itself, loaded from the shard (server/web.ts serves the
// built client on the shard's port), so a player always has the client the shard runs.
//  - The launcher keeps itself up to date from GitHub Releases (electron-updater): it checks on
//    start and every half hour, downloads a new version in the background (only the changed
//    parts), and shows an icon; it installs when you restart it (or next time it closes).
//  - The shard's address: shard.json, packed in. Players can't change it; a new address goes out
//    as a launcher update. (A settings.json an older launcher wrote is ignored.)
//  - Keys in the game: F11 full screen, Ctrl+Shift+L back to the launcher, Ctrl+R reload (Cmd on a
//    Mac).
//  - On a Mac the launcher isn't signed by Apple, and macOS only installs updates into signed apps:
//    there it finds an update the same way, and Play becomes Download, which opens the release page.
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

let autoUpdater = null
try { ({ autoUpdater } = require('electron-updater')) } catch { autoUpdater = null }

const LAUNCHER_PAGE = path.join(__dirname, 'app', 'index.html')
const DEFAULTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'shard.json'), 'utf8')) } catch { return { shard: 'http://localhost:2593' } } })()
// "name.playit.gg:12345" → "http://name.playit.gg:12345" (an origin, nothing after it).
function shardOrigin(address) {
  let text = String(address ?? '').trim()
  if (!text) throw new Error('Enter the shard address.')
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`
  const url = new URL(text)
  return url.origin
}
const SHARD = (() => { try { return shardOrigin(DEFAULTS.shard) } catch { return 'http://localhost:2593' } })()

const isMac = process.platform === 'darwin'
const RELEASES = DEFAULTS.releases || 'https://github.com/kvasily/greyhaven-launcher/releases/latest'
let win = null
let update = { state: app.isPackaged ? 'idle' : 'dev', version: null, percent: 0 }
const tell = () => { if (win && !win.isDestroyed()) win.webContents.send('launcher:update', update) }
const inGame = () => !!win && !win.isDestroyed() && win.webContents.getURL().startsWith('http')

function openLauncher(query) {
  if (!win || win.isDestroyed()) return
  void win.loadFile(LAUNCHER_PAGE, query ? { query } : undefined)
  // Back from the game: look for a launcher update now (it must be installed before Play).
  void checkForUpdates()
}
// The game sends you back here (src/updates.ts) when it was updated or the shard restarts for an
// update: it goes to <shard>/__launcher?reason=…, which never loads.
const BACK = { update: 'Greyhaven has been updated. Press Play to load the new version.', restart: 'Greyhaven is restarting for an update. Play opens again as soon as the shard is back.' }
function openGame() {
  if (win && !win.isDestroyed()) void win.loadURL(`${SHARD}/`)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600, show: false,
    title: 'Greyhaven', backgroundColor: '#101417', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  // (A Mac needs its app menu for Quit, Hide and copy and paste; elsewhere no menu at all.)
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }]) : null)
  win.once('ready-to-show', () => win.show())
  // Only the launcher's page and the shard's own pages open here; anything else goes to the browser.
  const allowed = url => url.startsWith('file:') || (() => { try { return new URL(url).origin === SHARD } catch { return false } })()
  win.webContents.on('will-navigate', (event, url) => {
    const back = (() => { try { const u = new URL(url); return u.origin === SHARD && u.pathname === '/__launcher' ? u.searchParams.get('reason') : null } catch { return null } })()
    if (back !== null) { event.preventDefault(); openLauncher({ notice: BACK[back] ?? BACK.update }); return }
    if (!allowed(url)) { event.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url) }
  })
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  // The shard unreachable when Play is pressed: back to the launcher, saying so.
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || !/^https?:/.test(url) || code === -3) return
    void win.loadFile(LAUNCHER_PAGE, { query: { error: `Could not reach the shard (${description}).` } })
  })
  // The shard answered, but with an error page (a 403, a 404 for a missing build): back, saying so.
  win.webContents.on('did-navigate', (_event, url, code) => {
    if (/^https?:/.test(url) && code >= 400) void win.loadFile(LAUNCHER_PAGE, { query: { error: `The shard answered ${code} for the game page.` } })
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = isMac ? input.meta : input.control
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault() }
    else if (mod && input.shift && input.key.toLowerCase() === 'l' && inGame()) { openLauncher(); event.preventDefault() }
    else if (mod && !input.shift && input.key.toLowerCase() === 'r') { win.webContents.reload(); event.preventDefault() }
    else if (mod && input.shift && input.key.toLowerCase() === 'i' && !app.isPackaged) { win.webContents.toggleDevTools(); event.preventDefault() }
  })
  void win.loadFile(LAUNCHER_PAGE)
}

// What the launcher's page asks for (preload.cjs).
ipcMain.handle('launcher:info', () => ({ version: app.getVersion(), shard: SHARD, update }))
ipcMain.handle('launcher:status', async () => {
  try {
    const response = await fetch(`${SHARD}/status`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (!response.ok) return { online: false, error: `The shard answered ${response.status}.` }
    return await response.json()
  } catch (error) {
    return { online: false, error: error && error.name === 'TimeoutError' ? 'The shard did not answer.' : 'The shard is offline.' }
  }
})
ipcMain.handle('launcher:play', () => { openGame() })
ipcMain.handle('launcher:restart', () => { if (autoUpdater && update.state === 'ready') autoUpdater.quitAndInstall(false, true) })
ipcMain.handle('launcher:check', () => { void checkForUpdates() })
// A Mac's update: the release page, to download the new launcher.
ipcMain.handle('launcher:download', () => { void shell.openExternal(RELEASES) })

// Updates of the launcher itself (GitHub Releases, package.json "build.publish").
async function checkForUpdates() {
  if (!autoUpdater || !app.isPackaged || update.state === 'downloading' || update.state === 'ready') return
  try { await autoUpdater.checkForUpdates() } catch (error) { failed(error) }
}
// What went wrong, for the page (hover the version) and for updater.log in the launcher's
// data folder (%APPDATA%\Greyhaven), with everything electron-updater says.
const logFile = () => path.join(app.getPath('userData'), 'updater.log')
function log(level, ...parts) {
  try { fs.appendFileSync(logFile(), `${new Date().toISOString()} ${level} ${parts.map(p => p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`) } catch { /* no log */ }
}
function failed(error) {
  log('error', error)
  if (update.state !== 'ready') { update = { ...update, state: 'error', error: String(error && error.message || error).split('\n')[0].slice(0, 300) }; tell() }
}
function watchUpdates() {
  if (!autoUpdater) return
  autoUpdater.logger = { info: (...a) => log('info', ...a), warn: (...a) => log('warn', ...a), error: (...a) => log('error', ...a), debug: () => {} }
  log('info', `launcher ${app.getVersion()} checking ${app.isPackaged ? 'GitHub releases' : '(not packaged: no updates)'}`)
  // (A Mac only hears of it: an unsigned app can't take an update by itself.)
  autoUpdater.autoDownload = !isMac
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => { update = { ...update, state: 'checking' }; tell() })
  autoUpdater.on('update-not-available', () => { update = { ...update, state: 'current' }; tell() })
  autoUpdater.on('update-available', info => { update = isMac ? { state: 'available', version: info.version, percent: 0 } : { state: 'downloading', version: info.version, percent: 0 }; tell() })
  autoUpdater.on('download-progress', p => { update = { ...update, state: 'downloading', percent: Math.round(p.percent) }; tell() })
  autoUpdater.on('update-downloaded', info => { update = { state: 'ready', version: info.version, percent: 100 }; tell() })
  autoUpdater.on('error', error => failed(error))
  void checkForUpdates()
  setInterval(() => { void checkForUpdates() }, 30 * 60 * 1000)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
  app.whenReady().then(() => { createWindow(); watchUpdates() })
  app.on('window-all-closed', () => app.quit())
}
