import { describe, expect, it } from 'vitest'

import { similarities } from './embed'

const reqs = [{ id: 'a', text: 'Kafka', skill: 'Kafka', required: true }, { id: 'b', text: 'Go', skill: 'Go', required: false }]

describe('similarities', () => {
  it('maps the best cosine to each requirement id', async () => {
    const out = await similarities(reqs, ['x'], async () => ({ best: [0.91, 0.8] }))
    expect(out).toEqual({ a: 0.91, b: 0.8 })
  })
  it('is null (degraded mode) without a model, with nothing to compare, or on a bad reply', async () => {
    expect(await similarities(reqs, ['x'], null)).toBeNull()
    expect(await similarities(reqs, [], async () => ({ best: [] }))).toBeNull()
    expect(await similarities(reqs, ['x'], async () => ({ best: [0.9] }))).toBeNull()
    expect(await similarities(reqs, ['x'], async () => { throw new Error('python exploded') })).toBeNull()
  })
})
