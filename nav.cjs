// What the launcher does with a page the game window is about to open (main.cjs, will-navigate).
// Pure, so tests/launcher.test.ts can check it without Electron.
//  { kind: 'quit' }               <shard>/__quit: the game's Quit game; close the launcher.
//  { kind: 'back', notice }       <shard>/__launcher?reason=…: back to the front page, saying why
//                                 (reason=menu, the game's Return to launcher, says nothing; an
//                                 unknown reason reads as an update, as launchers before 1.0.5 did).
//                                 reason=logout (Log out in a game the launcher logged in) also
//                                 forgets the login; reason=signin (the shard refused it: the front
//                                 page asks the shard again and says why) and reason=gone&text=…
//                                 (kicked or banned: says the shard's words) leave that to the check.
//  { kind: 'open' }               the launcher's own page or the shard's: let it load.
//  { kind: 'external' }           anything else: the player's browser (http/https only).
const BACK = { update: 'Greyhaven has been updated. Press Play to load the new version.', restart: 'Greyhaven is restarting for an update. Play opens again as soon as the shard is back.', menu: null, logout: null, signin: null, gone: 'You were removed from the shard.' }
const FORGET = new Set(['logout'])
function navDecision(url, shard) {
  if (String(url).startsWith('file:')) return { kind: 'open' }
  let u = null
  try { u = new URL(url) } catch { u = null }
  if (u && u.origin === shard) {
    if (u.pathname === '/__quit') return { kind: 'quit' }
    if (u.pathname === '/__launcher') {
      const reason = u.searchParams.get('reason') ?? ''
      const known = Object.prototype.hasOwnProperty.call(BACK, reason)
      const said = reason === 'gone' ? String(u.searchParams.get('text') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) : ''
      return { kind: 'back', notice: said || (known ? BACK[reason] : BACK.update), forget: known && FORGET.has(reason) }
    }
    return { kind: 'open' }
  }
  return { kind: 'external', url: /^https?:/.test(String(url)) ? String(url) : null }
}
module.exports = { navDecision, BACK }
