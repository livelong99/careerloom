// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('../../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))

import { dismissToast } from '../../../lib/toast'
import { KeyField } from '../KeyField'
import { REGISTRY } from '../settings-registry'
import { fakeBridge, settingsFixture, WithRuns } from '../testKit'
import { KeysPage } from './Keys'
import { LocalModelsPage } from './LocalModels'
import { cliState, RunnersPage } from './Runners'

const SECRET = 'sk-or-v1-TOPSECRETvalue0001'
const keyInfo = (id: string, over = {}) => ({ id, label: id === 'openrouter' ? 'OpenRouter' : id === 'opencode' ? 'OpenCode Zen' : 'Firecrawl', hasKey: false, tail: null, optional: id !== 'openrouter', usedBy: ['API runner'], neededByRunners: id === 'openrouter' ? ['api'] : [], helpUrl: null, formatHint: 'Starts with sk-or-', lastTest: null, ...over })
const props = (over = {}) => ({ settings: settingsFixture(over), onChanged: vi.fn() })
const mount = (ui: React.ReactNode) => render(<WithRuns>{ui}</WithRuns>)
const cli = (id: string, over = {}) => ({ id, label: id, path: `/bin/${id}`, version: '1.0', signedIn: true, skill: true, configured: true, ready: true, problems: [], ...over })

beforeEach(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollIntoView ??= () => {}
  dismissToast()
})

describe('registry points at real controls', () => {
  const cases: Array<[string, () => React.ReactNode]> = [['runners', () => <RunnersPage {...props()} />], ['keys', () => <KeysPage {...props()} />], ['local-models', () => <LocalModelsPage {...props()} />]]
  it.each(cases)('%s', async (page, ui) => {
    bridge.current = fakeBridge({ keysList: [keyInfo('openrouter'), keyInfo('opencode'), keyInfo('firecrawl')], listIntegrations: [], getReadiness: { root: '/r', checkedAt: 0, deps: true, clis: [] }, localModelStatus: { installed: false, model: 'm', dir: '/d', platform: 'darwin', arch: 'arm64', python: null, oldPython: null, downloadGb: { packages: 1, weights: 1 }, installRun: null } })
    const { container } = mount(ui())
    await waitFor(() => expect(container.querySelector('[data-focus]')).toBeTruthy())
    const have = new Set([...container.querySelectorAll('[data-focus]')].map(n => (n as HTMLElement).dataset.focus))
    expect(REGISTRY.filter(e => e.page === page && e.focus && !have.has(e.focus)).map(e => e.focus)).toEqual([])
  })
})

describe('KeyField', () => {
  it('submits the trimmed value once, then clears the input', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<KeyField label="Key" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Key') as HTMLInputElement
    expect(input.type).toBe('password')
    await userEvent.type(input, `  ${SECRET}  `)
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect(onSubmit).toHaveBeenCalledWith(SECRET)
    await waitFor(() => expect(input.value).toBe(''))
  })
  it('shows the error text, keeps the draft for correction, and cancel clears it', async () => {
    const onCancel = vi.fn()
    render(<KeyField label="Key" onSubmit={async () => { throw new Error('That does not look like an OpenRouter key') }} onCancel={onCancel} />)
    const input = screen.getByLabelText('Key') as HTMLInputElement
    await userEvent.type(input, 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect((await screen.findByRole('alert')).textContent).toContain('does not look like')
    expect(input.value).toBe('bad')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(input.value).toBe('')
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('Keys page', () => {
  const list = [keyInfo('openrouter', { hasKey: true, tail: 'a1b2', lastTest: { ok: true, latencyMs: 412, detail: 'Key accepted', at: Date.now() - 120_000 } }), keyInfo('opencode'), keyInfo('firecrawl')]
  it('shows masked status, used-by and the last test; never a secret', async () => {
    bridge.current = fakeBridge({ keysList: list, listIntegrations: [] })
    const { container } = mount(<KeysPage {...props({ runner: 'api', hasApiKey: true })} />)
    await screen.findByText('••••a1b2')
    expect(screen.getByText(/ok · 412 ms · tested 2 min ago/)).toBeTruthy()
    expect(screen.getByText('Needed for your active runner')).toBeTruthy()
    expect(container.textContent).not.toContain('sk-or-')
  })
  it('replace sends the key once through keysSet and clears the field', async () => {
    bridge.current = fakeBridge({ keysList: list, listIntegrations: [], keysSet: keyInfo('openrouter') })
    const p = props({ runner: 'api' })
    mount(<KeysPage {...p} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }))
    const input = screen.getByLabelText('OpenRouter API key') as HTMLInputElement
    await userEvent.type(input, SECRET)
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(bridge.current.keysSet).toHaveBeenCalledWith('openrouter', SECRET))
    await waitFor(() => expect(screen.queryByLabelText('OpenRouter API key')).toBeNull())
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(p.onChanged).toHaveBeenCalled()
  })
  it('remove names the consequence and only deletes after confirming', async () => {
    bridge.current = fakeBridge({ keysList: list, listIntegrations: [], keysSet: keyInfo('openrouter') })
    mount(<KeysPage {...props()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/API runner will stop working/)).toBeTruthy()
    expect(bridge.current.keysSet).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(bridge.current.keysSet).toHaveBeenCalledWith('openrouter', null))
  })
  it('test shows the failure reason', async () => {
    bridge.current = fakeBridge({ keysList: list, listIntegrations: [], keysTest: { ok: false, latencyMs: 90, detail: 'Invalid key — OpenRouter rejected it', at: Date.now() } })
    mount(<KeysPage {...props()} />)
    await screen.findByText('OpenRouter')
    await userEvent.click(within(document.querySelector('[data-focus="key:openrouter"]') as HTMLElement).getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Invalid key — OpenRouter rejected it · 90 ms/)).toBeTruthy()
  })
  it('lists plugin keys read-only with a link to Integrations', async () => {
    bridge.current = fakeBridge({ keysList: list, listIntegrations: [{ id: 'plugin:x', kind: 'plugin', name: 'Plugin X', status: 'needs_setup', statusText: 'Missing keys: X_KEY' }, { id: 'service:a', kind: 'service', name: 'Svc', status: 'ready', statusText: 'Ready' }] })
    mount(<KeysPage {...props()} />)
    expect(await screen.findByText('Plugin X')).toBeTruthy()
    expect(screen.getByText('Missing keys: X_KEY')).toBeTruthy()
    expect(screen.queryByText('Svc')).toBeNull()
  })
})

describe('cliState', () => {
  it('maps a probe to a readiness badge', () => {
    expect(cliState(undefined, true).state).toBe('checking')
    expect(cliState(cli('claude') as never, false)).toEqual({ state: 'ready', text: 'Ready' })
    expect(cliState(cli('claude', { path: null, ready: false }) as never, false).text).toBe('Not installed')
    expect(cliState(cli('claude', { signedIn: false, ready: false }) as never, false).text).toBe('Not signed in')
    expect(cliState(cli('claude', { ready: false, problems: ['x'] }) as never, false).state).toBe('error')
  })
})

describe('Runners page', () => {
  const readiness = { root: '/r', checkedAt: 0, deps: true, clis: [cli('claude'), cli('codex', { path: null, ready: false, signedIn: null }), cli('antigravity', { ready: false, signedIn: false }), cli('opencode')] }
  it('Use is only offered for ready runners and switches through setRunner', async () => {
    bridge.current = fakeBridge({ getReadiness: readiness, setRunner: {}, listModels: [] })
    const p = props({ runner: 'claude' })
    mount(<RunnersPage {...p} />)
    const codex = await screen.findByRole('region', { name: 'Codex' })
    await waitFor(() => expect(within(codex).getByText('Not installed')).toBeTruthy())
    expect((within(codex).getByRole('button', { name: 'Use this runner' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(screen.getByRole('region', { name: 'Claude Code' })).getByRole('button', { name: 'In use' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(within(screen.getByRole('region', { name: 'OpenCode' })).getByRole('button', { name: 'Use this runner' }))
    await waitFor(() => expect(bridge.current.setRunner).toHaveBeenCalledWith('opencode'))
    expect(p.onChanged).toHaveBeenCalled()
  })
  it('model and helper model save through their own setters; bad ids are blocked', async () => {
    bridge.current = fakeBridge({ getReadiness: readiness, setModel: {}, setHelperModel: {}, listModels: [] })
    mount(<RunnersPage {...props({ models: { claude: 'opus' } })} />)
    const claude = await screen.findByRole('region', { name: 'Claude Code' })
    const model = within(claude).getByLabelText('Model') as HTMLInputElement
    expect(model.value).toBe('opus')
    await userEvent.clear(model)
    await userEvent.type(model, 'sonnet{Enter}')
    await waitFor(() => expect(bridge.current.setModel).toHaveBeenCalledWith('claude', 'sonnet'))
    const helper = within(claude).getByLabelText('Helper model')
    await userEvent.type(helper, 'bad id!')
    expect(within(claude).getByRole('alert').textContent).toMatch(/Letters, digits/)
    await userEvent.type(helper, '{Enter}')
    expect(bridge.current.setHelperModel).not.toHaveBeenCalled()
  })
  it('Test on an API runner runs the key test and shows its result', async () => {
    bridge.current = fakeBridge({ getReadiness: readiness, keysTest: { ok: true, latencyMs: 300, detail: 'Key accepted', at: Date.now() } })
    mount(<RunnersPage {...props({ hasApiKey: true })} />)
    const api = await screen.findByRole('region', { name: 'API key (OpenRouter)' })
    await userEvent.click(within(api).getByRole('button', { name: 'Test' }))
    expect(await within(api).findByText(/ok · 300 ms/)).toBeTruthy()
    expect(bridge.current.keysTest).toHaveBeenCalledWith('openrouter')
  })
})

describe('Local models page', () => {
  const stt = [
    { engine: 'whisper-mlx', model: 'small', sizeMb: 480, installed: false, devices: [], lastBenchmark: null, recommended: true },
    { engine: 'moonshine', model: 'small', sizeMb: 120, installed: true, devices: ['cpu'], lastBenchmark: null, recommended: false },
  ]
  const base = { localModelStatus: { installed: true, model: 'm', dir: '/d', platform: 'darwin', arch: 'arm64', python: null, oldPython: null, downloadGb: { packages: 1, weights: 1 }, installRun: null }, prescreenStatus: { available: true, model: null, labels: { pos: 1, neg: 2 } }, dataLocations: [{ id: 'models', label: 'Local models', path: '/home/me/.careerloom/models' }], diagnostics: { rows: [], memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 2 * 1024 ** 3 } }, copilotListSttModels: stt, copilotGetConfig: { stt: { engine: 'whisper-mlx' } }, revealPath: true }
  it('installs only for the configured engine, warns on low memory, reveals the folder', async () => {
    bridge.current = fakeBridge({ ...base, copilotInstallStt: { runId: 'r1' } })
    mount(<LocalModelsPage {...props()} />)
    expect(await screen.findByText(/2.0 GB free of 16.0 GB/)).toBeTruthy()
    expect(screen.getByText(/Memory is tight/)).toBeTruthy()
    const installs = await screen.findAllByRole('button', { name: 'Install' })
    expect(installs).toHaveLength(1)
    await userEvent.click(installs[0]!)
    await waitFor(() => expect(bridge.current.copilotInstallStt).toHaveBeenCalledWith('small'))
    await userEvent.click(screen.getByRole('button', { name: 'Show in Finder' }))
    expect(bridge.current.revealPath).toHaveBeenCalledWith('/home/me/.careerloom/models')
  })
  it('tolerates a speech module that is not wired yet', async () => {
    bridge.current = fakeBridge({ ...base, copilotListSttModels: { status: 'not-implemented' } })
    mount(<LocalModelsPage {...props()} />)
    expect(await screen.findByText(/not available in this build yet/)).toBeTruthy()
  })
})
