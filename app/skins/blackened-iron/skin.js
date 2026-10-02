// Blackened Iron: small, optional. Watches the Play button's text (set by launcher.js) and marks
// busy states so the CSS can show them as working rather than dead: "Updating 62%" fills the
// button with embers up to 62%; Checking…/Loading…/Restarting… smoulder.
(() => {
  const play = document.getElementById('play')
  if (!play) return
  const mark = () => {
    const text = play.textContent || ''
    const pct = /(\d+)\s*%/.exec(text)
    const busy = /^Updating/.test(text) ? 'progress' : /…$/.test(text) && play.disabled ? 'wait' : ''
    if (play.dataset.busy !== busy) { if (busy) play.dataset.busy = busy; else delete play.dataset.busy }
    play.style.setProperty('--p', pct ? String(Math.min(100, +pct[1]) / 100) : busy === 'progress' ? '0.08' : '0')
  }
  new MutationObserver(mark).observe(play, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  mark()
})()
