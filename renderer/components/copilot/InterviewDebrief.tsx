import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { careerloom } from '@/lib/ipc'
import type { KbItemView, KbSummary, SessionDetail } from '@/lib/types'
import { orNull, useAsync } from './api'
import { Group } from './Group'
import { AXES, heatRows, weakestEvidence } from './heatmap'

const clip = (s: string, n = 70): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const load = async <T,>(f: () => Promise<T | { status: 'not-implemented' }>): Promise<T | null> => { try { return orNull(await f() as T) } catch { return null } }

/** Per-question rubric rows and the skill heat map for a practice session with the AI interviewer. Scores are rough estimates and say so. */
export function InterviewDebrief({ session }: { session: SessionDetail }) {
  const rec = session.interview
  const kb = useAsync(async () => ({ items: await load<KbItemView[]>(() => careerloom.kbList(session.jobId)), summary: await load<KbSummary>(() => careerloom.kbSummary(session.jobId)) }), [session.jobId]).data
  const text = (id: string): string => session.questionsList.find(q => q.id === id)?.text ?? kb?.items?.find(i => i.id === id)?.text ?? 'Question'
  const labelsOf = useMemo(() => {
    const names = new Map((kb?.summary?.coverage ?? []).map(c => [c.skillId, c.name]))
    const skills = new Map((kb?.items ?? []).map(i => [i.id, i.skills.map(s => names.get(s) ?? s)]))
    return (id: string): string[] => { const s = skills.get(id); return s && s.length ? s : [clip(text(id))] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb, session])
  if (!rec || rec.perQuestion.length === 0) return null
  const rows = heatRows(rec.perQuestion, labelsOf)
  const origin = (id: string): KbItemView['provenance'] | null => kb?.items?.find(i => i.id === id)?.provenance ?? null
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Group title="Questions" action={<span className="text-xs text-muted-foreground">Scores are rough AI estimates of the content.</span>}>
        <ul className="m-0 grid list-none gap-2 p-0">
          {rec.perQuestion.map(r => {
            const w = weakestEvidence(r)
            const o = origin(r.itemId)
            return (
              <li key={r.itemId} className="flex items-start gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-medium text-foreground">{text(r.itemId)}</p>
                  <p className="m-0 text-xs text-muted-foreground">{r.skipped ? 'Skipped' : w ? `“${w.evidence}” (${w.criterion})` : 'No evidence quote'}{r.hintUsed ? ' · hint used' : ''}</p>
                </div>
                {o && <Badge variant={o === 'sourced' ? 'success' : o === 'generated' ? 'warn' : 'info'}>{o === 'sourced' ? 'Sourced' : o === 'generated' ? 'Generated' : 'Yours'}</Badge>}
                <b className="w-8 text-right text-sm tabular-nums" aria-label="Score">{r.score === null ? '–' : r.score.toFixed(1)}</b>
              </li>
            )
          })}
        </ul>
      </Group>
      <Group title="Skill heat map">
        {rows.length === 0 ? <p className="m-0 text-sm text-muted-foreground">No scored answers yet.</p> : (
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead><tr><th className="text-left text-xs font-medium text-muted-foreground"><span className="sr-only">Skill</span></th>{AXES.map(a => <th key={a} className="text-xs font-medium text-muted-foreground">{a}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label}>
                  <th scope="row" className="text-left text-sm font-normal">{r.label}</th>
                  {r.cells.map((c, i) => (
                    <td key={AXES[i]} className="rounded-md py-1.5 text-center tabular-nums" style={{ background: c === null ? 'transparent' : `color-mix(in srgb, var(--color-primary) ${Math.round(18 + ((c - 1) / 4) * 62)}%, transparent)` }} aria-label={`${r.label} ${AXES[i]}: ${c ?? 'not scored'}`}>{c === null ? '–' : c.toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="m-0 mt-2 text-xs text-muted-foreground">Lighter cells need more work. Every cell shows its number.</p>
      </Group>
    </div>
  )
}
