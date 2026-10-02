// The Greyhaven launcher (Electron). One window: first the launcher's own page (app/: news, the
// shard's status, Play), then the game itself, loaded from the shard (server/web.ts serves the
// built client on the shard's port), so a player always has the client the shard runs.
//  - The launcher keeps itself up to date from GitHub Releases (electron-updater): it checks on
//    start and every half hour, downloads a new version in the background (only the changed
//    parts), and shows an icon; it installs when you restart it (or next time it closes).
//  - The shard's address: shard.json, packed in. Players can't change it; a new address goes out
//    as a launcher update. (A settings.json an older launcher wrote is ignored.)
//  - Keys in the game: F11 full screen, Ctrl+Shift+L back to the launcher, Ctrl+R reload (Cmd on a
//    Mac). The game's Esc menu has Return to launcher and Quit game (the game is told it runs in a
//    launcher that understands them by ?launcher=2 on its address; nav.cjs).
//  - The front page's art: five designs (app/skins/<name>/), a different one each launch, or the
//    one you pin with the gear in the corner (app/shared/chooser.js). Kept in launcher.json in the
//    launcher's data folder.
//  - On a Mac the launcher isn't signed by Apple, and macOS only installs updates into signed apps:
//    there it finds an update the same way, and Play becomes Download, which opens the release page.
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { normalPrefs, pickSkin } = require('./rotation.cjs')
const { navDecision } = require('./nav.cjs')

let autoUpdater = null
try { ({ autoUpdater } = require('electron-updater')) } catch { autoUpdater = null }

// The front page's designs, in rotation order. (app/index.html, the original page, is only the
// fallback should a design's folder be missing.)
const SKINS = [
  { id: 'wayworn', name: 'Wayworn' },
  { id: 'blackened-iron', name: 'Blackened Iron' },
  { id: 'cartographer', name: 'Cartographer' },
  { id: 'monumental-gothic', name: 'Monumental Gothic' },
  { id: 'illuminated', name: 'Illuminated' },
]
const FALLBACK_PAGE = path.join(__dirname, 'app', 'index.html')
const skinPage = id => path.join(__dirname, 'app', 'skins', id, 'index.html')
const known = id => SKINS.some(s => s.id === id) && fs.existsSync(skinPage(id))
// { pinned: id | null, next: index } in the launcher's data folder.
const prefsFile = () => path.join(app.getPath('userData'), 'launcher.json')
function readPrefs() {
  let raw = null
  try { raw = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } catch { raw = null }
  return normalPrefs(raw, SKINS.map(s => s.id), known)
}
function writePrefs(p) { try { fs.writeFileSync(prefsFile(), JSON.stringify(p)) } catch { /* kept for this launch only */ } }
let prefs = { pinned: null, next: 0 }
let skin = null // the design showing this launch
// Each launch: the pinned design, or the next one in turn (a missing folder is skipped).
function chooseSkin() {
  let raw = null
  try { raw = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } catch { raw = null }
  const picked = pickSkin(raw, SKINS.map(s => s.id), known)
  skin = picked.skin; prefs = picked.prefs
  if (!prefs.pinned && skin) writePrefs(prefs)
}
const launcherPage = () => (skin && known(skin) ? skinPage(skin) : FALLBACK_PAGE)
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
  void win.loadFile(launcherPage(), query ? { query } : undefined)
  // Back from the game: look for a launcher update now (it must be installed before Play).
  void checkForUpdates()
}
// The game sends you back here (src/updates.ts) when it was updated or the shard restarts for an
// update: it goes to <shard>/__launcher?reason=…, which never loads.
// The game sends you back here (reason=update or restart, src/updates.ts; reason=menu, its Esc
// menu's Return to launcher) or closes the launcher (/__quit, Quit game): nav.cjs. Launchers before
// 1.0.5 don't know menu or quit, so the game only offers them when its address has ?launcher=2.
// Play pressed until the game's page has loaded (or failed): pinning another design must not
// reload the front page under it.
let gameLoading = false
function openGame() {
  if (!win || win.isDestroyed()) return
  gameLoading = true
  void win.loadURL(`${SHARD}/?launcher=2`).catch(() => {}).finally(() => { gameLoading = false })
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
  win.webContents.on('will-navigate', (event, url) => {
    const go = navDecision(url, SHARD)
    if (go.kind === 'open') return
    event.preventDefault()
    if (go.kind === 'quit') app.quit()
    else if (go.kind === 'back') openLauncher(go.notice ? { notice: go.notice } : undefined)
    else if (go.url) void shell.openExternal(go.url)
  })
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  // The shard unreachable when Play is pressed: back to the launcher, saying so.
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || !/^https?:/.test(url) || code === -3) return
    void win.loadFile(launcherPage(), { query: { error: `Could not reach the shard (${description}).` } })
  })
  // The shard answered, but with an error page (a 403, a 404 for a missing build): back, saying so.
  win.webContents.on('did-navigate', (_event, url, code) => {
    if (/^https?:/.test(url) && code >= 400) void win.loadFile(launcherPage(), { query: { error: `The shard answered ${code} for the game page.` } })
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = isMac ? input.meta : input.control
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault() }
    else if (mod && input.shift && input.key.toLowerCase() === 'l' && inGame()) { openLauncher(); event.preventDefault() }
    else if (mod && !input.shift && input.key.toLowerCase() === 'r') { win.webContents.reload(); event.preventDefault() }
    else if (mod && input.shift && input.key.toLowerCase() === 'i' && !app.isPackaged) { win.webContents.toggleDevTools(); event.preventDefault() }
  })
  void win.loadFile(launcherPage())
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
// The front page's designs (the gear): which there are, which is showing, which is pinned. Pinning
// another design shows it now; Rotate (null) keeps this one until the next launch.
ipcMain.handle('launcher:skins', () => ({ skins: SKINS.filter(s => known(s.id)), current: skin, pinned: prefs.pinned }))
ipcMain.handle('launcher:pin', (_event, id) => {
  const pinned = typeof id === 'string' && known(id) ? id : null
  prefs = { ...readPrefs(), pinned }
  writePrefs(prefs)
  if (pinned && pinned !== skin && win && !win.isDestroyed() && !inGame() && !gameLoading) {
    skin = pinned
    // (Whatever the page was saying, it says again.)
    let query
    try { const q = new URL(win.webContents.getURL()).searchParams; query = Object.fromEntries(q) } catch { query = undefined }
    void win.loadFile(launcherPage(), query && Object.keys(query).length ? { query } : undefined)
  }
  return { current: skin, pinned }
})
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
  app.whenReady().then(() => { chooseSkin(); createWindow(); watchUpdates() })
  app.on('window-all-closed', () => app.quit())
}
