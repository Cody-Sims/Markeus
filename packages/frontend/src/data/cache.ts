import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'markeus-cache'
const DB_VERSION = 1
const STORE_NAME = 'data'

interface CacheEntry {
  key: string
  data: unknown
  expiresAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb()
    const entry = await db.get(STORE_NAME, key) as CacheEntry | undefined
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) db.delete(STORE_NAME, key) // clean up expired
      return null
    }
    return entry.data as T
  } catch {
    return null
  }
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    const db = await getDb()
    const entry: CacheEntry = {
      key,
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }
    await db.put(STORE_NAME, entry)
  } catch {
    // Non-fatal
  }
}
