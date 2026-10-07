import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const sha = (s: string, n = 16) => createHash('sha256').update(s).digest('hex').slice(0, n)

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. Stops starting new work on abort. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, signal?: AbortSignal): Promise<Array<R | undefined>> {
  const out: Array<R | undefined> = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

/** Atomic JSON write (temp file + rename) so a crash never leaves a half-written checkpoint. */
export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file)
}

export function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return null }
}

export const round1 = (n: number) => Math.round(n * 10) / 10
