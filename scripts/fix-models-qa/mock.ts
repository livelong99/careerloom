// Harness only: a fake bridge whose data matches what the backend returned before (?v=before) and after (?v=after) the fix,
// for a free model under the default deny policy. The "after" values are what electron/copilot/models.ts + providers/errors.ts produce (unit-tested).
const q = new URLSearchParams(location.search)
const after = q.get('v') === 'after'
const dc = q.get('dc') === 'allow' ? 'allow' : 'deny' // before-fix default was deny; after-fix default is allow
const RAW = 'No endpoints found matching your data policy (Free model training). Configure: https://openrouter.ai/settings/privacy'
const m = (id: string, name: string, p: number, c: number, free = false) => ({ id, name, contextTokens: 262144, promptUsdPerM: p, completionUsdPerM: c, dataPolicy: free && after ? 'may-collect' : 'unknown', supportsStreaming: true })
const models = [
  m('openai/gpt-4.1-nano', 'OpenAI: GPT-4.1 Nano', 0.1, 0.4), m('anthropic/claude-haiku-4.5', 'Anthropic: Claude Haiku 4.5', 1, 5),
  m('nvidia/nemotron-3.5-lightning:free', 'NVIDIA: Nemotron 3.5 Lightning (free)', 0, 0, true), m('qwen/qwen3.8-27b:free', 'Qwen: Qwen3.8 27B (free)', 0, 0, true), m('cohere/north-mini-code:free', 'Cohere: North Mini Code (free)', 0, 0, true),
]
let config: Record<string, any> = {
  version: 1, coaching: {}, hotkeys: { answer: 'Control+Alt+A' }, privacy: {}, overlay: {}, audio: {}, stt: {},
  engine: { tier: 'fast', escalateForDesignCoding: true, provider: 'openrouter', openrouter: { dataCollection: dc, zdr: false, sort: 'latency', policyMigrated: true }, models: { fast: 'qwen/qwen3.8-27b:free', balanced: 'nvidia/nemotron-3.5-lightning:free', deep: 'cohere/north-mini-code:free' }, factCheck: true, vision: 'vision', autoAnswer: false },
}
const merge = (a: any, b: any): any => (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b)
const impl: Record<string, (...a: any[]) => unknown> = {
  platform: () => 'darwin',
  copilotGetConfig: () => config,
  copilotSetConfig: (p: unknown) => (config = merge(config, p)),
  copilotListLlmModels: () => models,
  copilotTestLlmModel: () => dc === 'allow' ? { ok: true, firstTokenMs: 740 } : after
    ? { ok: false, firstTokenMs: null, code: 'policy', actions: ['change-model', 'privacy-settings'], message: 'This model may use your prompts (free models can train on them), which your privacy setting blocks. Pick a paid model, or allow free models.' }
    : { ok: false, firstTokenMs: null, message: RAW },
  getSettings: () => ({ root: null, runner: 'claude', models: {}, helperModels: {}, hasApiKey: true, hasOpencodeKey: false, rootCheck: null }),
}
;(window as any).careerloom = new Proxy(impl, {
  get: (t, k: string) => (k in t ? (k === 'platform' ? 'darwin' : (...a: unknown[]) => Promise.resolve(t[k]!(...a))) : k.startsWith('on') ? () => () => {} : () => Promise.resolve(null)),
})
