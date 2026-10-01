import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { goToSettings, navigate } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { LocalModelStatus, SttModelInfo } from '../../../lib/types'
import { orNull } from '../../copilot/api'
import { STT_ENGINES } from '../../copilot/catalog'
import { Group, Note, Row } from '../../kit/Group'
import { LocalModelSetup } from '../../onboarding/ModelStep'
import { openRuns } from '../../RunsDrawer'
import { ReadinessBadge } from '../kit'
import type { PageProps } from '../pages'

const gb = (n: number) => (n / 1024 ** 3).toFixed(1)
const engineLabel = (id: string) => STT_ENGINES.find(e => e.id === id)?.label ?? id
const modelLabel = (m: SttModelInfo) => STT_ENGINES.find(e => e.id === m.engine)?.models.find(c => c.id === m.model)?.label ?? m.model

export function LocalModelsPage(_props: PageProps) {
  const [pre, setPre] = useState<LocalModelStatus | null>(null)
  const status = usePolled(() => careerloom.prescreenStatus(), [pre?.installed], { intervalMs: null })
  const locations = usePolled(() => careerloom.dataLocations(), [], { intervalMs: null })
  const diag = usePolled(() => careerloom.diagnostics(), [], { intervalMs: null })
  const stt = usePolled(async () => orNull(await careerloom.copilotListSttModels()) as SttModelInfo[] | null, [], { intervalMs: null })
  const config = usePolled(() => careerloom.copilotGetConfig(), [], { intervalMs: null })
  const [installing, setInstalling] = useState<string | null>(null)
  const modelsDir = locations.data?.find(l => l.id === 'models')?.path ?? null
  const model = status.data?.model
  const mem = diag.data?.memory
  const engine = config.data?.stt.engine

  const installStt = async (m: SttModelInfo) => {
    setInstalling(`${m.engine}:${m.model}`)
    try {
      const r = orNull(await careerloom.copilotInstallStt(m.model)) as { runId: string } | null
      if (r) { showToast('Installing the speech model. Progress shows in Runs.'); openRuns(r.runId) } else showToast('The installer is not available in this build yet.', 'error')
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setInstalling(null); stt.refresh() }
  }

  return (
    <>
      <Group title="Memory" focus="memory">
        {diag.error ? <p className="m-0 text-xs text-muted-foreground">Memory check not available yet: {diag.error.message}</p> : mem ? (
          <Row label="This computer" hint="Install and run one model at a time; models load into memory while they work.">
            <ReadinessBadge state="ready" label={`${gb(mem.freeBytes)} GB free of ${gb(mem.totalBytes)} GB`} />
          </Row>
        ) : <p className="m-0 text-xs text-muted-foreground">Checking…</p>}
      </Group>

      <Group title="Pre-screen model" focus="prescreen-model" action={<>
        {modelsDir && <Button size="sm" variant="outline" onClick={() => void careerloom.revealPath(modelsDir).catch(err => showToast(normalizeCliError(err).message, 'error'))}>Show in Finder</Button>}
        <Button size="sm" variant="outline" onClick={() => navigate('jobs')}>Retrain in Jobs →</Button>
      </>}>
        {model && (
          <Row label={model.personal ? 'Personal layer trained' : 'Base model only'} hint={model.personal ? `Learned from ${model.n} of your marks (${model.pos} relevant, ${model.neg} not) · ${new Date(model.trainedAt).toLocaleDateString()}` : `Needs 5 Relevant and 5 Not relevant marks in Jobs to personalise (you have ${status.data?.labels.pos ?? 0} and ${status.data?.labels.neg ?? 0}).`}>
            <ReadinessBadge state="ready" label={model.personal ? 'Personal' : 'Base'} />
          </Row>
        )}
        {status.data && !status.data.available && <p className="m-0 mb-3 text-xs text-muted-foreground">Not installed: pre-screening uses rules only. {status.data.reason ?? ''}</p>}
        <LocalModelSetup onStatus={setPre} />
      </Group>

      <Group title="Transcription engines" focus="stt-models" action={<Button size="sm" variant="outline" onClick={() => goToSettings('copilot')}>Engine settings →</Button>}>
        <Note tone="ok">Speech is transcribed on this computer. Audio is never uploaded.</Note>
        <div className="mt-2">
          {stt.error && <p className="m-0 text-xs text-muted-foreground">Not available yet: {stt.error.message}</p>}
          {stt.data === null && <p className="m-0 text-xs text-muted-foreground">The speech engines are not available in this build yet.</p>}
          {(stt.data ?? []).map(m => {
            const key = `${m.engine}:${m.model}`
            const canInstall = !m.installed && m.engine === engine
            return (
              <Row key={key} label={`${engineLabel(m.engine)} · ${modelLabel(m)}`} hint={`${m.sizeMb === null ? 'size shown after install' : `about ${m.sizeMb} MB`}${m.recommended ? ' · recommended' : ''}${!m.installed && m.engine !== engine ? ' · switch the engine in Copilot to install' : ''}`}>
                <ReadinessBadge state={m.installed ? 'ready' : 'off'} label={m.installed ? 'Installed' : 'Not installed'} />
                {canInstall && <Button size="sm" disabled={installing !== null} onClick={() => void installStt(m)}>{installing === key ? 'Starting…' : 'Install'}</Button>}
              </Row>
            )
          })}
        </div>
        <div className="mt-2"><Note>{engine === 'faster-whisper' ? 'Whisper on an NVIDIA GPU installs about 1.3 GB of NVIDIA runtime libraries (no PyTorch, no CUDA toolkit) plus the model' : 'Whisper installs about 1.3 GB of Python packages (PyTorch) plus the model'} into a folder in your home directory. Nothing is bundled with the app.</Note></div>
      </Group>
    </>
  )
}
