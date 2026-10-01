// OpenRouter Kokoro TTS (/api/v1/audio/speech, pcm output), one sentence per request. Main process only; key from safeStorage via getKey.
import type { VoiceInfo } from '../kb/types'
import type { TtsEngine } from './adapter'

// ponytail: model id and pcm = 24 kHz s16le are from OpenRouter/OpenAI speech docs, unverified live (needs a key): `CL_LIVE_TTS=1 node scripts/tts-latency.mjs --engine openrouter`.
const MODEL = 'hexgrad/kokoro-82m'
const VOICES: Array<[string, string]> = [['af_heart', 'Heart (US, F)'], ['af_bella', 'Bella (US, F)'], ['am_michael', 'Michael (US, M)'], ['bf_emma', 'Emma (UK, F)'], ['bm_george', 'George (UK, M)']]
const scrub = (s: string, key: string) => s.split(key).join('[key]').replace(/sk-[A-Za-z0-9_-]{6,}/g, '[key]').replace(/Bearer\s+\S+/gi, 'Bearer [key]').slice(0, 200)

export type OpenRouterTtsDeps = { getKey: () => string | null; fetch?: typeof fetch; baseUrl?: string; model?: string }

export function createOpenRouterEngine(d: OpenRouterTtsDeps): TtsEngine {
  const doFetch = d.fetch ?? fetch
  const base = d.baseUrl ?? 'https://openrouter.ai/api/v1'
  return {
    id: 'openrouter',
    async voices(): Promise<VoiceInfo[]> {
      if (!d.getKey()) return []
      return VOICES.map(([id, name]) => ({ engine: 'openrouter', id, name, lang: id.startsWith('b') ? 'en_GB' : 'en_US', offline: false, installed: true, sizeMb: null, note: 'Cloud voice (needs your OpenRouter key)' }))
    },
    async *synth(text, voiceId, speed, signal) {
      const key = d.getKey()
      if (!key) throw new Error('OpenRouter key missing: add it in Settings → API keys')
      if (signal.aborted) return
      let res: Response
      try {
        res = await doFetch(`${base}/audio/speech`, {
          method: 'POST', signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: d.model ?? MODEL, input: text, voice: voiceId, response_format: 'pcm', speed }),
        })
      } catch (e) {
        if (signal.aborted) return
        throw new Error(`OpenRouter TTS request failed: ${scrub(String((e as Error).message), key)}`)
      }
      if (!res.ok) throw new Error(`OpenRouter TTS ${res.status}: ${scrub(await res.text().catch(() => ''), key)}`)
      if (!res.body) throw new Error('OpenRouter TTS returned no audio')
      const reader = res.body.getReader()
      let carry: number | null = null
      try {
        for (;;) {
          if (signal.aborted) return
          const { value, done } = await reader.read()
          if (done) return
          if (!value?.length) continue
          const bytes: Uint8Array = carry === null ? value : Uint8Array.from([carry, ...value])
          const even = bytes.length - (bytes.length % 2)
          carry = bytes.length % 2 ? bytes[bytes.length - 1] : null
          if (even) yield { pcm16: bytes.slice(0, even).buffer as ArrayBuffer, sampleRate: 24000 as const }
        }
      } catch (e) {
        if (signal.aborted) return
        throw e
      } finally { void reader.cancel().catch(() => {}) }
    },
  }
}
