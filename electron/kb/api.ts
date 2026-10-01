// KbApi store methods (plan §4): validation at the boundary, the store for everything else. Electron-free; handlers.ts supplies the env.
import { exportKb, importKb } from './import-export'
import { makeItem } from './research/item'
import { parseItem } from './schema-guard'
import type { KbStore } from './store'
import type { Difficulty, KbApi, KbFilter, KbItem, KbQuestionType, ResearchProgress } from './types'
import { itemDetail, itemView, listItems, summarise } from './views'

export type KbApiEnv = {
  store(): KbStore
  research(): { running(jobId: string): string | null; progress(jobId: string): ResearchProgress | null; inputHash(jobId: string): string | null }
  refreshAfterDays(): number
  exportDir(): string
  changed(jobId: string): void
  now?: () => number
}
type Methods = 'kbSummary' | 'kbList' | 'kbItem' | 'kbItemUpdate' | 'kbItemAdd' | 'kbItemRemove' | 'kbExport' | 'kbImport'

const jobArg = (v: unknown): string => { if (typeof v !== 'string' || v.trim() === '' || v.length > 2000) throw new Error('That job id is not valid.'); return v }
const idArg = (v: unknown): string => { if (typeof v !== 'string' || v === '') throw new Error('That item id is not valid.'); return v }
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

export function createKbApi(env: KbApiEnv): Pick<KbApi, Methods> {
  const touch = <T>(jobId: string, v: T): T => { env.changed(jobId); return v }
  return {
    kbSummary(jobId) {
      const id = jobArg(jobId)
      const r = env.research()
      return summarise(id, env.store().read(id), { runId: r.running(id), progress: r.progress(id), inputHash: r.inputHash(id), now: (env.now ?? Date.now)(), refreshAfterDays: env.refreshAfterDays() })
    },
    kbList: (jobId, filter?: KbFilter) => { const id = jobArg(jobId); return listItems(env.store().read(id), rec(filter) as KbFilter) },
    kbItem(jobId, itemId_) {
      const id = jobArg(jobId); const data = env.store().read(id)
      const item = data.items.find(i => i.id === idArg(itemId_))
      if (!item) throw new Error('That question is no longer in the knowledge base.')
      return itemDetail(item, data)
    },
    kbItemUpdate(jobId, itemId_, patch) {
      const id = jobArg(jobId); const p = rec(patch)
      const next = env.store().updateItem(id, idArg(itemId_), old => {
        const content = ['text', 'type', 'skills', 'difficulty'].some(k => k in p)
        const user = { ...old.user, ...(typeof p.pinned === 'boolean' ? { pinned: p.pinned } : {}), ...(typeof p.hidden === 'boolean' ? { hidden: p.hidden } : {}), ...('notes' in p ? { notes: typeof p.notes === 'string' ? p.notes : null } : {}), ...(content ? { edited: true } : {}) }
        const merged = parseItem({ ...old, ...(content ? { text: p.text ?? old.text, type: p.type ?? old.type, skills: p.skills ?? old.skills, difficulty: p.difficulty ?? old.difficulty } : {}), user })
        if (!merged) throw new Error('A question needs some text.')
        return { ...merged, id: old.id }
      })
      return touch(id, itemView(next, env.store().read(id)))
    },
    kbItemAdd(jobId, item) {
      const id = jobArg(jobId); const i = rec(item)
      const made = parseItem({ ...makeItem({ text: String(i.text ?? ''), type: i.type as KbQuestionType, skills: Array.isArray(i.skills) ? (i.skills as string[]) : [], difficulty: i.difficulty as Difficulty, provenance: 'user' }), user: { pinned: false, hidden: false, edited: false, notes: null } })
      if (!made) throw new Error('A question needs some text.')
      const store = env.store()
      if (store.read(id).items.some(x => x.id === made.id)) throw new Error('That question is already in the knowledge base.')
      store.commit(id, { items: [made] })
      return touch(id, itemView(made, store.read(id)))
    },
    kbItemRemove(jobId, itemId_) {
      const id = jobArg(jobId); const store = env.store()
      const item = store.read(id).items.find((x: KbItem) => x.id === idArg(itemId_))
      if (!item) throw new Error('That question is no longer in the knowledge base.')
      if (item.provenance === 'user') store.removeItem(id, item.id)
      else store.updateItem(id, item.id, o => ({ ...o, user: { ...o.user, hidden: true } })) // researched items are hidden, never deleted: a refresh would only bring them back
      touch(id, undefined)
    },
    kbExport: jobId => exportKb(env.store(), jobArg(jobId), env.exportDir()),
    kbImport(jobId, file) {
      const id = jobArg(jobId)
      if (typeof file !== 'string' || file === '') throw new Error('Pick a file to import.')
      return touch(id, importKb(env.store(), id, file))
    },
  }
}
