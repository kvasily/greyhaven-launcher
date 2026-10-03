// The launcher's front page: the shard's status and news, the launcher's own update (which must
// be installed before playing), and Play. `window.launcher` is preload.cjs.
// Two views (the gear switches them, main.cjs): the login view (the default) asks for your
// account first, in the form below (built into the design's #login slot), and Play then opens the
// game at your characters; the Play view leaves logging in to the game. The page says which on
// <html>: data-front="login|play", data-auth="checking|out|in" and data-play="shown|hidden".
(() => {
  const api = window.launcher
  const $ = id => document.getElementById(id)
  const status = $('status'), statusText = $('status-text'), news = $('news'), play = $('play')
  const error = $('error')
  const version = $('version')
  const root = document.documentElement
  let launcherVersion = ''
  let online = false
  let front = 'play', account = null, auth = 'checking'

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
    play.textContent = 'Play'; play.disabled = !online || !signedIn(); play.title = !online ? 'The shard is offline' : signedIn() ? '' : 'Log in first'
  }
  // (The login view: Play only once you are logged in; a launcher update shows either way.)
  const signedIn = () => front !== 'login' || auth === 'in'
  function showView() {
    root.dataset.front = front; root.dataset.auth = auth
    const mode = play.dataset.mode
    root.dataset.play = signedIn() || mode === 'update' || mode === 'download' ? 'shown' : 'hidden'
    if (loginView) loginView.render()
  }
  async function refresh() {
    const s = await api.status()
    const was = online
    online = !!s.online
    // (The shard back: a login that couldn't be checked offline is checked now.)
    if (online && !was && front === 'login' && auth === 'in' && accountUnchecked) void checkAccount()
    status.dataset.state = online ? 'online' : 'offline'
    statusText.textContent = online ? `${s.name || 'Greyhaven'} is online · ${plural(s.players ?? 0, 'player', 'players')}` : 'Shard offline'
    if (online) { showNews(s.news); if (!s.build) showError('The shard has no game client built yet (npm run build on the shard).') }
    else { showNews([]); news.firstChild.textContent = s.error || 'The shard is offline.' }
    renderPlay(); showView()
  }
  function showUpdate(u) {
    update = u
    // Beside the version: whether it is up to date, or why it could not tell (click to look again).
    const note = { checking: 'checking for updates…', current: 'up to date', error: 'couldn’t check for updates', dev: 'not installed: no updates', downloading: `downloading ${u.version || 'an update'}…`, ready: `${u.version} ready to install`, available: `${u.version} is out` }[u.state]
    version.textContent = `Launcher ${launcherVersion}${note ? ` · ${note}` : ''}`
    version.title = u.state === 'error' ? `${u.error || 'Unknown error'} (details in updater.log, in %APPDATA%\\Greyhaven). Click to try again.` : 'Click to check for updates'
    renderPlay(); showView()
  }

  // --- The login view ----------------------------------------------------------------------
  // The form, in the design's #login slot (or just before Play, should a design have none): log
  // in or make an account; once in, who you are and Switch account. The launcher (main.cjs) does
  // the talking to the shard and keeps the login; this page only ever hears the account's name.
  let loginView = null, accountUnchecked = false
  async function checkAccount() {
    auth = 'checking'; showView()
    let r = { account: null }
    try { r = await api.account() } catch { r = { account, unchecked: true } }
    account = r.account || null; accountUnchecked = !!r.unchecked
    auth = account ? 'in' : 'out'
    if (r.error && loginView) loginView.fail(r.error)
    renderPlay(); showView()
  }
  function makeLoginView() {
    const box = $('login') || (() => { const s = document.createElement('section'); s.id = 'login'; s.className = 'login'; play.parentElement.insertBefore(s, play); return s })()
    box.setAttribute('aria-label', 'Log in')
    box.innerHTML = `<form class="login-form" novalidate>
      <h2 class="login-title">Log in</h2>
      <label class="login-field"><span>Account name</span><input name="name" maxlength="16" autocomplete="username" spellcheck="false" required></label>
      <label class="login-field"><span>Password</span><input name="password" type="password" maxlength="128" autocomplete="current-password" required></label>
      <label class="login-field login-confirm" hidden><span>Password again</span><input name="confirm" type="password" maxlength="128" autocomplete="new-password"></label>
      <p class="login-rule" hidden>3 to 16 letters, digits, - or _; a password of at least 8 characters.</p>
      <p class="login-error" role="alert" hidden></p>
      <button type="submit" class="login-submit">Log in</button>
      <button type="button" class="login-switch">New here? Make an account</button>
    </form>
    <div class="login-signed" hidden>
      <p class="login-account">Logged in as <b></b></p>
      <button type="button" class="login-signout">Switch account</button>
    </div>`
    const form = box.querySelector('form'), signed = box.querySelector('.login-signed')
    const q = s => box.querySelector(s)
    const name = q('input[name="name"]'), password = q('input[name="password"]'), confirm = q('input[name="confirm"]')
    const submit = q('.login-submit'), swap = q('.login-switch'), err = q('.login-error'), title = q('.login-title')
    let mode = 'login', busy = false
    const fail = text => { err.textContent = text || ''; err.hidden = !text }
    function render() {
      const out = auth === 'out' || (auth === 'checking' && !account)
      box.hidden = front !== 'login'
      form.hidden = !out; signed.hidden = out
      box.dataset.state = auth
      title.textContent = mode === 'register' ? 'Make an account' : 'Log in'
      submit.textContent = busy ? (mode === 'register' ? 'Making it…' : 'Logging in…') : mode === 'register' ? 'Make the account' : 'Log in'
      swap.textContent = mode === 'register' ? 'Have an account? Log in' : 'New here? Make an account'
      q('.login-confirm').hidden = mode !== 'register'; q('.login-rule').hidden = mode !== 'register'
      password.autocomplete = mode === 'register' ? 'new-password' : 'current-password'
      submit.disabled = busy || auth === 'checking' || !online
      submit.title = !online ? 'The shard is offline' : auth === 'checking' ? 'Asking the shard…' : ''
      if (account) q('.login-account b').textContent = account
      q('.login-signout').disabled = auth === 'checking'
      // (Nothing typed lingers behind the signed-in panel.)
      if (!out) { password.value = ''; confirm.value = '' }
    }
    form.addEventListener('submit', async e => {
      e.preventDefault()
      if (busy || submit.disabled) return
      fail('')
      busy = true; render()
      let r
      try { r = await api.login({ mode, name: name.value, password: password.value, confirm: confirm.value }) } catch { r = { ok: false, error: 'The launcher could not ask the shard.' } }
      busy = false
      password.value = ''; confirm.value = ''
      if (!r.ok) { fail(r.error); render(); password.focus(); return }
      account = r.account; auth = 'in'; mode = 'login'; accountUnchecked = false
      renderPlay(); showView()
      if (!play.disabled) play.focus()
    })
    swap.addEventListener('click', () => { mode = mode === 'register' ? 'login' : 'register'; fail(''); render(); name.focus() })
    q('.login-signout').addEventListener('click', async () => {
      try { await api.signout() } catch { /* forgotten here either way */ }
      const was = account
      account = null; auth = 'out'; renderPlay(); showView()
      name.value = was || ''; password.focus()
    })
    return { render, fail, focus: () => (name.value ? password : name).focus() }
  }

  play.addEventListener('click', () => {
    if (play.dataset.mode === 'download') { void api.download(); return }
    if (play.dataset.mode === 'update') { play.disabled = true; play.textContent = 'Restarting…'; loading = true; void api.restart(); return }
    if (online && !play.disabled) { loading = true; play.disabled = true; play.textContent = 'Loading…'; void api.play() }
  })
  version.addEventListener('click', () => { void api.check() })
  // (Enter is Play, except in the login form or on a button of its own.)
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !play.disabled && !(e.target && e.target.closest && e.target.closest('form, input, button, select, textarea'))) play.click() })

  api.onUpdate(showUpdate)
  api.info().then(info => {
    launcherVersion = info.version
    front = info.front === 'login' && typeof api.login === 'function' ? 'login' : 'play'
    // (A kept login shows as itself while the shard is asked, not as an empty form.)
    if (front === 'login') { account = info.account || null; loginView = makeLoginView() }
    else auth = 'in'
    showUpdate(info.update)
    // Sent back from the game: why (the game was updated, the shard restarting, or an error).
    const query = new URLSearchParams(location.search), failed = query.get('error'), notice = query.get('notice')
    if (failed) showError(failed)
    else if (notice) { showError(notice); error.dataset.kind = 'notice' }
    void refresh()
    setInterval(() => { void refresh() }, 15000)
    if (front === 'login') void checkAccount().then(() => { if (auth === 'out' && loginView) loginView.focus() })
    // (Checking for an update has a limit before Play opens anyway.)
    setTimeout(renderPlay, CHECK_WAIT + 100)
  })
})()
