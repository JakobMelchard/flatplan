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
  const state = () => ({
    tool: ed.tool,
    multi: ed.multi,
    pen: ed.penSeen,
    sel: ed.sel?.kind === 'items' ? ed.sel.ids.length : (ed.sel?.kind ?? null),
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
