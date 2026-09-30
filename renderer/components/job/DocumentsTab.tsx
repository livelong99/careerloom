import { useEffect, useState } from 'react'
import { ChevronDown, Copy, Download, FolderOpen, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { Artifact, DocsOptions, JobView } from '../../lib/types'
import { Markdown } from '../Markdown'
import { Block } from './bits'
import { DocPdf } from './DocPdf'
import { useDocs, type DocState } from './useDocs'

const act = (p: Promise<unknown>) => p.catch(err => showToast(normalizeCliError(err).message, 'error', 6000))
const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) => (
  <div role="group" aria-label={label} className="flex gap-1">
    {options.map(o => <Button key={o} size="sm" variant={value === o ? 'default' : 'outline'} aria-pressed={value === o} className="h-8 text-xs capitalize" onClick={() => onChange(o)}>{o}</Button>)}
  </div>
)

function Files({ a }: { a: Artifact }) {
  const files = [a.files.md, a.files.pdf, a.files.changes, a.files.draft].filter((f): f is string => Boolean(f))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void act(careerloom.docsReveal(a.files.pdf ?? a.files.md))}><FolderOpen className="h-3.5 w-3.5" />Show in folder</Button>
      {files.map(f => <Button key={f} size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => void act(careerloom.docsSave(f).then(p => { if (p) showToast(`Saved ${p.split(/[\\/]/).pop()}`) }))}><Download className="h-3.5 w-3.5" />{f.split('/').pop()}</Button>)}
    </div>
  )
}

const Footer = ({ a }: { a: Artifact }) => (
  <p className="m-0 text-xs text-muted-foreground">
    {a.model ?? 'the configured model'} · {a.tokens.toLocaleString()} tokens{a.humanizeTokens ? ` + ${a.humanizeTokens.toLocaleString()} for the humanizer pass` : ''} · {new Date(a.createdAt).toLocaleString()}
  </p>
)

function Status({ s }: { s: DocState }) {
  if (s.running) return <p role="status" className="m-0 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{s.message}</p>
  return s.error ? <p role="alert" className="m-0 text-sm text-destructive">{s.error}</p> : null
}

function ResumeCard({ a, s, onGenerate }: { a?: Artifact; s: DocState; onGenerate: () => void }) {
  const [changes, setChanges] = useState<string | null>(null)
  useEffect(() => { setChanges(null); if (a?.files.changes) void careerloom.docsReadText(a.files.changes).then(setChanges, () => setChanges(null)) }, [a?.files.changes, a?.createdAt])
  return (
    <Block title="Tailored résumé">
      <p className="m-0 mb-3 text-sm text-muted-foreground">Edits a copy of your résumé for this job. Every number, employer, title and tool is checked against your real résumé first; your master résumé is never changed.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={s.running} onClick={onGenerate}>{s.running ? 'Working…' : a ? 'Regenerate' : 'Tailor my résumé'}</Button>
        <Status s={s} />
      </div>
      {a && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Fact check passed</Badge>
            <span className="text-sm">{a.gate.applied} edit{a.gate.applied === 1 ? '' : 's'} applied{a.gate.rejected ? `, ${a.gate.rejected} rejected by the fact check` : ''}</span>
            {a.gate.notes.map(n => <span key={n} className="text-xs text-muted-foreground">{n}</span>)}
          </div>
          {a.files.pdf && <DocPdf rel={a.files.pdf} stamp={a.createdAt} title="Tailored résumé" />}
          {changes && (
            <Collapsible>
              <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />What changed (before and after)</CollapsibleTrigger>
              <CollapsibleContent className="mt-2"><Markdown source={changes} /></CollapsibleContent>
            </Collapsible>
          )}
          <Files a={a} />
          <Footer a={a} />
        </div>
      )}
    </Block>
  )
}

function CoverCard({ a, s, onGenerate }: { a?: Artifact; s: DocState; onGenerate: (o: DocsOptions) => void }) {
  const [tone, setTone] = useState<'concise' | 'warm' | 'formal'>('warm')
  const [length, setLength] = useState<'short' | 'standard'>('standard')
  const [humanize, setHumanize] = useState(true)
  const [voice, setVoice] = useState('')
  const [text, setText] = useState<string | null>(null)
  useEffect(() => { setText(null); if (a) void careerloom.docsReadText(a.files.md).then(setText, () => setText(null)) }, [a?.files.md, a?.createdAt])
  return (
    <Block title="Cover letter">
      <p className="m-0 mb-3 text-sm text-muted-foreground">Specific to this job, written from your résumé, then checked claim by claim. Skills you lack can only appear as honest interest.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Seg label="Tone" value={tone} options={['concise', 'warm', 'formal'] as const} onChange={setTone} />
        <Seg label="Length" value={length} options={['short', 'standard'] as const} onChange={setLength} />
        <label className="flex items-center gap-2 text-sm"><ToggleSwitch checked={humanize} onCheckedChange={setHumanize} aria-label="Humanize the letter" />Humanize <span className="text-xs text-muted-foreground">(one extra call, about 10k tokens)</span></label>
      </div>
      <Collapsible className="mt-3">
        <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />Voice sample (optional; your voice-dna file is used when there is one)</CollapsibleTrigger>
        <CollapsibleContent className="mt-2"><Textarea rows={4} value={voice} onChange={e => setVoice(e.target.value)} placeholder="Paste a paragraph you wrote, so the letter sounds like you" maxLength={4000} /></CollapsibleContent>
      </Collapsible>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={s.running} onClick={() => onGenerate({ tone, length, humanize, voiceSample: voice || undefined })}>{s.running ? 'Working…' : a ? 'Regenerate' : 'Write the cover letter'}</Button>
        <Status s={s} />
      </div>
      {a && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Fact check passed</Badge>
            <Badge variant={a.humanized ? 'brand' : 'neutral'}>{a.humanized ? 'Humanized' : 'Not humanized'}</Badge>
            {a.gate.tells?.map(t => <Badge key={t} variant="warn" title="Wording that often reads as AI-written">{t}</Badge>)}
            {a.humanized && a.gate.tellsBefore && a.gate.tellsBefore.length > 0 && <span className="text-xs text-muted-foreground">Humanizer removed: {a.gate.tellsBefore.filter(t => !a.gate.tells?.includes(t)).join(', ') || 'nothing flagged'}</span>}
          </div>
          {a.gate.notes.map(n => <p key={n} className="m-0 text-xs text-muted-foreground">{n}</p>)}
          {text && (
            <div className="rounded-md border border-border p-4 text-sm">
              {text.split(/\n{2,}/).map((p, i) => <p key={i} className="m-0 mb-3 last:mb-0">{p}</p>)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {text && <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void navigator.clipboard.writeText(text).then(() => showToast('Copied'), () => showToast('Could not copy', 'error'))}><Copy className="h-3.5 w-3.5" />Copy text</Button>}
          </div>
          {a.files.pdf && <DocPdf rel={a.files.pdf} stamp={a.createdAt} title="Cover letter" />}
          <Files a={a} />
          <Footer a={a} />
        </div>
      )}
    </Block>
  )
}

export function DocumentsTab({ jobId, view }: { jobId: string; view: JobView }) {
  const docs = useDocs(jobId)
  const ready = view.posting !== null
  const by = (k: 'resume' | 'cover') => docs.artifacts.find(a => a.kind === k)
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      {!ready && <p className="m-0 text-sm text-muted-foreground xl:col-span-2">The posting is still being read. Generation needs it, give it a moment.</p>}
      <ResumeCard a={by('resume')} s={docs.state.resume} onGenerate={() => void docs.generate('resume')} />
      <CoverCard a={by('cover')} s={docs.state.cover} onGenerate={o => void docs.generate('cover', o)} />
    </div>
  )
}
