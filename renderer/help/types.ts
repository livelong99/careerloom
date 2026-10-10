import type { IconName } from '../components/icons'
import type { Section } from '../components/Sidebar'
import type { PageId } from '../components/settings/pages'

export type GroupId = 'start' | 'find' | 'work' | 'agents' | 'interview' | 'configure' | 'reference'
/** A button that opens the real screen (and a Settings page, when `page` is set). */
export type Go = { label: string; section: Section; page?: PageId }
export type Step = { title: string; body: string }
export type Topic = {
  id: string
  group: GroupId
  title: string
  icon: IconName
  /** One sentence: what this screen is for. */
  summary: string
  /** Situations where the reader should reach for it. */
  when: string[]
  steps: Step[]
  tips?: string[]
  go?: Go[]
  /** Extra words the search should match. */
  keywords?: string
  /** `{mod}` is replaced by the platform's modifier key. */
  keys?: Array<{ k: string; label: string }>
  faq?: Array<{ q: string; a: string }>
}

export const GROUPS: ReadonlyArray<{ id: GroupId; label: string }> = [
  { id: 'start', label: 'Start here' },
  { id: 'find', label: 'Find jobs' },
  { id: 'work', label: 'Work a job' },
  { id: 'agents', label: 'Agents' },
  { id: 'interview', label: 'Interview' },
  { id: 'configure', label: 'Configure' },
  { id: 'reference', label: 'Reference' },
]
