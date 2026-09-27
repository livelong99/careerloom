// Portal housekeeping for the Jobs rail: seed career-ops' default portals (once,
// or on request) and delete portals with their Careerloom-side traces.
import fs from 'node:fs'
import path from 'node:path'

import { careerOpsRoot, dataRoot } from '../context'
import type { JobListing, PortalDetail } from '../contract'
import { readGuidelines, upsertGuideline } from '../jobs-data'
import { portalDetail, validatePortalPatch } from './portal-edit'
import { presetBoards, searchProfile, seedDefaults } from './portal-defaults'
import { readAllSources, readPortalsFile, removeSources, updateSources, writeDoc, type Source } from './sources'
import { readBoardIndex } from './web-board'

const AUTO_SEED_BELOW = 20 // an established portals.yml is left alone
const read = (file: string) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const portalsFile = () => path.join(dataRoot(), 'portals.yml')
const dataFile = (name: string) => path.join(dataRoot(), 'data', name)
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

/** Merge the example portals + presets the user lacks. Returns how many were added. */
export function seedDefaultPortals(): number {
  const example = read(path.join(careerOpsRoot(), 'templates', 'portals.example.yml'))
  if (!example) throw new Error('career-ops has no templates/portals.example.yml — update it in Integrations')
  const doc = readPortalsFile(portalsFile())
  const added = seedDefaults(doc, example, presetBoards(searchProfile(read(path.join(dataRoot(), 'config', 'profile.yml')))))
  if (added) writeDoc(portalsFile(), doc)
  writeJson(dataFile('careerloom-defaults-seeded.json'), { at: new Date().toISOString(), added })
  return added
}

/** First Jobs visit: seed once for a near-empty portals.yml; the marker stops a deleted default coming back. */
export function seedOnce(): void {
  if (fs.existsSync(dataFile('careerloom-defaults-seeded.json'))) return
  try {
    if (readAllSources(portalsFile()).length < AUTO_SEED_BELOW) seedDefaultPortals()
    else writeJson(dataFile('careerloom-defaults-seeded.json'), { at: new Date().toISOString(), added: 0 })
  } catch (err) {
    console.error('default portals not seeded:', err)
  }
}

// Unevaluated jobs of a deleted portal are hidden Careerloom-side: career-ops has no
// locked writer that removes pipeline.md lines, and hand-editing it would race scan.mjs.
const HIDDEN = 'careerloom-hidden-jobs.json'
export function readHiddenJobs(): Set<string> {
  try { return new Set(JSON.parse(read(dataFile(HIDDEN)) || '[]') as string[]) } catch { return new Set() }
}

export const unevaluatedOf = (jobs: JobListing[], id: string): JobListing[] =>
  jobs.filter(j => j.portalId === id && j.reportNum === null && (j.state === 'new' || j.state === 'queued'))

/** Remove portals from portals.yml, plus their guideline and web-board index entries. Evaluated jobs stay. */
export function deletePortals(chosen: Source[], hideJobs: JobListing[]): { removed: number; hidden: number } {
  removeSources(portalsFile(), chosen)
  const custom = path.join(dataRoot(), 'modes', '_custom.md')
  if (fs.existsSync(custom)) fs.writeFileSync(custom, chosen.reduce((text, s) => upsertGuideline(text, s.name, ''), read(custom)))
  const names = new Set(chosen.map(s => s.name))
  const index = readBoardIndex()
  if (Object.values(index).some(n => names.has(n))) {
    writeJson(dataFile('careerloom-web-boards.json'), Object.fromEntries(Object.entries(index).filter(([, n]) => !names.has(n))))
  }
  if (hideJobs.length) writeJson(dataFile(HIDDEN), [...new Set([...readHiddenJobs(), ...hideJobs.map(j => j.id)])])
  return { removed: chosen.length, hidden: hideJobs.length }
}

const customFile = () => path.join(dataRoot(), 'modes', '_custom.md')

function sourceById(id: unknown): Source {
  const found = typeof id === 'string' ? readAllSources(portalsFile()).find(s => s.id === id) : undefined
  if (!found) throw new Error('That board is no longer in portals.yml — refresh and try again')
  return found
}

export function getPortalDetail(id: unknown): PortalDetail {
  const s = sourceById(id)
  return portalDetail(s, readGuidelines(read(customFile())).get(s.name) ?? null)
}

/** Save the editor's changes; a rename carries the board's guideline and web-board index along. */
export function updatePortal(id: unknown, raw: unknown): PortalDetail {
  const source = sourceById(id)
  const all = readAllSources(portalsFile())
  const patch = validatePortalPatch(raw, source, all.filter(s => s.id !== source.id))
  updateSources(portalsFile(), [[source, patch]])
  const renamed = patch.name && patch.name !== source.name ? patch.name : null
  if (renamed) {
    const custom = customFile()
    const guideline = readGuidelines(read(custom)).get(source.name)
    if (guideline) fs.writeFileSync(custom, upsertGuideline(upsertGuideline(read(custom), source.name, ''), renamed, guideline))
    const index = readBoardIndex()
    if (Object.values(index).includes(source.name)) {
      writeJson(dataFile('careerloom-web-boards.json'), Object.fromEntries(Object.entries(index).map(([u, n]) => [u, n === source.name ? renamed : n])))
    }
  }
  const next = readAllSources(portalsFile()).find(s => s.list === source.list && s.name === (renamed ?? source.name))!
  return portalDetail(next, readGuidelines(read(customFile())).get(next.name) ?? null)
}

export function setPortalsEnabled(ids: string[], enabled: boolean): number {
  const chosen = readAllSources(portalsFile()).filter(s => ids.includes(s.id))
  updateSources(portalsFile(), chosen.map(s => [s, { enabled }]))
  return chosen.length
}
