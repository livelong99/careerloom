// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AtsFinding, ScoreBlock } from '../../lib/types'
import { FindingRow, type PreviewState } from './FindingRow'
import { ScoreCard } from './ScoreCard'

afterEach(cleanup)

const BLOCK: ScoreBlock = {
  score: 61, low: 55, high: 67, confidence: 'medium',
  parts: [{ id: 'coverage', label: 'Skill coverage', got: 20, max: 35, evidence: '7 of 11 skills found' }],
  caps: [{ id: 'ceiling', max: 97, reason: 'A keyword heuristic cannot certify a perfect match' }, { id: 'missing-required', max: 79, reason: '1 required skill is missing' }],
}

describe('ScoreCard', () => {
  it('always shows the heuristic label, the range and the confidence; a ceiling is a note, a real cap is an alert', () => {
    render(<ScoreCard title="Job match" block={BLOCK} label="A parse-risk heuristic" note="Install the local model for +accuracy" />)
    expect(screen.getByText(/A parse-risk heuristic/)).toBeTruthy()
    expect(screen.getByText(/Install the local model for \+accuracy/)).toBeTruthy()
    expect(screen.getByText('range 55–67')).toBeTruthy()
    expect(screen.getByText('medium confidence')).toBeTruthy()
    expect(screen.getByText(/Never scores above 97/)).toBeTruthy()
    expect(screen.getByText('Capped at 79')).toBeTruthy()
    expect(screen.queryByText('Capped at 97')).toBeNull()
    expect(screen.getByText('20 / 35')).toBeTruthy()
  })
})

const finding = (over: Partial<AtsFinding> = {}): AtsFinding => ({
  id: 'f1', severity: 'major', category: 'skill', title: 'Kafka is missing', detail: 'Add it if you have used it.', status: 'open',
  apply: { op: 'append', target: 'Skills', after: '- Kafka', requires_answers: ['have:Kafka'] }, ...over,
})
const OK: PreviewState = { state: 'ok', preview: { diff: { before: 'a', after: 'a\n- Kafka' }, factCheck: { ok: true, violations: [] } } }
const setup = (f: AtsFinding, preview: PreviewState | undefined, onApply = vi.fn(async (): Promise<string | null> => null)) => {
  const onPreview = vi.fn()
  render(<FindingRow f={f} preview={preview} questions={[]} undoId={null} busy={false} onPreview={onPreview} onApply={onApply} onSkip={vi.fn()} onUndo={vi.fn(async () => null)} onGoContent={vi.fn()} />)
  return { onApply, onPreview }
}

describe('FindingRow', () => {
  it('Answer first: the change is hidden and Apply stays disabled until the user confirms and previews', async () => {
    const { onPreview } = setup(finding(), { state: 'needs', unmet: ['have:Kafka'] })
    expect(screen.getByText('Answer first')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Show the change' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /No, not yet/ }))
    expect((screen.getByRole('button', { name: 'Show the change' }) as HTMLButtonElement).disabled).toBe(true) // "no" is not an answer that unlocks it
    fireEvent.click(screen.getByRole('radio', { name: /Yes, I have used it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Show the change' }))
    expect(onPreview).toHaveBeenCalledWith([{ id: 'have:Kafka', value: 'yes' }])
  })

  it('a passed preview shows before/after and the fact check, and Apply sends the answers', async () => {
    const { onApply } = setup(finding({ apply: { op: 'replace', target: 'x', after: 'y', requires_answers: [] } }), OK)
    expect(screen.getByText('Before')).toBeTruthy()
    expect(screen.getByText(/Fact check passed/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([], false))
  })

  it('fact-check violations block Apply until the user explicitly overrides', async () => {
    const bad: PreviewState = { state: 'ok', preview: { diff: { before: 'a', after: 'b' }, factCheck: { ok: false, violations: ['The skill "Kafka" is not in your résumé or your answers'] } } }
    const { onApply } = setup(finding({ apply: { op: 'replace', target: 'x', after: 'y', requires_answers: [] } }), bad)
    expect(screen.getByText(/The skill "Kafka"/)).toBeTruthy()
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(apply.disabled).toBe(false)
    fireEvent.click(apply)
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([], true))
  })

  it('advice-only findings offer no Apply; an apply error stays inline (not a toast)', async () => {
    setup(finding({ apply: undefined }), undefined)
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    expect(screen.getByText(/No automatic change/)).toBeTruthy()
    cleanup()
    setup(finding({ apply: { op: 'replace', target: 'x', after: 'y', requires_answers: [] } }), OK, vi.fn(async () => 'Conflict: your résumé changed'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Conflict/))
  })

  it('applied findings can be undone; the rebuild-profile action has its own label', async () => {
    const onUndo = vi.fn(async () => null)
    render(<FindingRow f={finding({ status: 'applied' })} preview={undefined} questions={[]} undoId="u1" busy={false} onPreview={vi.fn()} onApply={vi.fn(async () => null)} onSkip={vi.fn()} onUndo={onUndo} onGoContent={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith('u1'))
    cleanup()
    setup(finding({ apply: { op: 'rebuild-profile', target: '', after: '', requires_answers: [] } }), OK)
    expect(screen.getByRole('button', { name: 'Rebuild template data' })).toBeTruthy()
  })
})
