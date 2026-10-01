// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))
const platform = vi.hoisted(() => ({ mac: true }))
vi.mock('@/lib/platform', async orig => ({ ...(await orig<typeof import('@/lib/platform')>()), isMacPlatform: () => platform.mac }))

import { DEFAULT_INTERVIEW_CONFIG } from '../../../../electron/kb/defaults'
import type { InterviewConfig, KeyInfo } from '../../../lib/types'
import { NAVIGATE_EVENT } from '../../../lib/nav'
import { REGISTRY } from '../settings-registry'
import { fakeBridge } from '../testKit'
import { InterviewPrepPage } from './InterviewPrep'

const key = (id: string, hasKey: boolean, tail: string | null): KeyInfo => ({ id, label: id, hasKey, tail, optional: true, usedBy: [], neededByRunners: [], helpUrl: null, formatHint: '', lastTest: null } as unknown as KeyInfo)
const merge = (b: InterviewConfig, p: Record<string, any>): InterviewConfig => ({ ...b, research: { ...b.research, ...p.research, search: { ...b.research.search, ...p.research?.search }, sources: { ...b.research.sources, ...p.research?.sources } }, voice: { ...b.voice, ...p.voice }, kb: { ...b.kb, ...p.kb } })
let stored: InterviewConfig
const mount = (impl: Record<string, unknown> = {}) => {
  bridge.current = fakeBridge({
    interviewConfig: () => Promise.resolve(stored),
    interviewSetConfig: (p: Record<string, any>) => Promise.resolve((stored = merge(stored, p))),
    keysList: [key('brave', true, '7f2a'), key('exa', false, null), key('serper', false, null)],
    interviewVoices: [{ engine: 'system', id: 'Aman', name: 'Aman (English India)', lang: 'en_IN', offline: true, installed: true, sizeMb: null, note: null }],
    interviewPreviewVoice: undefined,
    ...impl,
  })
  return render(<InterviewPrepPage />)
}
const saved = () => (bridge.current.interviewSetConfig as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])

beforeEach(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  platform.mac = true
  stored = structuredClone(DEFAULT_INTERVIEW_CONFIG)
})

describe('Interview prep settings', () => {
  it('shows the saved config in four groups', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Research' })).toBeInTheDocument()
    for (const g of ['Search and sources', 'Interviewer voice', 'Question bases']) expect(screen.getByRole('region', { name: g })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Standard', selected: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Cost limit in dollars')).toHaveValue('0.30')
  })

  it('depth and the agent-pass switch save a patch', async () => {
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Deep' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Extra agent pass' }))
    await waitFor(() => expect(saved()).toEqual([{ research: { depth: 'deep' } }, { research: { allowAgent: true } }]))
  })

  it('limits commit on blur, show the stored value, and flag out-of-range or non-numeric text without saving', async () => {
    mount()
    const cost = await screen.findByLabelText('Cost limit in dollars')
    for (const bad of ['99', 'lots']) {
      await userEvent.clear(cost); await userEvent.type(cost, bad); await userEvent.tab()
      expect(cost).toHaveAttribute('aria-invalid', 'true')
    }
    expect(saved()).toEqual([])
    await userEvent.clear(cost); await userEvent.type(cost, '1.5'); await userEvent.tab()
    await waitFor(() => expect(cost).toHaveValue('1.50'))
    expect(cost).not.toHaveAttribute('aria-invalid')
    expect(saved()).toEqual([{ research: { budgetUsd: 1.5 } }])
  })

  it('model: blank means the helper tier (null); an invalid id is not saved', async () => {
    mount()
    const model = await screen.findByLabelText('Model for reading pages')
    await userEvent.type(model, 'bad id!'); await userEvent.tab()
    expect(model).toHaveAttribute('aria-invalid', 'true')
    expect(saved()).toEqual([])
    await userEvent.clear(model); await userEvent.type(model, 'vendor/small-1'); await userEvent.tab()
    await waitFor(() => expect(saved()).toEqual([{ research: { model: 'vendor/small-1' } }]))
  })

  it('shows the provider key as set with its last four and links to API keys, never the key', async () => {
    mount()
    expect(await screen.findByText('Key set')).toBeInTheDocument()
    expect(screen.getByText(/last four 7f2a/)).toBeInTheDocument()
    const seen = vi.fn(); window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    await userEvent.click(screen.getByRole('button', { name: /Manage in API keys/ }))
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ section: 'settings', page: 'keys', focus: 'key:brave' }))
  })

  it('changing the provider saves it and says consent will be asked again', async () => {
    stored = merge(stored, { research: { consentVersion: 'v1' } })
    mount()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Search provider' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Exa' }))
    await waitFor(() => expect(saved()).toEqual([{ research: { search: { backend: 'exa' } } }]))
    expect(await screen.findByText(/ask you again before the next run/i)).toBeInTheDocument()
    expect(screen.getByText('No key')).toBeInTheDocument()
  })

  it('SearXNG shows a URL field that saves only https or loopback', async () => {
    stored = merge(stored, { research: { search: { backend: 'searxng' } } })
    mount()
    const url = await screen.findByLabelText('SearXNG address')
    await userEvent.type(url, 'http://search.example.org'); await userEvent.tab()
    expect(url).toHaveAttribute('aria-invalid', 'true')
    expect(saved()).toEqual([])
    await userEvent.clear(url); await userEvent.type(url, 'http://localhost:8080'); await userEvent.tab()
    await waitFor(() => expect(saved()).toEqual([{ research: { search: { searxngUrl: 'http://localhost:8080' } } }]))
  })

  it('allowed sources toggle one group; the never-read group is locked and cannot be enabled', async () => {
    mount()
    await userEvent.click(await screen.findByRole('checkbox', { name: /Stack Exchange/ }))
    await waitFor(() => expect(saved()).toEqual([{ research: { sources: { stackexchange: false } } }]))
    const locked = screen.getByRole('checkbox', { name: /Glassdoor, LeetCode, Reddit, Blind, LinkedIn/ })
    expect(locked).toBeDisabled(); expect(locked).not.toBeChecked()
    await userEvent.click(locked)
    expect(saved()).toHaveLength(1)
    expect(screen.getByText(/Never read automatically/)).toBeInTheDocument()
  })

  it('voice: lists installed voices, saves the pick, previews, and sets speakers or headphones', async () => {
    const preview = vi.fn().mockResolvedValue(undefined)
    mount({ interviewPreviewVoice: preview })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Voice' }))
    await userEvent.click(await screen.findByRole('option', { name: /Aman \(English India\)/ }))
    await waitFor(() => expect(saved()).toContainEqual({ voice: { engine: 'system', voiceId: 'Aman' } }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(preview).toHaveBeenCalledWith('system', 'Aman', 1)
    await userEvent.click(screen.getByRole('tab', { name: 'Headphones' }))
    await waitFor(() => expect(saved()).toContainEqual({ voice: { echo: 'headphones' } }))
  })

  it('voices not wired yet: the page still works and says so', async () => {
    mount({ interviewVoices: { status: 'not-implemented', method: 'interviewVoices' } })
    expect(await screen.findByText(/voices appear here once/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Speakers', selected: true })).toBeInTheDocument()
  })

  it('off macOS the voice group is replaced by a note and no voice call is made', async () => {
    platform.mac = false
    const voices = vi.fn()
    mount({ interviewVoices: voices })
    expect(await screen.findByText(/macOS only/)).toBeInTheDocument()
    expect(voices).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Research' })).toBeInTheDocument()
  })

  it('question bases: refresh and retention selects save', async () => {
    mount()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Suggest a refresh after' }))
    await userEvent.click(await screen.findByRole('option', { name: '60 days' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Keep question bases for' }))
    await userEvent.click(await screen.findByRole('option', { name: '90 days' }))
    await waitFor(() => expect(saved()).toEqual([{ research: { refreshAfterDays: 60 } }, { kb: { retentionDays: 90 } }]))
  })

  it('Reset restores every default after confirming', async () => {
    stored = merge(stored, { research: { depth: 'deep', budgetUsd: 1 }, voice: { echo: 'headphones' } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Reset to defaults…' }))
    expect(saved()).toEqual([])
    await userEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(saved()).toEqual([DEFAULT_INTERVIEW_CONFIG]))
    expect(screen.getByRole('tab', { name: 'Standard', selected: true })).toBeInTheDocument()
  })

  it('a config error shows a note instead of crashing', async () => {
    mount({ interviewConfig: () => Promise.reject(new Error('disk full')) })
    expect(await screen.findByText(/disk full/)).toBeInTheDocument()
  })

  it('every Interview prep deep link has a registry entry and a target on the page', async () => {
    mount()
    await screen.findByRole('region', { name: 'Research' })
    const ids = REGISTRY.filter(e => e.page === 'interview-prep' && e.focus).map(e => e.focus!)
    expect(ids.length).toBeGreaterThanOrEqual(5)
    for (const id of ids) expect(document.querySelector(`[data-setting-id="${id}"]`), id).not.toBeNull()
  })
})
