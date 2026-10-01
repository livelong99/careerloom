import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { errorText, isNotImplemented, mergeConfig, useAsync } from '@/components/copilot/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { SegTabs } from '@/components/SegTabs'
import { careerloom } from '@/lib/ipc'
import { goToSettings, openRuns } from '@/lib/nav'
import { isMacPlatform } from '@/lib/platform'
import { showToast } from '@/lib/toast'
import type { DeepPartial, InterviewConfig, ResearchSourceGroup, SearchBackendId, VoiceInfo } from '@/lib/types'
import { DEFAULT_INTERVIEW_CONFIG } from '../../../../electron/kb/defaults'
import { Group, Note, Row } from '../../kit/Group'
import { ConfirmDialog } from '../kit'
import { MODEL_ID } from '../ModelField'

type Patch = DeepPartial<InterviewConfig>

/** interview.json: `save` applies the patch at once and reverts (with a toast) if main refuses it. Main returns the clamped result. */
function useInterviewConfig() {
  const [config, setConfig] = useState<InterviewConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<InterviewConfig | null>(null)
  ref.current = config
  useEffect(() => {
    let live = true
    careerloom.interviewConfig().then(c => { if (live) setConfig(c) }, e => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [])
  const save = useCallback(async (patch: Patch): Promise<InterviewConfig | null> => {
    const before = ref.current
    if (before) setConfig(mergeConfig(before, patch))
    try { const next = await careerloom.interviewSetConfig(patch); setConfig(next); return next } catch (e) { setConfig(before); showToast(errorText(e), 'error'); return null }
  }, [])
  return { config, save, error }
}

const PROVIDERS: ReadonlyArray<{ id: SearchBackendId; label: string }> = [{ id: 'brave', label: 'Brave Search' }, { id: 'exa', label: 'Exa' }, { id: 'serper', label: 'Serper' }, { id: 'searxng', label: 'SearXNG (your own server)' }]
const SOURCES: ReadonlyArray<{ id: ResearchSourceGroup; title: string; hint: string }> = [
  { id: 'stackexchange', title: 'Stack Exchange', hint: 'API · CC BY-SA · author credited' },
  { id: 'github', title: 'GitHub question lists', hint: 'Licence checked per repo' },
  { id: 'taxonomy', title: 'O*NET, Wikidata, Wikipedia', hint: 'Skills and role data · credited' },
  { id: 'hn', title: 'Hacker News threads', hint: 'Questions and short notes only' },
  { id: 'companyPages', title: 'Company blogs and careers pages', hint: 'robots.txt respected · link plus summary' },
  { id: 'articles', title: 'Interview-prep articles', hint: 'Question and a short note only' },
]
const REFRESH_DAYS = [7, 14, 30, 60, 90, 180]
const RETENTION_DAYS = [30, 90, 180, 365]
const money = (n: number) => n.toFixed(2)

/** Draft text that commits on blur or Enter, reverts on Esc, and flags (does not save) an invalid value. `parse` returns the value to save, or undefined when invalid. */
function Draft({ label, value, parse, onCommit, className, ...rest }: { label: string; value: string; parse: (text: string) => unknown | undefined; onCommit: (v: unknown) => void; className?: string } & Pick<React.ComponentProps<typeof Input>, 'placeholder' | 'inputMode' | 'maxLength'>) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  useEffect(() => { setText(value); setBad(false) }, [value])
  const commit = () => {
    const next = parse(text.trim())
    if (next === undefined) return setBad(true)
    setBad(false)
    if (text.trim() !== value) onCommit(next)
  }
  return <Input aria-label={label} aria-invalid={bad || undefined} className={className} value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(value); setBad(false) } }} {...rest} />
}

const num = (min: number, max: number) => (t: string) => { const n = Number(t); return t !== '' && Number.isFinite(n) && n >= min && n <= max ? n : undefined }
const daysSelect = (label: string, value: string, onChange: (v: string) => void, options: ReactNode) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={label} className="w-52"><SelectValue /></SelectTrigger>
    <SelectContent>{options}</SelectContent>
  </Select>
)

function ResearchGroup({ c, save }: { c: InterviewConfig; save: (p: Patch) => void }) {
  const r = c.research
  return (
    <Group title="Research" focus="interview:research">
      <Row label="Model for reading pages" htmlFor="interview-model" hint="A small, cheap model does the extracting. Leave blank for the built-in helper model.">
        <Draft label="Model for reading pages" value={r.model ?? ''} placeholder="Built-in helper model" className="h-8 w-60" maxLength={100} parse={t => (t === '' ? null : MODEL_ID.test(t) ? t : undefined)} onCommit={v => save({ research: { model: v as string | null } })} />
      </Row>
      <Row label="Depth" hint="Quick reads fewer pages; Deep adds company and interviewer-style notes.">
        <SegTabs options={[{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }, { value: 'deep', label: 'Deep' }]} value={r.depth} onChange={v => save({ research: { depth: v as InterviewConfig['research']['depth'] } })} />
      </Row>
      <Row label="Limit per job" hint="Research stops and keeps what it found. You can continue for more.">
        <span aria-hidden className="text-xs text-muted-foreground">$</span>
        <Draft label="Cost limit in dollars" value={money(r.budgetUsd)} inputMode="decimal" className="h-8 w-20" parse={num(0.05, 2)} onCommit={v => save({ research: { budgetUsd: v as number } })} />
        <Draft label="Time limit in minutes" value={String(r.minutes)} inputMode="numeric" className="h-8 w-16" parse={num(1, 20)} onCommit={v => save({ research: { minutes: v as number } })} />
        <span aria-hidden className="text-xs text-muted-foreground">min</span>
      </Row>
      <Row label="Allow an extra agent pass" hint={<>If coverage is low, one more round of up to 5 searches. Costs more. <Badge variant="warn">Off by default</Badge></>}>
        <ToggleSwitch aria-label="Extra agent pass" checked={r.allowAgent} onCheckedChange={v => save({ research: { allowAgent: v } })} />
      </Row>
    </Group>
  )
}

function SearchGroup({ c, save, keyTail }: { c: InterviewConfig; save: (p: Patch) => void; keyTail: { has: boolean; tail: string | null } | null }) {
  const s = c.research.search
  const needsKey = s.backend !== 'searxng'
  const label = PROVIDERS.find(p => p.id === s.backend)!.label
  const [switched, setSwitched] = useState(false)
  const change = (v: SearchBackendId) => { setSwitched(c.research.consentVersion !== null && v !== s.backend); save({ research: { search: { backend: v } } }) }
  return (
    <Group title="Search and sources" focus="interview:search">
      <Row label="Search provider" htmlFor="interview-provider" hint={needsKey
        ? <>{label} · {keyTail?.has ? <>key in your keychain, last four {keyTail.tail}. </> : 'no key saved. '}<button type="button" className="text-brand-text underline-offset-2 hover:underline" onClick={() => goToSettings('keys', `key:${s.backend}`)}>Manage in API keys</button></>
        : 'Your own SearXNG server. Nothing leaves your network unless it does.'}>
        <Select value={s.backend} onValueChange={v => change(v as SearchBackendId)}>
          <SelectTrigger id="interview-provider" aria-label="Search provider" className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        {needsKey && (keyTail?.has ? <Badge variant="success">Key set</Badge> : <Badge variant="warn">No key</Badge>)}
      </Row>
      {!needsKey && (
        <Row label="SearXNG address" htmlFor="interview-searxng" hint="https, or http on this computer only (localhost). No password or query in the address.">
          <Draft label="SearXNG address" value={s.searxngUrl ?? ''} placeholder="http://localhost:8080" className="h-8 w-60" maxLength={200} parse={t => (t === '' ? null : /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(t) && !/[?#@]/.test(t) ? t : undefined)} onCommit={v => save({ research: { search: { searxngUrl: v as string | null } } })} />
        </Row>
      )}
      <Row label="Without a key" hint="Uses a local search container and pages you paste. Fewer results, and some searches may be blocked." />
      <Row label="Pages are read with" hint="Plain fetch first, then your browser engine, then Firecrawl."><Badge variant="neutral">Automatic</Badge></Row>
      <Note>{switched ? `Switched to ${label}. We’ll ask you again before the next run, because a different provider sees your job queries.` : c.research.consentVersion ? `You agreed to send job queries to ${label}. Changing the provider asks you again.` : `Nothing is sent until you agree, once per provider, before the first run.`}</Note>
      <Sources c={c} save={save} />
    </Group>
  )
}

function Sources({ c, save }: { c: InterviewConfig; save: (p: Patch) => void }) {
  const box = 'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm'
  return (
    <div data-setting-id="interview:sources" className="border-t border-border pt-3">
      <h4 className="m-0 mb-2 text-sm font-semibold">Allowed sources</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {SOURCES.map(g => (
          <label key={g.id} className={box}>
            <Checkbox className="mt-0.5" aria-label={g.title} checked={c.research.sources[g.id]} onCheckedChange={v => save({ research: { sources: { [g.id]: v === true } } })} />
            <span><b className="font-medium">{g.title}</b><br /><span className="text-xs text-muted-foreground">{g.hint}</span></span>
          </label>
        ))}
        {/* never-fetch hosts are a code constant (kb/sources.ts), not a setting: this box is display only */}
        <label className={`${box} cursor-not-allowed opacity-60`}>
          <Checkbox className="mt-0.5" aria-label="Glassdoor, LeetCode, Reddit, Blind, LinkedIn" checked={false} disabled />
          <span><b className="font-medium">Glassdoor, LeetCode, Reddit, Blind, LinkedIn</b><br /><span className="text-xs text-muted-foreground">Never read automatically. Search links open in your browser.</span></span>
        </label>
      </div>
    </div>
  )
}

function VoiceGroup({ c, save }: { c: InterviewConfig; save: (p: Patch) => void }) {
  const voices = useAsync<VoiceInfo[] | null>(async () => { const v = await careerloom.interviewVoices(); return isNotImplemented(v) ? null : v }, [])
  const [speed, setSpeed] = useState(c.voice.speed)
  useEffect(() => setSpeed(c.voice.speed), [c.voice.speed])
  const list = (voices.data ?? []).filter(v => v.installed)
  const current = c.voice.voiceId ? `${c.voice.engine}:${c.voice.voiceId}` : 'default'
  const pick = (v: string) => { const [engine, ...id] = v.split(':'); save({ voice: v === 'default' ? { engine: 'system', voiceId: null } : { engine: engine as InterviewConfig['voice']['engine'], voiceId: id.join(':') } }) }
  const sel = list.find(v => `${v.engine}:${v.id}` === current)
  return (
    <Group title="Interviewer voice" focus="interview:voice">
      <Row label="Voice" htmlFor="interview-voice" hint={voices.data === null && !voices.loading && !voices.error ? 'Voices appear here once the interviewer is installed in this build. The system default is used until then.' : voices.error ? `Could not list voices: ${voices.error}` : 'Installed Indian English voices on this Mac work offline.'}>
        <Select value={current} onValueChange={pick}>
          <SelectTrigger id="interview-voice" aria-label="Voice" className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">This Mac · system default</SelectItem>
            {list.map(v => <SelectItem key={`${v.engine}:${v.id}`} value={`${v.engine}:${v.id}`}>{v.engine === 'system' ? 'This Mac' : v.engine === 'kokoro' ? 'Kokoro' : 'Cloud'} · {v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => void Promise.resolve(careerloom.interviewPreviewVoice(sel?.engine ?? 'system', sel?.id ?? c.voice.voiceId ?? '', speed)).catch(e => showToast(errorText(e), 'error'))}>Preview</Button>
      </Row>
      <Row label="Natural voice on this Mac" hint="Kokoro, about 80 MB, installed from Local models. British and American voices.">
        <Button size="sm" variant="outline" onClick={() => goToSettings('local-models')}>Install in Local models</Button>
      </Row>
      <Row label="Premium cloud voice" hint="Lower delay and Indian English voices. Needs a key."><Badge variant="neutral">Coming later</Badge></Row>
      <Row label="Speed" htmlFor="interview-speed">
        <Slider id="interview-speed" aria-label="Speed" className="w-44" min={70} max={130} step={5} value={[Math.round(speed * 100)]} onValueChange={([v]) => setSpeed((v ?? 100) / 100)} onValueCommit={([v]) => save({ voice: { speed: (v ?? 100) / 100 } })} />
        <span className="w-10 text-right font-mono text-xs text-muted-foreground">{speed.toFixed(2).replace(/0$/, '')}×</span>
      </Row>
      <Row label="Speakers or headphones" hint="Speakers pause your mic while the interviewer talks. Headphones let you interrupt.">
        <SegTabs options={[{ value: 'speakers', label: 'Speakers' }, { value: 'headphones', label: 'Headphones' }]} value={c.voice.echo} onChange={v => save({ voice: { echo: v as 'speakers' | 'headphones' } })} />
      </Row>
    </Group>
  )
}

function BasesGroup({ c, save }: { c: InterviewConfig; save: (p: Patch) => void }) {
  return (
    <Group title="Question bases" focus="interview:bases">
      <Row label="Use my question base in live sessions" hint="Gives the live coach the questions your job’s base expects, as context only. Nothing in it is ever claimed as your experience. Does nothing for jobs without a base.">
        <ToggleSwitch aria-label="Use my question base in live sessions" checked={c.kb.useInLive} onCheckedChange={v => save({ kb: { useInLive: v } })} />
      </Row>
      <Row label="Suggest a refresh after" htmlFor="interview-refresh" hint="Never runs by itself. You’ll see a banner and decide.">
        {daysSelect('Suggest a refresh after', String(c.research.refreshAfterDays), v => save({ research: { refreshAfterDays: Number(v) } }), (REFRESH_DAYS.includes(c.research.refreshAfterDays) ? REFRESH_DAYS : [...REFRESH_DAYS, c.research.refreshAfterDays].sort((a, b) => a - b)).map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>))}
      </Row>
      <Row label="Keep question bases for" htmlFor="interview-retention" hint="Your own questions and notes are kept until you delete them.">
        {daysSelect('Keep question bases for', c.kb.retentionDays === null ? 'forever' : String(c.kb.retentionDays), v => save({ kb: { retentionDays: v === 'forever' ? null : Number(v) } }), <>
          <SelectItem value="forever">Until I delete them</SelectItem>
          {(c.kb.retentionDays !== null && !RETENTION_DAYS.includes(c.kb.retentionDays) ? [...RETENTION_DAYS, c.kb.retentionDays].sort((a, b) => a - b) : RETENTION_DAYS).map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}
        </>)}
      </Row>
    </Group>
  )
}

export function InterviewPrepPage() {
  const { config, save, error } = useInterviewConfig()
  const keys = useAsync(() => careerloom.keysList(), [])
  const [resetting, setResetting] = useState(false)
  const mac = isMacPlatform()
  const apply = useCallback((p: Patch) => { void save(p) }, [save])
  if (error) return <Note tone="warn">Interview prep settings are not available yet: {error}</Note>
  if (!config) return <p className="m-0 text-xs text-muted-foreground">Loading…</p>
  const k = keys.data?.find(x => x.id === config.research.search.backend)
  return (
    <>
      <ResearchGroup c={config} save={apply} />
      <SearchGroup c={config} save={apply} keyTail={keys.data ? { has: k?.hasKey ?? false, tail: k?.tail ?? null } : null} />
      {mac ? <VoiceGroup c={config} save={apply} /> : <Group title="Interviewer voice" focus="interview:voice"><Note>The spoken interviewer is available on macOS only for now. Practice questions still work as text.</Note></Group>}
      <BasesGroup c={config} save={apply} />
      <Note>Research runs show up in <button type="button" className="text-brand-text underline-offset-2 hover:underline" onClick={() => openRuns()}>Runs</button> as “Job research”, with their log and cost.</Note>
      <div><Button size="sm" variant="outline" onClick={() => setResetting(true)}>Reset to defaults…</Button></div>
      <ConfirmDialog open={resetting} onOpenChange={setResetting} title="Reset Interview prep settings?" description="Research limits, search provider, sources, voice and refresh settings go back to their defaults, and search consent is asked again. API keys and existing question bases are not touched." confirmLabel="Reset"
        onConfirm={async () => { setResetting(false); if (await save(DEFAULT_INTERVIEW_CONFIG)) showToast('Interview prep settings reset') }} />
    </>
  )
}
