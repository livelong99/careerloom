// NVIDIA GPU probe for the faster-whisper (CTranslate2, CUDA 12) engine. Sync, cached, fail-soft: no nvidia-smi = no GPU.
import { execFileSync } from 'node:child_process'

export type GpuInfo = { name: string; vramMb: number; driver: string; computeCap: number | null }
/** CUDA 12 minimum driver (Windows 527.41, Linux 525.60.13). Older drivers cannot load the cuBLAS/cuDNN 12 wheels. */
export const MIN_DRIVER: Record<string, string> = { win32: '527.41', linux: '525.60.13' }
/** CTranslate2 float16 is only fast from Volta (7.0); Pascal (6.x) runs int8; below 6.0 is not worth it. */
export const MIN_COMPUTE_CAP = 6.0
export const LOW_VRAM_MB = 6144
const QUERY = ['--query-gpu=name,memory.total,driver_version,compute_cap', '--format=csv,noheader']

const nums = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
/** a >= b for dotted versions. */
export function versionAtLeast(a: string, b: string): boolean {
  const x = nums(a), y = nums(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0 }
  return true
}

/** One CSV row per GPU: "NVIDIA GeForce RTX 4060, 8188 MiB, 551.23, 8.9" (compute_cap may be absent on old drivers). Largest-VRAM GPU wins. */
export function parseNvidiaSmi(out: string): GpuInfo | null {
  const gpus = out.split(/\r?\n/).flatMap((line): GpuInfo[] => {
    const p = line.split(',').map(s => s.trim())
    if (p.length < 3) return []
    const mem = /^(\d+)\s*MiB/i.exec(p[p.length >= 4 ? p.length - 3 : p.length - 2]!)
    const driver = p[p.length >= 4 ? p.length - 2 : p.length - 1]!
    if (!mem || !/^\d+(\.\d+)*$/.test(driver)) return []
    const cc = p.length >= 4 ? parseFloat(p[p.length - 1]!) : NaN
    return [{ name: p.slice(0, p.length - (p.length >= 4 ? 3 : 2)).join(', '), vramMb: Number(mem[1]), driver, computeCap: Number.isFinite(cc) ? cc : null }]
  })
  return gpus.sort((a, b) => b.vramMb - a.vramMb)[0] ?? null
}

/** Why CUDA cannot be used (null = usable). Unknown compute capability is given the benefit of the doubt. */
export function cudaBlocker(g: GpuInfo | null, platform = process.platform): string | null {
  if (!g) return 'No NVIDIA GPU found'
  const min = MIN_DRIVER[platform]
  if (!min) return 'CUDA is not supported on this operating system'
  if (!versionAtLeast(g.driver, min)) return `NVIDIA driver ${g.driver} is too old (${min} or newer is needed)`
  if (g.computeCap !== null && g.computeCap < MIN_COMPUTE_CAP) return `${g.name} is too old for CUDA 12 speech recognition`
  return null
}

/** float16 on Volta+ with room to spare, int8_float16 on 6 GB cards or less, int8 on Pascal, int8 on CPU. */
export function computeTypeFor(device: 'cuda' | 'cpu', g: GpuInfo | null): string {
  if (device === 'cpu') return 'int8'
  if (g?.computeCap != null && g.computeCap < 7) return 'int8'
  return g && g.vramMb <= LOW_VRAM_MB ? 'int8_float16' : 'float16'
}

let cached: { value: GpuInfo | null } | null = null
export const resetGpuCache = () => { cached = null }

/** nvidia-smi on PATH, then the System32 copy; one retry without compute_cap for ancient drivers. Cached for the process. */
export function probeGpu(run: (bin: string, args: string[]) => string = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 4000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })): GpuInfo | null {
  if (cached) return cached.value
  let value: GpuInfo | null = null
  const bins = process.platform === 'win32' ? ['nvidia-smi', `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\nvidia-smi.exe`] : ['nvidia-smi']
  outer: for (const bin of bins) {
    for (const q of [QUERY, [QUERY[0]!.replace(',compute_cap', ''), QUERY[1]!]]) {
      try { value = parseNvidiaSmi(run(bin, q)); if (value) break outer } catch { /* try the next form */ }
    }
  }
  cached = { value }
  return value
}

/** The probed GPU when CUDA can use it, else null. macOS never has CUDA, so it is not probed there. */
export const usableGpu = (platform = process.platform, gpu: () => GpuInfo | null = probeGpu): GpuInfo | null => {
  if (platform !== 'win32' && platform !== 'linux') return null
  const g = gpu()
  return cudaBlocker(g, platform) === null ? g : null
}
