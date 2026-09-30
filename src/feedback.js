// Feedback for people who got a link with a token (#fb=…): observe's shim, pointed at switchboard,
// which files the issue. Without a token nothing loads, nothing is sent and no button shows.

/** @typedef {import('./editor.js').Editor} Editor */
/** @typedef {{ t: number, app: string, action: string, detail?: string }} LogEntry */

const KEY = 'flatplan.feedback'
const RECEIVER = 'https://switchboard.feelz.workers.dev/in/feedback'
const REPO = 'JakobMelchard/flatplan'
const RING = 50

/**
 * @param {Editor} ed
 * @param {HTMLElement} group header button group the Feedback button goes into
 */
export function setupFeedback(ed, group) {
  const m = /[#&]fb=([\w.-]+)/.exec(location.hash)
  if (m) {
    try {
      localStorage.setItem(KEY, m[1])
    } catch {} // private window: the token lasts this session only
    history.replaceState(null, '', location.pathname + location.search)
  }
  let token = m?.[1] ?? ''
  try {
    token = localStorage.getItem(KEY) ?? token
  } catch {}
  if (!token) return tokenField()

  // the last pointer events with the tool and drag state, so a report says what was happening
  /** @type {LogEntry[]} */
  const logs = []
  for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
    ed.cv.addEventListener(
      type,
      (e) => {
        const p = /** @type {PointerEvent} */ (e)
        logs.push({
          t: Date.now(),
          app: 'flatplan',
          action: type,
          detail: `${p.pointerType} ${ed.tool}${ed.drag ? ` ${ed.drag.kind}` : ''}`,
        })
        if (logs.length > RING) logs.shift()
      },
      true,
    )
  let version = ''
  fetch('version', { cache: 'no-store' })
    .then((r) => r.json())
    .then((v) => (version = v.version))
    .catch(() => {})

  Object.assign(window, {
    __OBSERVE_CONFIG__: {
      feedbackEndpoint: RECEIVER,
      token,
      repo: REPO,
      traces: false,
      registerSw: false,
      button: false,
    },
    __observe_enrich__: () => ({
      version,
      ua: navigator.userAgent,
      standalone: matchMedia('(display-mode: standalone)').matches,
      w: innerWidth,
      h: innerHeight,
      tool: ed.tool,
      pen: ed.penSeen,
      multi: ed.multi,
      drag: ed.drag?.kind ?? null,
      sel: ed.sel ? `${ed.sel.items.length}/${ed.sel.walls.length}/${ed.sel.opens.length}` : null,
      logs: logs.slice(),
    }),
  })
  const s = document.createElement('script')
  s.src = 'observe.js'
  s.onload = () => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn ghost wide'
    b.title = 'Send feedback'
    b.append(Object.assign(document.createElement('span'), { textContent: 'Feedback' }))
    b.onclick = () => /** @type {any} */ (window).__observe__?.open()
    group.prepend(b)
  }
  document.head.append(s)
}

/**
 * No token yet: a field in the help dialog. An installed home-screen app cannot receive the
 * link's fragment (its storage is separate from Safari's), so the token is pasted there once.
 */
function tokenField() {
  const foot = document.querySelector('dialog.help .hint.foot')
  if (!foot) return
  const input = Object.assign(document.createElement('input'), {
    type: 'text',
    placeholder: 'Feedback token',
    spellcheck: false,
    autocapitalize: 'off',
    autocomplete: 'off',
  })
  const enable = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'btn ghost wide',
    title: 'Enable the Feedback button with a token from a feedback link',
  })
  enable.append(Object.assign(document.createElement('span'), { textContent: 'Enable feedback' }))
  enable.onclick = () => {
    const v = input.value.trim()
    if (!v) return input.focus()
    try {
      localStorage.setItem(KEY, v)
    } catch {}
    location.reload()
  }
  const box = Object.assign(document.createElement('div'), { className: 'in' })
  box.append(input)
  const row = Object.assign(document.createElement('div'), { className: 'g2' })
  row.append(box, enable)
  foot.append(row)
}
