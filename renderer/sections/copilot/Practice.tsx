import { Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Group, Row } from '@/components/copilot/Group'
import { QuestionList } from '@/components/copilot/QuestionList'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import type { PracticeQuestion } from '@/lib/types'
import { orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { setPracticePick, useSelection } from '@/components/copilot/selection'
import { startPractice } from '@/components/copilot/startActions'
import { Page } from '../resume/PageStub'

/** Own questions are listed after the report's; ids carry `own-` so the list can label them (main derives its own ids for them). */
const ownQuestion = (text: string, n: number): PracticeQuestion => ({ id: `own-${n}`, text, type: 'other', source: 'custom', lastScore: null })

export function PracticePage() {
  const { jobId } = useSelection()
  const { config, save } = useCopilotConfig()
  const list = useAsync(async () => (jobId ? orNull(await careerloom.copilotPracticeQuestions(jobId)) ?? [] : []), [jobId])
  const company = useAsync(async () => (jobId ? (await careerloom.copilotReadiness(jobId)).context : null), [jobId]).data
  const [off, setOff] = useState<Set<string>>(new Set())
  const [own, setOwn] = useState<string[]>([])
  const listed = list.data ?? []
  const picked = useMemo(() => new Set([...listed.filter(q => !off.has(q.id)).map(q => q.id)]), [listed, off])
  const questions = useMemo(() => [...listed, ...own.map(ownQuestion)], [listed, own])
  const shown = useMemo(() => new Set([...picked, ...own.map((_, i) => `own-${i}`).filter(id => !off.has(id))]), [picked, own, off])

  useEffect(() => { setOff(new Set()); setOwn([]) }, [jobId])
  useEffect(() => {
    setPracticePick({ ids: listed.filter(q => picked.has(q.id)).map(q => q.id), custom: own.filter((_, i) => !off.has(`own-${i}`)) })
  }, [listed, picked, own, off])

  const count = shown.size
  return (
    <Page title="Practice" blurb="A mock interviewer asks questions from this job's report. Nothing is sent to a call, and the overlay shows a Practice chip.">
      {!jobId ? <Group><p className="m-0 text-sm text-muted-foreground">Pick a job on Setup to see its questions.</p></Group> : (
        <QuestionList company={company?.company ?? 'this job'} questions={questions} picked={shown}
          onPick={(id, on) => setOff(prev => { const n = new Set(prev); if (on) n.delete(id); else n.add(id); return n })}
          onAdd={t => setOwn(prev => [...prev, t])} />
      )}
      {config && (
        <Group>
          <Row label="Follow-up questions" hint="The mock interviewer asks one follow-up based on your answer.">
            <ToggleSwitch aria-label="Follow-up questions" checked={config.practice.followups} onCheckedChange={v => void save({ practice: { followups: v } })} />
          </Row>
          <Row label="Read questions aloud" hint="Uses your system voice. Headphones recommended.">
            <ToggleSwitch aria-label="Read questions aloud" checked={config.practice.readAloud} onCheckedChange={v => void save({ practice: { readAloud: v } })} />
          </Row>
          <Row label="Time per answer" hint="A soft timer in the overlay. It never cuts you off." htmlFor="answer-minutes">
            <Slider id="answer-minutes" aria-label="Time per answer" className="w-48" min={1} max={5} step={1} value={[Math.min(5, config.practice.answerMinutes)]} onValueChange={([v]) => { if (v) void save({ practice: { answerMinutes: v } }) }} />
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{config.practice.answerMinutes} min</span>
          </Row>
        </Group>
      )}
      <div><Button disabled={!jobId || count === 0} onClick={() => { void startPractice() }}><Play className="size-3.5" aria-hidden />Start practice ({count} {count === 1 ? 'question' : 'questions'})</Button></div>
    </Page>
  )
}
