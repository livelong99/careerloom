import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { CopilotConfig, OverlayViewState } from '../../../electron/contract'
import { fakeEventsFor } from '../../../electron/copilot/overlay-fake'
import { initialOverlayModel, reduceOverlay, type OverlayEvent } from '../../lib/copilot'
import { buildOverlayData } from '../../overlay/buildData'
import { OverlayView } from '../../overlay/OverlayView'

type Props = {
  config: CopilotConfig
  state?: OverlayViewState
  /** Defaults to the saved layout / theme; the Appearance page overrides them while a control is being changed. */
  layout?: 'strip' | 'panel'
  theme?: 'dark' | 'light'
  practice?: boolean
}

/** Scale the overlay down (never up) to the width of its card, so a 780-1200 px overlay stays inside a narrow column. */
function useFit(naturalPx: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setZoom(Math.min(1, e!.contentRect.width / naturalPx)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalPx])
  return { ref, zoom }
}

/** The real overlay drawing with sample content (same OverlayView the overlay window uses), for the config screens. */
export function OverlayPreview({ config, state = 'answered', layout, theme, practice = false }: Props) {
  const data = useMemo(() => {
    const model = fakeEventsFor(state).map(e => ({ type: e.name, payload: e.payload }) as OverlayEvent).reduce(reduceOverlay, initialOverlayModel)
    const started = model.session?.startedAt ?? 0
    const d = buildOverlayData(model, { cfg: config, layout: layout ?? config.overlay.layout, now: started + 252_000, wiped: false })
    return { ...d, practice, passive: false, levels: { mic: 0.6, system: 0.4 } }
  }, [config, state, layout, practice])
  const dark = theme ?? (config.overlay.theme === 'light' ? 'light' : 'dark')
  // ponytail: the strip's 780 px is the CSS default in overlay.css; keep in sync.
  const { ref, zoom } = useFit(data.layout === 'panel' ? config.overlay.width : 780)
  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <div style={{ zoom }}><OverlayView data={data} on={{}} theme={dark} fontPx={config.overlay.fontPx} widthPx={data.layout === 'panel' ? config.overlay.width : undefined} opacity={config.overlay.opacity} /></div>
    </div>
  )
}
