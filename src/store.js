// Project persistence (IndexedDB) and file helpers.
// IndexedDB instead of localStorage: no ~5 MB cap for plan scans and item images, and with
// navigator.storage.persist() Safari does not evict it after 7 days of disuse.
import { blank, migrate } from './model.js'

/** @typedef {import('./model.js').Project} Project */

const DB = 'flatplan'
const STORE = 'kv'
const KEY = 'project'
const LEGACY = 'flatplan' // localStorage key of the pre-IndexedDB versions

/** @type {Promise<IDBDatabase> | undefined} */
let conn
// Set when the stored project could not be read. save() refuses from then on, so the blank
// project the app starts with is never written over the stored one.
let unread = ''

/** @returns {Promise<IDBDatabase>} one connection for the page, reopened after it closes or fails */
const open = () =>
  (conn ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => {
      r.result.onclose = () => (conn = undefined)
      res(r.result)
    }
    r.onerror = () => ((conn = undefined), rej(r.error))
  }))

/**
 * @param {IDBTransactionMode} mode
 * @param {(s: IDBObjectStore) => IDBRequest} fn
 * @returns {Promise<any>}
 */
const tx = async (mode, fn) => {
  const db = await open()
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }).catch((e) => {
    // the connection may be dead (iOS drops them in the background): open a new one next time
    db.close()
    conn = undefined
    throw e
  })
}

/**
 * @returns {Promise<Project>} a blank project when nothing is stored. Rejects when the stored
 *   project cannot be read or is not a project; save() refuses until the page is reloaded.
 */
export const load = async () => {
  navigator.storage?.persist?.().catch(() => {})
  try {
    const p = await tx('readonly', (s) => s.get(KEY))
    if (p) return migrate(p)
  } catch (e) {
    unread = `Could not read the saved project (${/** @type {Error} */ (e)?.name}). Changes are not saved.`
    throw new Error(unread, { cause: e })
  }
  try {
    const s = localStorage.getItem(LEGACY)
    if (s) {
      const p = migrate(JSON.parse(s))
      await save(p)
      localStorage.removeItem(LEGACY)
      return p
    }
  } catch {}
  return blank()
}

/**
 * @param {Project} p
 * @returns {Promise<string | null>} error message, null on success
 */
export const save = async (p) => {
  if (unread) return unread
  try {
    await tx('readwrite', (s) => s.put(structuredClone(p), KEY))
    return null
  } catch (e) {
    return `save failed (${/** @type {Error} */ (e).name}), export JSON instead`
  }
}

/**
 * Save a JSON file. Uses the share sheet where it can take files (iPad: "Save to Files"),
 * a download link elsewhere.
 * @param {string} name
 * @param {string} text
 */
export const exportFile = async (name, text) => {
  const file = new File([text], name, { type: 'application/json' })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      return await navigator.share({ files: [file] })
    } catch (e) {
      if (/** @type {Error} */ (e).name === 'AbortError') return
    }
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(file),
    download: name,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * @param {File} f
 * @param {'text' | 'dataURL'} as
 * @returns {Promise<string>}
 */
export const readFile = (f, as) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(/** @type {string} */ (r.result))
    r.onerror = rej
    as === 'text' ? r.readAsText(f) : r.readAsDataURL(f)
  })

/**
 * Downscale big images (phone photos of a plan are 12 MP+) before they go into the project.
 * @param {string} src data URL
 * @param {number} [max] longest side in px
 * @returns {Promise<string>} rejects when src is not an image the browser can decode
 */
export const shrinkImage = (src, max = 2000) =>
  new Promise((res, rej) => {
    const im = new Image()
    im.onerror = () => rej(new Error('not an image'))
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height))
      if (k === 1) return res(src)
      const c = Object.assign(document.createElement('canvas'), {
        width: Math.round(im.width * k),
        height: Math.round(im.height * k),
      })
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'))
      g.drawImage(im, 0, 0, c.width, c.height)
      res(
        c.toDataURL(
          src.startsWith('data:image/png') || src.startsWith('data:image/svg')
            ? 'image/png'
            : 'image/jpeg',
          0.85,
        ),
      )
    }
    im.src = src
  })
