// Per-session consent gate for live sessions. Main re-validates the record (electron/copilot/consent.ts); this only collects it.
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import type { ConsentRecord, SourceId } from '@/lib/types'
import { CONSENT_TEXT_VERSION } from '../../../electron/copilot/consent'
import { errorText, useCopilotConfig } from './api'
import { CONSENT_COPY as T } from './consentCopy'
import { retentionLabel } from './retention'
import { useSelection } from './selection'

export function ConsentGate({ open, onOpenChange, onPractice, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; onPractice: () => void; onStarted: (sessionId: string) => void }) {
  const { config } = useCopilotConfig()
  const { jobId, interviewType } = useSelection()
  const [ai, setAi] = useState(false)
  const [everyone, setEveryone] = useState(false)
  const [system, setSystem] = useState(false)
  const [place, setPlace] = useState<string | null>(null)
  const [rules, setRules] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = ai && everyone && jobId !== null && config !== null && !busy

  async function go(): Promise<void> {
    if (!ready || !config || !jobId) return
    setBusy(true); setError(null)
    const sources: SourceId[] = system ? ['mic', 'system'] : ['mic']
    const consent: ConsentRecord = {
      id: crypto.randomUUID(), sessionId: crypto.randomUUID(), at: Date.now(), textVersion: CONSENT_TEXT_VERSION,
      aiAllowedConfirmed: ai, everyoneInformedConfirmed: everyone, jurisdiction: place, sources,
      sttProvider: config.stt.engine, llmProvider: config.engine.provider, transcriptSaved: config.privacy.retentionDays !== 0,
      privacyMode: config.privacy.mode.enabled, indicator: config.privacy.mode.indicator,
    }
    try {
      const r = await careerloom.copilotStart({ mode: 'live', jobId, interviewType, consent })
      onStarted(r.sessionId); onOpenChange(false)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{T.title}</DialogTitle>
          <DialogDescription>{T.intro(config ? retentionLabel(config.privacy.retentionDays) : '3 months', config?.engine.openrouter.dataCollection !== 'deny')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <SourceRow title={T.mic.title} hint={T.mic.hint}><Badge variant="success">On</Badge></SourceRow>
          <SourceRow title={T.system.title} hint={T.system.hint}><ToggleSwitch checked={system} onCheckedChange={setSystem} aria-label="Include system audio" /></SourceRow>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm"><Checkbox checked={ai} onCheckedChange={v => setAi(v === true)} aria-label={T.aiAllowed} className="mt-0.5" /><span>{T.aiAllowed}</span></label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm"><Checkbox checked={everyone} onCheckedChange={v => setEveryone(v === true)} aria-label={T.everyoneInformed} className="mt-0.5" /><span>{T.everyoneInformed}</span></label>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span id="consent-place">{T.jurisdictionLabel}</span>
            <Select value={place ?? ''} onValueChange={setPlace}>
              <SelectTrigger aria-labelledby="consent-place" className="w-44"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{T.jurisdictions.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="link" className="h-auto p-0" aria-expanded={rules} onClick={() => setRules(r => !r)}>{T.rulesLink}</Button>
          </div>
          {rules && <p className="m-0 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{T.rulesBody}</p>}
          <p role="note" className="m-0 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{T.notLegal}</p>
          {jobId === null && <p className="m-0 text-xs text-warning">Pick a job on Setup first: every session belongs to a job.</p>}
          {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={onPractice}>Practice instead</Button>
          <Button disabled={!ready} onClick={() => { void go() }}>Start live session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceRow({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground">{hint}</div></div>
      {children}
    </div>
  )
}
