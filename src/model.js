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

/**
 * Fill in fields added after a project was saved.
 * @param {Project} p
 * @returns {Project}
 */
export const migrate = (p) => {
  p.plan.walls.forEach((w) => (w.id ??= uid()))
  p.plan.openings ??= []
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
