import { Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Group, Note, Row } from '@/components/copilot/Group'
import { InterviewLive } from '@/components/copilot/InterviewLive'
import { JobPicker } from '@/components/copilot/JobPicker'
import { FocusSkills } from '@/components/copilot/FocusSkills'
import { rangeClass, Pills, selectClass } from '@/components/copilot/hwControls'
import { MINUTES, SENIORITIES, STYLES, getInterviewForm, setInterviewForm, toPlan, useInterviewForm } from '@/components/copilot/interviewForm'
import { ModePicker } from '@/components/copilot/ModePicker'
import { QuestionList } from '@/components/copilot/QuestionList'
import { SessionSummary } from '@/components/copilot/SessionSummary'
import { VoicePicker } from '@/components/copilot/VoicePicker'
import { Button } from '@/components/ui/button'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import { openJob } from '@/lib/jobNav'
import type { InterviewPlan, KbSummary, PlanPreview, PracticeQuestion, VoiceInfo } from '@/lib/types'
import { errorText, orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { setPracticePick, useSelection } from '@/components/copilot/selection'
import { startPractice } from '@/components/copilot/startActions'
import { takeKbPracticeSeed } from '@/components/kb/practice'
import { Page } from '../resume/PageStub'

/** Own questions are listed after the report's; ids carry `own-` so the list can label them (main derives its own ids for them). */
const ownQuestion = (text: string, n: number): PracticeQuestion => ({ id: `own-${n}`, text, type: 'other', source: 'custom', lastScore: null })

/** null when the question base is not available (not built, none yet, or the call fails): practice then uses the report questions. */
const loadKb = async (jobId: string): Promise<KbSummary | null> => { try { return orNull(await careerloom.kbSummary(jobId)) } catch { return null } }
const loadVoices = async (): Promise<VoiceInfo[]> => { try { return orNull(await careerloom.interviewVoices()) ?? [] } catch { return [] } }

export function PracticePage() {
  const { jobId } = useSelection()
  const kb = useAsync(() => (jobId ? loadKb(jobId) : Promise.resolve(null)), [jobId]).data
  const ready = kb !== null && kb !== undefined && kb.items > 0
  const [source, setSource] = useState<'ai' | 'report'>('ai')
  const ai = ready && source === 'ai'
  useEffect(() => { setInterviewForm({ enabledFor: ai ? jobId : null }) }, [ai, jobId])
  useEffect(() => { setInterviewForm({ itemIds: null }) }, [jobId])
  useEffect(() => { const s = takeKbPracticeSeed(); if (s) { setSource('ai'); setInterviewForm({ itemIds: s.itemIds }) } }, []) // 'Practise this job' / 'this question' from the KB tab
  useEffect(() => () => setInterviewForm({ enabledFor: null }), [])

  const note = ready ? (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <Note>{kb.items} questions · {kb.sourcedPct}% sourced · the rest are generated and labelled so.</Note>
      <div className="flex items-center gap-2">
        <Pills label="Question source" value={source} options={[{ value: 'ai', label: 'AI interviewer' }, { value: 'report', label: 'Report questions' }]} onChange={setSource} />
        {jobId && <Button size="sm" variant="outline" onClick={() => openJob(jobId, 'kb')}>Open knowledge base</Button>}
      </div>
    </div>
  ) : jobId ? (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <Note>This job has no question base yet. Research it for web-sourced questions, or practise with the questions from its report.</Note>
      <Button size="sm" variant="outline" onClick={() => openJob(jobId, 'kb')}>Research this job</Button>
    </div>
  ) : null

  return (
    <Page title="Practice" blurb={ai ? "An AI interviewer asks questions from this job's question base. Cues and suggested answers work exactly as they do in a live session." : "A mock interviewer asks questions from this job's report. Nothing is sent to a call, and the overlay shows a Practice chip."}>
      <InterviewLive />
      <JobPicker summary={note} />
      {!jobId ? null : ai ? <AiPractice jobId={jobId} kb={kb!} /> : <ReportPractice jobId={jobId} />}
    </Page>
  )
}

function AiPractice({ jobId, kb }: { jobId: string; kb: KbSummary }) {
  const f = useInterviewForm()
  const voices = useAsync(loadVoices, []).data ?? []
  const plan = useMemo<InterviewPlan>(() => toPlan(f, voices), [f, voices])
  const skills = useMemo(() => kb.coverage.map(c => ({ id: c.skillId, name: c.name, gap: !c.inCv })), [kb])
  const [preview, setPreview] = useState<{ value: PlanPreview | null; error: string | null; loading: boolean }>({ value: null, error: null, loading: true })
  const key = JSON.stringify(plan)
  useEffect(() => {
    let live = true
    setPreview(p => ({ ...p, loading: true }))
    const t = setTimeout(() => {
      careerloom.interviewPlanPreview(jobId, plan).then(
        r => { if (live) setPreview({ value: orNull(r), error: null, loading: false }) },
        e => { if (live) setPreview({ value: null, error: errorText(e), loading: false }) },
      )
    }, 200)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, key])

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="grid gap-4">
        <Group title="Interview">
          {f.itemIds?.length ? <div className="mb-3 flex items-center justify-between gap-2"><Note>Practising {f.itemIds.length === 1 ? 'one chosen question' : `${f.itemIds.length} chosen questions`}.</Note><Button size="sm" variant="outline" onClick={() => setInterviewForm({ itemIds: null })}>Use the whole base</Button></div> : null}
          <ModePicker value={f.mode} onChange={mode => setInterviewForm({ mode })} />
          <div className="mt-4">
            <Row label="Length" hint="The interviewer paces questions to fit. It never cuts you off.">
              <Pills label="Length" value={f.minutes === null ? 'none' : String(f.minutes)} options={MINUTES} onChange={v => setInterviewForm({ minutes: v === 'none' ? null : Number(v) })} />
            </Row>
            <Row label="Focus skills" hint="Dashed chips are gaps from your evaluation. Chosen skills are practised first." stack>
              <FocusSkills skills={skills} value={f.focusSkills} onChange={focusSkills => setInterviewForm({ focusSkills })} />
            </Row>
            <Row label="Difficulty" hint="Adaptive steps up after two strong answers and down after two weak ones.">
              <Pills label="Difficulty" value={f.difficulty} options={[{ value: 'adaptive', label: 'Adaptive' }, { value: 'easier', label: 'Easier' }, { value: 'match', label: 'Match the job' }, { value: 'harder', label: 'Harder' }]} onChange={difficulty => setInterviewForm({ difficulty })} />
            </Row>
            <Row label="Include generated questions" hint="Off keeps the session to questions with a source.">
              <ToggleSwitch aria-label="Include generated questions" checked={f.includeGenerated} onCheckedChange={includeGenerated => setInterviewForm({ includeGenerated })} />
            </Row>
          </div>
        </Group>
        <Group title="Interviewer">
          <Row label="Style" htmlFor="iv-style">
            <select id="iv-style" className={selectClass} value={f.style} onChange={e => setInterviewForm({ style: e.target.value })}>{STYLES.map(s => <option key={s}>{s}</option>)}</select>
          </Row>
          <Row label="Seniority" htmlFor="iv-seniority">
            <select id="iv-seniority" className={selectClass} value={f.seniority} onChange={e => setInterviewForm({ seniority: e.target.value })}>{SENIORITIES.map(s => <option key={s}>{s}</option>)}</select>
          </Row>
          <Row label="Strictness" hint="How hard they probe vague answers." htmlFor="iv-strict">
            <input id="iv-strict" type="range" className={rangeClass} min={1} max={5} step={1} value={f.strictness} onChange={e => setInterviewForm({ strictness: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })} />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{f.strictness} of 5</span>
          </Row>
          <Row label="Voice" stack>
            <VoicePicker voices={voices} value={f.voiceId} onChange={voiceId => setInterviewForm({ voiceId })} onPreview={v => { void Promise.resolve(careerloom.interviewPreviewVoice(v.engine, v.id, f.speed)).catch(() => undefined) }} />
          </Row>
          {voices.length > 0 && (
            <>
              <Row label="Speed" htmlFor="iv-speed">
                <input id="iv-speed" type="range" className={rangeClass} min={0.7} max={1.3} step={0.05} value={f.speed} onChange={e => setInterviewForm({ speed: Number(e.target.value) })} />
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{f.speed.toFixed(2)}×</span>
              </Row>
              <Row label="Audio" hint={f.echo === 'speakers' ? 'The mic pauses while the interviewer speaks, so it does not hear itself.' : 'With headphones you can interrupt the interviewer by speaking.'}>
                <Pills label="Audio output" value={f.echo} options={[{ value: 'speakers', label: 'Speakers' }, { value: 'headphones', label: 'Headphones' }]} onChange={echo => setInterviewForm({ echo })} />
              </Row>
            </>
          )}
        </Group>
        <div><Button disabled={preview.value?.questions === 0} onClick={() => { void startPractice() }}><Play className="size-3.5" aria-hidden />Start practice{preview.value ? ` · ${preview.value.questions} questions` : ''}</Button></div>
      </div>
      <SessionSummary preview={preview.value} error={preview.error} loading={preview.loading} />
    </div>
  )
}

/** Today's behaviour: the report's questions, picked by hand. Also the fallback when a job has no question base. */
function ReportPractice({ jobId }: { jobId: string }) {
  const { config, save } = useCopilotConfig()
  const list = useAsync(async () => orNull(await careerloom.copilotPracticeQuestions(jobId)) ?? [], [jobId])
  const company = useAsync(async () => (await careerloom.copilotReadiness(jobId)).context, [jobId]).data
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
    <>
      <QuestionList company={company?.company ?? 'this job'} questions={questions} picked={shown}
        onPick={(id, on) => setOff(prev => { const n = new Set(prev); if (on) n.delete(id); else n.add(id); return n })}
        onAdd={t => setOwn(prev => [...prev, t])} />
      {config && (
        <Group>
          <Row label="Follow-up questions" hint="The mock interviewer asks one follow-up based on your answer.">
            <ToggleSwitch aria-label="Follow-up questions" checked={config.practice.followups} onCheckedChange={v => void save({ practice: { followups: v } })} />
          </Row>
          <Row label="Read questions aloud" hint="Uses your system voice. Headphones recommended.">
            <ToggleSwitch aria-label="Read questions aloud" checked={config.practice.readAloud} onCheckedChange={v => void save({ practice: { readAloud: v } })} />
          </Row>
          <Row label="Time per answer" hint="A soft timer in the overlay. It never cuts you off." htmlFor="answer-minutes">
            <input id="answer-minutes" type="range" aria-label="Time per answer" className={rangeClass} min={1} max={5} step={1} value={Math.min(5, config.practice.answerMinutes)} onChange={e => { void save({ practice: { answerMinutes: Number(e.target.value) } }) }} />
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{config.practice.answerMinutes} min</span>
          </Row>
        </Group>
      )}
      <div><Button disabled={count === 0} onClick={() => { void startPractice() }}><Play className="size-3.5" aria-hidden />Start practice ({count} {count === 1 ? 'question' : 'questions'})</Button></div>
    </>
  )
}
