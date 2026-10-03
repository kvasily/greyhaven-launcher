// Preview stand-in for the launcher's preload bridge (preload.cjs). It does nothing inside the real
// launcher, where window.launcher already exists. In a plain browser it fakes the shard so the page
// can be reviewed: add ?state=online|offline|checking|downloading|ready|available, and optionally
// &error=… or &notice=… (the same query the launcher uses when the game sends the player back),
// &front=play for the Play view, &auth=in to start logged in (password "wrong" fails a login).
// Keys 1–6 switch state.
(() => {
  // (Inside Electron it never stands in: a missing bridge should show as broken, not as a fake shard.)
  if (window.launcher || /Electron/i.test(navigator.userAgent)) return
  const q = new URLSearchParams(location.search)
  const state = q.get('state') || 'online'
  const NEWS = [
    { date: '2 Oct', title: 'The Marrow Road is open', text: 'Wardens have cleared the old drovers’ road east of Greyhaven. Watch the barrows at dusk.' },
    { date: '28 Sep', title: 'Houses may now be sold', text: 'Deeds can be handed over at any bank. The buyer’s name goes on the door when the coin changes hands.' },
    { date: '21 Sep', title: 'Shard restart, Saturday night', text: 'The world sleeps for ten minutes at midnight. Anything on the ground stays where it fell.' },
  ]
  const upd = {
    online: { state: 'current' }, offline: { state: 'current' }, checking: { state: 'checking' },
    downloading: { state: 'downloading', version: '0.9.4', percent: 62 },
    ready: { state: 'ready', version: '0.9.4' }, available: { state: 'available', version: '0.9.4' },
  }[state] || { state: 'current' }
  const online = state !== 'offline' && state !== 'checking'
  window.launcher = {
    info: async () => ({ version: '0.9.3', shard: 'http://example', update: upd, front: q.get('front') === 'play' ? 'play' : 'login' }),
    status: async () => online
      ? { online: true, name: 'Greyhaven', players: 37, news: NEWS, build: true }
      : { online: false, error: state === 'checking' ? 'Looking for the shard…' : 'The shard is down or restarting. This page will reconnect by itself.' },
    play: async () => {}, restart: async () => {}, download: async () => {}, check: async () => {},
    onUpdate: () => {},
    // The login view (?front=play for the Play view, &auth=in to start logged in).
    account: async () => (q.get('auth') === 'in' ? { account: 'Maren' } : { account: null }),
    login: async f => { await new Promise(r => setTimeout(r, 300)); return f.password === 'wrong' ? { ok: false, error: 'Wrong account name or password.' } : { ok: true, account: String(f.name || 'Maren') } },
    signout: async () => ({ ok: true }),
    front: async mode => { q.set('front', mode); location.search = q.toString(); return { front: mode } },
  }
  const order = ['online', 'offline', 'checking', 'downloading', 'ready', 'available']
  addEventListener('keydown', e => {
    const i = '123456'.indexOf(e.key)
    if (i >= 0 && e.target.tagName !== 'INPUT') { q.set('state', order[i]); location.search = q.toString() }
  })
})()
