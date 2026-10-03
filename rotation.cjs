// Which of the front page's designs a launch shows (main.cjs): the pinned one, or the next in
// turn. Pure, so tests/launcher.test.ts can check it without Electron.
//  prefs: what launcher.json held (anything; it is checked here). available(id): whether that
//  design's folder is there. Returns the design to show (null: none is, use the fallback page)
//  and the prefs to keep.
function normalPrefs(raw, ids, available) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const pinned = typeof p.pinned === 'string' && ids.includes(p.pinned) && available(p.pinned) ? p.pinned : null
  const next = Number.isInteger(p.next) && p.next >= 0 ? p.next % ids.length : 0
  // The front page: the login view (the default) or the Play view (the gear switches them).
  const front = p.front === 'play' ? 'play' : 'login'
  return { pinned, next, front }
}
function pickSkin(raw, ids, available) {
  const prefs = normalPrefs(raw, ids, available)
  if (prefs.pinned) return { skin: prefs.pinned, prefs }
  for (let i = 0; i < ids.length; i++) {
    const at = (prefs.next + i) % ids.length
    if (available(ids[at])) return { skin: ids[at], prefs: { ...prefs, next: (at + 1) % ids.length } }
  }
  return { skin: null, prefs }
}
module.exports = { normalPrefs, pickSkin }
