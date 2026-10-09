// "Any Hugging Face speech model": parse an id/URL, read the model's public metadata, and decide whether it is safe to install.
// Pure (fetch is injected, no fs): the install and the sidecar only ever see a `owner/name@<40-hex commit>` id that passed `compat`.
import type { HfCheck } from '../types'

export const REPO_RE = /^[A-Za-z0-9._-]{1,96}\/[A-Za-z0-9._-]{1,96}$/
export const REV_RE = /^[0-9a-f]{40}$/
export const WARN_BYTES = 3 * 1024 ** 3
export const REFUSE_BYTES = 8 * 1024 ** 3
const API = 'https://huggingface.co/api/models/'
const PICKLE = /\.(bin|pt|pth|ckpt|pkl|pickle)$/i
const DTYPE_BYTES: Record<string, number> = { F64: 8, F32: 4, F16: 2, BF16: 2, I64: 8, I32: 4, I16: 2, I8: 1, U8: 1 }

const validRepo = (r: string) => REPO_RE.test(r) && r.split('/').every(p => !/^\.+$/.test(p))

/** `owner/name`, `owner/name@<sha>` or a huggingface.co URL (optionally `/tree/<sha>`); anything else is refused. A revision that is not a full commit sha is ignored: the install pins the commit it inspects. */
export function parseHfInput(input: string): { repo: string; rev?: string } {
  let s = input.trim()
  if (/^https?:\/\//i.test(s)) {
    let u: URL
    try { u = new URL(s) } catch { throw new Error('That is not a valid link') }
    if (u.protocol !== 'https:' || !/^(www\.)?huggingface\.co$/i.test(u.hostname)) throw new Error('Only huggingface.co links are accepted')
    const [owner = '', name = '', kind, rev] = u.pathname.split('/').filter(Boolean)
    s = `${owner}/${name}${(kind === 'tree' || kind === 'blob' || kind === 'resolve') && rev && REV_RE.test(rev) ? `@${rev}` : ''}`
  }
  const [repo = '', rev, ...rest] = s.split('@')
  if (rest.length || !validRepo(repo)) throw new Error('Enter a model id like owner/name, or a huggingface.co link')
  return rev && REV_RE.test(rev) ? { repo, rev } : { repo }
}

export const formatModelId = (repo: string, rev: string) => `${repo}@${rev}`
/** The stored model id (`repo@sha`), or null when it is anything else. */
export function parseModelId(id: string | null | undefined): { repo: string; rev: string } | null {
  const [repo, rev, ...rest] = (id ?? '').split('@')
  return !rest.length && repo && rev && validRepo(repo) && REV_RE.test(rev) ? { repo, rev } : null
}
export const isHfModel = (id: string | null | undefined) => parseModelId(id) !== null

/** `<en-US>` style language tags some multilingual models put in their text. */
export const stripLangTags = (t: string) => t.replace(/<[a-z]{2,3}-[A-Z]{2}>/g, '').replace(/\s{2,}/g, ' ').trim()
/** Look-ahead frames (80 ms each) → the milliseconds shown to the user. */
export const LOOKAHEAD_MS = { 0: 80, 3: 320, 6: 560, 13: 1120 } as const

export type HfInspection = { repo: string; rev: string; pipelineTag: string | null; library: string | null; license: string | null; gated: boolean; private: boolean; sizeBytes: number | null; formats: string[]; tags: string[]; languages: string[]; customCode: boolean }
export type HfFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
type Sibling = { rfilename?: unknown; size?: unknown }
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})
const strs = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is string => typeof x === 'string')

/** Public metadata at one commit (`rev` omitted = the current one; the result carries the sha to pin). */
export async function inspect(repo: string, fetchFn: HfFetch, rev?: string): Promise<HfInspection> {
  if (!validRepo(repo) || (rev !== undefined && !REV_RE.test(rev))) throw new Error('Invalid model id')
  const url = `${API}${repo.split('/').map(encodeURIComponent).join('/')}${rev ? `/revision/${rev}` : ''}?blobs=true`
  const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) throw new Error('Model not found on Hugging Face')
  if (res.status === 401 || res.status === 403) return { repo, rev: rev ?? '', pipelineTag: null, library: null, license: null, gated: true, private: true, sizeBytes: null, formats: [], tags: [], languages: [], customCode: false }
  if (!res.ok) throw new Error(`Hugging Face answered ${res.status}`)
  const j = obj(await res.json())
  const sha = typeof j.sha === 'string' ? j.sha : ''
  if (!REV_RE.test(sha)) throw new Error('Hugging Face did not return a commit for this model')
  if (rev && sha !== rev) throw new Error('The model changed since it was checked: check it again')
  const card = obj(j.cardData), tags = strs(j.tags), siblings = (Array.isArray(j.siblings) ? j.siblings : []) as Sibling[]
  const names = siblings.map(s => (typeof s.rfilename === 'string' ? s.rfilename : ''))
  const formats = [...new Set(names.flatMap(n => (n.endsWith('.safetensors') ? ['safetensors'] : PICKLE.test(n) ? ['pickle'] : n.endsWith('.onnx') ? ['onnx'] : n.endsWith('.gguf') ? ['gguf'] : [])))]
  const fileBytes = siblings.filter((s, i) => names[i]!.endsWith('.safetensors') && typeof s.size === 'number').reduce((n, s) => n + (s.size as number), 0)
  const params = obj(obj(j.safetensors).parameters)
  const paramBytes = Object.entries(params).reduce((n, [k, v]) => n + (typeof v === 'number' ? v * (DTYPE_BYTES[k] ?? 4) : 0), 0)
  const license = typeof card.license_name === 'string' ? card.license_name : typeof card.license === 'string' ? card.license : (tags.find(t => t.startsWith('license:'))?.slice(8) ?? null)
  return {
    repo, rev: sha, pipelineTag: typeof j.pipeline_tag === 'string' ? j.pipeline_tag : null, library: typeof j.library_name === 'string' ? j.library_name : null, license,
    gated: !!j.gated, private: j.private === true, sizeBytes: fileBytes || paramBytes || null, formats, tags, languages: strs(card.language),
    customCode: tags.includes('custom_code') || Object.keys(obj(obj(j.config).auto_map)).length > 0,
  }
}

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`
/** OK only for a public, ungated, speech-recognition model with safetensors weights and no custom code, under the size cap. */
export function compat(i: HfInspection): Pick<HfCheck, 'verdict' | 'reasons'> {
  const refuse: string[] = [], warn: string[] = []
  if (i.private) refuse.push('The model is private or needs a Hugging Face login')
  else if (i.gated) refuse.push('The model is gated: it needs you to accept terms on Hugging Face first')
  if (i.pipelineTag !== 'automatic-speech-recognition') refuse.push(`It is not a speech-recognition model (type: ${i.pipelineTag ?? 'unknown'})`)
  if (!i.formats.includes('safetensors')) refuse.push(i.formats.includes('pickle') ? 'It only ships pickle weights (.bin/.pt/.ckpt), which can run code when loaded; only safetensors models are accepted' : 'It has no safetensors weights')
  if (i.customCode) refuse.push('It needs custom code from the model repository (auto_map), which Careerloom never runs')
  if (i.sizeBytes !== null && i.sizeBytes > REFUSE_BYTES) refuse.push(`Too large: ${gb(i.sizeBytes)} (limit ${gb(REFUSE_BYTES)})`)
  else if (i.sizeBytes !== null && i.sizeBytes > WARN_BYTES) warn.push(`Large download: ${gb(i.sizeBytes)}; it will use that much memory while running`)
  if (i.sizeBytes === null && !refuse.length) warn.push('The download size is not published')
  if (i.library && i.library !== 'transformers') warn.push(`Library is ${i.library}, not transformers: it may not load`)
  if (!i.license && !refuse.length) warn.push('No licence is declared: check the model page before relying on it')
  return refuse.length ? { verdict: 'refuse', reasons: refuse } : warn.length ? { verdict: 'warn', reasons: warn } : { verdict: 'ok', reasons: ['Public, safetensors weights, no custom code'] }
}

export const toCheck = (i: HfInspection): HfCheck => ({ model: formatModelId(i.repo, i.rev), repo: i.repo, rev: i.rev, pipelineTag: i.pipelineTag, license: i.license, sizeBytes: i.sizeBytes, languages: i.languages, formats: i.formats, ...compat(i) })

/** The Check button: parse, inspect, verdict. */
export async function checkHfModel(input: string, fetchFn: HfFetch): Promise<HfCheck> {
  const { repo, rev } = parseHfInput(input)
  return toCheck(await inspect(repo, fetchFn, rev))
}
/** Re-check right before a download: the stored id must still be at that commit and still pass. Throws the refusal reasons. */
export async function assertHfInstallable(model: string, fetchFn: HfFetch): Promise<void> {
  const m = parseModelId(model)
  if (!m) throw new Error('Not a pinned Hugging Face model id')
  const c = toCheck(await inspect(m.repo, fetchFn, m.rev))
  if (c.verdict === 'refuse') throw new Error(`This model cannot be installed: ${c.reasons.join('; ')}`)
}
