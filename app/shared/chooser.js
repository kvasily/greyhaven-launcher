// The gear in the front page's corner: the front page's view (Log in, the default, or Play:
// launcher.js) and which of the launcher's designs you see. "A different one
// each launch" (the default) or one you pin; pinning another design shows it at once. The launcher
// keeps the choice (main.cjs, launcher:skins / launcher:pin). Shared by every design in app/skins/;
// it only adds itself, so a design's own page needs nothing but its two lines (the stylesheet and
// this script). Outside the launcher (a design opened in a browser, with mock.js) it shows the
// list but changes nothing.
(() => {
  const api = window.launcher || {}
  const PREVIEW = [['wayworn', 'Wayworn'], ['blackened-iron', 'Blackened Iron'], ['cartographer', 'Cartographer'], ['monumental-gothic', 'Monumental Gothic'], ['illuminated', 'Illuminated']]
  const here = (/\/skins\/([^/]+)\//.exec(location.pathname) || [])[1] || null
  const fetchSkins = () => (api.skins ? api.skins() : Promise.resolve({ skins: PREVIEW.map(([id, name]) => ({ id, name })), current: here, pinned: null, front: document.documentElement.dataset.front || 'login' }))

  const gear = document.createElement('button')
  gear.type = 'button'; gear.className = 'gh-chooser-gear'; gear.title = 'Launcher settings'
  gear.setAttribute('aria-label', 'Launcher settings'); gear.setAttribute('aria-haspopup', 'dialog'); gear.setAttribute('aria-expanded', 'false')
  gear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.7a7.6 7.6 0 0 1 1.9 1.1l2.6-.9 1.7 2.9-2.1 1.8a7.7 7.7 0 0 1 0 2.2l2.1 1.8-1.7 2.9-2.6-.9a7.6 7.6 0 0 1-1.9 1.1l-.5 2.7h-3.4l-.5-2.7a7.6 7.6 0 0 1-1.9-1.1l-2.6.9-1.7-2.9 2.1-1.8a7.7 7.7 0 0 1 0-2.2L3.6 7.8l1.7-2.9 2.6.9a7.6 7.6 0 0 1 1.9-1.1z"/><circle cx="12" cy="12" r="3.2"/></svg>'

  const panel = document.createElement('div')
  panel.className = 'gh-chooser'; panel.hidden = true
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Launcher settings')
  document.body.append(gear, panel)

  let state = { skins: [], current: here, pinned: null, front: 'login' }
  const card = (id, name, thumb, note) => {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'gh-chooser-option'; b.dataset.pick = id
    const chosen = id === '' ? !state.pinned : state.pinned === id
    b.setAttribute('aria-pressed', String(chosen))
    if (thumb) { const img = document.createElement('img'); img.src = `../../shared/thumbs/${id}.jpg`; img.alt = ''; img.loading = 'lazy'; b.append(img) }
    else { const r = document.createElement('span'); r.className = 'gh-chooser-rotate'; r.setAttribute('aria-hidden', 'true'); r.textContent = '↻'; b.append(r) }
    const label = document.createElement('span'); label.className = 'gh-chooser-name'; label.textContent = name; b.append(label)
    if (note) { const n = document.createElement('small'); n.textContent = note; b.append(n) }
    return b
  }
  function render() {
    panel.textContent = ''
    // The front page's view: log in here first, or the Play button (the game logs in).
    const fh = document.createElement('h2'); fh.textContent = 'Front page'
    const fp = document.createElement('p'); fp.textContent = state.front === 'play' ? 'Play first: you log in inside the game.' : 'Log in here first: Play opens the game at your characters.'
    const views = document.createElement('div'); views.className = 'gh-chooser-views'; views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Front page')
    for (const [mode, label] of [['login', 'Log in'], ['play', 'Play']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gh-chooser-view'; b.dataset.front = mode; b.textContent = label
      b.setAttribute('aria-pressed', String(state.front === mode)); views.append(b)
    }
    panel.append(fh, fp, views)
    const h = document.createElement('h2'); h.textContent = 'Launcher art'
    const p = document.createElement('p'); p.textContent = state.pinned ? 'Pinned: this design every launch.' : 'A different design each time you start the launcher.'
    const list = document.createElement('div'); list.className = 'gh-chooser-list'
    list.append(card('', 'Rotate', false, 'a new one each launch'))
    for (const s of state.skins) list.append(card(s.id, s.name, true, s.id === state.current ? 'showing now' : ''))
    panel.append(h, p, list)
    if (!api.pin) { const m = document.createElement('p'); m.className = 'gh-chooser-preview'; m.textContent = 'Preview: the launcher keeps this choice.'; panel.append(m) }
  }
  const isOpen = () => !panel.hidden
  async function open() {
    try { state = await fetchSkins() } catch { /* the list as it was */ }
    render(); panel.hidden = false; gear.setAttribute('aria-expanded', 'true')
    ;(panel.querySelector('[aria-pressed="true"]') || panel.querySelector('button'))?.focus()
  }
  function close(refocus) { if (!isOpen()) return; panel.hidden = true; gear.setAttribute('aria-expanded', 'false'); if (refocus) gear.focus() }
  gear.addEventListener('click', () => { if (isOpen()) close(true); else void open() })
  panel.addEventListener('click', async e => {
    const v = e.target.closest('[data-front]')
    if (v) {
      const mode = v.dataset.front
      if (mode === state.front) return
      // (The launcher shows the front page again in that view.)
      if (api.front) { try { await api.front(mode) } catch { return } }
      state = { ...state, front: mode }; render(); panel.querySelector(`[data-front="${mode}"]`)?.focus(); return
    }
    const b = e.target.closest('[data-pick]'); if (!b) return
    const id = b.dataset.pick || null
    if (!api.pin) { state = { ...state, pinned: id }; render(); return }
    try { const r = await api.pin(id); state = { ...state, ...r } } catch { return }
    // (Pinning another design reloads the page with it; otherwise it stays open, showing the choice.)
    render(); panel.querySelector(`[data-pick="${id || ''}"]`)?.focus()
  })
  // Keys in the gear or its list stay there: Enter is Play everywhere else on the page (launcher.js).
  for (const el of [gear, panel]) el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(true) }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') e.stopPropagation()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(true) })
  // (While the list is open, Enter is never Play, wherever focus has wandered: the page, past the list.)
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && isOpen() && !panel.contains(e.target) && e.target !== gear) e.stopPropagation() }, true)
  document.addEventListener('pointerdown', e => { if (isOpen() && !panel.contains(e.target) && !gear.contains(e.target)) close(false) })
})()
