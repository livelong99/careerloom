// Test-only: a full CopilotConfig for component tests that mock the bridge.
import type { CopilotConfig } from '@/lib/types'

export const DEFAULT_CONFIG_FOR_TESTS: CopilotConfig = {
  version: 1,
  audio: { micDeviceId: null, useSystem: false, systemSource: 'loopback', virtualDeviceId: null },
  stt: { engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] },
  engine: { tier: 'fast', escalateForDesignCoding: true, provider: 'openrouter', openrouter: { dataCollection: 'allow', zdr: false, sort: 'latency', policyMigrated: true }, models: { fast: null, balanced: null, deep: null }, factCheck: true, vision: 'vision', screenshots: false, autoAnswer: false, speculativeStart: false, gate: { engine: 'heuristic', baseUrl: 'https://openrouter.ai/api', endpoint: 'systemone' } },
  coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true },
  overlay: { layout: 'strip', anchor: 'tr', displayId: null, width: 440, fontPx: 14, opacity: 0.94, theme: 'app', clickThroughIdle: true, aboveFullscreen: true },
  hotkeys: { answer: 'Control+Alt+A', followup: 'Control+Alt+F', clarify: 'Control+Alt+C', screenshot: 'Control+Alt+S', summarise: 'Control+Alt+M', detail: 'Control+Alt+D', expand: 'Control+Alt+E', listen: 'Control+Alt+L', toggle: 'Control+Alt+H', quickHide: 'Control+Alt+Shift+H', clear: 'Control+Alt+K', panic: 'Control+Alt+Shift+X' },
  privacy: { retentionDays: 90, localOnly: false, redact: true, mode: { enabled: false, noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' } },
  practice: { followups: true, answerMinutes: 2 },
}
