import { useState } from 'react'

import { goalProgress, parseTarget } from '../../lib/overviewData'

const KEY = 'careerloom.overview.weeklyGoal'
const R = 40
const C = 2 * Math.PI * R

export function loadTarget(): number | null {
  try { return parseTarget(localStorage.getItem(KEY)) } catch { return null }
}

/** Optional weekly applications target with a progress ring; stored on this device. */
export function Goal({ done }: { done: number }) {
  const [target, setTarget] = useState<number | null>(loadTarget)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const save = () => {
    const n = parseTarget(draft)
    if (n === null) return
    try { localStorage.setItem(KEY, String(n)) } catch { /* storage can be unavailable */ }
    setTarget(n); setEditing(false)
  }
  const clear = () => { try { localStorage.removeItem(KEY) } catch { /* storage can be unavailable */ } setTarget(null); setEditing(false) }

  if (target === null || editing) {
    return (
      <form className="ovx-goal-form" onSubmit={e => { e.preventDefault(); save() }}>
        <label htmlFor="ovx-goal-input">Applications per week</label>
        <div>
          <input id="ovx-goal-input" className="ovx-input" inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value)} placeholder={target ? String(target) : 'e.g. 5'} aria-invalid={draft !== '' && parseTarget(draft) === null} />
          <button type="submit" className="btnp btnp-primary" disabled={parseTarget(draft) === null}>Set goal</button>
          {target !== null && <button type="button" className="btnp" onClick={clear}>Remove</button>}
        </div>
        <small>1 to 100. Counts applications dated this week (Monday to Sunday).</small>
      </form>
    )
  }
  const p = goalProgress(done, target)
  return (
    <div className="ovx-goal">
      <svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label={`${done} of ${target} applications this week`}>
        <circle cx="50" cy="50" r={R} className="ovx-ring-bg" />
        <circle cx="50" cy="50" r={R} className="ovx-ring" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 50 50)" />
        <text x="50" y="50" textAnchor="middle" className="ovx-ring-n">{done}</text>
        <text x="50" y="66" textAnchor="middle" className="ovx-ring-s">of {target}</text>
      </svg>
      <div>
        <b>{done >= target ? 'Weekly goal met' : `${target - done} to go this week`}</b>
        <button type="button" className="ovx-link" onClick={() => { setDraft(String(target)); setEditing(true) }}>Change goal</button>
      </div>
    </div>
  )
}
