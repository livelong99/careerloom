// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('../../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))

import type { HfCheck, SttModelInfo } from '../../../lib/types'
import { dismissToast } from '../../../lib/toast'
import { fakeBridge, WithRuns } from '../testKit'
import { HfModelCard } from './HfModelCard'

const SHA = 'f'.repeat(40)
const check = (over: Partial<HfCheck> = {}): HfCheck => ({ model: `acme/asr@${SHA}`, repo: 'acme/asr', rev: SHA, pipelineTag: 'automatic-speech-recognition', license: 'mit', sizeBytes: 2 * 1024 ** 3, languages: ['en', 'de'], formats: ['safetensors'], verdict: 'ok', reasons: ['Public, safetensors weights, no custom code'], ...over })
const row = (over: Partial<SttModelInfo> = {}): SttModelInfo => ({ engine: 'hf', model: `acme/asr@${SHA}`, sizeMb: null, installed: true, devices: ['cpu'], lastBenchmark: null, recommended: false, ...over })
const mount = (models: SttModelInfo[] = [], onChanged = vi.fn()) => { render(<WithRuns><HfModelCard models={models} onChanged={onChanged} /></WithRuns>); return onChanged }
const checkIt = async (input = 'acme/asr') => { await userEvent.type(screen.getByLabelText('Hugging Face model id or link'), input); await userEvent.click(screen.getByRole('button', { name: 'Check' })) }

beforeEach(() => { dismissToast() })

describe('HfModelCard', () => {
  it('Check is disabled until something is typed; the result shows licence, size, languages, verdict and reasons', async () => {
    bridge.current = fakeBridge({ copilotHfCheck: check() })
    mount()
    expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true)
    await checkIt()
    expect(await screen.findByText('Can be installed')).toBeTruthy()
    expect(screen.getByText(/Licence: mit · 2.0 GB · languages: en, de/)).toBeTruthy()
    expect(screen.getByRole('listitem').textContent).toMatch(/safetensors weights/)
    expect(bridge.current.copilotHfCheck).toHaveBeenCalledWith('acme/asr')
  })
  it('a warning still allows the install and passes the pinned id', async () => {
    bridge.current = fakeBridge({ copilotHfCheck: check({ verdict: 'warn', reasons: ['Large download: 5.0 GB; it will use that much memory while running'] }), copilotInstallStt: { runId: 'r9' } })
    mount()
    await checkIt()
    expect(await screen.findByText('Can be installed, with cautions')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Download and install' }))
    await waitFor(() => expect(bridge.current.copilotInstallStt).toHaveBeenCalledWith(`acme/asr@${SHA}`))
  })
  it('a refused model shows every reason and the install button stays disabled', async () => {
    bridge.current = fakeBridge({ copilotHfCheck: check({ verdict: 'refuse', reasons: ['The model is gated: it needs you to accept terms on Hugging Face first', 'It only ships pickle weights'] }) })
    mount()
    await checkIt()
    expect(await screen.findByText('Cannot be installed')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map(l => l.textContent).join(' ')).toMatch(/gated.*pickle weights/)
    expect((screen.getByRole('button', { name: 'Download and install' }) as HTMLButtonElement).disabled).toBe(true)
    expect(bridge.current.copilotInstallStt).not.toHaveBeenCalled()
  })
  it('shows the error when the id is not accepted, with no install offered', async () => {
    bridge.current = fakeBridge({ copilotHfCheck: () => Promise.reject(new Error('Enter a model id like owner/name, or a huggingface.co link')) })
    mount()
    await checkIt('nope')
    expect(await screen.findByText(/Enter a model id like owner\/name/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download and install' })).toBeNull()
  })
  it('editing the input clears a stale verdict', async () => {
    bridge.current = fakeBridge({ copilotHfCheck: check() })
    mount()
    await checkIt()
    await screen.findByText('Can be installed')
    await userEvent.type(screen.getByLabelText('Hugging Face model id or link'), 'x')
    expect(screen.queryByText('Can be installed')).toBeNull()
  })
  it('installed models can be selected and removed; the list refreshes after', async () => {
    bridge.current = fakeBridge({ copilotSetConfig: {}, copilotRemoveStt: { ok: true } })
    const changed = mount([row(), row({ model: 'nvidia/x@' + SHA, installed: false })])
    expect(screen.getByText('acme/asr')).toBeTruthy(); expect(screen.queryByText('nvidia/x')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    await waitFor(() => expect(bridge.current.copilotSetConfig).toHaveBeenCalledWith({ stt: { engine: 'hf', model: `acme/asr@${SHA}`, device: 'auto' } }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(bridge.current.copilotRemoveStt).toHaveBeenCalledWith(`acme/asr@${SHA}`))
    await waitFor(() => expect(changed).toHaveBeenCalled())
  })
  it('states the licence and responsible-use note', () => {
    bridge.current = fakeBridge()
    mount()
    expect(screen.getByRole('note').textContent).toMatch(/own licences.*audio stays on this computer.*ever run as code/s)
  })
})
