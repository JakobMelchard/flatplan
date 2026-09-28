import { layout, asset, uid } from './model.js'
import { dist, projT, segDist, lum, toLocal, openingGeom, hits, footprint, sat } from './geom.js'
import { History } from './history.js'

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').Pt} Pt */
/** @typedef {import('./model.js').Item} Item */
/** @typedef {import('./model.js').Opening} Opening */
/** @typedef {'select' | 'wall' | 'door' | 'window' | 'scale'} Tool */
/** @typedef {{ kind: 'items', ids: string[] } | { kind: 'wall', i: number } | { kind: 'open', id: string } | null} Sel */
/**
 * `items`: the grabbed item follows the pointer at offset (dx, dy), the rest of the selection
 * keeps its offset to it; start holds every item's position when the drag began.
 * @typedef {{ kind: 'pan', sx: number, sy: number, ox: number, oy: number }
 *   | { kind: 'items', grab: Item, its: Item[], start: Pt[], dx: number, dy: number }
 *   | { kind: 'turn', it: Item, rot0: number }
 *   | { kind: 'open', o: Opening, dt: number, t0: number }
 *   | { kind: 'pinch', d0: number, k0: number, wx: number, wy: number }
 *   | { kind: 'marquee', a: Pt, b: Pt, base: string[] }
 *   | null} Drag
 */

const GRID = 5
const SNAP_PX = 12
const TAP_PX = 8 // pointer travel below this is a tap, above it a drag
const TURN_PX = 28 // rotation handle distance beyond the item edge
const HOLD_MS = 450 // touch long-press: multi-select
const GESTURE_TAP_MS = 300 // two-finger tap = undo, three-finger tap = redo
/** Canvas colours: org token (tokens.css custom property) and the fallback used before it loads. */
const TOKENS = {
  swing: ['--muted', '#6272a4'],
  bg: ['--bg', '#0b0d10'],
  grid: ['--grid', 'rgba(238, 244, 255, 0.035)'],
  grid2: ['--line', 'rgba(98, 114, 164, 0.25)'],
  wall: ['--fg', '#f8f8f2'],
  acc: ['--accent', '#8be9fd'],
  bad: ['--danger', '#ff5555'],
  pill: ['--card', '#15171f'],
  pillLine: ['--line', 'rgba(98, 114, 164, 0.25)'],
  pillText: ['--fg', '#f8f8f2'],
  handle: ['--card', '#15171f'],
  outline: ['--ghost', 'rgba(255, 255, 255, 0.18)'],
  font: ['--font', 'ui-monospace, Menlo, monospace'],
}
const C = /** @type {Record<keyof typeof TOKENS, string>} */ (
  Object.fromEntries(Object.entries(TOKENS).map(([k, [, v]]) => [k, v]))
)
/** Re-read the canvas colours from the document's custom properties. */
const readTokens = () => {
  const cs = getComputedStyle(document.documentElement)
  for (const [k, [name, fallback]] of Object.entries(TOKENS))
    C[/** @type {keyof typeof TOKENS} */ (k)] = cs.getPropertyValue(name).trim() || fallback
}
/**
 * `col` (a hex or rgb() token) at alpha `a` (0..1), multiplied into any alpha it already has.
 * @param {string} col colour token value
 * @param {number} a alpha, 0..1
 * @returns {string} rgba() colour, or `col` unchanged when it is neither hex nor rgb()
 */
const alpha = (col, a) => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(col)
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(col)
  if (hex) return `rgba(${hex.slice(1).map((h) => parseInt(h, 16))}, ${a})`
  if (rgb) return `rgba(${rgb.slice(1, 4)}, ${a * +(rgb[4] ?? 1)})`
  return col
}

/**
 * Shorten `s` with an ellipsis until it fits `max` in the context's current font.
 * @param {CanvasRenderingContext2D} g context with the font set
 * @param {string} s text
 * @param {number} max width in the context's units
 * @returns {string} `s`, shortened, or '' when not even one character fits
 */
const fitText = (g, s, max) => {
  if (g.measureText(s).width <= max) return s
  for (let n = s.length - 1; n > 0; n--) {
    const t = `${s.slice(0, n).trimEnd()}…`
    if (g.measureText(t).width <= max) return t
  }
  return ''
}

export class Editor {
  ox = 60
  oy = 60
  k = 1 // view: screen = world * k + o
  /** @type {Tool} */
  tool = 'select'
  /** @type {Sel} */
  sel = null
  /** Set once an Apple Pencil (or any pen) is used: from then on only the pen places points. */
  penSeen = false
  /** Multi-select mode (toolbar toggle): taps add / remove items, drag on empty space boxes. */
  multi = false
  /** @type {{ at: Pt, t: number } | null} ring shown where a long-press registered */
  pulse = null
  onChange = () => {}
  onSelect = () => {}
  onView = () => {}
  /** @type {(did: 'undo' | 'redo') => void} */
  onHistory = () => {}
  /** @type {(hint: string, coords: string) => void} */
  status = () => {}
  /** @type {(measured: number) => Promise<number | null>} asks the real length (cm) of a marked segment */
  askLength = async () => null

  /** @type {Pt[]} */
  drawPts = []
  /** @type {Pt | null} */
  cur = null
  /** @type {Pt[]} */
  scalePts = []
  lenBuf = ''
  /** @type {Drag} */
  drag = null
  mods = { shift: false, ctrl: false }
  /** @type {Map<number, { x: number, y: number, sx: number, sy: number, type: string }>} */
  ptrs = new Map()
  /**
   * untoggle: in multi mode a tap (no drag) on an already selected item deselects it on release
   * @type {{ x: number, y: number, type: string, moved: boolean, multi: boolean, untoggle?: string } | null}
   */
  press = null
  /** multi-finger gesture: start time, most fingers down, whether any finger travelled */
  gest = { t0: 0, max: 0, moved: false }
  hold = 0 // long-press timer
  /** @type {Map<string, HTMLImageElement>} */
  imgs = new Map()

  /**
   * @param {HTMLCanvasElement} cv
   * @param {Project} p
   */
  constructor(cv, p) {
    this.cv = cv
    this.p = p
    this.hist = new History(p)
    this.restoring = false
    this.ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'))
    new ResizeObserver(() => this.resize()).observe(cv)
    cv.addEventListener('pointerdown', (e) => this.down(e))
    cv.addEventListener('pointermove', (e) => this.move(e))
    cv.addEventListener('pointerup', (e) => this.up(e, false))
    cv.addEventListener('pointercancel', (e) => this.up(e, true))
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && !this.ptrs.size) ((this.cur = null), this.render())
    })
    // iPad Safari's own long-press / double-tap handling can cancel pointers mid-gesture;
    // pointer events keep arriving when the touch events are default-prevented
    for (const t of ['touchstart', 'touchmove', 'touchend'])
      cv.addEventListener(t, (e) => e.preventDefault(), { passive: false })
    cv.addEventListener('contextmenu', (e) => e.preventDefault())
    cv.addEventListener('dblclick', () => this.endWall())
    cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false })
    window.addEventListener('keydown', (e) => this.key(e))
    window.addEventListener(
      'keyup',
      (e) => (this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }),
    )
    // canvas colours come from tokens.css: read now, again once it (re)loads or the theme flips
    const theme = () => (readTokens(), this.render())
    readTokens()
    document.querySelector('link[href="tokens.css"]')?.addEventListener('load', theme)
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme)
    new MutationObserver(theme).observe(document.documentElement, {
      attributeFilter: ['data-theme'],
    })
    this.resize()
  }

  // ---- coords
  /**
   * @param {{ clientX: number, clientY: number }} e
   * @returns {Pt}
   */
  w(e) {
    const r = this.cv.getBoundingClientRect()
    return { x: (e.clientX - r.left - this.ox) / this.k, y: (e.clientY - r.top - this.oy) / this.k }
  }
  /** @returns {Pt} */
  center() {
    const r = this.cv.getBoundingClientRect()
    return this.w({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
  }
  /**
   * @param {Pt} p
   * @returns {Pt}
   */
  snapWall(p) {
    const eps = SNAP_PX / this.k
    for (const w of this.p.plan.walls)
      for (const q of [w.a, w.b]) if (dist(p, q) < eps) return { ...q }
    for (const q of this.drawPts) if (dist(p, q) < eps) return { ...q }
    let s = this.mods.ctrl
      ? p
      : { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
    const last = this.drawPts.at(-1)
    if (last && this.mods.shift)
      s =
        Math.abs(s.x - last.x) > Math.abs(s.y - last.y)
          ? { x: s.x, y: last.y }
          : { x: last.x, y: s.y }
    return s
  }
  /**
   * Hit tolerance in world units: fingers need more slack than a mouse or pen.
   * @param {string} [type] pointer type
   */
  slop(type = 'mouse') {
    return (type === 'touch' ? 16 : 6) / this.k
  }

  // ---- openings (doors / windows live on a wall, parametrised by distance from wall.a)
  openings() {
    return (this.p.plan.openings ??= [])
  }
  /** @param {Opening} o */
  wallOf(o) {
    return this.p.plan.walls.find((w) => w.id === o.wall)
  }
  /** @param {Opening} o */
  geom(o) {
    const w = this.wallOf(o)
    return w ? openingGeom(o, w) : null
  }
  /**
   * @param {'door' | 'window'} kind
   * @param {Pt} p
   * @param {string} [type] pointer type, for hit tolerance
   */
  addOpening(kind, p, type) {
    const wi = this.p.plan.walls.findIndex(
      (w) => segDist(p, w.a, w.b) < Math.max(this.wallT(), this.slop(type)),
    )
    if (wi < 0) return
    const w = this.p.plan.walls[wi]
    w.id ??= uid()
    /** @type {Opening} */
    const o = {
      id: uid(),
      wall: w.id,
      t: Math.round(projT(p, w.a, w.b) * dist(w.a, w.b)),
      w: kind === 'door' ? 80 : 100,
      kind,
      hinge: 0,
      swing: 1,
    }
    this.clampOpening(o)
    this.openings().push(o)
    this.sel = { kind: 'open', id: o.id }
    this.changed()
  }
  /** @param {Opening} o */
  clampOpening(o) {
    const w = this.wallOf(o)
    if (!w) return
    const L = dist(w.a, w.b)
    o.w = Math.min(o.w, L)
    o.t = Math.max(o.w / 2, Math.min(L - o.w / 2, o.t))
  }
  /** @returns {Opening | undefined} */
  selectedOpening() {
    const s = this.sel
    return s?.kind === 'open' ? this.openings().find((o) => o.id === s.id) : undefined
  }

  // ---- public ops
  /** @param {Tool} t */
  setTool(t) {
    this.tool = t
    this.drawPts = []
    this.scalePts = []
    this.lenBuf = ''
    this.sel = null
    this.onSelect()
    this.hint()
    this.render()
  }
  /** @returns {Item[]} selected items, in drawing order */
  selectedItems() {
    const s = this.sel
    return s?.kind === 'items' ? layout(this.p).items.filter((i) => s.ids.includes(i.id)) : []
  }
  /** @returns {Item | undefined} the selected item when exactly one is selected */
  selected() {
    const its = this.selectedItems()
    return its.length === 1 ? its[0] : undefined
  }
  /** @param {string[]} ids */
  selectItems(ids) {
    this.sel = ids.length ? { kind: 'items', ids } : null
    this.onSelect()
    this.hint()
    this.render()
  }
  selectAll() {
    this.selectItems(layout(this.p).items.map((i) => i.id))
  }
  /** Drop selection entries that no longer exist (after undo, delete, layout switch). */
  cleanSel() {
    const s = this.sel
    if (s?.kind === 'items') {
      const have = new Set(layout(this.p).items.map((i) => i.id))
      const ids = s.ids.filter((id) => have.has(id))
      this.sel = ids.length ? { kind: 'items', ids } : null
    } else if (s?.kind === 'wall' && !this.p.plan.walls[s.i]) this.sel = null
    else if (s?.kind === 'open' && !this.selectedOpening()) this.sel = null
  }
  /**
   * @param {string} assetId
   * @param {Pt} [at] world point, default view centre
   */
  addItem(assetId, at) {
    const c = at ?? this.center()
    /** @type {Item} */
    const it = { id: uid(), asset: assetId, x: Math.round(c.x), y: Math.round(c.y), rot: 0 }
    layout(this.p).items.push(it)
    this.unstick(it)
    this.sel = { kind: 'items', ids: [it.id] }
    this.changed()
  }
  /**
   * Rotate the selection; several items turn as a group around their common centre.
   * @param {number} deg
   */
  rotate(deg) {
    const its = this.selectedItems()
    if (!its.length) return
    const cx = its.reduce((s, i) => s + i.x, 0) / its.length
    const cy = its.reduce((s, i) => s + i.y, 0) / its.length
    const r = (deg * Math.PI) / 180
    for (const it of its) {
      if (its.length > 1) {
        const dx = it.x - cx
        const dy = it.y - cy
        it.x = Math.round((cx + dx * Math.cos(r) - dy * Math.sin(r)) * 10) / 10
        it.y = Math.round((cy + dx * Math.sin(r) + dy * Math.cos(r)) * 10) / 10
      }
      it.rot = (((it.rot + deg) % 360) + 360) % 360
      this.unstick(it)
    }
    this.changed()
  }
  /**
   * @param {number} dx
   * @param {number} dy
   */
  nudge(dx, dy) {
    const its = this.selectedItems()
    if (!its.length) return
    for (const it of its) ((it.x += dx), (it.y += dy))
    this.changed()
  }
  /**
   * Nearest wall-free spot within 150 cm (spiral search), else leave in place.
   * @param {Item} it
   */
  unstick(it) {
    if (!this.collides(it, it.x, it.y, it.rot)) return
    for (let r = 5; r <= 150; r += 5)
      for (let a = 0; a < 360; a += 15) {
        const x = it.x + r * Math.cos((a * Math.PI) / 180)
        const y = it.y + r * Math.sin((a * Math.PI) / 180)
        if (!this.collides(it, x, y, it.rot)) {
          it.x = Math.round(x)
          it.y = Math.round(y)
          return
        }
      }
  }
  del() {
    const s = this.sel
    if (s?.kind === 'items') {
      const l = layout(this.p)
      l.items = l.items.filter((i) => !s.ids.includes(i.id))
    } else if (s?.kind === 'wall') {
      const [w] = this.p.plan.walls.splice(s.i, 1)
      this.p.plan.openings = this.openings().filter((o) => o.wall !== w.id)
    } else if (s?.kind === 'open')
      this.p.plan.openings = this.openings().filter((o) => o.id !== s.id)
    this.sel = null
    this.changed()
  }
  dup() {
    const its = this.selectedItems()
    if (!its.length) return
    const copies = its.map((it) => ({ ...it, id: uid(), x: it.x + 20, y: it.y + 20 }))
    layout(this.p).items.push(...copies)
    for (const c of copies) this.unstick(c)
    this.sel = { kind: 'items', ids: copies.map((c) => c.id) }
    this.changed()
  }
  fit() {
    const pts = this.p.plan.walls.flatMap((w) => [w.a, w.b])
    for (const it of layout(this.p).items) pts.push({ x: it.x, y: it.y })
    const im = this.p.plan.image
    const el = im && this.img(im.src)
    if (im && el && el.complete)
      pts.push(
        { x: im.x, y: im.y },
        { x: im.x + el.width * im.cmPerPx, y: im.y + el.height * im.cmPerPx },
      )
    if (!pts.length) {
      this.ox = 60
      this.oy = 60
      this.k = 1
      this.onView()
      return this.render()
    }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const W = this.cv.clientWidth
    const H = this.cv.clientHeight
    this.k = Math.min(W / (x1 - x0 + 100), H / (y1 - y0 + 100), 4)
    this.ox = (W - (x0 + x1) * this.k) / 2
    this.oy = (H - (y0 + y1) * this.k) / 2
    this.onView()
    this.render()
  }
  changed() {
    this.commit()
    this.onSelect()
    this.hint()
    this.render()
  }
  /** Record the current project as an undo step and notify (save, UI refresh). */
  commit() {
    if (!this.restoring) this.hist.record(this.p)
    this.onChange()
  }
  /** @param {Project | null} p a snapshot from the history */
  restore(p) {
    if (!p) return
    this.restoring = true
    this.p = p
    this.drawPts = []
    this.scalePts = []
    this.lenBuf = ''
    this.drag = null
    this.cleanSel()
    this.changed()
    this.hint()
    this.restoring = false
  }
  undo() {
    const p = this.hist.undo()
    this.restore(p)
    if (p) this.onHistory('undo')
  }
  redo() {
    const p = this.hist.redo()
    this.restore(p)
    if (p) this.onHistory('redo')
  }

  // ---- pointer events: mouse, touch (pinch/pan with two fingers) and pen share one path.
  // Drawing tools act on tap (pointer up without travel), so a one-finger drag pans and a
  // second finger turns the gesture into a pinch without leaving a stray wall corner behind.
  /** @param {PointerEvent} e */
  down(e) {
    const pen = e.pointerType === 'pen'
    if (pen) this.penSeen = true
    // palm rejection: while the pen is down, other contacts are ignored
    if (!pen && [...this.ptrs.values()].some((q) => q.type === 'pen')) return
    try {
      this.cv.setPointerCapture(e.pointerId)
    } catch {} // synthetic events (tests) have no active pointer
    const pt = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType }
    this.ptrs.set(e.pointerId, pt)
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    clearTimeout(this.hold)
    if (this.ptrs.size === 2) {
      this.gest = { t0: performance.now(), max: 2, moved: false }
      return this.startPinch()
    }
    if (this.ptrs.size > 2) return void (this.gest.max = Math.max(this.gest.max, this.ptrs.size))
    this.press = { x: e.clientX, y: e.clientY, type: e.pointerType, moved: false, multi: false }
    const p = this.w(e)
    this.cur = p
    if (e.button === 1 || (e.button === 0 && e.altKey)) return this.pan(e)
    if (e.button !== 0) return
    if (this.tool !== 'select') return this.pan(e)
    this.pick(p, e)
  }
  /**
   * Select tool: grab the rotation handle, an item, an opening or a wall; else pan, or start
   * a marquee (pen, Shift + mouse, touch long-press).
   * @param {Pt} p
   * @param {PointerEvent} e
   */
  pick(p, e) {
    const slop = this.slop(e.pointerType)
    const toggle = e.shiftKey || e.metaKey || e.ctrlKey
    const multi = toggle || this.multi
    const cur = this.selected()
    const ca = cur && asset(this.p, cur.asset)
    if (cur && ca && !toggle) {
      const l = toLocal(cur, cur.rot, p)
      if (Math.hypot(l.x, l.y + ca.d / 2 + TURN_PX / this.k) < Math.max(slop, 10 / this.k)) {
        this.drag = { kind: 'turn', it: cur, rot0: cur.rot }
        return this.render()
      }
    }
    const items = layout(this.p).items
    const grow = e.pointerType === 'touch' ? 4 / this.k : 0
    const hit = items.findLast((it) => {
      const a = asset(this.p, it.asset)
      const l = toLocal(it, it.rot, p)
      return a && Math.abs(l.x) <= a.w / 2 + grow && Math.abs(l.y) <= a.d / 2 + grow
    })
    if (hit) {
      const ids = this.sel?.kind === 'items' ? this.sel.ids : []
      if (toggle) {
        this.selectItems(ids.includes(hit.id) ? ids.filter((i) => i !== hit.id) : [...ids, hit.id])
        return
      }
      // grabbing part of a multi-selection moves all of it; in multi mode a new item joins,
      // and releasing an already selected one without dragging drops it
      if (this.multi && ids.includes(hit.id) && this.press) this.press.untoggle = hit.id
      else if (this.multi) this.sel = { kind: 'items', ids: [...ids, hit.id] }
      else if (!ids.includes(hit.id)) this.sel = { kind: 'items', ids: [hit.id] }
      items.push(...items.splice(items.indexOf(hit), 1)) // raise to top
      const its = this.selectedItems()
      this.drag = {
        kind: 'items',
        grab: hit,
        its,
        start: its.map((i) => ({ x: i.x, y: i.y })),
        dx: hit.x - p.x,
        dy: hit.y - p.y,
      }
      // touch long-press without moving: add to / remove from the selection instead
      if (e.pointerType === 'touch' && !this.multi)
        this.holdFor(() => {
          this.drag = null
          this.flash(p)
          this.selectItems(
            ids.includes(hit.id) ? ids.filter((i) => i !== hit.id) : [...ids, hit.id],
          )
        })
      this.onSelect()
      return this.render()
    }
    const near = Math.max(this.wallT() / 2, slop)
    for (const o of this.openings()) {
      const g = this.geom(o)
      if (!g) continue
      const t = projT(p, g.w.a, g.w.b) * g.L
      if (segDist(p, g.w.a, g.w.b) < near && t >= g.t0 && t <= g.t1) {
        this.sel = { kind: 'open', id: o.id }
        this.drag = { kind: 'open', o, dt: o.t - t, t0: o.t }
        this.onSelect()
        return this.render()
      }
    }
    const wi = this.p.plan.walls.findIndex((w) => segDist(p, w.a, w.b) < near)
    // multi mode / modifier: box select (walls are not part of a multi-selection)
    if (multi) return this.marquee(p, true)
    if (wi < 0 && e.pointerType === 'pen') return this.marquee(p, false)
    this.sel = wi >= 0 ? { kind: 'wall', i: wi } : null
    this.onSelect()
    if (wi < 0) {
      this.pan(e)
      if (e.pointerType === 'touch') this.holdFor(() => this.marquee(p, true), p)
    }
    this.render()
  }
  /**
   * Brief ring at p: feedback that a long-press registered.
   * @param {Pt} p
   */
  flash(p) {
    this.pulse = { at: p, t: performance.now() }
    this.render()
    setTimeout(() => ((this.pulse = null), this.render()), 350)
  }
  /**
   * Run fn if the single pointer stays put for HOLD_MS.
   * @param {() => void} fn
   * @param {Pt} [at] where to show the long-press ring
   */
  holdFor(fn, at) {
    this.hold = window.setTimeout(() => {
      if (this.ptrs.size === 1 && this.press && !this.press.moved) {
        this.press.moved = true // the eventual pointer up is not a tap
        if (at) this.flash(at)
        fn()
      }
    }, HOLD_MS)
  }
  /**
   * @param {Pt} p world start
   * @param {boolean} add keep the current selection
   */
  marquee(p, add) {
    const base = add && this.sel?.kind === 'items' ? this.sel.ids : []
    this.drag = { kind: 'marquee', a: p, b: p, base }
    this.render()
  }
  /** @param {PointerEvent} e */
  pan(e) {
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy }
  }
  startPinch() {
    // a one-finger drag that turns into a pinch is undone
    const d = this.drag
    if (d?.kind === 'items')
      d.its.forEach((it, i) => ((it.x = d.start[i].x), (it.y = d.start[i].y)))
    if (d?.kind === 'turn') d.it.rot = d.rot0
    if (d?.kind === 'open') d.o.t = d.t0
    if (this.press) this.press.multi = true
    const [a, b] = [...this.ptrs.values()]
    const r = this.cv.getBoundingClientRect()
    const mx = (a.x + b.x) / 2 - r.left
    const my = (a.y + b.y) / 2 - r.top
    this.drag = {
      kind: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      k0: this.k,
      wx: (mx - this.ox) / this.k,
      wy: (my - this.oy) / this.k,
    }
    this.onSelect()
    this.render()
  }
  /** @param {PointerEvent} e */
  move(e) {
    const q = this.ptrs.get(e.pointerId)
    if (q) {
      q.x = e.clientX
      q.y = e.clientY
      if (this.ptrs.size > 1 && Math.hypot(q.x - q.sx, q.y - q.sy) > TAP_PX) this.gest.moved = true
    } else if (this.ptrs.size) return // a rejected palm
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    const pr = this.press
    if (pr && !pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_PX) {
      pr.moved = true
      clearTimeout(this.hold)
    }
    const p = this.w(e)
    this.cur = p
    const d = this.drag
    if (d?.kind === 'pinch') {
      const [a, b] = [...this.ptrs.values()]
      if (!a || !b) return
      const r = this.cv.getBoundingClientRect()
      this.k = Math.min(20, Math.max(0.05, (d.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0))
      this.ox = (a.x + b.x) / 2 - r.left - d.wx * this.k
      this.oy = (a.y + b.y) / 2 - r.top - d.wy * this.k
      this.onView()
    } else if (d?.kind === 'pan') {
      if (pr?.moved) {
        this.ox = d.ox + e.clientX - d.sx
        this.oy = d.oy + e.clientY - d.sy
        this.onView()
      }
    } else if (d?.kind === 'items') {
      if (pr?.moved) this.dragItems(d, p)
    } else if (d?.kind === 'marquee') {
      d.b = p
      const ids = this.inRect(d.a, d.b)
      this.sel = { kind: 'items', ids: [...new Set([...d.base, ...ids])] }
      this.onSelect()
    } else if (d?.kind === 'turn') {
      const deg = (Math.atan2(p.y - d.it.y, p.x - d.it.x) * 180) / Math.PI + 90
      const g = this.mods.ctrl ? 1 : 15
      d.it.rot = (((Math.round(deg / g) * g) % 360) + 360) % 360
      this.onSelect()
    } else if (d?.kind === 'open') {
      const g = this.geom(d.o)
      if (g) {
        d.o.t = Math.round(projT(p, g.w.a, g.w.b) * g.L + d.dt)
        this.clampOpening(d.o)
        this.onSelect()
      }
    }
    this.hint()
    this.render()
  }
  /**
   * Ids of items whose footprint touches the rectangle ab.
   * @param {Pt} a
   * @param {Pt} b
   * @returns {string[]}
   */
  inRect(a, b) {
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    const box = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]
    return layout(this.p)
      .items.filter((it) => {
        const as = asset(this.p, it.asset)
        return as && sat(footprint(as, it.x, it.y, it.rot), box)
      })
      .map((it) => it.id)
  }
  /**
   * Move the selection rigidly. The grabbed item snaps to wall faces when it is alone.
   * Swept so fast drags can't tunnel through walls, then slides along x / y; items may leave
   * obstacles they are already in, never enter new ones.
   * @param {Extract<Drag, { kind: 'items' }>} d
   * @param {Pt} p
   */
  dragItems(d, p) {
    const g = this.mods.ctrl ? 0.1 : this.mods.shift ? 10 : 1
    const gi = d.its.indexOf(d.grab)
    const s0 = d.start[gi]
    let t = { x: Math.round((p.x + d.dx) / g) * g, y: Math.round((p.y + d.dy) / g) * g }
    if (d.its.length === 1) t = this.snapToWalls(d.grab, t)
    const want = { x: t.x - s0.x, y: t.y - s0.y } // offset from the drag start
    /** @param {Pt} o */
    const at = (o) =>
      d.its.map((it, i) => this.hits(it, d.start[i].x + o.x, d.start[i].y + o.y, it.rot))
    /**
     * @param {Pt} from offset
     * @param {Pt} to offset
     * @returns {Pt}
     */
    const reach = (from, to) => {
      const base = at(from)
      const n = Math.ceil(dist(from, to) / 4) || 1
      let ok = from
      for (let i = 1; i <= n; i++) {
        const o = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }
        if (at(o).some((hs, j) => hs.some((h) => !base[j].includes(h)))) break
        ok = o
      }
      return ok
    }
    const now = { x: d.grab.x - s0.x, y: d.grab.y - s0.y }
    let c = reach(now, want)
    c = reach(c, { x: want.x, y: c.y })
    c = reach(c, { x: c.x, y: want.y })
    d.its.forEach((it, i) => {
      it.x = Math.round((d.start[i].x + c.x) * 10) / 10
      it.y = Math.round((d.start[i].y + c.y) * 10) / 10
    })
    this.onSelect()
  }
  /**
   * @param {PointerEvent} e
   * @param {boolean} cancel
   */
  up(e, cancel) {
    if (!this.ptrs.delete(e.pointerId)) return
    clearTimeout(this.hold)
    const d = this.drag
    if (d?.kind === 'pinch' || this.gest.max > 1) {
      // lifting one finger of a pinch ends it; the remaining finger does nothing until lifted
      if (this.ptrs.size < 2 && d?.kind === 'pinch') this.drag = null
      if (this.ptrs.size) return
      const g = this.gest
      this.gest = { t0: 0, max: 0, moved: false }
      this.press = null
      if (!cancel && !g.moved && performance.now() - g.t0 < GESTURE_TAP_MS)
        g.max === 2 ? this.undo() : g.max === 3 ? this.redo() : null
      return
    }
    if (this.ptrs.size) return
    const pr = this.press
    this.press = null
    this.drag = null
    if (d?.kind === 'marquee') return this.render()
    if ((d?.kind === 'items' || d?.kind === 'open') && pr?.moved) this.commit()
    if (d?.kind === 'items' && pr?.untoggle && !pr.moved && !cancel) {
      const drop = pr.untoggle
      return this.selectItems(
        this.selectedItems()
          .filter((i) => i.id !== drop)
          .map((i) => i.id),
      )
    }
    if (d?.kind === 'turn') {
      this.unstick(d.it)
      this.changed()
    }
    if (cancel || !pr || pr.moved || pr.multi || e.button > 0 || e.altKey) return
    // tap in a drawing tool; once a pen has been used, fingers only pan and zoom
    if (this.tool !== 'select' && !(this.penSeen && pr.type === 'touch'))
      this.tap(this.w(e), pr.type)
  }
  /**
   * @param {Pt} p
   * @param {string} type
   */
  tap(p, type) {
    if (this.tool === 'wall') {
      const s = this.snapWall(p)
      const first = this.drawPts[0]
      const last = this.drawPts.at(-1)
      if (first && this.drawPts.length > 2 && dist(s, first) < 1e-6)
        return (this.commitWall(s), this.endWall())
      if (last && dist(s, last) < 1e-6) return this.endWall() // tap the last corner again to finish
      return this.commitWall(s)
    }
    if (this.tool === 'scale') {
      this.scalePts.push(p)
      if (this.scalePts.length === 2) this.applyScale()
      return this.render()
    }
    if (this.tool === 'door' || this.tool === 'window') this.addOpening(this.tool, p, type)
  }
  /** @param {WheelEvent} e */
  wheel(e) {
    e.preventDefault()
    const r = this.cv.getBoundingClientRect()
    this.zoom(
      Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
      e.clientX - r.left,
      e.clientY - r.top,
    )
  }
  /**
   * @param {number} f factor
   * @param {number} [mx] screen anchor x
   * @param {number} [my] screen anchor y
   */
  zoom(f, mx = this.cv.clientWidth / 2, my = this.cv.clientHeight / 2) {
    const k2 = Math.min(20, Math.max(0.05, this.k * f))
    this.ox = mx - ((mx - this.ox) * k2) / this.k
    this.oy = my - ((my - this.oy) * k2) / this.k
    this.k = k2
    this.onView()
    this.render()
  }
  /** @param {KeyboardEvent} e */
  key(e) {
    const typing = e.target instanceof Element && e.target.matches('input,select,textarea')
    if (typing || document.querySelector('dialog[open]')) return
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    if (this.tool === 'wall' && this.drawPts.length) {
      if (/^[\d.]$/.test(e.key)) {
        this.lenBuf += e.key
        return (this.hint(), this.render(), this.onSelect())
      }
      if (e.key === 'Backspace' && this.lenBuf) {
        this.lenBuf = this.lenBuf.slice(0, -1)
        return (this.hint(), this.render(), this.onSelect())
      }
      if (e.key === 'Enter' && this.lenBuf) return this.commitLength(+this.lenBuf)
    }
    const cmd = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (cmd && (k === 'z' || k === 'y')) {
      e.preventDefault()
      return k === 'y' || e.shiftKey ? this.redo() : this.undo()
    }
    if (cmd && k === 'a' && this.tool === 'select') return (e.preventDefault(), this.selectAll())
    switch (e.key) {
      case 'Escape':
        this.multi = false
        this.endWall()
        this.scalePts = []
        this.sel = null
        this.onSelect()
        break
      case 'Delete':
      case 'Backspace':
        if (this.tool === 'wall' && this.drawPts.length) this.undoPoint()
        else this.del()
        break
      case 'r':
        this.rotate(90)
        break
      case 'R':
        this.rotate(-90)
        break
      case 'q':
        this.rotate(-15)
        break
      case 'e':
        this.rotate(15)
        break
      case 'd':
        if (cmd) (e.preventDefault(), this.dup())
        else this.setTool('door')
        break
      case 'f':
        this.fit()
        break
      case 'v':
        this.setTool('select')
        break
      case 'w':
        this.setTool('wall')
        break
      case 'n':
        this.setTool('window')
        break
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        if (this.selectedItems().length) {
          const s = e.shiftKey ? 10 : 1
          e.preventDefault()
          this.nudge(
            e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0,
            e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0,
          )
        }
    }
    this.render()
  }

  // ---- wall / scale tools
  /**
   * End point `len` cm from the last corner, along the cursor's dominant axis.
   * @param {number} len
   * @returns {Pt}
   */
  byLength(len) {
    const last = /** @type {Pt} */ (this.drawPts.at(-1))
    const c = this.cur ?? { x: last.x + 1, y: last.y }
    let dx = c.x - last.x
    let dy = c.y - last.y
    if (Math.abs(dx) > Math.abs(dy)) ((dx = Math.sign(dx) || 1), (dy = 0))
    else ((dy = Math.sign(dy) || 1), (dx = 0))
    return { x: last.x + dx * len, y: last.y + dy * len }
  }
  /**
   * @param {number} len cm
   * @param {Pt} [dir] unit direction, default the cursor's dominant axis
   */
  commitLength(len, dir) {
    const last = this.drawPts.at(-1)
    if (!last || !(len > 0)) return
    this.commitWall(dir ? { x: last.x + dir.x * len, y: last.y + dir.y * len } : this.byLength(len))
    this.lenBuf = ''
    this.hint()
    this.onSelect()
  }
  /** @param {Pt} pt */
  commitWall(pt) {
    const last = this.drawPts.at(-1)
    if (last && dist(last, pt) > 0.5) this.p.plan.walls.push({ id: uid(), a: last, b: pt })
    this.drawPts.push(pt)
    this.commit()
    this.onSelect()
    this.render()
  }
  /** Remove the last placed corner (and the wall ending there). */
  undoPoint() {
    const last = this.drawPts.pop()
    const w = this.p.plan.walls.at(-1)
    if (last && w && dist(w.b, last) < 1e-6) {
      this.p.plan.walls.pop()
      this.p.plan.openings = this.openings().filter((o) => o.wall !== w.id)
    }
    this.lenBuf = ''
    this.changed()
    this.hint()
  }
  endWall() {
    this.drawPts = []
    this.lenBuf = ''
    this.hint()
    this.onSelect()
    this.render()
  }
  async applyScale() {
    const [a, b] = this.scalePts
    const im = this.p.plan.image
    this.render()
    const real = await this.askLength(dist(a, b))
    this.scalePts = []
    if (im && real && real > 0) {
      const f = real / dist(a, b)
      im.cmPerPx *= f
      im.x = a.x - (a.x - im.x) * f
      im.y = a.y - (a.y - im.y) * f
      this.commit()
    }
    this.setTool('select')
    this.fit()
  }
  hint() {
    const c = this.cur ? `${this.cur.x.toFixed(0)}, ${this.cur.y.toFixed(0)} cm` : ''
    const last = this.drawPts.at(-1)
    const t =
      this.tool === 'wall'
        ? last
          ? `${this.lenBuf ? `length ${this.lenBuf}` : this.cur ? dist(this.cur, last).toFixed(0) : ''} cm · tap next corner, tap it again to finish`
          : 'tap to place the first corner'
        : this.tool === 'scale'
          ? `tap two points with a known distance (${this.scalePts.length}/2)`
          : this.tool === 'door' || this.tool === 'window'
            ? `tap a wall to place a ${this.tool}`
            : this.multi
              ? `multi-select (${this.selectedItems().length}) · tap items to add / remove · drag to box`
              : this.selectedItems().length > 1
                ? `${this.selectedItems().length} items · drag to move together`
                : this.selected()
                  ? 'drag to move · handle rotates · long-press adds more'
                  : this.selectedOpening()
                    ? 'drag along the wall'
                    : 'tap to select · long-press + drag to select many · pinch to zoom'
    this.status(t, c)
  }

  // ---- walls vs items
  wallT() {
    return this.p.plan.wallT ?? 10
  }
  /**
   * @param {Item} it
   * @param {number} x
   * @param {number} y
   * @param {number} rot
   */
  collides(it, x, y, rot) {
    return this.hits(it, x, y, rot).length > 0
  }
  /**
   * @param {Item} it
   * @param {number} x
   * @param {number} y
   * @param {number} rot
   */
  hits(it, x, y, rot) {
    const a = asset(this.p, it.asset)
    if (!a) return []
    return hits(
      { walls: this.p.plan.walls, openings: this.openings(), wallT: this.wallT() },
      a,
      x,
      y,
      rot,
    )
  }
  /**
   * Pull item edges onto nearby axis-aligned wall faces.
   * @param {Item} it
   * @param {Pt} t
   * @returns {Pt}
   */
  snapToWalls(it, t) {
    const a = asset(this.p, it.asset)
    if (!a || it.rot % 90) return t
    const [hw, hd] = it.rot % 180 ? [a.d / 2, a.w / 2] : [a.w / 2, a.d / 2]
    const T = this.wallT() / 2
    const eps = SNAP_PX / this.k
    let { x, y } = t
    for (const w of this.p.plan.walls) {
      const vert = Math.abs(w.a.x - w.b.x) < 1e-6
      const horz = Math.abs(w.a.y - w.b.y) < 1e-6
      if (vert && y + hd > Math.min(w.a.y, w.b.y) && y - hd < Math.max(w.a.y, w.b.y))
        for (const f of [w.a.x - T, w.a.x + T])
          for (const e of [x - hw, x + hw]) if (Math.abs(e - f) < eps) x += f - e
      if (horz && x + hw > Math.min(w.a.x, w.b.x) && x - hw < Math.max(w.a.x, w.b.x))
        for (const f of [w.a.y - T, w.a.y + T])
          for (const e of [y - hd, y + hd]) if (Math.abs(e - f) < eps) y += f - e
    }
    return { x, y }
  }

  // ---- render
  /** @param {string} src */
  img(src) {
    let el = this.imgs.get(src)
    if (!el) {
      el = new Image()
      el.onload = () => this.render()
      el.src = src
      this.imgs.set(src, el)
    }
    return el
  }
  resize() {
    const d = devicePixelRatio
    this.cv.width = this.cv.clientWidth * d
    this.cv.height = this.cv.clientHeight * d
    this.render()
  }
  render() {
    const { ctx: g, k, ox, oy } = this
    const W = this.cv.clientWidth
    const H = this.cv.clientHeight
    const d = devicePixelRatio
    g.setTransform(d, 0, 0, d, 0, 0)
    g.fillStyle = C.bg
    g.fillRect(0, 0, W, H)
    g.setTransform(d * k, 0, 0, d * k, d * ox, d * oy)
    const im = this.p.plan.image
    if (im) {
      const el = this.img(im.src)
      if (el.complete && el.width) {
        g.globalAlpha = im.opacity
        g.drawImage(el, im.x, im.y, el.width * im.cmPerPx, el.height * im.cmPerPx)
        g.globalAlpha = 1
      }
    }
    // grid
    const step = k > 0.6 ? 50 : k > 0.15 ? 100 : 500
    const x0 = Math.floor(-ox / k / step) * step
    const y0 = Math.floor(-oy / k / step) * step
    for (const [mod, col] of /** @type {[number, string][]} */ ([
      [1, C.grid],
      [step === 50 ? 2 : 5, C.grid2],
    ])) {
      g.lineWidth = 1 / k
      g.beginPath()
      for (let x = x0; x < (W - ox) / k; x += step)
        if (Math.round(x / step) % mod === 0) (g.moveTo(x, -oy / k), g.lineTo(x, (H - oy) / k))
      for (let y = y0; y < (H - oy) / k; y += step)
        if (Math.round(y / step) % mod === 0) (g.moveTo(-ox / k, y), g.lineTo((W - ox) / k, y))
      g.strokeStyle = col
      g.stroke()
    }
    // walls
    const wallPts = this.p.plan.walls.flatMap((w) => [w.a, w.b])
    const cen = {
      x: wallPts.reduce((s, q) => s + q.x, 0) / (wallPts.length || 1),
      y: wallPts.reduce((s, q) => s + q.y, 0) / (wallPts.length || 1),
    }
    /**
     * Length pill beside a wall, on the side away from the plan's centre.
     * @param {Pt} a
     * @param {Pt} b
     * @param {string} col
     */
    const label = (a, b, col) => {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      let ang = Math.atan2(b.y - a.y, b.x - a.x)
      if (Math.abs(ang) > Math.PI / 2) ang += Math.PI
      const outward = (m.x - cen.x) * -Math.sin(ang) + (m.y - cen.y) * Math.cos(ang)
      g.save()
      g.translate(m.x, m.y)
      g.rotate(ang)
      const txt = `${dist(a, b).toFixed(0)} cm`
      g.font = `500 ${11 / k}px ${C.font}`
      const tw = g.measureText(txt).width
      g.fillStyle = C.pill
      g.strokeStyle = C.pillLine
      g.lineWidth = 1 / k
      const rx = -tw / 2 - 5 / k
      const rw = tw + 10 / k
      const rh = 16 / k
      const ry = outward > 0 ? this.wallT() / 2 + 6 / k : -this.wallT() / 2 - 6 / k - rh
      g.beginPath()
      g.roundRect(rx, ry, rw, rh, 4 / k)
      g.fill()
      g.stroke()
      g.fillStyle = col
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(txt, 0, ry + rh / 2)
      g.restore()
    }
    g.lineCap = 'square'
    this.p.plan.walls.forEach((w, i) => {
      const on = this.sel?.kind === 'wall' && this.sel.i === i
      g.strokeStyle = on ? C.acc : C.wall
      g.lineWidth = this.wallT()
      g.beginPath()
      g.moveTo(w.a.x, w.a.y)
      g.lineTo(w.b.x, w.b.y)
      g.stroke()
    })
    // openings: cut the gap, then door leaf + swing arc / window panes
    for (const o of this.openings()) {
      const G = this.geom(o)
      if (!G) continue
      const on = this.sel?.kind === 'open' && this.sel.id === o.id
      const a = G.at(G.t0)
      const b = G.at(G.t1)
      g.lineCap = 'butt'
      g.strokeStyle = C.bg
      g.lineWidth = this.wallT() + 0.6
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
      if (o.kind === 'door') {
        const tip = { x: G.hp.x + G.n.x * o.w, y: G.hp.y + G.n.y * o.w }
        g.strokeStyle = on ? C.acc : C.wall
        g.lineWidth = Math.max(2 / k, 3)
        g.beginPath()
        g.moveTo(G.hp.x, G.hp.y)
        g.lineTo(tip.x, tip.y)
        g.stroke() // leaf, open 90°
        const a0 = Math.atan2(G.n.y, G.n.x)
        const a1 = Math.atan2(G.u.y * G.dir, G.u.x * G.dir)
        let da = a1 - a0
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        g.strokeStyle = on ? C.acc : C.swing
        g.lineWidth = 1.2 / k
        g.setLineDash([4 / k, 4 / k])
        g.beginPath()
        g.arc(G.hp.x, G.hp.y, o.w, a0, a1, da < 0)
        g.stroke()
        g.setLineDash([])
      } else {
        g.strokeStyle = on ? C.acc : C.wall
        g.lineWidth = Math.max(1.5 / k, 1.5)
        const s = this.wallT() / 4
        const n = G.n
        g.beginPath()
        for (const f of [-s, s])
          (g.moveTo(a.x + n.x * f, a.y + n.y * f), g.lineTo(b.x + n.x * f, b.y + n.y * f))
        g.moveTo(a.x + n.x * s, a.y + n.y * s)
        g.lineTo(a.x - n.x * s, a.y - n.y * s)
        g.moveTo(b.x + n.x * s, b.y + n.y * s)
        g.lineTo(b.x - n.x * s, b.y - n.y * s)
        g.stroke()
      }
    }
    // items
    const single = this.sel?.kind === 'items' && this.sel.ids.length === 1
    for (const it of layout(this.p).items) {
      const a = asset(this.p, it.asset)
      if (!a) continue
      g.save()
      g.translate(it.x, it.y)
      g.rotate((it.rot * Math.PI) / 180)
      const on = this.sel?.kind === 'items' && this.sel.ids.includes(it.id)
      const bad = this.collides(it, it.x, it.y, it.rot)
      g.shadowColor = 'rgba(0,0,0,.5)'
      g.shadowBlur = 10
      g.shadowOffsetY = 3
      if (a.img) {
        const el = this.img(a.img)
        if (el.complete && el.width) g.drawImage(el, -a.w / 2, -a.d / 2, a.w, a.d)
      } else {
        g.fillStyle = a.color + 'd9'
        g.beginPath()
        g.roundRect(-a.w / 2, -a.d / 2, a.w, a.d, Math.min(3, a.w / 8, a.d / 8))
        g.fill()
      }
      g.shadowColor = 'transparent'
      g.lineWidth = (on ? 2 : 1) / k
      g.strokeStyle = bad ? C.bad : on ? C.acc : C.outline
      g.strokeRect(-a.w / 2, -a.d / 2, a.w, a.d)
      if (on) {
        const hs = 7 / k
        g.fillStyle = C.handle
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          g.beginPath()
          g.rect((sx * a.w) / 2 - hs / 2, (sy * a.d) / 2 - hs / 2, hs, hs)
          g.fill()
          g.stroke()
        }
      }
      if (on && single) {
        // rotation handle
        const hy = -a.d / 2 - TURN_PX / k
        g.strokeStyle = C.acc
        g.beginPath()
        g.moveTo(0, -a.d / 2)
        g.lineTo(0, hy)
        g.stroke()
        g.fillStyle = C.acc
        g.beginPath()
        g.arc(0, hy, 7 / k, 0, 7)
        g.fill()
      }
      if (a.w * k > 44 && a.d * k > 18) {
        const dark = a.img || lum(a.color) > 0.55
        g.fillStyle = dark ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)'
        g.font = `500 ${12 / k}px ${C.font}`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        const room = a.w - 8 / k
        g.fillText(fitText(g, a.name, room), 0, a.d * k > 40 ? -7 / k : 0)
        if (a.d * k > 40) {
          g.font = `${10.5 / k}px ${C.font}`
          g.fillStyle = dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'
          g.fillText(fitText(g, `${a.w} × ${a.d}`, room), 0, 8 / k)
        }
      }
      g.restore()
    }
    this.p.plan.walls.forEach((w) => label(w.a, w.b, C.pillText))
    // wall tool: in-progress segment, or the snapped point under a hovering mouse / pen
    const last = this.drawPts.at(-1)
    if (this.tool === 'wall' && this.cur && (last || !this.ptrs.size)) {
      const s = last && this.lenBuf ? this.byLength(+this.lenBuf || 0) : this.snapWall(this.cur)
      if (last) {
        g.lineWidth = this.wallT()
        g.strokeStyle = alpha(C.acc, 0.53)
        g.beginPath()
        g.moveTo(last.x, last.y)
        g.lineTo(s.x, s.y)
        g.stroke()
        label(last, s, C.acc)
      }
      g.fillStyle = C.acc
      g.beginPath()
      g.arc(s.x, s.y, 4 / k, 0, 7)
      g.fill()
    }
    for (const q of this.drawPts) {
      g.strokeStyle = C.acc
      g.lineWidth = 1.5 / k
      g.beginPath()
      g.arc(q.x, q.y, 5 / k, 0, 7)
      g.stroke()
    }
    if (this.pulse) {
      g.strokeStyle = C.acc
      g.lineWidth = 3 / k
      g.beginPath()
      g.arc(this.pulse.at.x, this.pulse.at.y, 22 / k, 0, 7)
      g.stroke()
    }
    const mq = this.drag
    if (mq?.kind === 'marquee') {
      g.fillStyle = alpha(C.acc, 0.12)
      g.strokeStyle = C.acc
      g.lineWidth = 1 / k
      g.setLineDash([5 / k, 4 / k])
      g.fillRect(mq.a.x, mq.a.y, mq.b.x - mq.a.x, mq.b.y - mq.a.y)
      g.strokeRect(mq.a.x, mq.a.y, mq.b.x - mq.a.x, mq.b.y - mq.a.y)
      g.setLineDash([])
    }
    for (const q of this.scalePts) {
      g.fillStyle = C.bad
      g.beginPath()
      g.arc(q.x, q.y, 5 / k, 0, 7)
      g.fill()
    }
    if (this.scalePts.length === 1 && this.cur) {
      g.strokeStyle = C.bad
      g.lineWidth = 2 / k
      g.beginPath()
      g.moveTo(this.scalePts[0].x, this.scalePts[0].y)
      g.lineTo(this.cur.x, this.cur.y)
      g.stroke()
    }
  }
}
