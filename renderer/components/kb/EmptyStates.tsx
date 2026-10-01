import { Play } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { ResearchEstimate } from '../../../electron/kb/types'

const card = 'rounded-lg border border-dashed border-border bg-card px-5 py-10 text-center'
const p = 'mx-auto mb-3.5 mt-0 max-w-[56ch] text-muted-foreground'

type Props = { estimate: ResearchEstimate | null; onResearch: () => void; onAdd: () => void; onKeys: () => void; onNoSearch: () => void }

/** First-run card, or the no-search-key variant (design §6). */
export function EmptyStates({ estimate, onResearch, onAdd, onKeys, onNoSearch }: Props) {
  if (estimate?.needsKey) {
    return (
      <div className={card}>
        <h3 className="m-0 mb-1 text-base font-bold">Web search needs a key</h3>
        <p className={p}>Add a Brave Search key in Settings to get sourced questions. Without one, Careerloom can still read the posting and generate labelled questions from it — expect fewer results.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onKeys}>Add a key in Settings</Button>
          <Button variant="outline" onClick={onNoSearch}>Research without search</Button>
          <Button variant="outline" onClick={onAdd}>Add a question myself</Button>
        </div>
      </div>
    )
  }
  return (
    <div className={card}>
      <h3 className="m-0 mb-1 text-base font-bold">No research for this job yet</h3>
      <p className={p}>
        Careerloom searches the web for the skills in this posting and your gaps, then builds a question bank you can practise from and use in live sessions.
        {estimate && <> Estimated cost <b className="text-foreground">${estimate.usdLow.toFixed(2)}–{estimate.usdHigh.toFixed(2)}</b>, about {estimate.minutes} minutes.</>}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onResearch}><Play aria-hidden />Research this job</Button>
        <Button variant="outline" onClick={onAdd}>Add a question myself</Button>
      </div>
    </div>
  )
}
