// Ring gauge for the ATS score, geometry/classes reused from codeburn's Overview
// (.ov-gauge*, .ov-grade). ponytail: no GSAP sweep-in — a static arc is one line
// simpler and this reads on demand, not on every poll tick; add motion.ts easing
// back if the static jump reads as broken.
const BOX = 96
const STROKE = 10
const RADIUS = (BOX - STROKE) / 2
const LENGTH = 2 * Math.PI * RADIUS

function gradeTone(grade: string): 'grade-ok' | 'grade-warn' | 'grade-bad' {
  if (grade.startsWith('A') || grade.startsWith('B')) return 'grade-ok'
  if (grade.startsWith('C')) return 'grade-warn'
  return 'grade-bad'
}

export function AtsGauge({ score, grade }: { score: number; grade: string }) {
  const offset = LENGTH * (1 - Math.max(0, Math.min(1, score / 100)))
  return (
    <div className="ov-gauge">
      <div className="ov-gauge-ring">
        <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
          <circle className="ov-gauge-track" cx={BOX / 2} cy={BOX / 2} r={RADIUS} />
          <circle
            className="ov-gauge-arc"
            cx={BOX / 2}
            cy={BOX / 2}
            r={RADIUS}
            strokeDasharray={LENGTH}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${BOX / 2} ${BOX / 2})`}
          />
        </svg>
        <div className="ov-gauge-face">
          <strong className="ov-gauge-score">{Math.round(score)}</strong>
          <span className="ov-gauge-cap">/100</span>
        </div>
      </div>
      <span className={`ov-grade ${gradeTone(grade)}`}>{grade}</span>
    </div>
  )
}
