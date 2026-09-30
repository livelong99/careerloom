// Streaming windowed-sinc resampler (replaces Open-Cluely's averaging downsample, which aliases).
// Kernel is Hann-windowed sinc with cutoff at the lower Nyquist; weights are normalised per output sample.
export type Resampler = { process(input: Float32Array): Float32Array }

export function createResampler(inRate: number, outRate: number, taps = 16): Resampler {
  if (inRate === outRate) return { process: x => x }
  const step = inRate / outRate
  const cutoff = Math.min(1, outRate / inRate)
  const half = Math.ceil(taps / cutoff)
  let buf = new Float32Array(half) // zeros: stream starts with silence before sample 0
  let pos = half                   // input position of the next output sample, in buf coordinates

  return {
    process(input) {
      const all = new Float32Array(buf.length + input.length)
      all.set(buf); all.set(input, buf.length)
      const out: number[] = []
      while (pos + half < all.length) {
        const base = Math.floor(pos)
        let sum = 0, norm = 0
        for (let i = base - half + 1; i <= base + half; i++) {
          const x = i - pos
          const a = x * cutoff * Math.PI
          const w = (x === 0 ? 1 : Math.sin(a) / a) * 0.5 * (1 + Math.cos((Math.PI * x) / half))
          sum += all[i]! * w; norm += w
        }
        out.push(sum / norm)
        pos += step
      }
      const keep = Math.max(0, Math.floor(pos) - half)
      buf = all.slice(keep); pos -= keep
      return Float32Array.from(out)
    },
  }
}
