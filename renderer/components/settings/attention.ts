import { usePolled } from '../../hooks/usePolled'
import { careerloom } from '../../lib/ipc'
import type { PageId } from './pages'
import type { Readiness, Settings } from '../../lib/types'

/** Pages that need the user's attention, with the reason. Pure so the sidebar dot, the nav dots and tests agree. */
export function attentionFor(settings: Pick<Settings, 'runner' | 'hasApiKey' | 'hasOpencodeKey'>, readiness: Readiness | null): Partial<Record<PageId, string>> {
  const out: Partial<Record<PageId, string>> = {}
  if (readiness && !readiness.clis.some(c => c.ready) && settings.runner !== 'api' && settings.runner !== 'zen') out.runners = 'No agent CLI is ready'
  if (settings.runner === 'api' && !settings.hasApiKey) out.keys = 'The API key runner needs an OpenRouter key'
  if (settings.runner === 'zen' && !settings.hasOpencodeKey) out.keys = 'The OpenCode Zen runner needs a Zen key'
  return out
}

/** Attention map for the current settings; readiness comes from the cached check (never forces a CLI spawn). */
export function useAttention(settings: Settings | null): Partial<Record<PageId, string>> {
  const ready = usePolled(() => careerloom.getReadiness(false), [settings?.root], { intervalMs: null, enabled: settings?.rootCheck?.ok === true })
  return settings ? attentionFor(settings, ready.data) : {}
}
