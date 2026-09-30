import { FileText, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { SessionDetail } from '@/lib/types'
import { errorText } from './api'
import { Group } from './Group'
import { TYPE_LABEL, TYPE_TONE } from './sessionsFormat'

/** "Improve this answer": one tip per question; Apply is always an explicit click and never touches the résumé itself. */
export function AnswerReview({ session, onTranscript }: { session: SessionDetail; onTranscript: () => void }) {
  const notes = session.scorecard?.notes ?? []
  const [i, setI] = useState(0)
  const note = notes[Math.min(i, notes.length - 1)]
  const question = note ? session.questionsList.find(q => q.id === note.questionId) : undefined

  async function apply(action: 'resume-bullet' | 'job-note'): Promise<void> {
    if (!note) return
    try {
      const r = await careerloom.copilotApplyDebrief(session.id, note.questionId, action)
      showToast(r.ok ? (action === 'job-note' ? 'Saved to the job notes' : 'Staged as a résumé bullet. Review it on the Resume page.') : 'That line was not added: it needs a fact from your résumé', r.ok ? 'ok' : 'error')
    } catch (e) { showToast(errorText(e), 'error') }
  }

  return (
    <Group title="Improve this answer" action={question && <Badge variant={TYPE_TONE[question.type]}>{TYPE_LABEL[question.type]}</Badge>}>
      {!note ? <p className="m-0 text-sm text-muted-foreground">{session.scorecard ? 'No tips for this session.' : 'Tips appear once the session is scored.'}</p> : (
        <div className="grid gap-2">
          {question?.text && <p className="m-0 text-sm text-muted-foreground">“{question.text}”</p>}
          <div role="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{note.tip}</span></div>
          {note.suggestedLine && <div role="note" className="flex items-start gap-2 rounded-lg border border-(--status-task-done)/40 bg-(--status-task-done)/10 p-3 text-sm"><FileText className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b>Stronger résumé line.</b> “{note.suggestedLine}”</span></div>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {note.suggestedLine && <Button size="sm" onClick={() => { void apply('resume-bullet') }}><Plus className="size-3.5" aria-hidden />Add to résumé bullets</Button>}
            <Button size="sm" variant="outline" onClick={() => { void apply('job-note') }}>Save to job notes</Button>
            <Button size="sm" variant="ghost" onClick={onTranscript}>View transcript</Button>
            {notes.length > 1 && <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous tip">‹</Button>{Math.min(i, notes.length - 1) + 1} / {notes.length}
              <Button size="sm" variant="ghost" disabled={i >= notes.length - 1} onClick={() => setI(i + 1)} aria-label="Next tip">›</Button></span>}
          </div>
        </div>
      )}
    </Group>
  )
}
