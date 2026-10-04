// All lengths in cm, world coords: +x right, +y down.

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ id?: string, a: Pt, b: Pt }} Wall */
/**
 * t = distance (cm) from wall.a to opening centre; hinge 0 = leaf pivots at the a-side jamb;
 * swing ±1 = side of the wall (left/right of a→b) the door opens into
 * @typedef {{ id: string, wall: string, t: number, w: number, kind: 'door' | 'window', hinge: 0 | 1, swing: 1 | -1 }} Opening
 */
/** @typedef {{ src: string, x: number, y: number, cmPerPx: number, opacity: number }} PlanImage */
/** @typedef {{ id: string, name: string, w: number, d: number, h: number, color: string, img?: string }} Asset */
/**
 * Center + rotation in degrees.
 * @typedef {{ id: string, asset: string, x: number, y: number, rot: number }} Item
 */
/** @typedef {{ id: string, name: string, items: Item[] }} Layout */
/** @typedef {{ walls: Wall[], openings?: Opening[], wallT?: number, image?: PlanImage }} Plan */
/** @typedef {{ plan: Plan, assets: Asset[], layouts: Layout[], current: string }} Project */

export const uid = () => Math.random().toString(36).slice(2, 10)

/** @returns {Project} */
export const blank = () => {
  const id = uid()
  return {
    plan: { walls: [], openings: [], wallT: 10 },
    assets: [],
    layouts: [{ id, name: 'Layout 1', items: [] }],
    current: id,
  }
}

const num = (/** @type {unknown} */ v) => typeof v === 'number'
const str = (/** @type {unknown} */ v) => typeof v === 'string'
const pt = (/** @type {any} */ v) => num(v?.x) && num(v?.y)
// What the app itself writes (colour input, FileReader, canvas). Anything else in an imported file
// could add CSS of its own or make the app fetch a foreign URL.
const HEX = /^#[0-9a-f]{6}$/i
const DATA = /^data:[\w/.+;=-]*;base64,[\w+/=]*$/
const src = (/** @type {unknown} */ v) => str(v) && DATA.test(/** @type {string} */ (v))

/**
 * Check a stored or imported project and fill in fields added after it was saved. Colours and
 * image sources the app would not write itself are replaced or dropped.
 * @param {any} p unchecked
 * @returns {Project}
 * @throws {TypeError} when parts are missing or of the wrong type
 */
export const migrate = (p) => {
  const pl = p?.plan
  const ok =
    Array.isArray(pl?.walls) &&
    pl.walls.every((/** @type {any} */ w) => pt(w?.a) && pt(w.b) && (w.id == null || str(w.id))) &&
    (pl.openings == null ||
      (Array.isArray(pl.openings) &&
        pl.openings.every(
          (/** @type {any} */ o) =>
            str(o?.id) &&
            str(o.wall) &&
            num(o.t) &&
            num(o.w) &&
            ['door', 'window'].includes(o.kind) &&
            [0, 1].includes(o.hinge) &&
            [1, -1].includes(o.swing),
        ))) &&
    (pl.wallT == null || num(pl.wallT)) &&
    Array.isArray(p.assets) &&
    p.assets.every(
      (/** @type {any} */ a) => str(a?.id) && str(a.name) && num(a.w) && num(a.d) && num(a.h),
    ) &&
    Array.isArray(p.layouts) &&
    p.layouts.length > 0 &&
    p.layouts.every(
      (/** @type {any} */ l) =>
        str(l?.id) &&
        str(l.name) &&
        Array.isArray(l.items) &&
        l.items.every(
          (/** @type {any} */ i) =>
            str(i?.id) && str(i.asset) && num(i.x) && num(i.y) && num(i.rot),
        ),
    ) &&
    str(p.current)
  if (!ok) throw new TypeError('not a flatplan project')
  pl.walls.forEach((/** @type {Wall} */ w) => (w.id ??= uid()))
  pl.openings ??= []
  const im = pl.image
  if (im != null && !(src(im.src) && num(im.x) && num(im.y) && num(im.cmPerPx) && num(im.opacity)))
    delete pl.image
  for (const a of p.assets) {
    if (!(str(a.color) && HEX.test(a.color))) a.color = '#6272a4'
    if (a.img != null && !src(a.img)) delete a.img
  }
  return p
}

/**
 * @param {Project} p
 * @returns {Layout}
 */
export const layout = (p) =>
  p.layouts.find((l) => l.id === p.current) ?? /** @type {Layout} */ (p.layouts[0])

/**
 * @param {Project} p
 * @param {string} id
 * @returns {Asset | undefined}
 */
export const asset = (p, id) => p.assets.find((a) => a.id === id)
