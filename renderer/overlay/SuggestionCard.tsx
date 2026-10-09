import type { Suggestion } from '../../electron/contract'
import { KbChip } from './KbChip'
import { OvIcon } from './OvIcon'

const FLAG_LABEL: Record<Suggestion['flags'][number]['kind'], string> = {
  'unsupported-number': 'Check this number',
  'unsupported-skill': 'Check this skill',
  'unsupported-name': 'Check this name',
}

/** Say first · Then cover · STAR skeleton (only real steps) · Proof · fact check. Streams: caret + shimmer rows. */
/** `compact`: only the headline (More detail is open under it). `onMore`: the More detail link in the answer's label row. */
export function SuggestionCard({ s, compact, onMore, moreKbd, note }: { s: Suggestion; compact?: boolean; onMore?: () => void; moreKbd?: string; note?: string | null }) {
  const streaming = !s.done && !(s.kind === 'detail' && note) // a note on the detail card means it failed where it broke off
  const { say, bullets, star, proof, flags } = s
  const detail = s.kind === 'detail'
  const noteEl = note ? <span className="more note" role="status" title={note}>{note}</span> : null
  const more = onMore && !detail ? <button type="button" className="more" onClick={onMore} title="Expand this answer with background and depth"><OvIcon name="more" size={12} />More detail{moreKbd ? <span className="kbd">{moreKbd}</span> : null}</button> : null
  if (compact && !detail) return <div className="sug compact"><div className="lbl"><OvIcon name="spark" size={12} />Say first</div><p className="say">{say}</p></div>
  return (
    <div className={`sug${detail ? ' detail' : ''}`} aria-live="polite" aria-busy={streaming}>
      <div className="lbl"><OvIcon name={detail ? 'more' : 'spark'} size={12} />{detail ? 'More detail · keep going with' : 'Say first'}{noteEl}{more}</div>
      <p className="say">{say}{streaming && bullets.length === 0 ? <span className="caret" /> : null}</p>
      {bullets.length > 0 || streaming ? (
        <>
          <div className="lbl">{detail ? 'Background and likely follow-ups' : 'Then cover'}</div>
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
      {s.kb?.length ? <KbChip items={s.kb} open={id => { void window.careerloom?.kbOpenSource(id) }} /> : null}
      {flags.map((f, i) => <div key={i} className="fc flag"><OvIcon name="warn" size={13} />{FLAG_LABEL[f.kind]}: {f.text}</div>)}
      {s.done && flags.length === 0 ? <div className="fc"><OvIcon name="shield" size={13} />Numbers checked against your résumé</div> : null}
    </div>
  )
}
