import { execFileSync } from 'node:child_process'
import os from 'node:os'

const PAGES = ['free', 'inactive', 'speculative'] as const

/** Bytes macOS can hand out without paging: free + inactive + speculative pages from `vm_stat`. `os.freemem()` counts only
 *  truly free pages, so on macOS it reads ~0.1 GB while the machine is fine. Null if the output is not recognised. */
export function parseVmStat(out: string): number | null {
  const size = /page size of (\d+) bytes/.exec(out)?.[1]
  if (!size) return null
  let pages = 0
  for (const k of PAGES) {
    const n = new RegExp(`^Pages ${k}:\\s+(\\d+)\\.`, 'm').exec(out)?.[1]
    if (!n) return null
    pages += Number(n)
  }
  return pages * Number(size)
}

type Deps = { platform: NodeJS.Platform; run: () => string; free: () => number }
const real: Deps = { platform: process.platform, run: () => execFileSync('/usr/bin/vm_stat', { encoding: 'utf8', timeout: 2000 }), free: () => os.freemem() }

export function availableMemory(deps: Deps = real): number {
  if (deps.platform === 'darwin') {
    try { const n = parseVmStat(deps.run()); if (n !== null) return n } catch { /* fall through to the OS figure */ }
  }
  return deps.free()
}
