import { useMemo, useState } from 'react'

import { Group, Note, Row } from '@/components/copilot/Group'
import { SttModelPicker, type SttRow } from '@/components/copilot/SttModelPicker'
import { errorText, orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { DEVICE_LABEL, STT_ENGINES } from '@/components/copilot/catalog'
import { Chip, rangeClass, selectClass } from '@/components/copilot/hwControls'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import type { SttBenchmark, SttDevice, SttEngineId } from '@/lib/types'
import { Page } from '../resume/PageStub'

const DEVICES: SttDevice[] = ['auto', 'cpu', 'coreml', 'cuda']

export function TranscriptionPage() {
  const { config, save } = useCopilotConfig()
  const list = useAsync(() => careerloom.copilotListSttModels(), [])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SttBenchmark | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const listed = list.data ? orNull(list.data) : null
  const engine = STT_ENGINES.find(e => e.id === config?.stt.engine) ?? STT_ENGINES[0]!

  const rows: SttRow[] = useMemo(() => {
    const mine = listed?.filter(m => m.engine === engine.id) ?? []
    if (mine.length > 0) {
      return mine.map(m => {
        const cat = engine.models.find(c => c.id === m.model)
        return { model: m.model, label: cat?.label ?? m.model, hint: cat?.hint ?? '', sizeMb: m.sizeMb, installed: m.installed, p50FinalMs: m.lastBenchmark?.p50FinalMs ?? null, recommended: m.recommended }
      })
    }
    return engine.models.map(c => ({ model: c.id, label: c.label, hint: c.hint, sizeMb: null, installed: null, p50FinalMs: null, recommended: false }))
  }, [listed, engine])
  // CUDA is offered only when the engine itself reports it; the static catalog never enables it.
  const devices = new Set<string>(['auto', ...(listed ? listed.filter(m => m.engine === engine.id).flatMap(m => m.devices) : engine.devices.filter(d => d !== 'cuda'))])

  if (!config) return <Page title="Transcription" blurb="Loading…" />
  const stt = config.stt
  const model = stt.model ?? rows.find(r => r.recommended)?.model ?? rows[0]?.model ?? null
  const shown = result ?? stt.lastBenchmark

  async function benchmark(): Promise<void> {
    if (!model) return
    setRunning(true); setNote(null)
    try {
      const r = orNull(await careerloom.copilotBenchmarkStt({ engine: engine.id, model, device: stt.device }))
      if (r) { setResult(r); list.reload() } else setNote('The benchmark is not available in this build yet.')
    } catch (e) { setNote(errorText(e)) } finally { setRunning(false) }
  }
  const addWord = (): void => {
    const w = word.trim()
    if (!w || stt.vocab.includes(w)) return setWord('')
    void save({ stt: { vocab: [...stt.vocab, w] } }); setWord('')
  }

  return (
    <Page title="Transcription" blurb="Turns speech into text as it happens. It runs on this computer, so your audio is never uploaded.">
      <Group title="Speech model" action={<Button variant="outline" disabled={running || !model} onClick={() => void benchmark()}>{running ? 'Benchmarking…' : 'Benchmark on this computer'}</Button>}>
        <Row label="Engine" hint={engine.hint} htmlFor="stt-engine">
          <select id="stt-engine" className={selectClass} value={engine.id} onChange={e => void save({ stt: { engine: e.target.value as SttEngineId, model: null, device: 'auto' } })}>
            {STT_ENGINES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Row>
        <Row label="Model" hint="Pick the smallest model that is accurate enough for you. Latency is measured on this computer." stack>
          <SttModelPicker rows={rows} value={model} onChange={m => void save({ stt: { model: m } })} />
        </Row>
        <Row label="Compute" hint="Auto picks the fastest option this computer supports. NVIDIA GPU (CUDA) appears only when the engine can use it." htmlFor="stt-device">
          <select id="stt-device" className={selectClass} value={stt.device} onChange={e => void save({ stt: { device: e.target.value as SttDevice } })}>
            {DEVICES.map(d => <option key={d} value={d} disabled={!devices.has(d)}>{DEVICE_LABEL[d]}{d === 'cuda' && engine.id === 'moonshine' ? ' · experimental' : ''}</option>)}
          </select>
        </Row>
        <Row label="Benchmark result" hint={note ?? (shown ? 'Measured on this computer.' : 'Run the benchmark to see speed and memory.')}>
          {shown && <><Chip tone="ok">Final {Math.round(shown.p50FinalMs)} ms</Chip>{shown.ramMb !== null && <Chip>RAM {Math.round(shown.ramMb)} MB</Chip>}<Chip>Speed {shown.realTimeFactor}× real time</Chip></>}
        </Row>
        <Note tone="ok">Audio from your microphone and system audio stays on this computer. Only the text of the conversation is sent to the answer provider.</Note>
      </Group>

      <Group>
        <Row label="Language" hint="English only for now. Accented English works, and you can check accuracy with the benchmark." htmlFor="stt-lang">
          <select id="stt-lang" className={selectClass} value="en" disabled><option value="en">English</option></select>
        </Row>
        <Row label="Wait after the interviewer stops" hint="Shorter is faster but may cut a question in half." htmlFor="stt-wait">
          <input id="stt-wait" type="range" className={rangeClass} min={200} max={3000} step={50} value={stt.endSilenceMs} onChange={e => void save({ stt: { endSilenceMs: Number(e.target.value) } })} />
          <span className="w-16 text-right font-mono text-xs text-muted-foreground">{stt.endSilenceMs} ms</span>
        </Row>
        <Row label="Words to recognise" hint="Names and tools the engine often gets wrong." stack>
          <div className="flex flex-wrap items-center gap-2">
            {stt.vocab.map(w => (
              <span key={w} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px text-xs text-foreground">{w}
                <button type="button" aria-label={`Remove word ${w}`} className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground" onClick={() => void save({ stt: { vocab: stt.vocab.filter(x => x !== w) } })}>×</button>
              </span>
            ))}
            <input aria-label="New word" className={`${selectClass} min-w-32`} value={word} onChange={e => setWord(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addWord() }} />
            <Button variant="outline" size="sm" aria-label="Add word" onClick={addWord}>Add</Button>
          </div>
        </Row>
      </Group>
    </Page>
  )
}
