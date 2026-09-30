import { OvButton } from './ActionRow'
import { OvIcon } from './OvIcon'
import type { OverlayActions, OverlayProblem } from './types'

const PANE: Record<'system' | 'mic', { title: string; body: string; steps: string[] }> = {
  system: {
    title: 'System audio is silent',
    body: "The interviewer can't be heard, so questions won't be detected. The microphone still works.",
    steps: ['Open System Settings → Privacy & Security.', 'Turn on Careerloom under “System Audio Recording”.', 'Quit and reopen Careerloom.'],
  },
  mic: {
    title: 'The microphone is silent',
    body: "You can't be heard. The interviewer side, if captured, still works.",
    steps: ['Open System Settings → Privacy & Security → Microphone.', 'Turn on Careerloom.', 'Quit and reopen Careerloom.'],
  },
}

export function ProblemPanel({ problem, on }: { problem: OverlayProblem; on: OverlayActions }) {
  if (problem.kind === 'stt') {
    return (
      <div className="prob bad">
        <div className="h"><OvIcon name="warn" size={16} />Speech-to-text disconnected</div>
        <p>{problem.message ?? `Retrying${problem.attempt ? ` (attempt ${problem.attempt} of 5)` : ''}. Your transcript so far is kept. Your microphone is still being captured, and nothing is lost.`}</p>
        <div className="bt"><OvButton icon="refresh" label="Retry now" onClick={on.retry} /><OvButton icon="cog" label="Switch to on-device" onClick={on.switchOnDevice} /></div>
      </div>
    )
  }
  if (problem.kind === 'error') {
    return <div className="prob bad"><div className="h"><OvIcon name="warn" size={16} />{problem.title ?? 'Something went wrong'}</div><p>{problem.message ?? 'Capture keeps running. Stop now if you want to be safe.'}</p></div>
  }
  const p = PANE[problem.kind]
  return (
    <div className="prob warn">
      <div className="h"><OvIcon name="warn" size={16} />{p.title}</div>
      <p>{p.body}</p>
      <ol>{p.steps.map(s => <li key={s}>{s}</li>)}</ol>
      <div className="bt"><OvButton icon="ext" label="Open System Settings" primary onClick={on.fix} /><OvButton icon="mic" label="Continue with mic only" onClick={on.micOnly} /></div>
    </div>
  )
}
