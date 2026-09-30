import { useMemo } from 'react'

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

/** The real overlay drawing with sample content (same OverlayView the overlay window uses), for the config screens. */
export function OverlayPreview({ config, state = 'answered', layout, theme, practice = false }: Props) {
  const data = useMemo(() => {
    const model = fakeEventsFor(state).map(e => ({ type: e.name, payload: e.payload }) as OverlayEvent).reduce(reduceOverlay, initialOverlayModel)
    const started = model.session?.startedAt ?? 0
    const d = buildOverlayData(model, { cfg: config, layout: layout ?? config.overlay.layout, now: started + 252_000, wiped: false })
    return { ...d, practice, passive: false, levels: { mic: 0.6, system: 0.4 } }
  }, [config, state, layout, practice])
  const dark = theme ?? (config.overlay.theme === 'light' ? 'light' : 'dark')
  return <OverlayView data={data} on={{}} theme={dark} fontPx={config.overlay.fontPx} widthPx={data.layout === 'panel' ? config.overlay.width : undefined} opacity={config.overlay.opacity} />
}
