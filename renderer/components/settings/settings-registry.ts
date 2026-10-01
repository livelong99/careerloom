// Search index for Settings: one entry per control that can be deep-linked (`navigate('settings', { page, focus })`).
// `focus` must equal the `data-setting-id` attribute on the control; settings-registry.test.ts checks pages B owns.
import type { PageId } from './pages'

export type RegistryEntry = { page: PageId; focus?: string; label: string; keywords: string[] }

const e = (page: PageId, focus: string | undefined, label: string, ...keywords: string[]): RegistryEntry => ({ page, focus, label, keywords })

export const REGISTRY: readonly RegistryEntry[] = [
  e('general', 'root', 'career-ops folder', 'workspace', 'path', 'directory', 'install'),
  e('general', 'deps', 'Dependencies check', 'node_modules', 'git', 'node'),
  e('general', 'theme', 'Theme', 'dark', 'light', 'appearance', 'system'),
  e('general', 'language', 'Language', 'locale', 'translation'),
  e('general', 'refresh', 'Refresh cadence', 'poll', 'interval', 'auto refresh', 'manual', 'battery'),
  e('general', 'updates', 'Check for updates', 'release', 'version', 'upgrade'),
  e('runners', undefined, 'Runners & models', 'agent', 'claude', 'codex', 'model'),
  e('runners', 'runner:claude', 'Claude Code', 'runner', 'cli'),
  e('runners', 'runner:codex', 'Codex', 'runner', 'cli', 'chatgpt'),
  e('runners', 'runner:antigravity', 'Antigravity', 'runner', 'agy', 'google'),
  e('runners', 'runner:opencode', 'OpenCode', 'runner', 'cli'),
  e('runners', 'runner:zen', 'OpenCode Zen (API)', 'runner', 'zen'),
  e('runners', 'runner:api', 'API key runner', 'runner', 'openrouter'),
  e('keys', undefined, 'API keys', 'secret', 'keychain', 'token'),
  e('keys', 'key:openrouter', 'OpenRouter key', 'api key', 'sk-or', 'copilot answers'),
  e('keys', 'key:opencode', 'OpenCode Zen key', 'api key', 'zen'),
  e('keys', 'key:firecrawl', 'Firecrawl key', 'api key', 'scrape'),
  e('keys', 'key:brave', 'Brave Search key', 'api key', 'search', 'research', 'knowledge base'),
  e('keys', 'key:exa', 'Exa key', 'api key', 'search', 'research'),
  e('keys', 'key:serper', 'Serper key', 'api key', 'search', 'research'),
  e('local-models', undefined, 'Local models', 'on-device', 'download', 'memory'),
  e('local-models', 'prescreen-model', 'Pre-screen model', 'verdict', 'laya', 'install', 'python'),
  e('local-models', 'stt-models', 'Transcription engines', 'whisper', 'moonshine', 'speech'),
  e('integrations', undefined, 'Integrations', 'connections', 'services'),
  e('integrations', 'integration:firecrawl', 'Firecrawl', 'scrape', 'docker', 'compose'),
  e('integrations', 'integration:browser', 'Browser login', 'cookies', 'chrome', 'consent', 'revoke'),
  e('integrations', 'integration:skills', 'Skills', 'github skills', 'allowlist'),
  e('integrations', 'integration:plugins', 'Plugins', 'career-ops plugins', 'enable', 'disable'),
  e('jobs', 'prescreen', 'Pre-screen policy', 'countries', 'remote', 'years', 'seniority', 'location'),
  e('jobs', 'pipeline-limits', 'Pipeline limits', 'sequential', 'scan caps', 'evaluate'),
  e('resume', 'doc-defaults', 'Document defaults', 'tone', 'length', 'humanize', 'cover letter'),
  e('agent', 'agent-permissions', 'What the runner may do', 'permissions', 'sandbox', 'tools'),
  e('copilot', 'copilot:stt', 'Copilot transcription', 'stt', 'whisper', 'vocabulary', 'silence'),
  e('copilot', 'copilot:engine', 'Copilot answer engine', 'tier', 'model', 'fact check', 'vision'),
  e('copilot', 'copilot:faster', 'Copilot faster answers', 'speculative', 'early start', 'auto answer', 'decision model', 'gate'),
  e('copilot', 'copilot:privacy', 'Copilot privacy', 'retention', 'redact', 'privacy mode', 'hide from capture'),
  e('interview-prep', undefined, 'Interview prep', 'knowledge base', 'research', 'search provider', 'interviewer', 'voice'),
  e('interview-prep', 'interview:research', 'Research limits', 'depth', 'budget', 'cost', 'minutes', 'agent pass', 'model', 'question base'),
  e('interview-prep', 'interview:search', 'Search provider', 'brave', 'exa', 'serper', 'searxng', 'consent', 'web search'),
  e('interview-prep', 'interview:sources', 'Allowed research sources', 'stack exchange', 'github', 'wikipedia', 'company pages', 'never read', 'reddit', 'glassdoor'),
  e('interview-prep', 'interview:voice', 'Interviewer voice', 'tts', 'speech', 'speakers', 'headphones', 'speed', 'kokoro', 'indian english'),
  e('interview-prep', 'interview:bases', 'Question bases', 'refresh', 'retention', 'keep', 'stale'),
  e('monitoring', 'monitoring-findings', 'What raises findings', 'insights', 'thresholds'),
  e('data', 'locations', 'Data locations', 'app data', 'folder', 'path', 'finder'),
  e('data', 'stats', 'Stored data', 'size', 'runs', 'logs', 'threads', 'sessions'),
  e('data', 'retention', 'Run-log retention', 'prune', 'keep', 'delete old', 'days'),
  e('data', 'secrets', 'Secrets overview', 'keychain', 'privacy', 'keys'),
  e('data', 'clear-run-logs', 'Clear run logs', 'delete', 'history'),
  e('data', 'clear-chats', 'Delete chat threads', 'delete', 'conversations', 'agent chat'),
  e('data', 'clear-copilot', 'Delete Copilot sessions', 'delete', 'transcripts', 'interview'),
  e('advanced', 'diagnostics', 'Diagnostics', 'node', 'git', 'python', 'memory', 'path', 'health'),
  e('advanced', 'run-history', 'Recent runs & logs', 'log', 'tail', 'history'),
  e('advanced', 'limits', 'Limits', 'caps', 'timeouts', 'read-only'),
  e('advanced', 'reset-preferences', 'Reset preferences', 'defaults', 'restore'),
  e('advanced', 'reset-everything', 'Reset everything', 'factory reset', 'wipe', 'remove keys'),
]

/** Entries matching every whitespace-separated term of `query` (label or keyword, case-insensitive). */
export function searchRegistry(query: string, entries: readonly RegistryEntry[] = REGISTRY): RegistryEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const rank = (en: RegistryEntry) => { const l = en.label.toLowerCase(); return terms.every(t => l.includes(t)) ? 0 : 1 }
  return entries
    .filter(en => { const hay = `${en.label} ${en.keywords.join(' ')}`.toLowerCase(); return terms.every(t => hay.includes(t)) })
    .map((en, i) => ({ en, i }))
    .sort((a, b) => rank(a.en) - rank(b.en) || a.i - b.i) // label hits first, registry order otherwise
    .map(x => x.en)
}
