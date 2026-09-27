import type { ReactNode } from 'react'

// Ring geometry from codeburn's Overview.tsx RingGauge (96px box, 10px stroke).
const GAUGE_BOX = 96
const GAUGE_STROKE = 10
const GAUGE_RADIUS = (GAUGE_BOX - GAUGE_STROKE) / 2
const GAUGE_LENGTH = 2 * Math.PI * GAUGE_RADIUS

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function grade(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: 'A', tone: 'var(--ok)' }
  if (score >= 65) return { label: 'B', tone: 'var(--ok)' }
  if (score >= 45) return { label: 'C', tone: 'var(--warn)' }
  return { label: 'D', tone: 'var(--bad)' }
}

function Row({ label, value, fraction }: { label: string; value: ReactNode; fraction: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px] text-[var(--mut)]">
        <span>{label}</span>
        <strong className="text-[var(--ink)]">{value}</strong>
      </div>
      <div className="h-1 rounded-full bg-[var(--fill)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${clamp(fraction, 0, 1) * 100}%` }} /></div>
    </div>
  )
}

const PROFILE_WEIGHT = 0.34
const APPLY_WEIGHT = 0.33
const SUCCESS_WEIGHT = 0.33

/**
 * "Search health" composite: profile completeness + apply rate + run success
 * rate, equally weighted. `successRate` is null before any run has happened —
 * that's "no data", not a 0% failure, so it's dropped from the score (and its
 * row shows "—") rather than dragging it down. ponytail: static ring (skipped
 * codeburn's gsap sweep-in), add useGSAP if the animated reveal is wanted later.
 */
export function HealthGauge({ profileFraction, applyRate, successRate }: { profileFraction: number; applyRate: number; successRate: number | null }) {
  const weighted = clamp(profileFraction, 0, 1) * PROFILE_WEIGHT + clamp(applyRate, 0, 1) * APPLY_WEIGHT
    + (successRate === null ? 0 : clamp(successRate, 0, 1) * SUCCESS_WEIGHT)
  const totalWeight = PROFILE_WEIGHT + APPLY_WEIGHT + (successRate === null ? 0 : SUCCESS_WEIGHT)
  const score = 100 * (weighted / totalWeight)
  const { label, tone } = grade(score)
  const offset = GAUGE_LENGTH * (1 - clamp(score / 100, 0, 1))

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: GAUGE_BOX, height: GAUGE_BOX }}>
        <svg viewBox={`0 0 ${GAUGE_BOX} ${GAUGE_BOX}`} aria-hidden="true">
          <circle cx={GAUGE_BOX / 2} cy={GAUGE_BOX / 2} r={GAUGE_RADIUS} fill="none" stroke="var(--fill)" strokeWidth={GAUGE_STROKE} />
          <circle
            cx={GAUGE_BOX / 2} cy={GAUGE_BOX / 2} r={GAUGE_RADIUS} fill="none" stroke={tone} strokeWidth={GAUGE_STROKE}
            strokeLinecap="round" strokeDasharray={GAUGE_LENGTH} strokeDashoffset={offset}
            transform={`rotate(-90 ${GAUGE_BOX / 2} ${GAUGE_BOX / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-[22px] leading-none text-[var(--ink)]">{Math.round(score)}</strong>
          <span className="text-xs text-[var(--mut)]">/100 · {label}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        <Row label="Profile complete" value={`${Math.round(profileFraction * 100)}%`} fraction={profileFraction} />
        <Row label="Apply rate" value={`${Math.round(applyRate * 100)}%`} fraction={applyRate} />
        <Row label="Run success rate" value={successRate === null ? '—' : `${Math.round(successRate * 100)}%`} fraction={successRate ?? 0} />
      </div>
    </div>
  )
}
