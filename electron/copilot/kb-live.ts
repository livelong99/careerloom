// Live-session view of a job's question base (kb plan WP7, §6.1): the stable `## QUESTION BASE` prefix block and the per-question
// top matches. Everything degrades to ''/[] when the setting is off, the store is unbound or the job has no KB.
import { readInterviewConfig } from '../kb/config'
import { kbPrefix, retrieve } from '../kb/retrieve'
import { getKbStore } from '../kb/runtime'
import type { KbMatch } from './prompts'

const TOP = 3
const on = (): boolean => readInterviewConfig().kb.useInLive

export function kbLive(): { block(jobId: string): string; match(jobId: string, question: string): KbMatch[] } {
  return {
    block: jobId => (on() ? kbPrefix(jobId, 700) : ''),
    match(jobId, question) {
      if (!on()) return []
      const store = getKbStore()
      return retrieve(jobId, question, { k: TOP }).map(i => {
        const sourceId = i.sources[0]?.sourceId ?? null
        return { id: i.id, text: i.text, outline: i.idealOutline[0] ?? null, sourceId, source: sourceId ? store.findSource(sourceId)?.title ?? null : null }
      })
    },
  }
}
