// Pure drawing of every overlay state, strip and panel (prototype/js/overlay.js). Shared by the live overlay window
// and OverlayPreview; it holds no state and talks to nothing.
import './overlay.css'

import type { ReactNode } from 'react'

import { ActionRow, OvButton } from './ActionRow'
import { ListeningChip } from './ListeningChip'
import { Meter } from './Meter'
import { OvIcon } from './OvIcon'
import { ProblemPanel } from './ProblemPanel'
import { QuestionBanner, WaitingBanner } from './QuestionBanner'
import { SuggestionCard } from './SuggestionCard'
import { Transcript } from './Transcript'
import type { OverlayActions, OverlayViewData } from './types'

type P = { data: OverlayViewData; on: OverlayActions; theme: 'dark' | 'light'; fontPx?: number; widthPx?: number; opacity?: number
  /** AI-interviewer practice: the interviewer row + caption go above the cues, the controls below (the question banner is replaced by the caption). */
  interview?: { top: ReactNode; bottom: ReactNode } }

const inQuestion = (s: OverlayViewData['state']): boolean => s === 'question' || s === 'answering' || s === 'answered'
const Kbd = ({ k }: { k: string }) => <span className="kbd">{k}</span>

function StripMiddle({ d, on }: { d: OverlayViewData; on: OverlayActions }) {
  const expand = <button type="button" className="ib" aria-label="Expand panel" title={`Expand ${d.keys.expand}`} onClick={on.expand} disabled={!on.expand}><OvIcon name="expand" size={15} /></button>
  const q = d.question
  switch (d.state) {
    case 'idle': return <><div className="stripq"><span className="q mute">Start from Careerloom, or press <Kbd k={d.keys.listen} /></span></div><OvButton icon="play" label="Start" kbd={d.keys.listen} primary onClick={on.start} /></>
    case 'stopped': return <><div className="stripq"><span className="q mute">Capture is off. Transcript saved on this device.</span></div><OvButton icon="x" label="Delete now" onClick={on.deleteTranscript} /></>
    case 'question': case 'answering': case 'answered':
      return (
        <>
          <div className="stripq"><span className="tb">{q?.type ?? 'Question'}</span><span className="q">{q?.text ?? ''}</span></div>
          {d.state === 'answering'
            ? <button type="button" className="ab" disabled><OvIcon name="spark" />Answering…</button>
            : <OvButton icon="spark" label={d.state === 'answered' ? 'Re-answer' : 'Answer'} kbd={d.keys.answer} primary={d.state === 'question'} onClick={on.answer ? () => on.answer?.('answer') : undefined} />}
          {expand}
        </>
      )
    case 'error': return <><div className="stripq"><span className="tb bad">Offline</span><span className="q">Speech-to-text lost connection. Reconnecting…</span></div><OvButton icon="refresh" label="Retry" onClick={on.retry} /></>
    case 'permission': return <><div className="stripq"><span className="tb">{d.problem?.kind === 'mic' ? 'Mic silent' : 'System audio silent'}</span><span className="q">{d.problem?.kind === 'mic' ? 'Hearing the interviewer only. Fix the permission to be heard.' : 'Hearing you only. Fix the permission to hear the interviewer.'}</span></div><OvButton icon="cog" label="Fix…" onClick={on.fix} /></>
    default: return <><div className="stripq"><span className="q mute">Waiting for a question…</span><span className="q mute tail">{d.lines.at(-1)?.text ?? ''}</span></div>{expand}</>
  }
}

function Header({ d, on }: { d: OverlayViewData; on: OverlayActions }) {
  const strip = d.layout === 'strip'
  const off = d.state === 'idle' || d.state === 'stopped'
  const showMeter = !(strip && inQuestion(d.state))
  return (
    <div className="ov-h">
      <ListeningChip state={d.state} practice={d.practice} sys={d.sys} indicator={d.indicator} time={d.time} />
      {showMeter ? <Meter level={off ? 0 : d.levels.mic} /> : null}
      {strip ? <StripMiddle d={d} on={on} /> : (
        <>
          <span className="sp" />
          {off ? null : <span className="lat" title="Time to first visible line · cost this session">{d.latency} · {d.cost}</span>}
          <button type="button" className="ib" aria-label="Collapse to strip" title="Collapse" onClick={on.collapse} disabled={!on.collapse}><OvIcon name="expand" size={15} /></button>
        </>
      )}
      {off ? null : <button type="button" className="ib stop" aria-label="Stop and hide (panic)" title={`Stop now ${d.keys.panic}`} onClick={on.stop} disabled={!on.stop}><OvIcon name="stop" size={14} /></button>}
    </div>
  )
}

function Footer({ d }: { d: OverlayViewData }) {
  return (
    <div className="ov-f">
      <span className="m"><OvIcon name="mic" size={12} /><Meter level={d.levels.mic} bars={8} /></span>
      {d.sys
        ? <span className="m"><OvIcon name="speaker" size={12} /><Meter level={d.levels.system} bars={8} sys /></span>
        : <span className="m" style={{ color: 'var(--warn)' }}><OvIcon name="speaker" size={12} />off</span>}
      <span className="sp" />
      <span>{d.engine} · {d.tier}</span>
    </div>
  )
}

function Body({ d, on, hideQuestion }: { d: OverlayViewData; on: OverlayActions; hideQuestion?: boolean }) {
  const acts = <ActionRow keys={d.keys} screen={d.screen} on={{ answer: on.answer, screenshot: on.screenshot, fixScreen: on.fixScreen }} />
  const tr = <Transcript lines={d.lines} />
  const q = hideQuestion ? null : d.question
  switch (d.state) {
    case 'idle':
      return <div className="prob"><div className="h"><OvIcon name="mic" size={16} />Ready when you are</div><p>Nothing is recorded until you start. Start from Careerloom, or press <Kbd k={d.keys.listen} />.</p><div className="bt"><OvButton icon="play" label="Start" kbd={d.keys.listen} primary onClick={on.start} /></div></div>
    case 'listening':
      return <><WaitingBanner /><div className="sug plain"><div className="lbl"><OvIcon name="spark" size={12} />Suggestions appear here</div><p className="hint">Press <Kbd k={d.keys.answer} /> any time to answer the last thing said.</p></div>{acts}{tr}<Footer d={d} /></>
    case 'question':
      return <>{q ? <QuestionBanner type={q.type} text={q.text} /> : null}<div className="sug plain"><p className="hint">Looks like a question. Answer now, or keep listening for a follow-up.</p></div>{acts}{tr}<Footer d={d} /></>
    case 'answering': case 'answered':
      return <>{q ? <QuestionBanner type={q.type} text={q.text} /> : null}{d.suggestion ? <SuggestionCard s={d.suggestion} /> : null}{acts}{tr}<Footer d={d} /></>
    case 'error': case 'permission':
      return <>{d.problem ? <ProblemPanel problem={d.problem} on={on} /> : null}{tr}</>
    case 'stopped':
      return <div className="prob"><div className="h"><OvIcon name="check" size={16} />Capture stopped</div><p>Microphone and system audio are off. {d.savedMinutes > 0 ? `${d.savedMinutes} minutes of transcript are` : 'The transcript is'} saved on this device.</p><div className="bt"><OvButton icon="x" label="Delete transcript now" onClick={on.deleteTranscript} /><OvButton icon="history" label="Open debrief" onClick={on.openDebrief} /></div></div>
  }
}

export function OverlayView({ data: d, on, theme, fontPx, widthPx, opacity, interview }: P) {
  if (d.wiped) return <div className="ov" data-theme={theme} data-wiped hidden /> // quick hide: no text survives in the DOM
  const style = { '--ov-fs': fontPx ? `${fontPx}px` : undefined, '--ovw': widthPx ? `${widthPx}px` : undefined, opacity: d.passive ? undefined : opacity } as React.CSSProperties
  return (
    <div className={`ov${d.passive ? ' passive' : ''}`} data-state={d.state} data-layout={d.layout} data-theme={theme} style={style}>
      <div className="thread" />
      <Header d={d} on={on} />
      {d.layout === 'strip' ? null : <>{interview?.top}<Body d={d} on={on} hideQuestion={interview !== undefined} />{interview?.bottom}</>}
    </div>
  )
}
