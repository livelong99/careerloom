import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Analysis } from './store'
import { jobStoreDir, openStore } from './store'

const analysis = (id: string) => ({ id, createdAt: 1, key: `k${id}`, report: { id } }) as unknown as Analysis

describe('per-job ATS store', () => {
  const base = mkdtempSync(join(tmpdir(), 'ats-'))
  it('gives every job its own folder, stable per id and never the base', () => {
    const a = jobStoreDir(base, 'https://x.test/a')
    expect(a).toBe(jobStoreDir(base, 'https://x.test/a'))
    expect(a).not.toBe(jobStoreDir(base, 'https://x.test/b'))
    expect(a.startsWith(join(base, 'jobs'))).toBe(true)
  })
  it('keeps job analyses and the résumé-level analysis apart', () => {
    const resume = openStore(base)
    const jobA = openStore(jobStoreDir(base, 'a'))
    const jobB = openStore(jobStoreDir(base, 'b'))
    resume.save(analysis('resume'))
    jobA.save(analysis('A'))
    expect(resume.current()?.id).toBe('resume')
    expect(jobA.current()?.id).toBe('A')
    expect(jobB.current()).toBeNull()
    jobB.save(analysis('B'))
    expect(jobA.current()?.id).toBe('A')
    expect(resume.current()?.id).toBe('resume')
  })
})
