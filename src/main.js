import { migrate } from './model.js'
import { load, save } from './store.js'
import { Editor } from './editor.js'
import { buildUI } from './ui.js'
import { setupFeedback } from './feedback.js'

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id))

const ed = new Editor(/** @type {HTMLCanvasElement} */ ($('c')), await load())
const refresh = buildUI(
  {
    top: $('top'),
    left: $('left'),
    right: $('right'),
    main: /** @type {HTMLElement} */ (document.querySelector('main')),
  },
  ed,
  (p) => (ed.p = migrate(p)),
)
let t = 0
let warned = false
ed.onChange = () => {
  refresh()
  clearTimeout(t)
  t = window.setTimeout(async () => {
    const err = await save(ed.p)
    if (err && !warned) ((warned = true), alert(err))
  }, 300)
}
// flush a pending save when the app is backgrounded (iPad home gesture, tab switch)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') (clearTimeout(t), save(ed.p))
})
// Safari pinch-zooms the whole page otherwise
document.addEventListener('gesturestart', (e) => e.preventDefault())
ed.fit()
ed.setTool('select')
Object.assign(window, { ed })
setupFeedback(ed, /** @type {HTMLElement} */ (document.querySelector('#top .hgroup')))

if ('serviceWorker' in navigator && location.hostname !== 'localhost')
  navigator.serviceWorker.register('sw.js')
