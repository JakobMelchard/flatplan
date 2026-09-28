import { layout, asset, uid } from './model.js'
import { dist, projT, segDist, lum, toLocal, openingGeom, hits } from './geom.js'

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').Pt} Pt */
/** @typedef {import('./model.js').Item} Item */
/** @typedef {import('./model.js').Opening} Opening */
/** @typedef {'select' | 'wall' | 'door' | 'window' | 'scale'} Tool */
/** @typedef {{ kind: 'item', id: string } | { kind: 'wall', i: number } | { kind: 'open', id: string } | null} Sel */
/**
 * @typedef {{ kind: 'pan', sx: number, sy: number, ox: number, oy: number }
 *   | { kind: 'item', it: Item, dx: number, dy: number, x0: number, y0: number }
 *   | { kind: 'turn', it: Item, rot0: number }
 *   | { kind: 'open', o: Opening, dt: number, t0: number }
 *   | { kind: 'pinch', d0: number, k0: number, wx: number, wy: number }
 *   | null} Drag
 */

const GRID = 5
const SNAP_PX = 12
const TAP_PX = 8 // pointer travel below this is a tap, above it a drag
const TURN_PX = 28 // rotation handle distance beyond the item edge
const C = {
  swing: '#6272a4',
  bg: '#21222c',
  grid: '#2b2d3a',
  grid2: '#383a4a',
  wall: '#f8f8f2',
  acc: '#bd93f9',
  bad: '#ff5555',
  pill: '#282a36',
  pillLine: '#44475a',
  pillText: '#8be9fd',
  handle: '#282a36',
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
  onChange = () => {}
  onSelect = () => {}
  onView = () => {}
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
  /** @type {Map<number, { x: number, y: number, type: string }>} */
  ptrs = new Map()
  /** @type {{ x: number, y: number, type: string, moved: boolean, multi: boolean } | null} */
  press = null
  /** @type {Map<string, HTMLImageElement>} */
  imgs = new Map()

  /**
   * @param {HTMLCanvasElement} cv
   * @param {Project} p
   */
  constructor(cv, p) {
    this.cv = cv
    this.p = p
    this.ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'))
    new ResizeObserver(() => this.resize()).observe(cv)
    cv.addEventListener('pointerdown', (e) => this.down(e))
    cv.addEventListener('pointermove', (e) => this.move(e))
    cv.addEventListener('pointerup', (e) => this.up(e, false))
    cv.addEventListener('pointercancel', (e) => this.up(e, true))
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && !this.ptrs.size) ((this.cur = null), this.render())
    })
    cv.addEventListener('dblclick', () => this.endWall())
    cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false })
    window.addEventListener('keydown', (e) => this.key(e))
    window.addEventListener(
      'keyup',
      (e) => (this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }),
    )
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
  /** @returns {Item | undefined} */
  selected() {
    const s = this.sel
    return s?.kind === 'item' ? layout(this.p).items.find((i) => i.id === s.id) : undefined
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
    this.sel = { kind: 'item', id: it.id }
    this.changed()
  }
  /** @param {number} deg */
  rotate(deg) {
    const it = this.selected()
    if (!it) return
    it.rot = (((it.rot + deg) % 360) + 360) % 360
    this.unstick(it)
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
    if (s?.kind === 'item') {
      const l = layout(this.p)
      l.items = l.items.filter((i) => i.id !== s.id)
    } else if (s?.kind === 'wall') {
      const [w] = this.p.plan.walls.splice(s.i, 1)
      this.p.plan.openings = this.openings().filter((o) => o.wall !== w.id)
    } else if (s?.kind === 'open')
      this.p.plan.openings = this.openings().filter((o) => o.id !== s.id)
    this.sel = null
    this.changed()
  }
  dup() {
    const it = this.selected()
    if (!it) return
    const c = { ...it, id: uid(), x: it.x + 20, y: it.y + 20 }
    layout(this.p).items.push(c)
    this.unstick(c)
    this.sel = { kind: 'item', id: c.id }
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
    this.onChange()
    this.onSelect()
    this.render()
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
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    if (this.ptrs.size === 2) return this.startPinch()
    if (this.ptrs.size > 2) return
    this.press = { x: e.clientX, y: e.clientY, type: e.pointerType, moved: false, multi: false }
    const p = this.w(e)
    this.cur = p
    if (e.button === 1 || (e.button === 0 && e.altKey)) return this.pan(e)
    if (e.button !== 0) return
    if (this.tool !== 'select') return this.pan(e)
    this.pick(p, e)
  }
  /**
   * Select tool: grab the rotation handle, an item, an opening or a wall; else pan.
   * @param {Pt} p
   * @param {PointerEvent} e
   */
  pick(p, e) {
    const slop = this.slop(e.pointerType)
    const cur = this.selected()
    const ca = cur && asset(this.p, cur.asset)
    if (cur && ca) {
      const l = toLocal(cur, cur.rot, p)
      if (Math.hypot(l.x, l.y + ca.d / 2 + TURN_PX / this.k) < Math.max(slop, 10 / this.k)) {
        this.drag = { kind: 'turn', it: cur, rot0: cur.rot }
        return this.render()
      }
    }
    const items = layout(this.p).items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      const a = asset(this.p, it.asset)
      if (!a) continue
      const l = toLocal(it, it.rot, p)
      const grow = e.pointerType === 'touch' ? 4 / this.k : 0
      if (Math.abs(l.x) <= a.w / 2 + grow && Math.abs(l.y) <= a.d / 2 + grow) {
        this.sel = { kind: 'item', id: it.id }
        this.drag = { kind: 'item', it, dx: it.x - p.x, dy: it.y - p.y, x0: it.x, y0: it.y }
        items.push(...items.splice(i, 1)) // raise to top
        this.onSelect()
        return this.render()
      }
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
    this.sel = wi >= 0 ? { kind: 'wall', i: wi } : null
    this.onSelect()
    if (wi < 0) this.pan(e)
    this.render()
  }
  /** @param {PointerEvent} e */
  pan(e) {
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy }
  }
  startPinch() {
    // a one-finger item/opening drag that turns into a pinch is undone
    const d = this.drag
    if (d?.kind === 'item') ((d.it.x = d.x0), (d.it.y = d.y0))
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
    if (this.ptrs.has(e.pointerId))
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    else if (this.ptrs.size) return // a rejected palm or a third finger
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    const pr = this.press
    if (pr && !pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_PX) pr.moved = true
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
    } else if (d?.kind === 'item') this.dragItem(d, p)
    else if (d?.kind === 'turn') {
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
   * @param {Extract<Drag, { kind: 'item' }>} d
   * @param {Pt} p
   */
  dragItem(d, p) {
    const g = this.mods.ctrl ? 0.1 : this.mods.shift ? 10 : 1
    const it = d.it
    const t = this.snapToWalls(it, {
      x: Math.round((p.x + d.dx) / g) * g,
      y: Math.round((p.y + d.dy) / g) * g,
    })
    // swept move so fast drags can't tunnel through walls; then slide along x / y.
    // May leave obstacles it is already in, never enter new ones.
    /**
     * @param {Pt} from
     * @param {Pt} to
     * @returns {Pt}
     */
    const reach = (from, to) => {
      const base = this.hits(it, from.x, from.y, it.rot)
      const n = Math.ceil(dist(from, to) / 4) || 1
      let ok = from
      for (let i = 1; i <= n; i++) {
        const q = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }
        if (this.hits(it, q.x, q.y, it.rot).some((h) => !base.includes(h))) break
        ok = q
      }
      return ok
    }
    let c = reach(it, t)
    c = reach(c, { x: t.x, y: c.y })
    c = reach(c, { x: c.x, y: t.y })
    it.x = Math.round(c.x * 10) / 10
    it.y = Math.round(c.y * 10) / 10
    this.onSelect()
  }
  /**
   * @param {PointerEvent} e
   * @param {boolean} cancel
   */
  up(e, cancel) {
    if (!this.ptrs.delete(e.pointerId)) return
    const d = this.drag
    if (d?.kind === 'pinch') {
      // lifting one finger of a pinch ends it; the remaining finger does nothing until lifted
      if (this.ptrs.size < 2) this.drag = null
      return
    }
    if (this.ptrs.size) return
    const pr = this.press
    this.press = null
    this.drag = null
    if (d?.kind === 'item' || d?.kind === 'open') this.onChange()
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
    const it = this.selected()
    const cmd = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'Escape':
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
        if (it) {
          const s = e.shiftKey ? 10 : 1
          it.x += e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0
          it.y += e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
          e.preventDefault()
          this.changed()
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
    this.onChange()
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
      this.onChange()
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
            : this.selected()
              ? 'drag to move · drag the handle to rotate'
              : this.selectedOpening()
                ? 'drag along the wall'
                : 'tap to select · drag to pan · pinch to zoom'
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
      g.font = `500 ${11 / k}px Inter, system-ui`
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
    for (const it of layout(this.p).items) {
      const a = asset(this.p, it.asset)
      if (!a) continue
      g.save()
      g.translate(it.x, it.y)
      g.rotate((it.rot * Math.PI) / 180)
      const on = this.sel?.kind === 'item' && this.sel.id === it.id
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
      g.strokeStyle = bad ? C.bad : on ? C.acc : 'rgba(255,255,255,.22)'
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
        g.font = `500 ${12 / k}px Inter, system-ui`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(a.name, 0, a.d * k > 40 ? -7 / k : 0)
        if (a.d * k > 40) {
          g.font = `${10.5 / k}px Inter, system-ui`
          g.fillStyle = dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'
          g.fillText(`${a.w} × ${a.d}`, 0, 8 / k)
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
        g.strokeStyle = C.acc + '88'
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
