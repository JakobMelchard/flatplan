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
const NS = 'http://www.w3.org/2000/svg'
/** @param {string} id icon: a `<symbol id="i-…">` in index.html */
const svg = (id) => {
  const s = document.createElementNS(NS, 'svg')
  const u = document.createElementNS(NS, 'use')
  s.setAttribute('viewBox', '0 0 24 24')
  u.setAttribute('href', `#i-${id}`)
  s.append(u)
  return s
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
/** Default colours for new furniture: org palette tokens, all #rrggbb as a colour input needs. */
const PALETTE = ['--green', '--accent', '--orange', '--pink', '--purple', '--red']
/**
 * @param {number} i index, wraps around
 * @returns {string} #rrggbb
 */
const paletteColor = (i) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(PALETTE[i % PALETTE.length])
    .trim()
const narrow = matchMedia('(max-width: 1200px)')

/**
 * Build header, side panels, floating controls and dialogs around the editor.
 * @param {{ top: HTMLElement, left: HTMLElement, right: HTMLElement, main: HTMLElement }} el
 * @param {Editor} ed
 * @param {(p: any) => string[]} setProject check and use a project the user chose (Import, Reset),
 *   lift a save block; returns the names of the images it dropped, throws when it is not a project
 * @param {string} [warn] shown in the toast while saving is blocked, with a reload button
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
                  svg('x'),
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
        svg('copy'),
      ),
    )
  const help = /** @type {HTMLDialogElement} */ (document.getElementById('help'))
  top.append(
    btn('', () => panel('left'), { icon: 'catalog', cls: 'ghost icon', title: 'Furniture panel' }),
    h('div', { className: 'brand' }, h('i'), h('span', { textContent: 'flatplan' })),
    tabs,
    h(
      'div',
      { className: 'hgroup' },
      btn('', () => (help.open ? help.close() : help.showModal()), {
        icon: 'help',
        cls: 'ghost icon',
        title: 'Help  ?',
      }),
      file(
        'Import',
        'application/json,.json',
        async (f) => {
          let dropped
          try {
            dropped = setProject(JSON.parse(await readFile(f, 'text')))
          } catch {
            return alert('Not a flatplan project file.')
          }
          unblock()
          ed.sel = null
          ed.changed()
          ed.fit()
          if (dropped.length)
            notify(
              `Images not imported (only embedded ones are kept): ${dropped.join(', ')}`,
              btn('OK', () => (toast.hidden = true), { cls: 'ghost' }),
              0,
            )
        },
        { icon: 'upload', cls: 'ghost wide' },
      ),
      btn('Export', () => exportFile('flatplan.json', JSON.stringify(p())), {
        icon: 'download',
        cls: 'ghost wide',
      }),
      btn(
        '',
        () => {
          if (!confirm('Erase everything? Export first if unsure.')) return
          setProject(blank())
          unblock()
          ed.sel = null
          ed.changed()
          ed.fit()
        },
        { icon: 'reset', cls: 'ghost icon', title: 'Reset project' },
      ),
      btn('', () => panel('right'), {
        icon: 'right',
        cls: 'ghost icon',
        title: 'Properties panel',
      }),
    ),
  )

  // ============ floating toolbar / zoom / status / actions ============
  /** @type {[Tool, string, string][]} */
  const tools = [
    ['select', 'cursor', 'Select  V'],
    ['wall', 'wall', 'Draw walls  W'],
    ['door', 'door', 'Door  D'],
    ['window', 'window', 'Window  N'],
    ['scale', 'ruler', 'Calibrate image scale'],
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
  const undoBtn = toolBtn('undo', () => ed.undo(), 'Undo  Ctrl+Z · two-finger tap')
  const redoBtn = toolBtn('redo', () => ed.redo(), 'Redo  Shift+Ctrl+Z')
  const multiBtn = toolBtn(
    'multi',
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
    if (ms) toastT = window.setTimeout(() => (warn ? warnToast() : (toast.hidden = true)), ms)
  }
  // while saving is blocked the warning comes back after every other toast
  const warnToast = () =>
    notify(
      warn ?? '',
      btn('Reload', () => location.reload(), { icon: 'reset', cls: 'ghost' }),
      0,
    )
  /** the save block is lifted (Import, Reset) */
  const unblock = () => warn && ((warn = ''), (toast.hidden = true))
  ed.onHistory = (did) =>
    did === 'undo'
      ? notify(
          'Undone',
          btn('Redo', () => ed.redo(), { icon: 'redo', cls: 'ghost' }),
        )
      : notify(
          'Redone',
          btn('Undo', () => ed.undo(), { icon: 'undo', cls: 'ghost' }),
        )
  if (warn) warnToast()

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
          btn('Reload', () => location.reload(), { icon: 'reset', cls: 'ghost' }),
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
    btn('', () => ed.zoom(1 / 1.25), { icon: 'minus', cls: 'icon', title: 'Zoom out' }),
    pct,
    btn('', () => ed.zoom(1.25), { icon: 'plus', cls: 'icon', title: 'Zoom in' }),
    btn('', () => ed.fit(), { icon: 'fit', cls: 'icon', title: 'Fit  F' }),
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
        arrow(1, 0, 'aR'),
        arrow(0, 1, 'aD'),
        arrow(-1, 0, 'aL'),
        arrow(0, -1, 'aU'),
        sep(),
        btn('', () => ed.undoPoint(), { icon: 'undo', cls: 'icon', title: 'Undo last corner' }),
        btn('Done', () => ed.endWall(), { icon: 'check', cls: 'pri' }),
      ]
    } else if (o)
      kids = [
        ...(o.kind === 'door'
          ? [
              btn('Hinge', () => ((o.hinge = o.hinge ? 0 : 1), ed.changed()), { icon: 'flip' }),
              btn('Swing', () => ((o.swing = o.swing === 1 ? -1 : 1), ed.changed()), {
                icon: 'rotr',
              }),
              sep(),
            ]
          : []),
        btn('', () => ed.del(), { icon: 'trash', cls: 'icon danger', title: `Delete ${o.kind}` }),
      ]
    else if (w) {
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
      kids = [
        btn('Door', () => ed.addOpening('door', m), { icon: 'door' }),
        btn('Window', () => ed.addOpening('window', m), { icon: 'window' }),
        sep(),
        btn('', () => ed.del(), { icon: 'trash', cls: 'icon danger', title: 'Delete wall' }),
      ]
    } else if (n)
      kids = [
        ...(n > 1 ? [h('span', { className: 'count', textContent: `${n}` })] : []),
        btn('', () => ed.selectAll(), {
          icon: 'all',
          cls: 'icon',
          title: 'Select everything  Ctrl+A',
        }),
        sep(),
        btn('90', () => ed.rotate(-90), { icon: 'rotl', title: 'Rotate −90°  Shift+R' }),
        btn('15', () => ed.rotate(-15), { icon: 'rotl', title: 'Rotate −15°  Q' }),
        btn('15', () => ed.rotate(15), { icon: 'rotr', title: 'Rotate +15°  E' }),
        btn('90', () => ed.rotate(90), { icon: 'rotr', title: 'Rotate +90°  R' }),
        sep(),
        btn('', () => ed.dup(), { icon: 'copy', cls: 'icon', title: 'Duplicate  Ctrl+D' }),
        btn('', () => ed.del(), { icon: 'trash', cls: 'icon danger', title: 'Delete  Del' }),
      ]
    actions.replaceChildren(...kids)
    actions.hidden = !kids.length
  }

  // ============ dialogs, markup in index.html ============
  const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('item'))
  const form = /** @type {HTMLFormElement} */ (dlg.firstElementChild)
  const el = (/** @type {string} */ n) =>
    /** @type {HTMLInputElement} */ (form.elements.namedItem(n))
  const f = { name: el('name'), w: el('w'), d: el('d'), h: el('h'), color: el('color'), img: '' }
  /** @type {Asset | null} */
  let editing = null
  el('file').addEventListener('change', async () => {
    const fl = el('file').files?.[0]
    el('file').value = ''
    if (!fl) return
    const src = await shrinkImage(await readFile(fl, 'dataURL'), 600).catch(() => '')
    if (!src) return alert('Not an image file.')
    f.img = src
    syncImg()
  })
  const syncImg = () => {
    ;/** @type {HTMLElement} */ (el('file').previousElementSibling).textContent = f.img
      ? 'Image set'
      : 'Top-view image'
    el('clear').hidden = !f.img
  }
  el('clear').addEventListener('click', () => ((f.img = ''), syncImg()))
  const dTitle = /** @type {HTMLElement} */ (form.querySelector('.dh span'))
  const dDel = el('del')
  dDel.addEventListener('click', () => {
    if (!editing || !confirm(`Delete "${editing.name}" and every placed copy?`)) return
    const id = editing.id
    p().assets = p().assets.filter((a) => a.id !== id)
    p().layouts.forEach((l) => (l.items = l.items.filter((i) => i.asset !== id)))
    dlg.close()
    ed.sel = null
    ed.changed()
  })
  el('close').addEventListener('click', () => dlg.close())
  el('cancel').addEventListener('click', () => dlg.close())
  form.addEventListener('submit', (e) => {
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
  })
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
  const scaleDlg = /** @type {HTMLDialogElement} */ (document.getElementById('scale'))
  const scaleIn = /** @type {HTMLInputElement} */ (scaleDlg.querySelector('input'))
  /** @type {(v: number | null) => void} */
  let scaleDone = () => {}
  scaleDlg.addEventListener('close', () =>
    scaleDone(scaleDlg.returnValue === 'ok' ? +scaleIn.value || null : null),
  )
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
          btn('', () => openDlg(a), { icon: 'edit', cls: 'icon ghost', title: 'Edit' }),
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
      btn('New', () => openDlg(null), { icon: 'plus', cls: 'pri' }),
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
        btn('Edit item', () => openDlg(a), { icon: 'edit' }),
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
        h(
          'div',
          { className: 'hint' },
          'Select an item, door or wall to edit it.',
          h('br'),
          h('br'),
          'Drag to pan, pinch or scroll to zoom, ',
          h('kbd', { textContent: 'F' }),
          ' fits the view.',
        ),
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
        { icon: 'image' },
      ),
      im
        ? btn('Remove', () => (delete p().plan.image, ed.changed()), { icon: 'x' })
        : btn('Set scale', () => (ed.setTool('scale'), closeDrawers()), { icon: 'ruler' }),
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
        { cls: 'danger', icon: 'trash' },
      ),
    ),
  )

  // ============ help overlay (? button / ? key), markup in index.html ============
  help.querySelector('.dh .btn')?.addEventListener('click', () => help.close())
  help.querySelector('.foot')?.append(ver)
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
