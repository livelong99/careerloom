import type { Suggestion } from '../../electron/contract'
import { OvIcon } from './OvIcon'

const FLAG_LABEL: Record<Suggestion['flags'][number]['kind'], string> = {
  'unsupported-number': 'Check this number',
  'unsupported-skill': 'Check this skill',
  'unsupported-name': 'Check this name',
}

/** Say first · Then cover · STAR skeleton (only real steps) · Proof · fact check. Streams: caret + shimmer rows. */
export function SuggestionCard({ s }: { s: Suggestion }) {
  const streaming = !s.done
  const { say, bullets, star, proof, flags } = s
  return (
    <div className="sug" aria-live="polite" aria-busy={streaming}>
      <div className="lbl"><OvIcon name="spark" size={12} />Say first</div>
      <p className="say">{say}{streaming && bullets.length === 0 ? <span className="caret" /> : null}</p>
      {bullets.length > 0 || streaming ? (
        <>
          <div className="lbl">Then cover</div>
          <ul>
            {bullets.map((b, i) => <li key={i}>{b}{streaming && i === bullets.length - 1 ? <span className="caret" /> : null}</li>)}
            {streaming && bullets.length < 3 ? <li className="pend">.</li> : null}
          </ul>
        </>
      ) : null}
      {star ? (
        <details className="stard" open={streaming}>
          <summary><OvIcon name="right" size={12} />STAR skeleton<span>Situation · Task · Action · Result</span></summary>
          <div className="star">
            {([['S', star.s], ['T', star.t], ['A', star.a], ['R', star.r]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><b>{k}</b><span>{v}</span></div>)}
          </div>
        </details>
      ) : null}
      {proof.length > 0 ? (
        <>
          <div className="lbl">Proof from your résumé</div>
          <div className="proof">{proof.map((p, i) => <div key={i} className="pf"><q>{p.quote}</q><small><OvIcon name="file" size={11} />{p.source}</small></div>)}</div>
        </>
      ) : null}
      {flags.map((f, i) => <div key={i} className="fc flag"><OvIcon name="warn" size={13} />{FLAG_LABEL[f.kind]}: {f.text}</div>)}
      {s.done && flags.length === 0 ? <div className="fc"><OvIcon name="shield" size={13} />Numbers checked against your résumé</div> : null}
    </div>
  )
}
