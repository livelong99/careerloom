import { careerloom } from '@/lib/ipc'
import type { JobListing } from '@/lib/types'
import { usePolled } from '@/hooks/usePolled'

/** Jobs you can rehearse for: evaluated or further along, interviews first, then by fit. */
export const rehearsable = (jobs: JobListing[]): JobListing[] =>
  jobs.filter(j => j.state === 'evaluated' || j.state === 'applied' || j.state === 'interview' || j.state === 'offer')
    .sort((a, b) => Number(b.state === 'interview') - Number(a.state === 'interview') || (b.score ?? 0) - (a.score ?? 0))

export function useJobChoices(): { jobs: JobListing[]; loading: boolean } {
  const polled = usePolled(() => careerloom.listJobs(), [], { intervalMs: 30_000 })
  return { jobs: polled.data ? rehearsable(polled.data) : [], loading: polled.loading && polled.data === null }
}
