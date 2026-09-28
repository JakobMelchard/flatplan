// Undo / redo as whole-project snapshots. Projects are small except for image data URLs, and
// `snap` copies objects and arrays but shares strings, so a snapshot never duplicates an image.

/** @typedef {import('./model.js').Project} Project */

/**
 * Deep copy of plain JSON-like data; strings are shared, not copied.
 * @template T
 * @param {T} v
 * @returns {T}
 */
export const snap = (v) => {
  if (Array.isArray(v)) return /** @type {T} */ (v.map(snap))
  if (v && typeof v === 'object') {
    /** @type {Record<string, unknown>} */
    const o = {}
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = snap(x)
    return /** @type {T} */ (o)
  }
  return v
}

export class History {
  /** @type {Project[]} */
  undos = []
  /** @type {Project[]} */
  redos = []
  lastAt = 0

  /**
   * @param {Project} p current state
   * @param {number} [limit] max undo steps kept
   * @param {number} [merge] changes closer together than this (ms) form one step, so typing
   *   into a number field or tapping rotate twice is undone at once
   */
  constructor(p, limit = 200, merge = 400) {
    this.last = snap(p)
    this.limit = limit
    this.merge = merge
  }

  /**
   * Call after every change.
   * @param {Project} p
   * @param {number} [now]
   */
  record(p, now = Date.now()) {
    if (now - this.lastAt >= this.merge || !this.undos.length) {
      this.undos.push(this.last)
      if (this.undos.length > this.limit) this.undos.shift()
    }
    this.last = snap(p)
    this.redos = []
    this.lastAt = now
  }

  /**
   * Forget the history, e.g. after importing another project.
   * @param {Project} p
   */
  reset(p) {
    this.undos = []
    this.redos = []
    this.last = snap(p)
    this.lastAt = 0
  }

  /** @returns {Project | null} the state to restore (a fresh copy), null if nothing to undo */
  undo() {
    const prev = this.undos.pop()
    if (!prev) return null
    this.redos.push(this.last)
    this.last = prev
    this.lastAt = 0
    return snap(prev)
  }

  /** @returns {Project | null} the state to restore (a fresh copy), null if nothing to redo */
  redo() {
    const next = this.redos.pop()
    if (!next) return null
    this.undos.push(this.last)
    this.last = next
    this.lastAt = 0
    return snap(next)
  }
}
