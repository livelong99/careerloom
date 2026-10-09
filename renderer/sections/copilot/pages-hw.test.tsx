// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => {
  const m = {
    copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotListSttModels: vi.fn(), copilotBenchmarkStt: vi.fn(),
    copilotReadiness: vi.fn(), copilotProbeAudio: vi.fn(), copilotAudio: vi.fn(), copilotOpenSystemSettings: vi.fn(), copilotCheckHotkey: vi.fn(),
  }
  return m
})
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))
const mic = vi.hoisted(() => ({ startMic: vi.fn() }))
vi.mock('../../overlay/capture/mic', () => mic)

import { AppearancePage } from './Appearance'
import { AudioPage } from './Audio'
import { HotkeysPage } from './Hotkeys'
import { TranscriptionPage } from './Transcription'
import { mergeConfig } from '@/components/copilot/api'
import { setSelection } from '@/components/copilot/selection'
import { DEFAULT_CONFIG_FOR_TESTS } from '@/components/copilot/testConfig'

const NI = (method: string) => ({ status: 'not-implemented', method })
const CONFIG = { ...DEFAULT_CONFIG_FOR_TESTS, stt: { ...DEFAULT_CONFIG_FOR_TESTS.stt, vocab: ['Kubernetes'] } }

beforeEach(() => {
  api.copilotGetConfig.mockResolvedValue(CONFIG)
  api.copilotSetConfig.mockImplementation(async (p: object) => mergeConfig(CONFIG, p as never))
  api.copilotListSttModels.mockResolvedValue(NI('copilotListSttModels'))
  api.copilotBenchmarkStt.mockResolvedValue(NI('copilotBenchmarkStt'))
  api.copilotReadiness.mockResolvedValue(NI('copilotReadiness'))
  api.copilotProbeAudio.mockResolvedValue(NI('copilotProbeAudio'))
  api.copilotCheckHotkey.mockResolvedValue(NI('copilotCheckHotkey'))
  mic.startMic.mockReset(); mic.startMic.mockResolvedValue({ stop: vi.fn() })
  setSelection({ jobId: null })
})
afterEach(() => { cleanup(); Object.values(api).forEach(f => f.mockReset()) })

describe('TranscriptionPage', () => {
  it('falls back to the catalog, never claims a size, and keeps CUDA disabled unless reported', async () => {
    render(<TranscriptionPage />)
    await screen.findByRole('radio', { name: /Small/ })
    expect(screen.getAllByText(/size shown after install/i).length).toBeGreaterThan(0)
    const compute = screen.getByLabelText('Compute') as HTMLSelectElement
    expect([...compute.options].find(o => o.value === 'cuda')?.disabled).toBe(true)
    expect([...compute.options].find(o => o.value === 'cpu')?.disabled).toBe(false)
  })
  it('enables CUDA only when the engine reports it, shows Installed / Recommended from the list', async () => {
    api.copilotListSttModels.mockResolvedValue([
      { engine: 'moonshine', model: 'small', sizeMb: 139, installed: true, devices: ['cpu', 'cuda'], lastBenchmark: { at: 1, p50FinalMs: 80, realTimeFactor: 0.08, ramMb: 610, wer: null }, recommended: true },
    ])
    render(<TranscriptionPage />)
    await screen.findByText('Installed')
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.getByText(/Final in 80 ms/)).toBeTruthy()
    const compute = screen.getByLabelText('Compute') as HTMLSelectElement
    expect([...compute.options].find(o => o.value === 'cuda')?.disabled).toBe(false)
    expect(compute.textContent).toMatch(/CUDA.*experimental/i)
  })
  it('selecting a model saves it; benchmark calls main with the selection and shows a neutral note when unwired', async () => {
    render(<TranscriptionPage />)
    fireEvent.click(await screen.findByRole('radio', { name: /Medium/ }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ stt: { model: 'medium' } }))
    fireEvent.click(screen.getByRole('button', { name: /Benchmark on this computer/ }))
    await waitFor(() => expect(api.copilotBenchmarkStt).toHaveBeenCalledWith({ engine: 'moonshine', model: 'medium', device: 'auto' }))
    await screen.findByText(/not available in this build yet/i)
  })
  it('Whisper (the default): warns about the ~1.3 GB install when missing, offers Turbo as on-demand, Auto compute only, and says the speeds are from synthetic speech', async () => {
    const whisper = { ...CONFIG, stt: { ...CONFIG.stt, engine: 'whisper-mlx' as const } }
    api.copilotGetConfig.mockResolvedValue(whisper)
    api.copilotListSttModels.mockResolvedValue([
      { engine: 'whisper-mlx', model: 'small', sizeMb: 481, installed: false, devices: [], lastBenchmark: null, recommended: true },
      { engine: 'whisper-mlx', model: 'turbo', sizeMb: 1600, installed: false, devices: [], lastBenchmark: null, recommended: false },
    ])
    render(<TranscriptionPage />)
    await screen.findByRole('radio', { name: /Turbo · most accurate \(on demand\)/ })
    expect(screen.getByText(/about 481 MB/)).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.getByText(/about 1\.3 GB of Python packages \(PyTorch\)/)).toBeTruthy()
    expect(screen.getByText(/computer-generated speech/)).toBeTruthy()
    const compute = screen.getByLabelText('Compute') as HTMLSelectElement
    expect([...compute.options].filter(o => !o.disabled).map(o => o.value)).toEqual(['auto'])
    expect(screen.queryByRole('button', { name: /Install speech model/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Manage Speech model in Settings/ })).toBeTruthy()
  })
  it('shows benchmark result chips', async () => {
    api.copilotBenchmarkStt.mockResolvedValue({ at: 1, p50FinalMs: 82, realTimeFactor: 0.08, ramMb: 610, wer: null })
    render(<TranscriptionPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Benchmark on this computer/ }))
    await screen.findByText('Final 82 ms')
    expect(screen.getByText('RAM 610 MB')).toBeTruthy()
    expect(screen.getByText(/0\.08× real time/)).toBeTruthy()
  })
  it('a word that is already listed (any case) is not added again, and the box caps a word at 60 characters', async () => {
    api.copilotGetConfig.mockResolvedValue(CONFIG)
    render(<TranscriptionPage />)
    const box = await screen.findByLabelText('New word') as HTMLInputElement
    expect(box.maxLength).toBe(60)
    fireEvent.change(box, { target: { value: 'kubernetes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add word' }))
    expect(api.copilotSetConfig).not.toHaveBeenCalledWith({ stt: { vocab: expect.anything() } })
  })
  it('states that audio stays on this computer and adds vocabulary', async () => {
    render(<TranscriptionPage />)
    expect(await screen.findByText(/stays on this computer/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New word'), { target: { value: 'Terraform' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add word' }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ stt: { vocab: ['Kubernetes', 'Terraform'] } }))
  })
})

describe('AudioPage', () => {
  it('renders neutral states when readiness, probe and devices are unavailable', async () => {
    render(<AudioPage />)
    expect(await screen.findByText('Your microphone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Test for 3 seconds/ }))
    await screen.findByText(/not available in this build yet/i)
  })
  it('shows probe result as text and permission from readiness for the selected job', async () => {
    setSelection({ jobId: 'j1' })
    api.copilotReadiness.mockResolvedValue({ context: {}, mic: 'denied', system: 'not-determined', stt: 'ready', engine: 'ready' })
    api.copilotProbeAudio.mockResolvedValue({ source: 'mic', status: 'silent', level: 0 })
    render(<AudioPage />)
    await screen.findByText('Blocked')
    fireEvent.click(screen.getByRole('button', { name: /Test for 3 seconds/ }))
    await screen.findByText(/Silent: no sound reached Careerloom/)
    expect(api.copilotProbeAudio).toHaveBeenCalledWith('mic', 3000)
  })
  it('system audio is shown as coming soon: off, disabled, nothing to configure or test', async () => {
    render(<AudioPage />)
    const sw = await screen.findByRole('switch', { name: 'Use system audio' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect((sw as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/coming soon/i)).toBeTruthy()
    expect(screen.queryByLabelText('Source')).toBeNull()
    expect(screen.queryByRole('button', { name: /Open System Settings/ })).toBeNull()
    expect(api.copilotSetConfig).not.toHaveBeenCalled()
  })
  it('a saved system-audio setting from an older build still renders as off', async () => {
    api.copilotGetConfig.mockResolvedValue({ ...CONFIG, audio: { ...CONFIG.audio, useSystem: true } })
    render(<AudioPage />)
    expect((await screen.findByRole('switch', { name: 'Use system audio' })).getAttribute('aria-checked')).toBe('false')
  })
  describe('microphone test', () => {
    const frame = (v: number) => new Int16Array(1600).fill(v).buffer
    it('drives the meter from the frames it sends, on one stream, and releases the mic', async () => {
      const stop = vi.fn()
      let onFrame: (b: ArrayBuffer) => void = () => undefined
      mic.startMic.mockImplementation(async (o: { onFrame: (b: ArrayBuffer) => void }) => { onFrame = o.onFrame; return { stop } })
      api.copilotProbeAudio.mockImplementation(() => new Promise(r => setTimeout(() => r({ source: 'mic', status: 'ok', level: 0.4 }), 400)))
      const gum = vi.fn(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum, enumerateDevices: async () => [] } })
      render(<AudioPage />)
      fireEvent.click(await screen.findByRole('button', { name: /Test for 3 seconds/ }))
      await waitFor(() => expect(mic.startMic).toHaveBeenCalled())
      onFrame(frame(16000))
      await waitFor(() => expect(Number(screen.getByRole('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(40))
      await screen.findByText(/Working: Careerloom heard sound/)
      expect(gum).not.toHaveBeenCalled() // the level meter no longer opens a second stream
      expect(stop).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(Number(screen.getByRole('meter').getAttribute('aria-valuenow'))).toBe(0))
    })
    it('shows why the mic could not open instead of "no input device", and the fix steps when it is blocked', async () => {
      mic.startMic.mockRejectedValue(Object.assign(new Error('Microphone access is blocked: allow Careerloom in System Settings → Privacy & Security → Microphone.'), { cause: { name: 'NotAllowedError' } }))
      render(<AudioPage />)
      fireEvent.click(await screen.findByRole('button', { name: /Test for 3 seconds/ }))
      await screen.findByText(/Microphone access is blocked/)
      expect(screen.getByRole('button', { name: /Open System Settings/ })).toBeTruthy()
      expect(api.copilotProbeAudio).not.toHaveBeenCalled()
    })
    it('a denied probe shows the fix steps even when no job is selected', async () => {
      mic.startMic.mockResolvedValue({ stop: vi.fn() })
      api.copilotProbeAudio.mockResolvedValue({ source: 'mic', status: 'denied', level: 0 })
      render(<AudioPage />)
      fireEvent.click(await screen.findByRole('button', { name: /Test for 3 seconds/ }))
      await screen.findByText(/Blocked: macOS did not let Careerloom/)
      expect(screen.getByRole('button', { name: /Open System Settings/ })).toBeTruthy()
    })
  })
  describe('input devices', () => {
    const dev = (deviceId: string, label: string) => ({ kind: 'audioinput', deviceId, label })
    function stubDevices(initial: unknown[]) {
      let list = initial
      const listeners: Array<() => void> = []
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        enumerateDevices: async () => list,
        addEventListener: (_: string, cb: () => void) => listeners.push(cb), removeEventListener: () => undefined,
      } })
      return { plug: (next: unknown[]) => { list = next; listeners.forEach(cb => cb()) } }
    }
    it('lists real inputs only (no duplicate "default" entry) and picks up a plugged-in device without a reload', async () => {
      const d = stubDevices([dev('default', 'Default - Built-in'), dev('a', 'Built-in Microphone')])
      render(<AudioPage />)
      await screen.findByRole('option', { name: 'Built-in Microphone' })
      expect(screen.queryByRole('option', { name: /Default - Built-in/ })).toBeNull()
      d.plug([dev('default', 'Default - USB'), dev('a', 'Built-in Microphone'), dev('b', 'USB Headset')])
      await screen.findByRole('option', { name: 'USB Headset' })
    })
    it('flags a saved microphone that is no longer connected, so the dropdown is not blank', async () => {
      stubDevices([dev('a', 'Built-in Microphone')])
      api.copilotGetConfig.mockResolvedValue({ ...CONFIG, audio: { ...CONFIG.audio, micDeviceId: 'gone' } })
      render(<AudioPage />)
      await screen.findByRole('option', { name: 'Built-in Microphone' })
      const sel = screen.getByLabelText('Input device') as HTMLSelectElement
      expect(sel.selectedOptions[0]!.textContent).toMatch(/not connected.*system default/i)
    })
  })
})

describe('AppearancePage', () => {
  it('opacity slider never goes below 60% and saves as a fraction', async () => {
    render(<AppearancePage />)
    const op = await screen.findByLabelText('Opacity') as HTMLInputElement
    expect(op.min).toBe('60')
    fireEvent.change(op, { target: { value: '80' } })
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ overlay: { opacity: 0.8 } }))
  })
  it('position grid and layout save', async () => {
    render(<AppearancePage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Bottom left' }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ overlay: { anchor: 'bl' } }))
    fireEvent.click(screen.getByRole('radio', { name: 'Panel' }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ overlay: { layout: 'panel' } }))
  })
})

describe('HotkeysPage', () => {
  it('lists eleven editable rows and the fixed stop row', async () => {
    render(<HotkeysPage />)
    await screen.findByText('Answer the last question')
    expect(screen.getAllByRole('button', { name: /^Change / })).toHaveLength(11)
    expect(screen.getByText('Stop everything now')).toBeTruthy()
    expect(screen.getByText('⌃⌥⇧X')).toBeTruthy()
  })
  it('saves a recorded shortcut and refuses one already used by another row', async () => {
    render(<HotkeysPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change Clarify the question' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Press the new shortcut/ }), { key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true })
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ hotkeys: { clarify: 'Control+Alt+Q' } }))
    api.copilotSetConfig.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Change Follow-up' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Press the new shortcut/ }), { key: 'a', code: 'KeyA', ctrlKey: true, altKey: true })
    expect(api.copilotSetConfig).not.toHaveBeenCalled()
    expect(await screen.findByText(/already used by "Answer the last question"/i)).toBeTruthy()
  })
})
