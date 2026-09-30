import type { Handler } from '../context'

// M1 stub: the engine (M2) and lifecycle (M3) replace these.
const pending = (name: string): Handler => async () => { throw new Error(`${name} is not available yet`) }

export const atsHandlers: Record<string, Handler> = {
  atsAnalyze: pending('atsAnalyze'),
  atsGet: async () => null,
  atsAnswer: pending('atsAnswer'),
  atsPreviewApply: pending('atsPreviewApply'),
  atsApply: pending('atsApply'),
  atsUndo: pending('atsUndo'),
  atsDismiss: pending('atsDismiss'),
}
