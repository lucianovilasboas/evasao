import fs from "fs"

interface Entrada<T> {
  mtime: number
  data: T
}

const store = new Map<string, Entrada<unknown>>()

/**
 * Lê um arquivo JSON com cache por mtime: se o arquivo mudou no disco,
 * reparseia; senão reaproveita o objeto em memória.
 */
export function lerJsonCacheado<T>(file: string, fallback: T): T {
  let mtime = 0
  try {
    mtime = fs.statSync(file).mtimeMs
  } catch {
    return fallback
  }
  const cached = store.get(file) as Entrada<T> | undefined
  if (cached && cached.mtime === mtime) return cached.data

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as T
    store.set(file, { mtime, data })
    return data
  } catch {
    return fallback
  }
}
