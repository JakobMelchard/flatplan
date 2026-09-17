import { type Project, type Pt, type Item, layout, asset, uid } from './model';

export type Tool = 'select' | 'wall' | 'scale';
export type Sel = { kind: 'item'; id: string } | { kind: 'wall'; i: number } | null;
type Drag = { kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'item'; it: Item; dx: number; dy: number } | null;

const GRID = 5, SNAP_PX = 12;
const C = { bg: '#21222c', grid: '#2b2d3a', grid2: '#383a4a', wall: '#f8f8f2', acc: '#bd93f9', bad: '#ff5555', pill: '#282a36', pillLine: '#44475a', pillText: '#8be9fd', handle: '#282a36' };
const lum = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const l2 = dist(a, b) ** 2; if (!l2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
};

export class Editor {
  ctx: CanvasRenderingContext2D;
  ox = 60; oy = 60; k = 1;               // view: screen = world*k + o
  tool: Tool = 'select'; sel: Sel = null;
  onChange = () => {}; onSelect = () => {}; onView = () => {}; status = (_hint: string, _coords: string) => {};
  private drawPts: Pt[] = []; private cur: Pt | null = null; private scalePts: Pt[] = []; private lenBuf = '';
  private drag: Drag = null; private mods = { shift: false, ctrl: false };
  private imgs = new Map<string, HTMLImageElement>();

  constructor(public cv: HTMLCanvasElement, public p: Project) {
    this.ctx = cv.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(cv);
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', () => this.up());
    cv.addEventListener('dblclick', () => this.endWall());
    cv.addEventListener('wheel', e => this.wheel(e), { passive: false });
    cv.addEventListener('dragover', e => e.preventDefault());
    cv.addEventListener('drop', e => { e.preventDefault(); const id = e.dataTransfer?.getData('asset'); if (id) this.addItem(id, this.w(e)); });
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => { this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }; });
    this.resize();
  }

  // ---- coords
  w(e: { clientX: number; clientY: number }): Pt { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left - this.ox) / this.k, y: (e.clientY - r.top - this.oy) / this.k }; }
  private snapWall(p: Pt): Pt {
    const eps = SNAP_PX / this.k;
    for (const w of this.p.plan.walls) for (const q of [w.a, w.b]) if (dist(p, q) < eps) return { ...q };
    for (const q of this.drawPts) if (dist(p, q) < eps) return { ...q };
    let s = this.mods.ctrl ? p : { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
    const last = this.drawPts.at(-1);
    if (last && this.mods.shift) s = Math.abs(s.x - last.x) > Math.abs(s.y - last.y) ? { x: s.x, y: last.y } : { x: last.x, y: s.y };
    return s;
  }

  // ---- public ops
  setTool(t: Tool) { this.tool = t; this.drawPts = []; this.scalePts = []; this.lenBuf = ''; this.sel = null; this.onSelect(); this.hint(); this.render(); }
  selected(): Item | undefined { const s = this.sel; return s?.kind === 'item' ? layout(this.p).items.find(i => i.id === s.id) : undefined; }
  addItem(assetId: string, at?: Pt) {
    const c = at ?? this.w({ clientX: this.cv.clientWidth / 2 + this.cv.getBoundingClientRect().left, clientY: this.cv.clientHeight / 2 + this.cv.getBoundingClientRect().top });
    const it: Item = { id: uid(), asset: assetId, x: Math.round(c.x), y: Math.round(c.y), rot: 0 };
    layout(this.p).items.push(it); this.unstick(it); this.sel = { kind: 'item', id: it.id }; this.changed();
  }
  rotate(deg: number) { const it = this.selected(); if (it) { it.rot = ((it.rot + deg) % 360 + 360) % 360; this.unstick(it); this.changed(); } }
  // nearest wall-free spot within 150cm (spiral search), else leave in place
  private unstick(it: Item) {
    if (!this.collides(it, it.x, it.y, it.rot)) return;
    for (let r = 5; r <= 150; r += 5) for (let a = 0; a < 360; a += 15) {
      const x = it.x + r * Math.cos(a * Math.PI / 180), y = it.y + r * Math.sin(a * Math.PI / 180);
      if (!this.collides(it, x, y, it.rot)) { it.x = Math.round(x); it.y = Math.round(y); return; }
    }
  }
  del() {
    const s = this.sel;
    if (s?.kind === 'item') { const l = layout(this.p); l.items = l.items.filter(i => i.id !== s.id); }
    else if (s?.kind === 'wall') this.p.plan.walls.splice(s.i, 1);
    this.sel = null; this.changed();
  }
  dup() { const it = this.selected(); if (it) { const c = { ...it, id: uid(), x: it.x + 20, y: it.y + 20 }; layout(this.p).items.push(c); this.sel = { kind: 'item', id: c.id }; this.changed(); } }
  fit() {
    const pts: Pt[] = this.p.plan.walls.flatMap(w => [w.a, w.b]);
    for (const it of layout(this.p).items) pts.push({ x: it.x, y: it.y });
    const im = this.p.plan.image, el = im && this.img(im.src);
    if (im && el?.complete) pts.push({ x: im.x, y: im.y }, { x: im.x + el.width * im.cmPerPx, y: im.y + el.height * im.cmPerPx });
    if (!pts.length) { this.ox = 60; this.oy = 60; this.k = 1; this.onView(); return this.render(); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    this.k = Math.min(this.cv.clientWidth / (x1 - x0 + 100), this.cv.clientHeight / (y1 - y0 + 100), 4);
    this.ox = (this.cv.clientWidth - (x0 + x1) * this.k) / 2; this.oy = (this.cv.clientHeight - (y0 + y1) * this.k) / 2;
    this.onView(); this.render();
  }
  changed() { this.onChange(); this.onSelect(); this.render(); }

  // ---- events
  private down(e: PointerEvent) {
    this.cv.setPointerCapture(e.pointerId);
    const p = this.w(e);
    if (e.button === 1 || (e.button === 0 && e.altKey)) return this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
    if (e.button !== 0) return;
    if (this.tool === 'wall') { const s = this.snapWall(p); if (this.drawPts.length && dist(s, this.drawPts[0]!) < 1e-6 && this.drawPts.length > 2) return this.commitWall(s), this.endWall(); this.commitWall(s); return; }
    if (this.tool === 'scale') { this.scalePts.push(p); if (this.scalePts.length === 2) this.applyScale(); return this.render(); }
    // select
    const items = layout(this.p).items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!, a = asset(this.p, it.asset); if (!a) continue;
      const r = -it.rot * Math.PI / 180, dx = p.x - it.x, dy = p.y - it.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= a.w / 2 && Math.abs(ly) <= a.d / 2) {
        this.sel = { kind: 'item', id: it.id }; this.drag = { kind: 'item', it, dx: it.x - p.x, dy: it.y - p.y };
        items.push(...items.splice(i, 1)); // raise to top
        this.onSelect(); return this.render();
      }
    }
    const wi = this.p.plan.walls.findIndex(w => segDist(p, w.a, w.b) < Math.max(this.wallT() / 2, 6 / this.k));
    this.sel = wi >= 0 ? { kind: 'wall', i: wi } : null; this.onSelect();
    if (wi < 0) this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
    this.render();
  }
  private move(e: PointerEvent) {
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    const p = this.w(e); this.cur = p;
    if (this.drag?.kind === 'pan') { this.ox = this.drag.ox + e.clientX - this.drag.sx; this.oy = this.drag.oy + e.clientY - this.drag.sy; this.onView(); }
    else if (this.drag?.kind === 'item') {
      const g = this.mods.ctrl ? 0.1 : this.mods.shift ? 10 : 1, it = this.drag.it;
      const t = this.snapToWalls(it, { x: Math.round((p.x + this.drag.dx) / g) * g, y: Math.round((p.y + this.drag.dy) / g) * g });
      // swept move so fast drags can't tunnel through walls; then slide along x / y
      const reach = (from: Pt, to: Pt): Pt => { const base = this.hits(it, from.x, from.y, it.rot), n = Math.ceil(dist(from, to) / 4) || 1; let ok = from; for (let i = 1; i <= n; i++) { const q = { x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }; if (this.hits(it, q.x, q.y, it.rot).some(h => !base.includes(h))) break; ok = q; } return ok; }; // may leave walls it's already in, never enter new ones
      let c = reach(it, t); c = reach(c, { x: t.x, y: c.y }); c = reach(c, { x: c.x, y: t.y });
      it.x = Math.round(c.x * 10) / 10; it.y = Math.round(c.y * 10) / 10;
      this.onSelect();
    }
    this.hint(); this.render();
  }
  private up() { if (this.drag?.kind === 'item') this.onChange(); this.drag = null; }
  private wheel(e: WheelEvent) {
    e.preventDefault();
    const r = this.cv.getBoundingClientRect();
    this.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }
  zoom(f: number, mx = this.cv.clientWidth / 2, my = this.cv.clientHeight / 2) {
    const k2 = Math.min(20, Math.max(0.05, this.k * f));
    this.ox = mx - (mx - this.ox) * k2 / this.k; this.oy = my - (my - this.oy) * k2 / this.k; this.k = k2; this.onView(); this.render();
  }
  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).matches('input,select,textarea')) return;
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    if (this.tool === 'wall' && this.drawPts.length) {
      if (/^[\d.]$/.test(e.key)) { this.lenBuf += e.key; return this.hint(); }
      if (e.key === 'Backspace') { this.lenBuf = this.lenBuf.slice(0, -1); return this.hint(); }
      if (e.key === 'Enter' && this.lenBuf) { this.commitWall(this.byLength(+this.lenBuf)); this.lenBuf = ''; return this.hint(); }
    }
    const it = this.selected();
    switch (e.key) {
      case 'Escape': this.endWall(); this.scalePts = []; this.sel = null; this.onSelect(); break;
      case 'Delete': case 'Backspace': this.del(); break;
      case 'r': this.rotate(90); break; case 'R': this.rotate(-90); break;
      case 'q': this.rotate(-15); break; case 'e': this.rotate(15); break;
      case 'd': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.dup(); } break;
      case 'f': this.fit(); break;
      case 'v': this.setTool('select'); break; case 'w': this.setTool('wall'); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        if (it) { const s = e.shiftKey ? 10 : 1; it.x += e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0; it.y += e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0; e.preventDefault(); this.changed(); }
    }
    this.render();
  }

  // ---- wall / scale tools
  private byLength(len: number): Pt {
    const last = this.drawPts.at(-1)!, c = this.cur ?? { x: last.x + 1, y: last.y };
    let dx = c.x - last.x, dy = c.y - last.y;
    if (Math.abs(dx) > Math.abs(dy)) { dx = Math.sign(dx) || 1; dy = 0; } else { dy = Math.sign(dy) || 1; dx = 0; }
    return { x: last.x + dx * len, y: last.y + dy * len };
  }
  private commitWall(pt: Pt) { const last = this.drawPts.at(-1); if (last && dist(last, pt) > 0.5) this.p.plan.walls.push({ a: last, b: pt }); this.drawPts.push(pt); this.onChange(); }
  private endWall() { this.drawPts = []; this.lenBuf = ''; this.hint(); this.render(); }
  private applyScale() {
    const [a, b] = this.scalePts as [Pt, Pt], im = this.p.plan.image; this.scalePts = [];
    const real = +(prompt('Real length of marked segment (cm):') ?? '');
    if (im && real > 0) { const f = real / dist(a, b); im.cmPerPx *= f; im.x = a.x - (a.x - im.x) * f; im.y = a.y - (a.y - im.y) * f; this.onChange(); }
    this.setTool('select');
  }
  private hint() {
    const c = this.cur ? `${this.cur.x.toFixed(0)}, ${this.cur.y.toFixed(0)} cm` : '';
    const t = this.tool === 'wall' ? (this.drawPts.length ? `${this.lenBuf ? `length ${this.lenBuf}` : `${this.cur ? dist(this.cur, this.drawPts.at(-1)!).toFixed(0) : ''}`} cm · type a number + Enter · Shift = 90° · Esc to finish` : 'click to place the first corner')
      : this.tool === 'scale' ? `click two points with a known distance (${this.scalePts.length}/2)` : this.selected() ? 'drag to move · R rotate · Del remove' : 'click an item to select · drag empty space to pan';
    this.status(t, c);
  }

  // ---- walls vs items (item-local frame; wall = segment with thickness)
  wallT() { return this.p.plan.wallT ?? 10; }
  private local(it: Pt, rot: number, q: Pt): Pt { const r = -rot * Math.PI / 180, dx = q.x - it.x, dy = q.y - it.y; return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) }; }
  collides(it: Item, x: number, y: number, rot: number) { return this.hits(it, x, y, rot).length > 0; }
  hits(it: Item, x: number, y: number, rot: number): number[] {
    const a = asset(this.p, it.asset); if (!a) return [];
    const hw = a.w / 2 + this.wallT() / 2 - 0.01, hd = a.d / 2 + this.wallT() / 2 - 0.01, c = { x, y };
    return this.p.plan.walls.flatMap((w, i) => {
      const p = this.local(c, rot, w.a), q = this.local(c, rot, w.b), dx = q.x - p.x, dy = q.y - p.y;
      let t0 = 0, t1 = 1; // Liang-Barsky clip of segment against [-hw,hw]x[-hd,hd]
      for (const [num, den] of [[p.x + hw, -dx], [hw - p.x, dx], [p.y + hd, -dy], [hd - p.y, dy]] as [number, number][]) {
        if (den === 0) { if (num < 0) return []; continue; }
        const t = num / den; if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        if (t0 > t1) return [];
      }
      return [i];
    });
  }
  private snapToWalls(it: Item, t: Pt): Pt {
    const a = asset(this.p, it.asset); if (!a || it.rot % 90) return t;
    const [hw, hd] = it.rot % 180 ? [a.d / 2, a.w / 2] : [a.w / 2, a.d / 2], T = this.wallT() / 2, eps = SNAP_PX / this.k;
    let { x, y } = t;
    for (const w of this.p.plan.walls) {
      const vert = Math.abs(w.a.x - w.b.x) < 1e-6, horz = Math.abs(w.a.y - w.b.y) < 1e-6;
      if (vert && y + hd > Math.min(w.a.y, w.b.y) && y - hd < Math.max(w.a.y, w.b.y))
        for (const f of [w.a.x - T, w.a.x + T]) for (const e of [x - hw, x + hw]) if (Math.abs(e - f) < eps) x += f - e;
      if (horz && x + hw > Math.min(w.a.x, w.b.x) && x - hw < Math.max(w.a.x, w.b.x))
        for (const f of [w.a.y - T, w.a.y + T]) for (const e of [y - hd, y + hd]) if (Math.abs(e - f) < eps) y += f - e;
    }
    return { x, y };
  }

  // ---- render
  private img(src: string) { let el = this.imgs.get(src); if (!el) { el = new Image(); el.onload = () => this.render(); el.src = src; this.imgs.set(src, el); } return el; }
  private resize() { const d = devicePixelRatio; this.cv.width = this.cv.clientWidth * d; this.cv.height = this.cv.clientHeight * d; this.render(); }
  render() {
    const { ctx: g, k, ox, oy } = this, W = this.cv.clientWidth, H = this.cv.clientHeight, d = devicePixelRatio;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
    const im = this.p.plan.image;
    if (im) { const el = this.img(im.src); if (el.complete && el.width) { g.globalAlpha = im.opacity; g.drawImage(el, im.x, im.y, el.width * im.cmPerPx, el.height * im.cmPerPx); g.globalAlpha = 1; } }
    // grid
    const step = k > 0.6 ? 50 : k > 0.15 ? 100 : 500, x0 = Math.floor(-ox / k / step) * step, y0 = Math.floor(-oy / k / step) * step;
    for (const [mod, col] of [[1, C.grid], [step === 50 ? 2 : 5, C.grid2]] as [number, string][]) {
      g.lineWidth = 1 / k; g.beginPath();
      for (let x = x0; x < (W - ox) / k; x += step) if (Math.round(x / step) % mod === 0) { g.moveTo(x, (0 - oy) / k); g.lineTo(x, (H - oy) / k); }
      for (let y = y0; y < (H - oy) / k; y += step) if (Math.round(y / step) % mod === 0) { g.moveTo((0 - ox) / k, y); g.lineTo((W - ox) / k, y); }
      g.strokeStyle = col; g.stroke();
    }
    // walls
    const wallPts = this.p.plan.walls.flatMap(w => [w.a, w.b]), cen = { x: wallPts.reduce((s, q) => s + q.x, 0) / (wallPts.length || 1), y: wallPts.reduce((s, q) => s + q.y, 0) / (wallPts.length || 1) };
    const label = (a: Pt, b: Pt, col: string) => {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
      const outward = (m.x - cen.x) * -Math.sin(ang) + (m.y - cen.y) * Math.cos(ang); // + when centroid is on the "up" side of text frame
      g.save(); g.translate(m.x, m.y); g.rotate(ang);
      const txt = `${dist(a, b).toFixed(0)} cm`, fs = 11 / k; g.font = `500 ${fs}px Inter, system-ui`; const tw = g.measureText(txt).width;
      g.fillStyle = C.pill; g.strokeStyle = C.pillLine; g.lineWidth = 1 / k;
      const rx = -tw / 2 - 5 / k, rw = tw + 10 / k, rh = 16 / k, ry = outward > 0 ? this.wallT() / 2 + 6 / k : -this.wallT() / 2 - 6 / k - rh;
      g.beginPath(); g.roundRect(rx, ry, rw, rh, 4 / k); g.fill(); g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, ry + rh / 2); g.restore();
    };
    g.lineCap = 'square';
    this.p.plan.walls.forEach((w, i) => {
      const on = this.sel?.kind === 'wall' && this.sel.i === i;
      g.strokeStyle = on ? C.acc : C.wall; g.lineWidth = this.wallT(); g.beginPath(); g.moveTo(w.a.x, w.a.y); g.lineTo(w.b.x, w.b.y); g.stroke();
    });
    // items
    for (const it of layout(this.p).items) {
      const a = asset(this.p, it.asset); if (!a) continue;
      g.save(); g.translate(it.x, it.y); g.rotate(it.rot * Math.PI / 180);
      const on = this.sel?.kind === 'item' && this.sel.id === it.id, bad = this.collides(it, it.x, it.y, it.rot);
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
      if (a.img) { const el = this.img(a.img); if (el.complete && el.width) g.drawImage(el, -a.w / 2, -a.d / 2, a.w, a.d); }
      else { g.fillStyle = a.color + 'd9'; g.beginPath(); g.roundRect(-a.w / 2, -a.d / 2, a.w, a.d, Math.min(3, a.w / 8, a.d / 8)); g.fill(); }
      g.shadowColor = 'transparent';
      g.lineWidth = (on ? 2 : 1) / k; g.strokeStyle = bad ? C.bad : on ? C.acc : 'rgba(255,255,255,.22)'; g.strokeRect(-a.w / 2, -a.d / 2, a.w, a.d);
      if (on) { const hs = 7 / k; g.fillStyle = C.handle; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) { g.beginPath(); g.rect(sx * a.w / 2 - hs / 2, sy * a.d / 2 - hs / 2, hs, hs); g.fill(); g.stroke(); } }
      if (a.w * k > 44 && a.d * k > 18) {
        const dark = a.img || lum(a.color) > 0.55;
        g.fillStyle = dark ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)'; g.font = `500 ${12 / k}px Inter, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a.name, 0, a.d * k > 40 ? -7 / k : 0);
        if (a.d * k > 40) { g.font = `${10.5 / k}px Inter, system-ui`; g.fillStyle = dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'; g.fillText(`${a.w} × ${a.d}`, 0, 8 / k); }
      }
      g.restore();
    }
    this.p.plan.walls.forEach(w => label(w.a, w.b, C.pillText));
    // in-progress wall
    const last = this.drawPts.at(-1);
    if (last && this.cur && this.tool === 'wall') {
      const s = this.lenBuf ? this.byLength(+this.lenBuf || 0) : this.snapWall(this.cur);
      g.lineWidth = this.wallT(); g.strokeStyle = C.acc + '88'; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(s.x, s.y); g.stroke(); label(last, s, C.acc);
      g.fillStyle = C.acc; g.beginPath(); g.arc(s.x, s.y, 4 / k, 0, 7); g.fill();
    }
    for (const q of this.scalePts) { g.fillStyle = C.bad; g.beginPath(); g.arc(q.x, q.y, 5 / k, 0, 7); g.fill(); }
    if (this.scalePts.length === 1 && this.cur) { g.strokeStyle = C.bad; g.lineWidth = 2 / k; g.beginPath(); g.moveTo(this.scalePts[0]!.x, this.scalePts[0]!.y); g.lineTo(this.cur.x, this.cur.y); g.stroke(); }
  }
}
