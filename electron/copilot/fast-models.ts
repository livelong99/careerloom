// The Copilot answers live, so it only accepts low-latency ("fast") models: OpenRouter's fast tier in
// recommended-models.json, or the provider's curated fast list (llm/providers.ts). `custom` accepts any id.
import recommended from './recommended-models.json'
import { fastModelsFor, isFastModel, type ProviderId } from '../llm/providers'

export const OPENROUTER_FAST: readonly string[] = recommended.tiers.fast.map(m => m.id)
export const isFastFor = (provider: ProviderId, model: string): boolean => isFastModel(provider, model, OPENROUTER_FAST)
/** null = unrestricted (custom server). */
export const fastIdsFor = (provider: ProviderId): readonly string[] | null => fastModelsFor(provider, OPENROUTER_FAST)
