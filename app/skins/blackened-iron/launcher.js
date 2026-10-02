// The launcher's front page: the shard's status and news, the launcher's own update (which must
// be installed before playing), and Play. `window.launcher` is preload.cjs.
(() => {
  const api = window.launcher
  const $ = id => document.getElementById(id)
  const status = $('status'), statusText = $('status-text'), news = $('news'), play = $('play')
  const error = $('error')
  const version = $('version')
  let launcherVersion = ''
  let online = false

  const showError = text => { error.textContent = text || ''; error.hidden = !text }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  function showNews(list) {
    news.textContent = ''
    if (!list || !list.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'No news yet.'; news.append(li); return }
    for (const item of list) {
      const li = document.createElement('li'), time = document.createElement('time'), title = document.createElement('b'), text = document.createElement('p')
      time.textContent = item.date; title.textContent = item.title; text.textContent = item.text
      li.append(time, title, text); news.append(li)
    }
  }
  // Play, or what stands before it: the shard must be up, and a launcher update found on GitHub
  // must be installed first (it downloads by itself; Play becomes Update, which restarts into it).
  let update = { state: 'idle' }, loading = false
  const opened = Date.now(), CHECK_WAIT = 15000
  function renderPlay() {
    if (loading) return
    const u = update, checking = u.state === 'checking' && Date.now() - opened < CHECK_WAIT
    play.dataset.mode = u.state === 'ready' ? 'update' : u.state === 'available' ? 'download' : 'play'
    // (A Mac downloads the new launcher from the release page: launcher/main.cjs.)
    if (u.state === 'available') { play.textContent = 'Download update'; play.disabled = false; play.title = `Launcher ${u.version} is out: download it from the release page, install it over this one, then play.`; return }
    if (u.state === 'ready') { play.textContent = 'Update'; play.disabled = false; play.title = `Launcher ${u.version} is downloaded: restart the launcher to install it, then play.`; return }
    if (u.state === 'downloading') { play.textContent = `Updating${u.percent ? ` ${u.percent}%` : '…'}`; play.disabled = true; play.title = `Downloading launcher ${u.version || 'update'}: Play opens once it is installed.`; return }
    if (checking) { play.textContent = 'Checking…'; play.disabled = true; play.title = 'Looking for a launcher update'; return }
    play.textContent = 'Play'; play.disabled = !online; play.title = online ? '' : 'The shard is offline'
  }
  async function refresh() {
    const s = await api.status()
    online = !!s.online
    status.dataset.state = online ? 'online' : 'offline'
    statusText.textContent = online ? `${s.name || 'Greyhaven'} is online · ${plural(s.players ?? 0, 'player', 'players')}` : 'Shard offline'
    if (online) { showNews(s.news); if (!s.build) showError('The shard has no game client built yet (npm run build on the shard).') }
    else { showNews([]); news.firstChild.textContent = s.error || 'The shard is offline.' }
    renderPlay()
  }
  function showUpdate(u) {
    update = u
    // Beside the version: whether it is up to date, or why it could not tell (click to look again).
    const note = { checking: 'checking for updates…', current: 'up to date', error: 'couldn’t check for updates', dev: 'not installed: no updates', downloading: `downloading ${u.version || 'an update'}…`, ready: `${u.version} ready to install`, available: `${u.version} is out` }[u.state]
    version.textContent = `Launcher ${launcherVersion}${note ? ` · ${note}` : ''}`
    version.title = u.state === 'error' ? `${u.error || 'Unknown error'} (details in updater.log, in %APPDATA%\\Greyhaven). Click to try again.` : 'Click to check for updates'
    renderPlay()
  }

  play.addEventListener('click', () => {
    if (play.dataset.mode === 'download') { void api.download(); return }
    if (play.dataset.mode === 'update') { play.disabled = true; play.textContent = 'Restarting…'; loading = true; void api.restart(); return }
    if (online && !play.disabled) { loading = true; play.disabled = true; play.textContent = 'Loading…'; void api.play() }
  })
  version.addEventListener('click', () => { void api.check() })
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !play.disabled) play.click() })

  api.onUpdate(showUpdate)
  api.info().then(info => {
    launcherVersion = info.version; showUpdate(info.update)
    // Sent back from the game: why (the game was updated, the shard restarting, or an error).
    const query = new URLSearchParams(location.search), failed = query.get('error'), notice = query.get('notice')
    if (failed) showError(failed)
    else if (notice) { showError(notice); error.dataset.kind = 'notice' }
    void refresh()
    setInterval(() => { void refresh() }, 15000)
    // (Checking for an update has a limit before Play opens anyway.)
    setTimeout(renderPlay, CHECK_WAIT + 100)
  })
})()
