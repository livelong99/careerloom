// Ported from Open-Cluely (owner's project), adapted for Careerloom: renderer/features/layout/window-adjustments.js.
// A drag handle on the panel's corner; the width is saved to copilot.json on release and main resizes the window.
import { useRef } from 'react'

export const PANEL_MIN = 360
export const PANEL_MAX = 560 // the window's own limits (overlay-window.ts PANEL_WIDTH)
export const clampWidth = (w: number): number => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(w)))

type Props = { width: number; onPreview(width: number): void; onCommit(width: number): void }

export function ResizeGrip({ width, onPreview, onCommit }: Props) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null)
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label="Resize overlay" aria-valuenow={width} aria-valuemin={PANEL_MIN} aria-valuemax={PANEL_MAX} tabIndex={0}
      className="ov-grip"
      onPointerDown={e => { drag.current = { x: e.clientX, w: width, last: width }; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        d.last = clampWidth(d.w + e.clientX - d.x)
        onPreview(d.last)
      }}
      onPointerUp={e => {
        const d = drag.current
        drag.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        if (d) onCommit(d.last)
      }}
      onKeyDown={e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onCommit(clampWidth(width + (e.key === 'ArrowRight' ? 20 : -20))) }
      }}
    />
  )
}
