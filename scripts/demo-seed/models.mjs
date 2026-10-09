// A live-style OpenRouter model list for the pickers: the app's own curated models (real ids and prices from
// electron/copilot) plus a handful of extra entries, so the dropdown looks like a fetched /models response.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const copilot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'electron', 'copilot')
const rec = JSON.parse(fs.readFileSync(path.join(copilot, 'recommended-models.json'), 'utf8'))
const prices = JSON.parse(fs.readFileSync(path.join(copilot, 'prices.json'), 'utf8')).models ?? {}

const curated = Object.values(rec.tiers).flat().map(m => ({ id: m.id, name: m.name, contextTokens: m.contextTokens, vision: m.vision }))
const extra = [
  ['anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5', 500000, true, 15, 75], ['anthropic/claude-sonnet-4.5', 'Anthropic: Claude Sonnet 4.5', 1000000, true, 3, 15],
  ['deepseek/deepseek-v3.2', 'DeepSeek: DeepSeek V3.2', 163840, false, 0.28, 0.42], ['meta-llama/llama-4-maverick', 'Meta: Llama 4 Maverick', 1048576, true, 0.15, 0.6],
  ['mistralai/mistral-medium-3.1', 'Mistral: Mistral Medium 3.1', 131072, true, 0.4, 2], ['mistralai/codestral-2508', 'Mistral: Codestral 2508', 256000, false, 0.3, 0.9],
  ['openai/gpt-5.1-codex', 'OpenAI: GPT-5.1 Codex', 400000, true, 1.25, 10], ['openai/gpt-oss-120b', 'OpenAI: gpt-oss-120b', 131072, false, 0.1, 0.5],
  ['qwen/qwen3-coder', 'Qwen: Qwen3 Coder 480B', 262144, false, 0.22, 0.95], ['x-ai/grok-4-fast', 'xAI: Grok 4 Fast', 2000000, true, 0.2, 0.5],
  ['z-ai/glm-4.6', 'Z.AI: GLM 4.6', 202752, false, 0.4, 1.75], ['google/gemini-2.5-flash', 'Google: Gemini 2.5 Flash', 1048576, true, 0.3, 2.5],
].map(([id, name, contextTokens, vision, p, c]) => ({ id, name, contextTokens, vision, promptUsdPerM: p, completionUsdPerM: c }))

export const MODEL_LIST = [...curated.map(m => ({ ...m, promptUsdPerM: prices[m.id]?.promptUsdPerM ?? 0.4, completionUsdPerM: prices[m.id]?.completionUsdPerM ?? 1.6 })), ...extra]
  .map(m => ({ ...m, dataPolicy: 'no-collect', supportsStreaming: true }))
