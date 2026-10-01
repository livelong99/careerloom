import { describe, expect, it } from 'vitest'

import { computeTypeFor, cudaBlocker, parseNvidiaSmi, probeGpu, resetGpuCache, usableGpu, versionAtLeast } from './gpu'
import { fasterWhisperAdapter, readFwTrace, resetFwTrace, resolveFasterWhisper, timed } from './faster-whisper'
import { createSidecarDecoder } from './decoder'
import { decodeFrames, FRAME } from './framing'
import type { SidecarChild } from './sidecar'

const G = (o: Partial<ReturnType<typeof parseNvidiaSmi> & object> = {}) => ({ name: 'RTX 4060', vramMb: 8188, driver: '551.23', computeCap: 8.9, ...o })

describe('nvidia-smi parsing', () => {
  it('parses name, VRAM, driver and compute capability; the largest GPU wins', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 4060 Laptop GPU, 8188 MiB, 551.23, 8.9\r\n')).toEqual({ name: 'NVIDIA GeForce RTX 4060 Laptop GPU', vramMb: 8188, driver: '551.23', computeCap: 8.9 })
    expect(parseNvidiaSmi('GTX 1050, 4096 MiB, 531.79, 6.1\nRTX 3090, 24576 MiB, 551.23, 8.6')?.name).toBe('RTX 3090')
  })
  it('copes with the no-compute_cap form and with garbage / empty output', () => {
    expect(parseNvidiaSmi('Tesla K80, 11441 MiB, 470.82.01')).toEqual({ name: 'Tesla K80', vramMb: 11441, driver: '470.82.01', computeCap: null })
    expect(parseNvidiaSmi('')).toBeNull()
    expect(parseNvidiaSmi('NVIDIA-SMI has failed because it could not communicate with the driver')).toBeNull()
  })
})

describe('CUDA usability', () => {
  it('compares dotted driver versions', () => {
    expect(versionAtLeast('527.41', '527.41')).toBe(true); expect(versionAtLeast('527.40', '527.41')).toBe(false)
    expect(versionAtLeast('551.23', '527.41')).toBe(true); expect(versionAtLeast('525.60.13', '525.60.13')).toBe(true); expect(versionAtLeast('470.82.01', '525.60.13')).toBe(false)
  })
  it('needs a driver >= the CUDA 12 minimum and compute capability >= 6.0; unknown capability is allowed', () => {
    expect(cudaBlocker(G(), 'win32')).toBeNull()
    expect(cudaBlocker(G({ driver: '522.06' }), 'win32')).toMatch(/too old/)
    expect(cudaBlocker(G({ computeCap: 5.2 }), 'win32')).toMatch(/too old/)
    expect(cudaBlocker(G({ computeCap: null }), 'linux')).toBeNull()
    expect(cudaBlocker(null, 'win32')).toMatch(/No NVIDIA/)
    expect(cudaBlocker(G(), 'darwin')).toMatch(/not supported/)
  })
  it('usableGpu is null on macOS without probing, and null for an unusable GPU', () => {
    let probed = 0
    expect(usableGpu('darwin', () => { probed++; return G() })).toBeNull(); expect(probed).toBe(0)
    expect(usableGpu('win32', () => G({ driver: '400.00' }))).toBeNull()
    expect(usableGpu('win32', () => G())).toEqual(G())
  })
  it('compute type: float16 on roomy Volta+, int8_float16 on <= 6 GB, int8 on Pascal and CPU', () => {
    expect(computeTypeFor('cuda', G())).toBe('float16')
    expect(computeTypeFor('cuda', G({ vramMb: 6144 }))).toBe('int8_float16')
    expect(computeTypeFor('cuda', G({ computeCap: 6.1, vramMb: 8192 }))).toBe('int8')
    expect(computeTypeFor('cpu', G())).toBe('int8')
  })
  it('probeGpu is fail-soft, retries without compute_cap, and caches', () => {
    resetGpuCache()
    const calls: string[][] = []
    const fake = (_b: string, a: string[]) => { calls.push(a); if (a[0]!.includes('compute_cap')) throw new Error('Field "compute_cap" is not a valid field'); return 'RTX 2060, 6144 MiB, 531.79\n' }
    expect(probeGpu(fake)).toMatchObject({ name: 'RTX 2060', computeCap: null })
    const n = calls.length
    expect(probeGpu(fake)).not.toBeNull(); expect(calls.length).toBe(n)
    resetGpuCache()
    expect(probeGpu(() => { throw new Error('ENOENT') })).toBeNull()
    resetGpuCache()
  })
})

describe('faster-whisper device selection', () => {
  const rt = { python: 'p', script: 's', cache: 'c', pin: 'x', models: ['turbo'], cuda: true }
  it('auto uses CUDA only with a usable GPU and the CUDA wheels; cpu never; cuda is always tried', () => {
    expect(resolveFasterWhisper('auto', rt, G())).toEqual({ device: 'cuda', computeType: 'float16' })
    expect(resolveFasterWhisper('auto', rt, null)).toEqual({ device: 'cpu', computeType: 'int8' })
    expect(resolveFasterWhisper('auto', { ...rt, cuda: false }, G())).toEqual({ device: 'cpu', computeType: 'int8' })
    expect(resolveFasterWhisper('cpu', rt, G()).device).toBe('cpu')
    expect(resolveFasterWhisper('cuda', rt, null).device).toBe('cuda')
  })
})

function makeChild() {
  const written: Buffer[] = []
  let data: (b: Buffer) => void = () => {}
  const child: SidecarChild = { write: b => void written.push(b), onData: cb => { data = cb }, onExit: () => {}, kill: () => {} }
  return { child, written, say: (o: object) => data(Buffer.from(JSON.stringify(o) + '\n')) }
}

describe('faster-whisper sidecar protocol (same framing as whisper-mlx)', () => {
  it('config frame carries device/compute type; ready reports the device that ran; decode times are traced', async () => {
    const c = makeChild()
    let t = 0
    const inner = createSidecarDecoder({ spawn: () => c.child, config: () => ({ repo: 'r', device: 'cuda', compute_type: 'float16' }), onReady: l => { seen.push(l.device ?? '') } })
    const seen: string[] = []
    const dec = timed(inner, () => (t += 50))
    resetFwTrace()
    const ready = dec.ready({ source: 'mic', language: 'en', vocab: [], endSilenceMs: 600 })
    c.say({ ev: 'ready', device: 'cpu', reason: 'cublas64_12.dll not found' })
    await ready
    const [cfg, ...rest] = decodeFrames(Buffer.concat(c.written)).frames
    expect(cfg!.type).toBe(FRAME.config); expect(JSON.parse(cfg!.payload.toString())).toMatchObject({ device: 'cuda', compute_type: 'float16' })
    expect(rest).toEqual([]); expect(seen).toEqual(['cpu'])
    const p = dec.decode(new Int16Array(1600), 'final')
    const id = decodeFrames(Buffer.concat(c.written)).frames[1]!.payload.readUInt32BE(0)
    c.say({ ev: 'decoded', id, text: ' hello ' })
    await expect(p).resolves.toBe('hello')
    expect(readFwTrace().decodeMs).toEqual([50])
  })
  it('the adapter records the ready device in the trace', () => {
    resetFwTrace()
    expect(fasterWhisperAdapter('small', 'cpu', null).id).toBe('faster-whisper')
    expect(readFwTrace()).toEqual({ device: null, reason: null, decodeMs: [] })
  })
})
