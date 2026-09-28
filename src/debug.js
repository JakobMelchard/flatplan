// Remote input log for diagnosing real-device gestures (iPad Safari cannot be inspected from
// mimi). Only runs when the server reports debug (CLIENT_LOG set in its environment); events are
// batched to POST /log.

/** @typedef {import('./editor.js').Editor} Editor */

/**
 * @param {Editor} ed
 * @param {string} version
 */
export function startDebugLog(ed, version) {
  /** @type {string[]} */
  let buf = []
  const t0 = performance.now()
  /** @param {Record<string, unknown>} o */
  const log = (o) => buf.push(JSON.stringify({ t: Math.round(performance.now() - t0), ...o }))
  const r1 = (/** @type {number} */ n) => Math.round(n)
  const state = () => ({
    items: ed.p.layouts.find((l) => l.id === ed.p.current)?.items.length,
    walls: ed.p.plan.walls.length,
    tool: ed.tool,
    multi: ed.multi,
    pen: ed.penSeen,
    sel: ed.sel ? `${ed.sel.items.length}/${ed.sel.walls.length}/${ed.sel.opens.length}` : null,
    drag: ed.drag?.kind ?? null,
    ptrs: ed.ptrs.size,
  })
  const flush = () => {
    if (!buf.length) return
    const body = buf.join('\n')
    buf = []
    fetch('log', { method: 'POST', body, keepalive: true }).catch(() => {})
  }
  log({
    ev: 'start',
    version,
    ua: navigator.userAgent,
    standalone: matchMedia('(display-mode: standalone)').matches,
    w: innerWidth,
    h: innerHeight,
    ...state(),
  })
  let moves = 0
  const cv = ed.cv
  for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
    cv.addEventListener(
      type,
      (e) => {
        const p = /** @type {PointerEvent} */ (e)
        log({
          ev: type,
          id: p.pointerId,
          pt: p.pointerType,
          btn: p.button,
          x: Math.round(p.clientX),
          y: Math.round(p.clientY),
          moves,
        })
        moves = 0
        // marquee geometry, before the editor clears the drag on release
        const d = ed.drag
        if (d?.kind === 'marquee' && type !== 'pointerdown') {
          const its = ed.p.layouts.find((l) => l.id === ed.p.current)?.items ?? []
          log({
            ev: 'marquee',
            a: [r1(d.a.x), r1(d.a.y)],
            b: [r1(d.b.x), r1(d.b.y)],
            view: { k: +ed.k.toFixed(3), ox: r1(ed.ox), oy: r1(ed.oy) },
            inRect: Object.values(ed.inRect(d.a, d.b)).map((l) => l.length),
            items: its.slice(0, 12).map((i) => [i.asset, r1(i.x), r1(i.y), i.rot]),
            assets: ed.p.assets.map((a) => [a.id, a.w, a.d]),
          })
        }
        // state after the editor handled it
        setTimeout(() => log({ ev: `${type}:after`, ...state() }), 0)
      },
      true,
    )
  cv.addEventListener('pointermove', () => moves++, true)
  for (const type of ['touchstart', 'touchend', 'touchcancel', 'contextmenu'])
    cv.addEventListener(
      type,
      (e) => log({ ev: type, touches: /** @type {TouchEvent} */ (e).touches?.length }),
      true,
    )
  document.addEventListener(
    'click',
    (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('button')
      if (b) log({ ev: 'button', title: b.title || b.textContent?.trim(), ...state() })
    },
    true,
  )
  setInterval(flush, 1500)
  document.addEventListener('visibilitychange', () => {
    log({ ev: `visibility:${document.visibilityState}` })
    flush()
  })
}
