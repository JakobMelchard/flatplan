// Pure geometry: no DOM, unit-tested in test/geom.test.js.

/** @typedef {import('./model.js').Pt} Pt */
/** @typedef {import('./model.js').Wall} Wall */
/** @typedef {import('./model.js').Opening} Opening */
/** @typedef {import('./model.js').Asset} Asset */

/**
 * @param {Pt} a
 * @param {Pt} b
 */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Parameter (0..1, clamped) of p projected onto segment ab.
 * @param {Pt} p
 * @param {Pt} a
 * @param {Pt} b
 */
export const projT = (p, a, b) => {
  const l2 = dist(a, b) ** 2
  if (!l2) return 0
  return Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2))
}

/**
 * @param {Pt} p
 * @param {Pt} a
 * @param {Pt} b
 */
export const segDist = (p, a, b) => {
  const t = projT(p, a, b)
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

/**
 * Separating-axis test for two convex polygons. Touching edges do not count as overlap.
 * @param {Pt[]} A
 * @param {Pt[]} B
 */
export const sat = (A, B) => {
  for (const P of [A, B])
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      const nx = a.y - b.y
      const ny = b.x - a.x
      /** @param {Pt[]} Q */
      const pr = (Q) => Q.map((q) => q.x * nx + q.y * ny)
      const pa = pr(A)
      const pb = pr(B)
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
    }
  return true
}

/**
 * Relative luminance-ish (0..1) of a #rrggbb colour, for label contrast.
 * @param {string} hex
 */
export const lum = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/**
 * q in the frame of a box centred at c rotated by rot degrees.
 * @param {Pt} c
 * @param {number} rot
 * @param {Pt} q
 * @returns {Pt}
 */
export const toLocal = (c, rot, q) => {
  const r = (-rot * Math.PI) / 180
  const dx = q.x - c.x
  const dy = q.y - c.y
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) }
}

/**
 * Door / window geometry on its wall.
 * u = wall direction, n = normal towards the swing side, hp = hinge point,
 * zone = the w×w square a door leaf sweeps.
 * @param {Opening} o
 * @param {Wall} w
 */
export const openingGeom = (o, w) => {
  const L = dist(w.a, w.b) || 1
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }
  const n = { x: -u.y * o.swing, y: u.x * o.swing }
  /**
   * @param {number} t along the wall from a
   * @param {number} [s] along n
   * @returns {Pt}
   */
  const at = (t, s = 0) => ({ x: w.a.x + u.x * t + n.x * s, y: w.a.y + u.y * t + n.y * s })
  const t0 = o.t - o.w / 2
  const t1 = o.t + o.w / 2
  const hp = at(o.hinge ? t1 : t0)
  const dir = o.hinge ? -1 : 1
  const zone = [hp, at(o.hinge ? t0 : t1), at(o.hinge ? t0 : t1, o.w), at(o.hinge ? t1 : t0, o.w)]
  return { w, L, u, n, at, t0, t1, hp, dir, zone }
}

/**
 * Corners of an asset's footprint centred at (x, y), rotated by rot degrees, shrunk by e.
 * @param {Asset} a
 * @param {number} x
 * @param {number} y
 * @param {number} rot
 * @param {number} [e]
 * @returns {Pt[]}
 */
export const footprint = (a, x, y, rot, e = 0) => {
  const r = (rot * Math.PI) / 180
  const cs = Math.cos(r)
  const sn = Math.sin(r)
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = sx * (a.w / 2 - e)
    const ly = sy * (a.d / 2 - e)
    return { x: x + lx * cs - ly * sn, y: y + lx * sn + ly * cs }
  })
}

/**
 * Obstacles an asset placed at (x, y, rot) overlaps: `w<index>` for walls (segments of
 * thickness wallT), `o<id>` for door swing zones.
 * @param {{ walls: Wall[], openings: Opening[], wallT: number }} plan
 * @param {Asset} a
 * @param {number} x
 * @param {number} y
 * @param {number} rot
 * @returns {string[]}
 */
export const hits = (plan, a, x, y, rot) => {
  const hw = a.w / 2 + plan.wallT / 2 - 0.01
  const hd = a.d / 2 + plan.wallT / 2 - 0.01
  const c = { x, y }
  const rect = footprint(a, x, y, rot, 0.5)
  /** @type {string[]} */
  const out = []
  for (const o of plan.openings) {
    const w = o.kind === 'door' && plan.walls.find((w) => w.id === o.wall)
    if (w && sat(rect, openingGeom(o, w).zone)) out.push(`o${o.id}`)
  }
  plan.walls.forEach((w, i) => {
    const p = toLocal(c, rot, w.a)
    const q = toLocal(c, rot, w.b)
    const dx = q.x - p.x
    const dy = q.y - p.y
    // Liang-Barsky clip of the wall segment against the item box grown by half the wall thickness
    let t0 = 0
    let t1 = 1
    for (const [num, den] of [
      [p.x + hw, -dx],
      [hw - p.x, dx],
      [p.y + hd, -dy],
      [hd - p.y, dy],
    ]) {
      if (den === 0) {
        if (num < 0) return
        continue
      }
      const t = num / den
      if (den < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
      if (t0 > t1) return
    }
    out.push(`w${i}`)
  })
  return out
}
