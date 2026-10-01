// Pure defaults for interview.json (plan §7, §15): no Electron imports, so the renderer's Reset can use them too.
import type { InterviewConfig } from './types'

export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  version: 1,
  research: {
    model: null, depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false,
    search: { backend: 'brave', fallbackOrder: ['brave', 'exa', 'serper', 'searxng'], searxngUrl: null },
    sources: { stackexchange: true, github: true, taxonomy: true, hn: true, companyPages: true, articles: true },
    consentVersion: null, refreshAfterDays: 30,
  },
  // speakers + half-duplex is the safe default; the picker lists installed en_IN system voices first
  voice: { engine: 'system', voiceId: null, speed: 1, echo: 'speakers', tailMs: 350, pushToInterrupt: 'Control+Alt+I' },
  kb: { retentionDays: null, maxItems: 400, useInLive: true },
}
