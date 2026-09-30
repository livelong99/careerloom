import { useEffect, useReducer } from 'react'

import { initialOverlayModel, reduceOverlay, subscribeCopilot } from '../lib/copilot'
import type { OverlayModel } from '../lib/copilot'

/** Live overlay state from the main-process push events (contract: CopilotEvents). */
export function useCopilotEvents(): OverlayModel {
  const [model, dispatch] = useReducer(reduceOverlay, initialOverlayModel)
  useEffect(() => subscribeCopilot(window.careerloom, dispatch), [])
  return model
}
