import { describe, expect, it } from 'vitest'
import { modelOrder, withFailover } from './failover'
import { LlmError } from './providers/openrouter'

async function all<T>(it: AsyncIterable<T>) { const o: T[] = []; for await (const x of it) o.push(x); return o }
const noSleep = async () => undefined

describe('withFailover', () => {
  it('moves to the next model on a retryable error before output', async () => {
    const tried: string[] = []
    const retries: string[] = []
    const out = await all(withFailover(['a', 'b'], async function* (m) {
      tried.push(m)
      if (m === 'a') throw new LlmError('rate_limit', 'slow')
      yield m
    }, { sleep: noSleep, onRetry: i => retries.push(`${i.from}>${i.to}:${i.code}`) }))
    expect(out).toEqual(['b']); expect(tried).toEqual(['a', 'b']); expect(retries).toEqual(['a>b:rate_limit'])
  })
  it('retries the same model when there is only one, up to maxAttempts', async () => {
    let n = 0
    await expect(all(withFailover(['a'], async function* () { n++; throw new LlmError('server', 'x'); yield 1 }, { sleep: noSleep }))).rejects.toMatchObject({ code: 'server' })
    expect(n).toBe(3)
  })
  it.each(['auth', 'credits', 'bad_request', 'aborted', 'budget'] as const)('never retries %s', async code => {
    let n = 0
    await expect(all(withFailover(['a', 'b'], async function* () { n++; throw new LlmError(code, 'x'); yield 1 }, { sleep: noSleep }))).rejects.toMatchObject({ code })
    expect(n).toBe(1)
  })
  it('does not retry after output has started (no duplicated text)', async () => {
    let n = 0
    const got: number[] = []
    await expect((async () => { for await (const x of withFailover(['a', 'b'], async function* () { n++; yield 1; throw new LlmError('server', 'x') }, { sleep: noSleep })) got.push(x) })()).rejects.toMatchObject({ code: 'server' })
    expect(got).toEqual([1]); expect(n).toBe(1)
  })
  it('does not retry plain errors, backs off exponentially, and stops when aborted', async () => {
    await expect(all(withFailover(['a', 'b'], async function* () { throw new Error('bug'); yield 1 }, { sleep: noSleep }))).rejects.toThrow('bug')
    const waits: number[] = []
    await all(withFailover(['a', 'b', 'c'], async function* (m) { if (m !== 'c') throw new LlmError('rate_limit', 't'); yield 1 }, { baseDelayMs: 100, sleep: async ms => { waits.push(ms) } }))
    expect(waits).toEqual([100, 200])
    const other: number[] = [] // a different model after a timeout/server/empty reply goes out at once
    await all(withFailover(['a', 'b'], async function* (m) { if (m === 'a') throw new LlmError('timeout', 't'); yield 1 }, { sleep: async ms => { other.push(ms) } }))
    expect(other).toEqual([])
    const ac = new AbortController(); ac.abort()
    await expect(all(withFailover(['a', 'b'], async function* () { throw new LlmError('timeout', 't'); yield 1 }, { sleep: noSleep, signal: ac.signal }))).rejects.toMatchObject({ code: 'timeout' })
  })
  it('modelOrder de-duplicates and keeps the primary first', () => {
    expect(modelOrder('a', ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
  it('rejects an empty model list', async () => {
    await expect(all(withFailover([], async function* () { yield 1 }))).rejects.toMatchObject({ code: 'bad_request' })
  })
})
