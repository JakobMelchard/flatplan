import { layout, asset, uid, blank } from './model.js'
import { exportFile, readFile, shrinkImage } from './store.js'
import { startDebugLog } from './debug.js'

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').Asset} Asset */
/** @typedef {import('./editor.js').Editor} Editor */
/** @typedef {import('./editor.js').Tool} Tool */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props] element properties; `on` maps event names to listeners
 * @param {...(Node | string)} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
const h = (tag, props = {}, ...kids) => {
  const { on, ...rest } = props
  const el = Object.assign(document.createElement(tag), rest)
  for (const [k, f] of Object.entries(on ?? {})) el.addEventListener(k, f)
  el.append(...kids)
  return el
}
const I = {
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>',
  wall: '<path d="M3 20V4M21 20V4M3 12h18"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  rotr: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  upload: '<path d="M12 16V4m-5 5l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12m-5-5l5 5 5-5M4 20h16"/>',
  door: '<path d="M14 4v16H5V4zM5 20h14M11 12h.01"/><path d="M14 4l5 2v14"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  flip: '<path d="M12 3v18M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/>',
  multi:
    '<rect x="3" y="3" width="11" height="11" rx="1" stroke-dasharray="3 2"/><path d="M13 13l7 3-3 1-1 3z"/>',
  all: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  left: '<path d="M4 5v14M20 5v14M9 5h6v14H9z"/>',
  right: '<path d="M4 5h16v14H4zM15 5v14"/>',
  catalog: '<path d="M4 5h16v14H4zM9 5v14"/>',
  aL: '<path d="M19 12H5m6-6l-6 6 6 6"/>',
  aR: '<path d="M5 12h14m-6-6l6 6-6 6"/>',
  aU: '<path d="M12 19V5m-6 6l6-6 6 6"/>',
  aD: '<path d="M12 5v14m-6-6l6 6 6-6"/>',
}
/** @param {string} d */
const svg = (d) => {
  const s = h('span')
  s.innerHTML = `<svg viewBox="0 0 24 24">${d}</svg>`
  return /** @type {SVGElement} */ (s.firstElementChild)
}
/**
 * @param {string} label
 * @param {() => void} click
 * @param {{ icon?: string, cls?: string, title?: string }} [opts]
 */
const btn = (label, click, opts = {}) =>
  h(
    'button',
    { className: `btn ${opts.cls ?? ''}`, title: opts.title ?? '', type: 'button', on: { click } },
    ...(opts.icon ? [svg(opts.icon)] : []),
    ...(label ? [label] : []),
  )
/**
 * @param {number} v
 * @param {(n: number) => void} oninput
 * @param {string} [unit]
 * @param {number} [step]
 */
const numIn = (v, oninput, unit = 'cm', step = 1) =>
  h(
    'div',
    { className: 'in' },
    h('input', {
      type: 'number',
      inputMode: 'decimal',
      value: String(v),
      step: String(step),
      on: { input: (/** @type {any} */ e) => oninput(+e.target.value) },
    }),
    h('span', { className: 'u', textContent: unit }),
  )
/**
 * @param {string} label
 * @param {HTMLElement} ctl
 */
const field = (label, ctl) =>
  h('label', { className: 'field' }, h('span', { textContent: label }), ctl)
/**
 * @param {string} label
 * @param {string} accept
 * @param {(f: File) => void} onFile
 * @param {{ icon?: string, cls?: string }} [opts]
 */
const file = (label, accept, onFile, opts = {}) =>
  h(
    'label',
    { className: `btn ${opts.cls ?? ''}` },
    ...(opts.icon ? [svg(opts.icon)] : []),
    h('span', { textContent: label }),
    h('input', {
      type: 'file',
      accept,
      on: {
        change: (/** @type {any} */ e) => {
          const f = e.target.files[0]
          e.target.value = ''
          if (f) onFile(f)
        },
      },
    }),
  )
/** @param {Asset} a */
const thumb = (a) => {
  const k = 34 / Math.max(a.w, a.d)
  const i = h('i')
  // one property at a time: a value from an imported file cannot add declarations of its own
  i.style.width = `${Math.max(4, a.w * k)}px`
  i.style.height = `${Math.max(4, a.d * k)}px`
  if (a.img) i.style.backgroundImage = `url("${a.img}")`
  else i.style.background = a.color
  return h('div', { className: 'th' }, i)
}
/** Default colours for new furniture: org palette tokens, with fallbacks (a colour input needs hex). */
const PALETTE = /** @type {const} */ ([
  ['--green', '#50fa7b'],
  ['--accent', '#8be9fd'],
  ['--orange', '#ffb86c'],
  ['--pink', '#ff79c6'],
  ['--purple', '#bd93f9'],
  ['--red', '#ff5555'],
])
/**
 * @param {number} i index, wraps around
 * @returns {string} #rrggbb
 */
const paletteColor = (i) => {
  const [name, fallback] = PALETTE[i % PALETTE.length]
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
}
/** @param {string} s */
const kbd = (s) => s.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>')
const narrow = matchMedia('(max-width: 1200px)')

/**
 * Build header, side panels, floating controls and dialogs around the editor.
 * @param {{ top: HTMLElement, left: HTMLElement, right: HTMLElement, main: HTMLElement }} el
 * @param {Editor} ed
 * @param {(p: Project) => void} setProject
 * @param {string} [warn] shown in the toast at start, with a reload button
 * @returns {() => void} refresh everything from the project
 */
export function buildUI({ top, left, right, main }, ed, setProject, warn) {
  const p = () => ed.p
  const body = document.body

  // ============ side panels: grid columns when wide, drawers over the canvas when narrow ============
  /**
   * @param {'left' | 'right'} side
   * @param {boolean} [open]
   */
  const panel = (side, open) => {
    body.classList.toggle(`no-${side}`, !(open ?? body.classList.contains(`no-${side}`)))
    if (narrow.matches && !body.classList.contains(`no-${side}`))
      body.classList.add(`no-${side === 'left' ? 'right' : 'left'}`)
    requestAnimationFrame(() => ed.resize())
  }
  const closeDrawers = () => narrow.matches && body.classList.add('no-left', 'no-right')
  const syncNarrow = () => {
    body.classList.toggle('no-left', narrow.matches)
    body.classList.toggle('no-right', narrow.matches)
    requestAnimationFrame(() => ed.resize())
  }
  syncNarrow()
  narrow.addEventListener('change', syncNarrow)
  main.addEventListener('pointerdown', closeDrawers)

  // ============ header: panels · brand · layout tabs · file actions ============
  const tabs = h('div', { className: 'tabs' })
  /** @param {string} id */
  const renameLayout = (id) => {
    const l = p().layouts.find((l) => l.id === id)
    const n = l && prompt('Layout name', l.name)?.trim()
    if (l && n) ((l.name = n), ed.changed())
  }
  const renderTabs = () =>
    tabs.replaceChildren(
      ...p().layouts.map((l) => {
        const on = l.id === p().current
        return h(
          'button',
          {
            className: `tab ${on ? 'on' : ''}`,
            title: 'tap again to rename',
            on: {
              click: () => {
                if (on) return renameLayout(l.id)
                p().current = l.id
                ed.sel = null
                ed.changed()
              },
            },
          },
          l.name,
          ...(on && p().layouts.length > 1
            ? [
                h(
                  'span',
                  {
                    className: 'x',
                    title: 'delete layout',
                    on: {
                      click: (/** @type {Event} */ e) => {
                        e.stopPropagation()
                        if (!confirm(`Delete layout "${l.name}"?`)) return
                        p().layouts = p().layouts.filter((x) => x.id !== l.id)
                        p().current = p().layouts[0].id
                        ed.changed()
                      },
                    },
                  },
                  svg(I.x),
                ),
              ]
            : []),
        )
      }),
      h(
        'button',
        {
          className: 'tab add',
          title: 'new layout',
          on: {
            click: () => {
              const id = uid()
              p().layouts.push({ id, name: `Layout ${p().layouts.length + 1}`, items: [] })
              p().current = id
              ed.changed()
            },
          },
        },
        '+',
      ),
      h(
        'button',
        {
          className: 'tab',
          title: 'duplicate current layout',
          on: {
            click: () => {
              const s = layout(p())
              const id = uid()
              p().layouts.push({
                id,
                name: `${s.name} copy`,
                items: s.items.map((i) => ({ ...i, id: uid() })),
              })
              p().current = id
              ed.changed()
            },
          },
        },
        svg(I.copy),
      ),
    )
  const help = h('dialog', { className: 'help' })
  top.append(
    btn('', () => panel('left'), { icon: I.catalog, cls: 'ghost icon', title: 'Furniture panel' }),
    h('div', { className: 'brand' }, h('i'), h('span', { textContent: 'flatplan' })),
    tabs,
    h(
      'div',
      { className: 'hgroup' },
      btn('', () => (help.open ? help.close() : help.showModal()), {
        icon: I.help,
        cls: 'ghost icon',
        title: 'Help  ?',
      }),
      file(
        'Import',
        'application/json,.json',
        async (f) => {
          try {
            setProject(JSON.parse(await readFile(f, 'text')))
          } catch {
            return alert('Not a flatplan project file.')
          }
          ed.sel = null
          ed.changed()
          ed.fit()
        },
        { icon: I.upload, cls: 'ghost wide' },
      ),
      btn('Export', () => exportFile('flatplan.json', JSON.stringify(p())), {
        icon: I.download,
        cls: 'ghost wide',
      }),
      btn(
        '',
        () => {
          if (!confirm('Erase everything? Export first if unsure.')) return
          setProject(blank())
          ed.sel = null
          ed.changed()
          ed.fit()
        },
        { icon: I.reset, cls: 'ghost icon', title: 'Reset project' },
      ),
      btn('', () => panel('right'), {
        icon: I.right,
        cls: 'ghost icon',
        title: 'Properties panel',
      }),
    ),
  )

  // ============ floating toolbar / zoom / status / actions ============
  /** @type {[Tool, string, string][]} */
  const tools = [
    ['select', I.cursor, 'Select  V'],
    ['wall', I.wall, 'Draw walls  W'],
    ['door', I.door, 'Door  D'],
    ['window', I.window, 'Window  N'],
    ['scale', I.ruler, 'Calibrate image scale'],
  ]
  const toolBtns = tools.map(([t, ic, tip]) =>
    h(
      'button',
      { className: 'tool', type: 'button', title: tip, on: { click: () => ed.setTool(t) } },
      svg(ic),
    ),
  )
  toolBtns.forEach((b, i) => b.setAttribute('data-tip', tools[i][2]))
  /** @param {string} icon @param {() => void} fn @param {string} tip */
  const toolBtn = (icon, fn, tip) =>
    h('button', { className: 'tool', type: 'button', title: tip, on: { click: fn } }, svg(icon))
  const undoBtn = toolBtn(I.undo, () => ed.undo(), 'Undo  Ctrl+Z · two-finger tap')
  const redoBtn = toolBtn(I.redo, () => ed.redo(), 'Redo  Shift+Ctrl+Z')
  const multiBtn = toolBtn(
    I.multi,
    () => {
      if (ed.tool !== 'select') ed.setTool('select')
      ed.multi = !ed.multi
      ed.onSelect()
      ed.hint()
    },
    'Multi-select: tap items to add / remove, drag to box-select',
  )
  undoBtn.setAttribute('data-tip', 'Undo')
  redoBtn.setAttribute('data-tip', 'Redo')
  multiBtn.setAttribute('data-tip', 'Multi-select')
  const syncTools = () => {
    toolBtns.forEach((b, i) => b.classList.toggle('on', tools[i][0] === ed.tool && !ed.multi))
    multiBtn.classList.toggle('on', ed.multi && ed.tool === 'select')
    undoBtn.disabled = !ed.hist.undos.length
    redoBtn.disabled = !ed.hist.redos.length
  }
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (main.querySelector(s))
  $('#toolbar').append(
    toolBtns[0],
    multiBtn,
    h('span', { className: 'sep' }),
    ...toolBtns.slice(1, 4),
    h('span', { className: 'sep' }),
    toolBtns[4],
    h('span', { className: 'sep' }),
    undoBtn,
    redoBtn,
  )

  // after an undo / redo: say what happened and offer the opposite, so redo is findable
  const toast = $('#toast')
  let toastT = 0
  /**
   * @param {string} text
   * @param {HTMLElement} action
   * @param {number} [ms] auto-hide after, 0 = stay
   */
  const notify = (text, action, ms = 4000) => {
    toast.replaceChildren(h('span', { textContent: text }), action)
    toast.hidden = false
    clearTimeout(toastT)
    if (ms) toastT = window.setTimeout(() => (toast.hidden = true), ms)
  }
  ed.onHistory = (did) =>
    did === 'undo'
      ? notify(
          'Undone',
          btn('Redo', () => ed.redo(), { icon: I.redo, cls: 'ghost' }),
        )
      : notify(
          'Redone',
          btn('Undo', () => ed.undo(), { icon: I.undo, cls: 'ghost' }),
        )
  if (warn)
    notify(
      warn,
      btn('Reload', () => location.reload(), { icon: I.reset, cls: 'ghost' }),
      0,
    )

  // An app opened from the home screen resumes the old page instead of reloading, so check the
  // served commit when it comes back to the foreground and offer a reload after a deploy.
  const ver = h('div', { className: 'hint' })
  /** @type {string | null} */
  let running = null
  const checkVersion = async () => {
    try {
      /** @type {{ version: string, debug: boolean }} */
      const v = await (await fetch('version', { cache: 'no-store' })).json()
      if (running === null) {
        running = v.version
        ver.textContent = `Version ${v.version || 'unknown'}`
        if (v.debug) startDebugLog(ed, v.version)
      } else if (v.version && v.version !== running)
        notify(
          'Update available',
          btn('Reload', () => location.reload(), { icon: I.reset, cls: 'ghost' }),
          0,
        )
    } catch {} // offline, or a static host without /version
  }
  checkVersion()
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'visible' && checkVersion(),
  )

  const pct = h('span', { className: 'pct' })
  ed.onView = () => (pct.textContent = `${Math.round(ed.k * 100)} %`)
  $('#zoomer').append(
    btn('', () => ed.zoom(1 / 1.25), { icon: I.minus, cls: 'icon', title: 'Zoom out' }),
    pct,
    btn('', () => ed.zoom(1.25), { icon: I.plus, cls: 'icon', title: 'Zoom in' }),
    btn('', () => ed.fit(), { icon: I.fit, cls: 'icon', title: 'Fit  F' }),
  )

  const st = { mode: h('b'), hint: h('span'), c: h('span', { className: 'c' }) }
  $('#status').append(st.mode, st.hint, st.c)
  ed.status = (hint, coords) => {
    st.mode.textContent = ed.tool[0].toUpperCase() + ed.tool.slice(1)
    st.hint.textContent = hint
    st.c.textContent = coords
  }

  // contextual buttons for the selection or the running tool, so nothing needs a keyboard
  const actions = $('#actions')
  const lenIn = h('input', {
    type: 'number',
    inputMode: 'decimal',
    placeholder: 'length',
    on: {
      input: () => (ed.lenBuf = lenIn.value),
      keydown: (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Enter' && +lenIn.value > 0) (ed.commitLength(+lenIn.value), lenIn.focus())
      },
    },
  })
  /**
   * @param {number} dx
   * @param {number} dy
   * @param {string} icon
   */
  const arrow = (dx, dy, icon) =>
    btn('', () => +lenIn.value > 0 && ed.commitLength(+lenIn.value, { x: dx, y: dy }), {
      icon,
      cls: 'icon',
      title: 'Add a wall of this length in this direction',
    })
  const sep = () => h('span', { className: 'sep' })
  const renderActions = () => {
    const n = ed.count()
    const o = ed.selectedOpening()
    const w = ed.selectedWall()
    /** @type {HTMLElement[]} */
    let kids = []
    if (ed.tool === 'wall' && ed.drawPts.length) {
      if (document.activeElement !== lenIn) lenIn.value = ed.lenBuf
      kids = [
        h('div', { className: 'in len' }, lenIn, h('span', { className: 'u', textContent: 'cm' })),
        arrow(1, 0, I.aR),
        arrow(0, 1, I.aD),
        arrow(-1, 0, I.aL),
        arrow(0, -1, I.aU),
        sep(),
        btn('', () => ed.undoPoint(), { icon: I.undo, cls: 'icon', title: 'Undo last corner' }),
        btn('Done', () => ed.endWall(), { icon: I.check, cls: 'pri' }),
      ]
    } else if (o)
      kids = [
        ...(o.kind === 'door'
          ? [
              btn('Hinge', () => ((o.hinge = o.hinge ? 0 : 1), ed.changed()), { icon: I.flip }),
              btn('Swing', () => ((o.swing = o.swing === 1 ? -1 : 1), ed.changed()), {
                icon: I.rotr,
              }),
              sep(),
            ]
          : []),
        btn('', () => ed.del(), { icon: I.trash, cls: 'icon danger', title: `Delete ${o.kind}` }),
      ]
    else if (w) {
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
      kids = [
        btn('Door', () => ed.addOpening('door', m), { icon: I.door }),
        btn('Window', () => ed.addOpening('window', m), { icon: I.window }),
        sep(),
        btn('', () => ed.del(), { icon: I.trash, cls: 'icon danger', title: 'Delete wall' }),
      ]
    } else if (n)
      kids = [
        ...(n > 1 ? [h('span', { className: 'count', textContent: `${n}` })] : []),
        btn('', () => ed.selectAll(), {
          icon: I.all,
          cls: 'icon',
          title: 'Select everything  Ctrl+A',
        }),
        sep(),
        btn('90', () => ed.rotate(-90), { icon: I.rotl, title: 'Rotate −90°  Shift+R' }),
        btn('15', () => ed.rotate(-15), { icon: I.rotl, title: 'Rotate −15°  Q' }),
        btn('15', () => ed.rotate(15), { icon: I.rotr, title: 'Rotate +15°  E' }),
        btn('90', () => ed.rotate(90), { icon: I.rotr, title: 'Rotate +90°  R' }),
        sep(),
        btn('', () => ed.dup(), { icon: I.copy, cls: 'icon', title: 'Duplicate  Ctrl+D' }),
        btn('', () => ed.del(), { icon: I.trash, cls: 'icon danger', title: 'Delete  Del' }),
      ]
    actions.replaceChildren(...kids)
    actions.hidden = !kids.length
  }

  // ============ dialogs ============
  const f = {
    name: h('input', { placeholder: 'e.g. Sofa' }),
    w: h('input', { type: 'number', inputMode: 'decimal', min: '1' }),
    d: h('input', { type: 'number', inputMode: 'decimal', min: '1' }),
    h: h('input', { type: 'number', inputMode: 'decimal', min: '0' }),
    color: h('input', { type: 'color' }),
    img: '',
  }
  /** @type {Asset | null} */
  let editing = null
  const imgBtn = file(
    'Top-view image',
    'image/*',
    async (fl) => {
      const src = await shrinkImage(await readFile(fl, 'dataURL'), 600).catch(() => '')
      if (!src) return alert('Not an image file.')
      f.img = src
      syncImg()
    },
    { icon: I.image },
  )
  const syncImg = () => {
    ;/** @type {HTMLElement} */ (imgBtn.querySelector('span')).textContent = f.img
      ? 'Image set'
      : 'Top-view image'
    clearImg.hidden = !f.img
  }
  const clearImg = btn('', () => ((f.img = ''), syncImg()), {
    icon: I.x,
    cls: 'icon',
    title: 'remove image',
  })
  const dTitle = h('span')
  const dDel = btn(
    'Delete',
    () => {
      if (!editing || !confirm(`Delete "${editing.name}" and every placed copy?`)) return
      const id = editing.id
      p().assets = p().assets.filter((a) => a.id !== id)
      p().layouts.forEach((l) => (l.items = l.items.filter((i) => i.asset !== id)))
      dlg.close()
      ed.sel = null
      ed.changed()
    },
    { cls: 'danger', icon: I.trash },
  )
  /** @param {HTMLInputElement} i */
  const cm = (i) =>
    h('div', { className: 'in' }, i, h('span', { className: 'u', textContent: 'cm' }))
  const dlg = h(
    'dialog',
    {},
    h(
      'form',
      {
        method: 'dialog',
        on: {
          submit: (/** @type {Event} */ e) => {
            e.preventDefault()
            const v = {
              name: f.name.value.trim() || 'Item',
              w: +f.w.value || 50,
              d: +f.d.value || 50,
              h: +f.h.value || 0,
              color: f.color.value,
            }
            if (editing) {
              Object.assign(editing, v)
              if (f.img) editing.img = f.img
              else delete editing.img
            } else p().assets.push({ id: uid(), ...v, ...(f.img ? { img: f.img } : {}) })
            dlg.close()
            ed.changed()
          },
        },
      },
      h(
        'div',
        { className: 'dh' },
        dTitle,
        btn('', () => dlg.close(), { icon: I.x, cls: 'ghost icon' }),
      ),
      field('Name', h('div', { className: 'in' }, f.name)),
      h(
        'div',
        { className: 'g3' },
        field('Width', cm(f.w)),
        field('Depth', cm(f.d)),
        field('Height', cm(f.h)),
      ),
      h(
        'div',
        { className: 'g2' },
        field('Colour', h('div', { className: 'in' }, f.color)),
        field('Image (optional)', h('div', { className: 'row' }, imgBtn, clearImg)),
      ),
      h(
        'div',
        { className: 'df' },
        dDel,
        btn('Cancel', () => dlg.close()),
        h('button', { className: 'btn pri', type: 'submit', textContent: 'Save' }),
      ),
    ),
  )
  body.append(dlg)
  /** @param {Asset | null} a */
  const openDlg = (a) => {
    editing = a
    dTitle.textContent = a ? 'Edit item' : 'New item'
    dDel.hidden = !a
    f.name.value = a?.name ?? ''
    f.w.value = String(a?.w ?? 100)
    f.d.value = String(a?.d ?? 50)
    f.h.value = String(a?.h ?? 75)
    f.color.value = a?.color ?? paletteColor(p().assets.length)
    f.img = a?.img ?? ''
    syncImg()
    dlg.showModal()
    if (!matchMedia('(pointer: coarse)').matches) f.name.focus()
  }

  // real length of the segment marked with the scale tool
  const scaleIn = h('input', { type: 'number', inputMode: 'decimal', min: '1' })
  /** @type {(v: number | null) => void} */
  let scaleDone = () => {}
  const scaleDlg = h(
    'dialog',
    {
      on: { close: () => scaleDone(scaleDlg.returnValue === 'ok' ? +scaleIn.value || null : null) },
    },
    h(
      'form',
      { method: 'dialog' },
      h('div', { className: 'dh' }, 'Set image scale'),
      h('div', { className: 'hint', textContent: 'Real length of the segment you marked:' }),
      field('Length', cm(scaleIn)),
      h(
        'div',
        { className: 'df' },
        h('button', { className: 'btn', value: 'cancel', textContent: 'Cancel' }),
        h('button', { className: 'btn pri', value: 'ok', textContent: 'Apply' }),
      ),
    ),
  )
  body.append(scaleDlg)
  ed.askLength = (measured) =>
    new Promise((res) => {
      scaleDone = res
      scaleIn.value = String(Math.round(measured))
      scaleDlg.returnValue = ''
      scaleDlg.showModal()
      scaleIn.select()
    })

  // ============ left: catalog ============
  // Cards are dragged with pointer events (HTML drag and drop is unreliable on touch):
  // a horizontal drag carries the item onto the canvas, vertical movement scrolls the list,
  // a tap places the item in the middle of the view.
  const cards = h('div', { className: 'cards' })
  /**
   * @param {HTMLElement} card
   * @param {Asset} a
   */
  const draggable = (card, a) => {
    /** @type {{ x: number, y: number, id: number, ghost?: HTMLElement } | null} */
    let g = null
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('button')) return
      g = { x: e.clientX, y: e.clientY, id: e.pointerId }
    })
    card.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return
      if (!g.ghost && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) {
        try {
          card.setPointerCapture(e.pointerId)
        } catch {}
        g.ghost = h('div', { className: 'dragging' }, thumb(a), h('b', { textContent: a.name }))
        body.append(g.ghost)
        if (narrow.matches) setTimeout(closeDrawers, 150)
      }
      if (g.ghost) g.ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`
    })
    card.addEventListener('pointerup', (e) => {
      if (!g || e.pointerId !== g.id) return
      const ghost = g.ghost
      g = null
      if (!ghost) return (ed.addItem(a.id), closeDrawers())
      ghost.remove()
      // bounds, not elementFromPoint: a drawer may still be sliding away over the canvas
      const r = ed.cv.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) ed.addItem(a.id, ed.w(e))
    })
    card.addEventListener('pointercancel', () => {
      g?.ghost?.remove()
      g = null
    })
  }
  const renderCards = () => {
    const rows = p().assets.map((a) => {
      const card = h(
        'div',
        { className: 'card', title: 'Tap to place, or drag onto the plan' },
        thumb(a),
        h(
          'div',
          {},
          h('b', { textContent: a.name }),
          h('small', { textContent: `${a.w} × ${a.d} cm` }),
        ),
        h(
          'div',
          { className: 'act' },
          btn('', () => openDlg(a), { icon: I.edit, cls: 'icon ghost', title: 'Edit' }),
        ),
      )
      draggable(card, a)
      return card
    })
    cards.replaceChildren(
      ...(rows.length
        ? rows
        : [
            h(
              'div',
              { className: 'empty' },
              'No furniture yet.',
              h('br'),
              'Add your pieces with real measurements, then tap or drag them onto the plan.',
            ),
          ]),
    )
  }
  left.append(
    h(
      'div',
      { className: 'ph' },
      h('h2', { textContent: 'Furniture' }),
      btn('New', () => openDlg(null), { icon: I.plus, cls: 'pri' }),
    ),
    cards,
  )

  // ============ right: inspector ============
  const insp = h('div', { className: 'sec' })
  const renderSel = () => {
    const it = ed.selected()
    const a = it && asset(p(), it.asset)
    if (it && a) {
      const bad = ed.collides(it, it.x, it.y, it.rot)
      insp.replaceChildren(
        h(
          'div',
          {},
          h('div', { className: 'title', textContent: a.name }),
          h('div', {
            className: `sub ${bad ? 'warn' : ''}`,
            textContent: bad ? 'Overlaps a wall' : `${a.w} × ${a.d} × ${a.h} cm`,
          }),
        ),
        h(
          'div',
          { className: 'g2' },
          field(
            'X',
            numIn(it.x, (v) => ((it.x = v), ed.changed())),
          ),
          field(
            'Y',
            numIn(it.y, (v) => ((it.y = v), ed.changed())),
          ),
        ),
        field(
          'Rotation',
          numIn(it.rot, (v) => ((it.rot = v), ed.changed()), '°', 15),
        ),
        btn('Edit item', () => openDlg(a), { icon: I.edit }),
      )
    } else if (ed.count() > 1) {
      const its = ed.selectedItems()
      const sel = /** @type {import('./editor.js').SelSet} */ (ed.sel)
      /** @type {[number, string, string?][]} */
      const kinds = [
        [its.length, 'item'],
        [sel.walls.length, 'wall'],
        [sel.opens.length, 'door / window', 'doors / windows'],
      ]
      const parts = kinds
        .filter(([n]) => n)
        .map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`)
      const bad = its.filter((i) => ed.collides(i, i.x, i.y, i.rot)).length
      insp.replaceChildren(
        h(
          'div',
          {},
          h('div', { className: 'title', textContent: `${ed.count()} selected` }),
          h('div', {
            className: `sub ${bad ? 'warn' : ''}`,
            textContent: bad ? `${bad} overlap a wall` : parts.join(', '),
          }),
        ),
      )
    } else if (ed.selectedOpening()) {
      const o = /** @type {import('./model.js').Opening} */ (ed.selectedOpening())
      const G = ed.geom(o)
      insp.replaceChildren(
        h(
          'div',
          {},
          h('div', { className: 'title', textContent: o.kind === 'door' ? 'Door' : 'Window' }),
          h('div', { className: 'sub', textContent: `on a ${G ? G.L.toFixed(0) : '?'} cm wall` }),
        ),
        h(
          'div',
          { className: 'g2' },
          field(
            'Width',
            numIn(o.w, (v) => ((o.w = Math.max(20, v || 20)), ed.clampOpening(o), ed.changed())),
          ),
          field(
            'From wall start',
            numIn(o.t, (v) => ((o.t = v), ed.clampOpening(o), ed.changed())),
          ),
        ),
      )
    } else if (ed.selectedWall()) {
      const w = /** @type {import('./model.js').Wall} */ (ed.selectedWall())
      insp.replaceChildren(
        h(
          'div',
          {},
          h('div', { className: 'title', textContent: 'Wall' }),
          h('div', {
            className: 'sub',
            textContent: `${Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(0)} cm`,
          }),
        ),
      )
    } else
      insp.replaceChildren(
        h('div', {
          className: 'hint',
          innerHTML: kbd(
            'Select an item, door or wall to edit it.<br><br>Drag to pan, pinch or scroll to zoom, [F] fits the view.',
          ),
        }),
      )
  }

  const opacity = h('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    on: {
      input: (/** @type {any} */ e) => {
        const im = p().plan.image
        if (im) ((im.opacity = +e.target.value), ed.changed())
      },
    },
  })
  const imgRow = h('div', { className: 'g2' })
  const wallT = h('div')
  const renderPlan = () => {
    const im = p().plan.image
    imgRow.replaceChildren(
      file(
        im ? 'Replace' : 'Upload plan',
        'image/*',
        async (fl) => {
          const src = await shrinkImage(await readFile(fl, 'dataURL')).catch(() => '')
          if (!src) return alert('Not an image file.')
          p().plan.image = { src, x: 0, y: 0, cmPerPx: 1, opacity: 0.6 }
          ed.changed()
          ed.fit()
          ed.setTool('scale')
          closeDrawers()
        },
        { icon: I.image },
      ),
      im
        ? btn('Remove', () => (delete p().plan.image, ed.changed()), { icon: I.x })
        : btn('Set scale', () => (ed.setTool('scale'), closeDrawers()), { icon: I.ruler }),
    )
    opacity.value = String(im?.opacity ?? 0.6)
    opacity.disabled = !im
    if (!wallT.contains(document.activeElement))
      wallT.replaceChildren(
        numIn(p().plan.wallT ?? 10, (v) => ((p().plan.wallT = v || 10), ed.changed())),
      )
  }
  right.append(
    insp,
    h(
      'div',
      { className: 'sec' },
      h('h3', { textContent: 'Floor plan' }),
      imgRow,
      field('Image opacity', opacity),
      field('Wall thickness', wallT),
      btn(
        'Clear all walls',
        () => {
          if (confirm('Delete all walls?'))
            ((p().plan.walls = []), (p().plan.openings = []), ed.changed())
        },
        { cls: 'danger', icon: I.trash },
      ),
    ),
  )

  // ============ help overlay (? button / ? key) ============
  /**
   * @param {string} k
   * @param {string} d
   */
  const row = (k, d) =>
    h(
      'div',
      { className: 'hrow' },
      h('span', { innerHTML: kbd(k) }),
      h('span', { innerHTML: kbd(d) }),
    )
  /**
   * @param {string} title
   * @param {...HTMLElement} rows
   */
  const col = (title, ...rows) =>
    h('div', { className: 'hcol' }, h('h3', { textContent: title }), ...rows)
  help.append(
    h(
      'div',
      { className: 'dh' },
      'flatplan: shortcuts & how-to',
      btn('', () => help.close(), { icon: I.x, cls: 'ghost icon' }),
    ),
    h(
      'div',
      { className: 'hgrid' },
      col(
        'Touch & Pencil',
        row('tap', 'Select; in a drawing tool, place a point'),
        row('drag', 'Move the selection, else pan'),
        row('pinch', 'Zoom and pan with two fingers'),
        row('Pencil', 'Once used, only the Pencil places points; fingers pan and zoom'),
        row('handle', 'Drag the dot above an item to rotate (15° steps)'),
        row('two-finger tap', 'Undo; the pill that appears offers Redo (also the toolbar arrows)'),
        row(
          'multi-select button',
          'Next to Select: taps add / remove furniture, walls, doors; drag draws a box',
        ),
        row(
          'long-press',
          'Same without the button: on something toggles it, on empty space starts a box',
        ),
        row('selected wall', 'Drag it to move; walls joined to it stretch along'),
      ),
      col(
        'Walls',
        row('tap', 'Place corner; tap first corner to close, last corner to finish'),
        row('length + arrow', 'Exact segment in cm (bottom bar)'),
        row('[0-9] [Enter]', 'Same from the keyboard, along the cursor axis'),
        row('[Shift]', 'Lock to 90°'),
        row('[Ctrl]', 'Disable grid snap'),
      ),
      col(
        'Furniture',
        row('tap / drag card', 'Place in the middle / where you drop it'),
        row('drag', 'Stops at walls and door swings, snaps to wall faces'),
        row('[R] / [Shift]+[R]', 'Rotate ±90°'),
        row('[Q] / [E]', 'Rotate ±15°'),
        row('[↑][↓][←][→]', 'Nudge 1 cm ([Shift] = 10)'),
        row('[Ctrl]+[D] / [Del]', 'Duplicate / remove'),
        row('[Shift]+click / drag', 'Add to selection / box select (Pencil: drag on empty space)'),
        row('[Ctrl]+[A]', 'Select all items'),
        row('[Ctrl]+[Z] / [Shift]+[Ctrl]+[Z]', 'Undo / redo'),
      ),
      col(
        'Doors & windows',
        row('[D] / [N]', 'Tool; then tap a wall'),
        row('drag', 'Slide along the wall'),
        row('bottom bar', 'Hinge side, swing side'),
        row('', 'Door swing zone is solid for furniture'),
      ),
      col(
        'View',
        row('wheel / pinch', 'Zoom'),
        row('drag empty', 'Pan'),
        row('[F]', 'Fit everything'),
        row('[V] [W] [Esc]', 'Select, walls, finish'),
      ),
      col(
        'Plan image',
        row('Upload plan', 'Then tap two points with a known distance and enter it'),
        row('opacity', 'Fade the scan under your walls'),
        row('Export / Import', 'Whole project as JSON incl. images'),
      ),
    ),
    h(
      'div',
      { className: 'hint foot' },
      h('span', { innerHTML: kbd('Press [?] anytime to open this. ') }),
      h('a', { href: '../', target: '_blank', textContent: 'Full documentation' }),
      ver,
    ),
  )
  body.append(help)
  window.addEventListener('keydown', (e) => {
    if (e.key === '?' && !(e.target instanceof Element && e.target.matches('input,textarea'))) {
      e.preventDefault()
      help.open ? help.close() : help.showModal()
    }
  })

  // ============ wiring ============
  const refresh = () => {
    renderTabs()
    renderCards()
    renderSel()
    renderPlan()
    renderActions()
    syncTools()
    ed.onView()
  }
  ed.onSelect = () => {
    renderSel()
    renderActions()
    syncTools()
  }
  refresh()
  return refresh
}
