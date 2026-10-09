import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { openRuns } from '@/lib/nav'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { showToast } from '../../../lib/toast'
import type { HfCheck, SttModelInfo } from '../../../lib/types'
import { orNull } from '../../copilot/api'
import { Group, Note, Row } from '../../kit/Group'
import { ReadinessBadge } from '../kit'

const size = (b: number | null) => (b === null ? 'size not published' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`)
const VERDICT = { ok: ['ready', 'Can be installed'], warn: ['needs-setup', 'Can be installed, with cautions'], refuse: ['error', 'Cannot be installed'] } as const

/** Settings → Local models: check any Hugging Face speech model (metadata only), install it pinned to the checked commit, remove it later. */
export function HfModelCard({ models, onChanged }: { models: SttModelInfo[]; onChanged: () => void }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<'check' | 'install' | string | null>(null)
  const [check, setCheck] = useState<HfCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown) => showToast(normalizeCliError(err).message, 'error', 6000)

  const run = async () => {
    setBusy('check'); setError(null); setCheck(null)
    try {
      const r = orNull(await careerloom.copilotHfCheck(input)) as HfCheck | null
      if (r) setCheck(r); else setError('The Hugging Face check is not available in this build yet.')
    } catch (err) { setError(normalizeCliError(err).message) } finally { setBusy(null) }
  }
  const install = async () => {
    if (!check || check.verdict === 'refuse') return
    setBusy('install')
    try {
      const r = orNull(await careerloom.copilotInstallStt(check.model)) as { runId: string } | null
      if (r) { showToast('Installing the speech model. Progress shows in Runs.'); openRuns(r.runId) }
    } catch (err) { fail(err) } finally { setBusy(null); onChanged() }
  }
  const remove = async (model: string) => {
    setBusy(model)
    try { await careerloom.copilotRemoveStt(model); showToast('Model removed') } catch (err) { fail(err) } finally { setBusy(null); onChanged() }
  }
  const use = async (model: string) => {
    try { await careerloom.copilotSetConfig({ stt: { engine: 'hf', model, device: 'auto' } }); showToast('Now used for transcription') } catch (err) { fail(err) }
  }
  const installed = models.filter(m => m.engine === 'hf' && m.installed)

  return (
    <Group title="Add a Hugging Face model" focus="hf-model">
      <Row label="Model id or link" hint="For example owner/name or a huggingface.co link. Only public speech-recognition models with safetensors weights and no custom code are accepted." stack>
        <Input aria-label="Hugging Face model id or link" placeholder="owner/name" value={input} maxLength={300} onChange={e => { setInput(e.target.value); setCheck(null); setError(null) }} onKeyDown={e => { if (e.key === 'Enter' && input.trim()) void run() }} />
        <Button size="sm" disabled={!input.trim() || busy !== null} onClick={() => void run()}>{busy === 'check' ? 'Checking…' : 'Check'}</Button>
      </Row>
      {error && <Note tone="warn">{error}</Note>}
      {check && (
        <div className="mt-2 flex flex-col gap-2" aria-label="Check result">
          <Row label={check.repo} hint={`Licence: ${check.license ?? 'not declared'} · ${size(check.sizeBytes)} · languages: ${check.languages.length ? check.languages.join(', ') : 'not listed'} · commit ${check.rev.slice(0, 8)}`}>
            <ReadinessBadge state={VERDICT[check.verdict][0]} label={VERDICT[check.verdict][1]} />
            <Button size="sm" disabled={check.verdict === 'refuse' || busy !== null} onClick={() => void install()}>{busy === 'install' ? 'Starting…' : 'Download and install'}</Button>
          </Row>
          <ul className="m-0 list-disc pl-5 text-xs text-muted-foreground">{check.reasons.map(r => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {installed.length > 0 && (
        <div className="mt-2" aria-label="Installed Hugging Face models">
          {installed.map(m => (
            <Row key={m.model} label={m.model.split('@')[0]} hint={m.sizeMb === null ? 'Installed' : `about ${m.sizeMb} MB`}>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void use(m.model)}>Use</Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void remove(m.model)}>{busy === m.model ? 'Removing…' : 'Remove'}</Button>
            </Row>
          ))}
        </div>
      )}
      <div className="mt-2"><Note>Models are third-party software under their own licences: read the licence on the model page before relying on one. Only the model files are downloaded, the audio stays on this computer, and nothing from the model repository is ever run as code. Benchmark it in Copilot → Transcription before a real interview.</Note></div>
    </Group>
  )
}
