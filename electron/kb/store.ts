// WP1 owns this file. Per-job folder of JSON under userData/kb (plan §5): atomic writes, per-job mutex, merge-by-id.
import { todo } from './todo'
import type { KbItem, KbManifest, KbNotes, SkillNode, SourceRef } from './types'

export type KbData = { manifest: KbManifest | null; items: KbItem[]; sources: SourceRef[]; skills: SkillNode[]; notes: KbNotes }
export interface KbStore {
  read(jobId: string): KbData
  /** Merges by `item.id`, preserving `user.*` and `stats.*`; atomic. */
  commit(jobId: string, data: Partial<KbData>): KbData
  updateItem(jobId: string, itemId: string, patch: (item: KbItem) => KbItem): KbItem
  remove(jobId: string): void
}
export const openKbStore = (_dir: () => string): KbStore => todo('WP1')
