// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listIntegrations: vi.fn(), getIntegration: vi.fn(), integrationAction: vi.fn(), setIntegrationConfig: vi.fn(),
  browserAcks: vi.fn(), browserRevoke: vi.fn(),
}))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: new Proxy(api, { get: (t, k) => (k in t ? (t as never)[k] : () => new Promise(() => {})) }) }))
vi.mock('../../../lib/ipc', async orig => ({ ...(await orig<typeof import('../../../lib/ipc')>()), careerloom: new Proxy(api, { get: (t, k) => (k in t ? (t as never)[k] : () => new Promise(() => {})) }) }))
vi.mock('../../../hooks/useRuns', () => ({ useRuns: () => ({ generation: 0, adopt: () => {} }) }))

import { IntegrationsPage } from './Integrations'

const row = (id: string, kind: string, name: string, extra = {}) => ({ id, kind, name, summary: `${name} summary`, status: 'ready', statusText: 'Ready', installedBy: 'app', source: null, actions: ['check'], ...extra })
const detail = (id: string, kind: string, name: string, extra = {}) => ({ ...row(id, kind, name), checks: [], config: [], logTail: [], path: null, ...extra })

beforeEach(() => {
  Object.values(api).forEach(f => f.mockReset())
  api.listIntegrations.mockResolvedValue([
    row('service:firecrawl', 'service', 'Firecrawl (self-hosted)', { actions: ['start', 'check'] }),
    row('service:browser', 'service', 'Browser login'),
    row('skill:career-ops', 'skill', 'career-ops', { actions: ['check', 'update'] }),
    row('plugin:x', 'plugin', 'Plugin X', { status: 'needs_setup', statusText: 'Missing keys: X_KEY' }),
    row('source:acme', 'source', 'Acme'),
  ])
})

describe('IntegrationsPage', () => {
  it('lists services, skills and plugins; job sources are a link, not rows', async () => {
    render(<IntegrationsPage />)
    await screen.findByText('Firecrawl (self-hosted)')
    expect(screen.getByText('Plugin X')).toBeTruthy()
    expect(screen.queryByText('Acme')).toBeNull()
    expect(screen.getByRole('button', { name: /Job sources/ })).toBeTruthy()
  })

  it('filters by tab', async () => {
    render(<IntegrationsPage />)
    await screen.findByText('Plugin X')
    fireEvent.click(screen.getByRole('button', { name: /^Plugins/ }))
    expect(screen.queryByText('Browser login')).toBeNull()
    expect(screen.getByText('Plugin X')).toBeTruthy()
  })

  it('Firecrawl detail hides the key field and links to API keys', async () => {
    api.getIntegration.mockResolvedValue(detail('service:firecrawl', 'service', 'Firecrawl (self-hosted)', {
      actions: ['start', 'check'],
      config: [{ key: 'url', label: 'API URL', type: 'url', value: 'http://127.0.0.1:3002' }, { key: 'apiKey', label: 'API key (optional)', type: 'secret', value: 'set' }],
    }))
    const seen: unknown[] = []
    window.addEventListener('careerloom:navigate', e => seen.push((e as CustomEvent).detail))
    render(<IntegrationsPage />)
    fireEvent.click(await screen.findByText('Firecrawl (self-hosted)'))
    await screen.findByLabelText('API URL')
    expect(screen.queryByLabelText('API key (optional)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'API keys' }))
    expect(seen).toContainEqual({ section: 'settings', page: 'keys', focus: 'key:firecrawl' })
  })

  it('Browser login lists acknowledged sites and revokes after confirm', async () => {
    api.getIntegration.mockResolvedValue(detail('service:browser', 'service', 'Browser login'))
    api.browserAcks.mockResolvedValue(['linkedin.com'])
    api.browserRevoke.mockResolvedValue([])
    render(<IntegrationsPage />)
    fireEvent.click(await screen.findByText('Browser login'))
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke linkedin.com' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(api.browserRevoke).toHaveBeenCalledWith('linkedin.com'))
  })

  it('tolerates backend not implemented yet', async () => {
    api.getIntegration.mockResolvedValue(detail('service:browser', 'service', 'Browser login'))
    api.browserAcks.mockRejectedValue(new Error('browserAcks is not implemented yet'))
    render(<IntegrationsPage />)
    fireEvent.click(await screen.findByText('Browser login'))
    expect(await screen.findByText(/Couldn't load acknowledged sites yet/)).toBeTruthy()
  })

  it('Check career-ops runs the check action', async () => {
    api.integrationAction.mockResolvedValue({})
    render(<IntegrationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Check career-ops' }))
    await waitFor(() => expect(api.integrationAction).toHaveBeenCalledWith('skill:career-ops', 'check'))
  })

  it('focus=integration:firecrawl expands that row', async () => {
    api.getIntegration.mockResolvedValue(detail('service:firecrawl', 'service', 'Firecrawl (self-hosted)'))
    render(<IntegrationsPage focus="integration:firecrawl" />)
    await waitFor(() => expect(api.getIntegration).toHaveBeenCalledWith('service:firecrawl'))
  })
})
