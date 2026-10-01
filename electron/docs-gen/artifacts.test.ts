import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { jobDir, listFor, safeArtifactPath, saveArtifact } from './artifacts'
import type { Artifact } from './types'

const mk = (over: Partial<Artifact>): Artifact => ({ id: 'i', jobId: 'j1', kind: 'cover', dir: 'output/careerloom/001-x', files: { md: 'output/careerloom/001-x/cover.md', pdf: null }, createdAt: 1, inputHash: 'h', model: 'm', tokens: 1, humanized: false, humanizeTokens: 0, gate: { ok: true, notes: [] }, ...over })

describe('artifacts', () => {
  it('uses a folder that is unique per job and never the master résumé', () => {
    const a = jobDir({ id: 'https://x/1', reportNum: 7, company: 'Acme Corp', title: 'Sr. Engineer!' })
    const b = jobDir({ id: 'https://x/2', reportNum: null, company: 'Acme Corp', title: 'Sr. Engineer!' })
    expect(a).toMatch(/output\/careerloom\/007-acme-corp-sr-engineer$/)
    expect(b).not.toBe(a)
    expect(jobDir({ id: 'https://x/2', reportNum: null, company: 'Acme Corp', title: 'Sr. Engineer!' })).toBe(b)
  })
  it('keeps one entry per job and kind, and only lists files that still exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'art-'))
    mkdirSync(join(root, 'output/careerloom/001-x'), { recursive: true })
    writeFileSync(join(root, 'output/careerloom/001-x/cover.md'), 'hi')
    saveArtifact(root, mk({ tokens: 1 }))
    saveArtifact(root, mk({ tokens: 2 }))
    saveArtifact(root, mk({ jobId: 'j2' }))
    expect(listFor(root, 'j1')).toHaveLength(1)
    expect(listFor(root, 'j1')[0]!.tokens).toBe(2)
    saveArtifact(root, mk({ kind: 'resume', files: { md: 'output/careerloom/001-x/cv.md', pdf: null } }))
    expect(listFor(root, 'j1')).toHaveLength(1) // the résumé file is missing
  })
  it('refuses paths outside output/careerloom', () => {
    expect(() => safeArtifactPath('/r', 'cv.md')).toThrow()
    expect(() => safeArtifactPath('/r', 'output/careerloom/../../cv.md')).toThrow()
    expect(safeArtifactPath('/r', 'output/careerloom/001-x/cv.md')).toBe('/r/output/careerloom/001-x/cv.md')
  })
})
