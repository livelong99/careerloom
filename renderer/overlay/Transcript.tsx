import type { OverlayLine } from './types'

/** Last few lines with speaker labels. Not a live region: the screen reader follows the answer, not the audio. */
export function Transcript({ lines }: { lines: OverlayLine[] }) {
  if (lines.length === 0) return null
  return (
    <div className="tr" aria-live="off">
      {lines.map(l => (
        <div key={l.id} className={`ln ${l.who === 'You' ? 'you' : 'them'}${l.partial ? ' partial' : ''}`}>
          <span className="w">{l.who}</span><span className="s">{l.text}</span>
        </div>
      ))}
    </div>
  )
}
