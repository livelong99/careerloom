import type { Application, DailyHistoryEntry, SpendFlow } from './types'

// career-ops' canonical states (templates/states.yml), in lifecycle order.
// Aliases cover the non-English values its localized modes write.
export const STAGES = [
  { id: 'evaluated', label: 'Evaluated', aliases: ['evaluada', 'condicional', 'hold', 'evaluar', 'verificar'] },
  { id: 'applied', label: 'Applied', aliases: ['aplicado', 'enviada', 'aplicada', 'sent'] },
  { id: 'responded', label: 'Responded', aliases: ['respondido'] },
  { id: 'interview', label: 'Interview', aliases: ['entrevista'] },
  { id: 'offer', label: 'Offer', aliases: ['oferta'] },
  { id: 'hired', label: 'Hired', aliases: ['contratado', 'contratada', 'accepted', 'accept'] },
  { id: 'rejected', label: 'Rejected', aliases: ['rechazado', 'rechazada'] },
  { id: 'discarded', label: 'Discarded', aliases: ['descartado', 'descartada', 'cerrada', 'cancelada'] },
  { id: 'skip', label: 'Skip', aliases: ['no_aplicar', 'no aplicar', 'monitor', 'geo blocker', 'geo_blocker'] },
] as const
export type StageId = (typeof STAGES)[number]['id'] | 'other'

const BY_NAME = new Map<string, StageId>(
  STAGES.flatMap(s => [[s.id, s.id] as const, ...s.aliases.map(a => [a, s.id] as const)]),
)

export function stageOf(status: string): StageId {
  return BY_NAME.get(status.trim().toLowerCase().replace(/\*/g, '')) ?? 'other'
}

export function stageLabel(id: StageId): string {
  return STAGES.find(s => s.id === id)?.label ?? 'Other'
}

const ACTIVE: ReadonlySet<StageId> = new Set(['applied', 'responded', 'interview', 'offer'])
export const isActive = (a: Application) => ACTIVE.has(stageOf(a.status))

/** Heatmap input: one entry per day that has applications. */
export function dailyCounts(apps: Application[]): DailyHistoryEntry[] {
  const counts = new Map<string, number>()
  for (const a of apps) if (/^\d{4}-\d{2}-\d{2}$/.test(a.date)) counts.set(a.date, (counts.get(a.date) ?? 0) + 1)
  return [...counts].map(([date, n]) => ({
    date, cost: n, calls: n, savingsUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
  }))
}

/** Sankey input: where roles came from (Via, else archetype-less "Direct") → stage. */
export function sourceFlow(apps: Application[]): SpendFlow {
  const links = new Map<string, number>()
  const left = new Map<string, number>()
  const right = new Map<string, number>()
  for (const a of apps) {
    const src = a.via?.trim() || 'Direct'
    const stage = stageLabel(stageOf(a.status))
    links.set(`${src}\u0000${stage}`, (links.get(`${src}\u0000${stage}`) ?? 0) + 1)
    left.set(src, (left.get(src) ?? 0) + 1)
    right.set(stage, (right.get(stage) ?? 0) + 1)
  }
  const nodes = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([id, cost]) => ({ id, label: id, cost }))
  return {
    period: { label: 'All time', start: '', end: '' },
    models: nodes(left),
    projects: nodes(right),
    links: [...links].map(([k, cost]) => { const [model, project] = k.split('\u0000') as [string, string]; return { model, project, cost } }),
  }
}
