import { DEFAULT_FILTERS, persistFilters, type JobFilters } from '../jobs/filters'
import { navigate } from '../../lib/nav'
import type { PipelineId } from '../../lib/overviewData'

/** Open Jobs with exactly these filters (Jobs reads the persisted filters when it mounts). */
export function openJobsWith(patch: Partial<JobFilters>): void {
  persistFilters({ ...DEFAULT_FILTERS, ...patch })
  navigate('jobs')
}

const EVALUATED: JobFilters['states'] = ['evaluated', 'applied', 'interview', 'offer']
// The Jobs list has no 'responded' state (tracker Responded rolls into Applied), so it shares that filter.
const STAGE_FILTERS: Record<PipelineId, Partial<JobFilters>> = {
  found: {},
  prescreened: { screen: ['likely', 'uncertain', 'unlikely'] },
  evaluated: { states: EVALUATED },
  applied: { states: ['applied', 'interview', 'offer'] },
  responded: { states: ['applied', 'interview', 'offer'] },
  interview: { states: ['interview'] },
  offer: { states: ['offer'] },
}
export const openStage = (id: PipelineId) => openJobsWith(STAGE_FILTERS[id])

/** Jobs filtered to one score band; the top band is closed at 5. */
export const openScoreBand = (lo: number, hi: number) => openJobsWith({ scoreMin: lo, scoreMax: hi >= 5 ? 5 : hi - 0.01 })
