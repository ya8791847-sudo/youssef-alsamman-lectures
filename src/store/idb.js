/**
 * Tiny IndexedDB wrapper — persists projects and media blobs locally.
 * Media files never leave the device: they live in IndexedDB.
 */

const DB_NAME = 'laqta-ai'
const DB_VERSION = 1
const STORES = ['projects', 'media', 'meta']

let dbp = null

/** IndexedDB is unavailable in some standalone WebViews (file:// origin). */
export function storageAvailable() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function open() {
  if (!storageAvailable()) return Promise.reject(new Error('indexeddb-unavailable'))
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexeddb-blocked'))
  })
  return dbp
}

async function tx(store, mode, fn) {
  if (!storageAvailable()) return undefined
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const os = t.objectStore(store)
    let req
    try {
      req = fn(os)
    } catch (e) {
      reject(e)
      return
    }
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : req)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', (os) => os.get(key)),
  getAll: (store) => tx(store, 'readonly', (os) => os.getAll()),
  keys: (store) => tx(store, 'readonly', (os) => os.getAllKeys()),
  put: (store, value, key) => tx(store, 'readwrite', (os) => os.put(value, key)),
  del: (store, key) => tx(store, 'readwrite', (os) => os.delete(key)),
  clear: (store) => tx(store, 'readwrite', (os) => os.clear()),
}

export async function estimateUsage() {
  try {
    const est = await navigator.storage?.estimate?.()
    return est || null
  } catch {
    return null
  }
}

export async function requestPersistent() {
  try {
    return await navigator.storage?.persist?.()
  } catch {
    return false
  }
}
