// Feedback button: opens a prefilled GitHub issue (the Feedback form, label `feedback`, which
// the triage workflow picks up). No server, no token: a GitHub account is the identity.

/** @typedef {import('./editor.js').Editor} Editor */

const NEW_ISSUE = 'https://github.com/JakobMelchard/flatplan/issues/new'

/**
 * @param {Editor} ed
 * @param {HTMLElement} group header button group the Feedback button goes into
 * @param {() => string} version the running version, '' until known
 */
export function setupFeedback(ed, group, version) {
  const context = () =>
    [
      version() && `version ${version().split(' ')[0]}`,
      matchMedia('(display-mode: standalone)').matches ? 'home screen' : 'browser',
      `${innerWidth}×${innerHeight}`,
      `tool ${ed.tool}${ed.penSeen ? ', pencil' : ''}`,
      ed.sel && `selected ${ed.sel.items.length}/${ed.sel.walls.length}/${ed.sel.opens.length}`,
      navigator.userAgent.replace(/^Mozilla\/5\.0 \(/, '').split(')')[0],
    ]
      .filter(Boolean)
      .join(' · ')
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'btn ghost wide'
  b.title = 'Send feedback (opens a GitHub issue)'
  b.append(Object.assign(document.createElement('span'), { textContent: 'Feedback' }))
  b.onclick = () => {
    const q = new URLSearchParams({ template: 'feedback.yml', context: context() })
    window.open(`${NEW_ISSUE}?${q}`, '_blank', 'noopener')
  }
  group.prepend(b)
}
