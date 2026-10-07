// Dust in the window's light (Monumental Gothic skin). A few dozen motes drift on a slow, soft
// current: each is carried by a gently turning flow (a few slow waves across the space, so nearby
// motes move together and the whole drift curls and eddies rather than sliding past), settles a
// little as it goes, glows in and fades out over some seconds, and comes back somewhere else. The near
// motes are bigger, out of focus and move a touch quicker (depth). The page masks the canvas to the
// soft region under the window (launcher.css: .dust-front) and the motes are born in it and shows it only when the shard is lit.
// Nothing runs while the window is hidden; with reduced motion the motes are drawn once and kept still.
(() => {
  const canvas = document.querySelector('.dust-front canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  // one soft sprite, drawn scaled for every mote: a warm core and a faint halo
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64
  {
    const g = sprite.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,246,228,1)'); r.addColorStop(.22, 'rgba(255,240,214,.9)')
    r.addColorStop(.5, 'rgba(255,228,192,.25)'); r.addColorStop(1, 'rgba(255,220,180,0)')
    g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  }
  let W = 0, H = 0, S = 1, dpr = 1
  const motes = []
  const rand = (a, b) => a + Math.random() * (b - a)
  // where the light is: the motes are born where the page's mask (art/window-dust-mask.png) shows
  // them, more where it is stronger, so none are wasted where they cannot be seen
  let field = null, FW = 0, FH = 0
  {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); FW = c.width = img.naturalWidth; FH = c.height = img.naturalHeight
      const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      try { field = g.getImageData(0, 0, FW, FH).data } catch { field = null }
      if (W) for (const m of motes) spawn(m, true)
    }
    img.src = 'art/window-dust-mask.png'
  }
  function place(m) {
    for (let i = 0; i < 40; i++) {
      const fx = Math.random(), fy = Math.random()
      if (!field) { m.x = fx * W; m.y = fy * H; return }
      const a = field[((Math.floor(fy * FH) * FW) + Math.floor(fx * FW)) * 4 + 3] / 255
      if (Math.random() < a * a) { m.x = fx * W; m.y = fy * H; return }
    }
  }
  function spawn(m, anywhere) {
    place(m)
    m.life = rand(9, 20); m.age = anywhere ? rand(0, m.life) : 0
    m.seed = rand(0, 1000)
    return m
  }
  for (let i = 0; i < 160; i++) motes.push({ near: false, r: rand(1.6, 2.6), a: rand(.5, .95) })
  for (let i = 0; i < 22; i++) motes.push({ near: true, r: rand(4, 6.5), a: rand(.2, .38) })
  function resize() {
    const b = canvas.getBoundingClientRect()
    dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.max(1, Math.round(b.width * dpr)), h = Math.max(1, Math.round(b.height * dpr))
    if (w === canvas.width && h === canvas.height && W) return
    const first = !W
    canvas.width = w; canvas.height = h
    if (!first) for (const m of motes) { m.x *= w / W; m.y *= h / H }
    W = w; H = h; S = b.width / 760 * dpr          // (760 css px: the region's width at the login view)
    if (first) for (const m of motes) spawn(m, true)
  }
  // the current at a point: a slow drift down and to the right (with the light), and a gentle swirl
  // made of a few broad waves that wander with time
  function flow(x, y, t, seed) {
    const u = x / (S * 100), v = y / (S * 100)
    const a = Math.sin(u * .9 + t * .11) + Math.sin(v * 1.1 - t * .08 + 1.7) + Math.sin((u + v) * .6 + t * .05 + 4.1) + Math.sin(seed + t * .2) * .35
    return [S * (3.2 + 7 * Math.cos(a * 1.4)), S * (5.5 + 5 * Math.sin(a * 1.4))]
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H)
    for (const m of motes) {
      const k = m.age / m.life
      const fade = Math.min(1, k * 5) * Math.min(1, (1 - k) * 3.5)       // glows in, lingers, fades out
      const tw = .8 + .2 * Math.sin(t * (m.near ? .9 : 1.7) + m.seed)    // a soft twinkle
      const alpha = m.a * fade * tw
      if (alpha <= .005) continue
      const size = m.r * S * 4
      ctx.globalAlpha = alpha
      ctx.drawImage(sprite, m.x - size / 2, m.y - size / 2, size, size)
    }
    ctx.globalAlpha = 1
  }
  let last = 0, time = rand(0, 100), running = false
  function step(now) {
    if (!running) return
    const dt = Math.min(.1, last ? (now - last) / 1000 : 0); last = now
    time += dt
    for (const m of motes) {
      const [vx, vy] = flow(m.x, m.y, time, m.seed)
      const f = m.near ? 1.5 : 1
      m.x += vx * f * dt; m.y += vy * f * dt
      m.age += dt
      if (m.age >= m.life || m.y > H || m.x > W || m.x < 0) spawn(m, false)
    }
    draw(time)
    requestAnimationFrame(step)
  }
  function start() { if (running || still) return; running = true; last = 0; requestAnimationFrame(step) }
  function stop() { running = false }
  new ResizeObserver(() => { resize(); if (still) draw(time) }).observe(canvas)
  resize(); draw(time)
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start())
  if (!document.hidden) start()
})()
