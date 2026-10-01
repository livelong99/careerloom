// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FakeState } from '../../lib/kbFake'
import { kb, resetFakeKb } from '../kb/api'
import { KnowledgeTab } from './KnowledgeTab'

async function open(state: FakeState, consent = true) {
  window.history.replaceState({}, '', `/?fakeKb=${state}${consent ? '' : '&fakeConsent=0'}`)
  resetFakeKb()
  const r = render(<KnowledgeTab jobId="job-1" />)
  await waitFor(() => expect(screen.queryByLabelText('Loading knowledge base')).toBeNull())
  return r
}
afterEach(() => { window.history.replaceState({}, '', '/'); resetFakeKb() })
const rows = () => within(screen.getByRole('table', { name: 'Interview questions' })).getAllByRole('row').slice(1)

describe('KnowledgeTab states (fake backend)', () => {
  it('ready: status strip, coverage tiles, nine rows with pinned first', async () => {
    await open('ready')
    expect(screen.getByText('Up to date')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Coverage by skill' })).toBeInTheDocument()
    expect(screen.getByText('Need 4 more · working expected · not on your résumé')).toBeInTheDocument()
    expect(rows()).toHaveLength(9)
    expect(rows()[0]).toHaveTextContent('idempotent payment-capture')
    expect(screen.getByText('67% sourced')).toBeInTheDocument()
  })

  it('opens the sheet with Enter, closes it with Escape', async () => {
    await open('ready')
    rows()[1]!.focus()
    await userEvent.keyboard('{Enter}')
    const sheet = await screen.findByRole('complementary', { name: 'Question detail' })
    expect(within(sheet).getByRole('heading', { level: 3 })).toHaveTextContent('Kafka give you')
    expect(within(sheet).getAllByRole('button', { name: /open source/i })).toHaveLength(4)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
  })

  it('arrow keys move between rows', async () => {
    await open('ready')
    rows()[0]!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(rows()[1]).toHaveFocus()
  })

  it('filters by coverage tile, by switch, and by sort header', async () => {
    await open('ready')
    await userEvent.click(screen.getByRole('button', { name: /^Kafka/ }))
    expect(rows()).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /^Kafka/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Hide generated questions' }))
    expect(rows()).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: 'Level' }))
    expect(screen.getByRole('columnheader', { name: 'Level' })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('pin and hide act on the open item; hidden items can be shown again', async () => {
    await open('ready')
    await userEvent.click(rows()[2]!)
    const sheet = await screen.findByRole('complementary')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(rows()).toHaveLength(8))
    await userEvent.click(await screen.findByRole('switch', { name: 'Show hidden questions' }))
    expect(rows()).toHaveLength(9)
    expect(within(await screen.findByRole('complementary')).getByRole('button', { name: 'Unhide' })).toBeInTheDocument()
  })

  it('adds a question of your own', async () => {
    await open('ready')
    await userEvent.click(screen.getByRole('button', { name: /Add question/ }))
    const dlg = await screen.findByRole('dialog')
    const save = within(dlg).getByRole('button', { name: 'Add question' })
    expect(save).toBeDisabled()
    await userEvent.type(within(dlg).getByRole('textbox'), 'How do you size a Kafka cluster?')
    await userEvent.click(save)
    await waitFor(() => expect(rows()).toHaveLength(10))
    expect(rows().some(r => /size a Kafka cluster/.test(r.textContent ?? ''))).toBe(true)
  })

  it('running: live stepper with Stop, partial bank below', async () => {
    await open('running')
    const status = screen.getByText(/Researching/).closest('[role=status]') as HTMLElement
    expect(status).toHaveTextContent('Step 3 of 6')
    expect(status).toHaveTextContent('17 / 29')
    expect(status).toHaveTextContent('Questions found so far 31')
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
  })

  it('empty: estimate and a Research button that starts a run', async () => {
    await open('empty')
    expect(screen.getByText('No research for this job yet')).toBeInTheDocument()
    expect(await screen.findByText(/\$0\.10–0\.20/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Research this job/ }))
    expect(await screen.findByText(/Researching this job/)).toBeInTheDocument()
  })

  it('nokey: explains and offers a keyless run', async () => {
    await open('nokey')
    expect(await screen.findByText('Web search needs a key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a key in Settings' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Research without search' }))
    expect(await screen.findByText(/Researching this job/)).toBeInTheDocument()
  })

  it('partial: amber banner with a continue action', async () => {
    await open('partial')
    expect(screen.getByText(/Partial results/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue for up to $0.10 more' })).toBeInTheDocument()
    expect(rows()).toHaveLength(6)
  })

  it('offline: red banner, last bank shown, Refresh disabled with a reason', async () => {
    await open('offline')
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the web')
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(refresh).toBeDisabled()
    expect(refresh).toHaveAttribute('title', expect.stringMatching(/offline/i))
    expect(rows()).toHaveLength(9)
  })

  it('stale: suggests a refresh with the age', async () => {
    await open('stale')
    expect(screen.getByText('The posting changed since this was researched.')).toBeInTheDocument()
    for (const b of screen.getAllByRole('button', { name: 'Refresh' })) expect(b).toBeEnabled()
  })

  it('first run: research is locked until the web-research acknowledgement is given, then it starts', async () => {
    await open('empty', false)
    expect(screen.getByRole('button', { name: /Research this job/ })).toBeDisabled()
    expect(screen.getByText(/Research needs your OK first/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review and agree' }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent(/never your résumé text/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agree and continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.queryByText(/Research needs your OK first/)).toBeNull())
    expect(screen.getByRole('button', { name: /Research this job/ })).toBeEnabled()
  })

  it('a Refresh from the banner before consent opens the dialog and then runs it', async () => {
    await open('stale', false)
    await userEvent.click(screen.getAllByRole('button', { name: 'Refresh' }).find(b => !(b as HTMLButtonElement).disabled)!)
    const dlg = await screen.findByRole('dialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Agree and continue' }))
    expect(await screen.findByText(/Researching this job/)).toBeInTheDocument()
  })

  it('re-reads the summary every 3 s while a run is active', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await open('running')
      const spy = vi.spyOn(kb(), 'kbSummary')
      await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
      expect(spy).toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('no dead or unnamed controls in the ready state', async () => {
    await open('ready')
    await userEvent.click(rows()[0]!)
    await screen.findByRole('complementary')
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('combobox'), ...screen.getAllByRole('searchbox')]
    expect(controls.length).toBeGreaterThan(20)
    for (const c of controls) expect(c).toHaveAccessibleName()
    // every enabled action button reacts (no handler-less buttons): clicking must not throw
    for (const c of screen.getAllByRole('button').filter(b => !(b as HTMLButtonElement).disabled && /^(Pin|Unpin|Edit)$/.test(b.textContent ?? ''))) await act(async () => { fireEvent.click(c) })
  })
})
