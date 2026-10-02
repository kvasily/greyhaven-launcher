// Wayworn skin: two small touches, nothing the launcher depends on.
// 1. Breathing: the page sits at reduced presence when left alone and comes up on any movement,
//    key, wheel or focus (Play itself never dims). Off under prefers-reduced-motion.
// 2. Progress: while the launcher update downloads ("Updating 62%"), mirror the percentage into a
//    CSS variable so the Play plate can show a slow line of molten metal.
(() => {
  const root = document.documentElement
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const REST_AFTER = 6000
  let timer = 0, last = 0
  const rest = () => {
    const f = document.activeElement
    if (reduce.matches || (f && f !== document.body && f.matches(':focus-visible'))) { timer = setTimeout(rest, REST_AFTER); return }
    root.dataset.presence = 'low'
  }
  const wake = () => {
    const now = Date.now()
    if (root.dataset.presence === 'full' && now - last < 400) return
    last = now; root.dataset.presence = 'full'
    clearTimeout(timer); timer = setTimeout(rest, REST_AFTER)
  }
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin']) addEventListener(type, wake, { passive: true })
  wake()

  const play = document.getElementById('play'), slot = play.parentElement
  const sync = () => {
    const m = /(\d+)\s*%/.exec(play.textContent || '')
    slot.classList.toggle('has-progress', !!m)
    if (m) slot.style.setProperty('--p', String(Math.min(100, +m[1]) / 100))
  }
  new MutationObserver(sync).observe(play, { childList: true, characterData: true, subtree: true })
  sync()
})()
