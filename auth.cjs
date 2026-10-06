// The launcher's own login (the login front page, main.cjs): it speaks to the shard the way the
// game page does (src/net.ts, server/shard.ts): one websocket, the shard's hello, then a login,
// a new account or a remembered login (resume), and the shard's auth answer. The token the
// shard gives stays in the launcher's main process (kept encrypted on disk by main.cjs) and goes
// to the game page only as it opens (preload.cjs, launcher:handoff); the launcher's own page never
// sees it (nor does the game page keep it on disk: src/login-memory.ts). Pure apart from the WebSocket it is given, so tests/launcher-login.test.ts runs it
// against a real shard.
const ACCOUNT_NAME = /^[A-Za-z0-9_-]{3,16}$/ // (src/protocol.ts)
const PASSWORD = { min: 8, max: 128 }
const PROTOCOL = 2 // (src/protocol.ts PROTOCOL: tests/launcher-login.test.ts keeps them equal)

const wsUrl = shard => String(shard).replace(/^http/i, 'ws').replace(/\/+$/, '')
// What the form says before anything goes to the shard (the same rules as the game's login).
function checkForm(mode, name, password, confirm) {
  const n = String(name ?? '').trim(), p = String(password ?? '')
  if (!ACCOUNT_NAME.test(n)) return 'Account names are 3 to 16 letters, digits, - or _.'
  if (mode === 'register' && p.length < PASSWORD.min) return `Choose a password of at least ${PASSWORD.min} characters.`
  if (mode === 'register' && p !== String(confirm ?? '')) return 'The two passwords do not match.'
  if (!p) return 'Enter your password.'
  if (p.length > PASSWORD.max) return `Passwords are at most ${PASSWORD.max} characters.`
  return null
}

// One request to the shard: {t:'login'|'register', name, password}, {t:'resume', token} or
// {t:'logout', token}. Resolves { ok, account, token } or { ok: false, error } (logout: { ok }).
function ask(shard, message, { WebSocketImpl = globalThis.WebSocket, timeout = 15000 } = {}) {
  return new Promise(resolve => {
    if (typeof WebSocketImpl !== 'function') { resolve({ ok: false, error: 'This launcher cannot reach the shard (no WebSocket).' }); return }
    let ws, done = false
    const finish = result => { if (done) return; done = true; clearTimeout(timer); try { ws.close() } catch { /* closed */ } resolve(result) }
    const timer = setTimeout(() => finish({ ok: false, error: 'The shard did not answer.' }), timeout)
    try { ws = new WebSocketImpl(wsUrl(shard)) } catch { finish({ ok: false, error: 'The shard is offline.' }); return }
    ws.onmessage = event => {
      let m
      try { m = JSON.parse(String(event.data)) } catch { return }
      if (m.t === 'hello') {
        if (m.protocol !== PROTOCOL) { finish({ ok: false, error: 'This launcher is a different version from the shard: restart it to update.' }); return }
        ws.send(JSON.stringify(message))
        // (A logout has no answer: sent is done.)
        if (message.t === 'logout') setTimeout(() => finish({ ok: true }), 150)
        return
      }
      if (m.t === 'auth') finish(m.ok ? { ok: true, account: m.account, token: m.token } : { ok: false, error: m.error || 'The shard refused the login.' })
      if (m.t === 'kicked') finish({ ok: false, error: m.reason || 'The shard refused the login.' })
    }
    ws.onerror = () => finish({ ok: false, error: 'The shard is offline.' })
    ws.onclose = () => finish({ ok: false, error: 'The shard is offline.' })
  })
}

// The login kept between launches, as main.cjs stores it: { account, token } with the token
// encrypted by the operating system (Electron's safeStorage), or nothing.
function readSaved(raw, decrypt) {
  try {
    const s = JSON.parse(raw)
    if (!s || typeof s.account !== 'string' || !ACCOUNT_NAME.test(s.account) || typeof s.token !== 'string') return null
    const token = decrypt(Buffer.from(s.token, 'base64'))
    return typeof token === 'string' && token ? { account: s.account, token } : null
  } catch { return null }
}
const writeSaved = (login, encrypt) => JSON.stringify({ account: login.account, token: encrypt(login.token).toString('base64') })

module.exports = { ask, checkForm, readSaved, writeSaved, wsUrl, ACCOUNT_NAME, PASSWORD, PROTOCOL }
