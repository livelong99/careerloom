import { describe, expect, it, vi } from 'vitest'

import { assertHfInstallable, checkHfModel, compat, formatModelId, inspect, isHfModel, parseHfInput, parseModelId, REFUSE_BYTES, stripLangTags, WARN_BYTES, type HfFetch, type HfInspection } from './hf-models'

const SHA = 'a'.repeat(40), SHA2 = 'b'.repeat(40)
const GB = 1024 ** 3
const base: HfInspection = { repo: 'acme/asr', rev: SHA, pipelineTag: 'automatic-speech-recognition', library: 'transformers', license: 'mit', gated: false, private: false, sizeBytes: 1 * GB, formats: ['safetensors'], tags: [], languages: ['en'], customCode: false }

/** What huggingface.co/api/models/<id>?blobs=true returns (the fields inspect reads). */
const api = (over: Record<string, unknown> = {}) => ({
  id: 'acme/asr', sha: SHA, private: false, gated: false, pipeline_tag: 'automatic-speech-recognition', library_name: 'transformers', tags: ['transformers', 'safetensors', 'license:mit'],
  cardData: { license: 'mit', language: ['en', 'de'] }, config: { architectures: ['X'], model_type: 'x' },
  siblings: [{ rfilename: 'config.json', size: 1000 }, { rfilename: 'model.safetensors', size: 2 * GB }], ...over,
})
const fake = (body: unknown, status = 200): HfFetch & ReturnType<typeof vi.fn> => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }))

describe('parseHfInput', () => {
  it('takes owner/name, owner/name@sha and huggingface.co links', () => {
    expect(parseHfInput(' acme/asr ')).toEqual({ repo: 'acme/asr' })
    expect(parseHfInput(`acme/asr@${SHA}`)).toEqual({ repo: 'acme/asr', rev: SHA })
    expect(parseHfInput('https://huggingface.co/acme/asr')).toEqual({ repo: 'acme/asr' })
    expect(parseHfInput(`https://huggingface.co/acme/asr/tree/${SHA}`)).toEqual({ repo: 'acme/asr', rev: SHA })
    expect(parseHfInput('https://huggingface.co/acme/asr/tree/main')).toEqual({ repo: 'acme/asr' }) // a branch is not a pin: the inspected commit is
    expect(parseHfInput('https://www.huggingface.co/acme/asr/blob/main/config.json')).toEqual({ repo: 'acme/asr' })
  })
  it.each(['', 'asr', 'a/b/c', 'a b/c', 'a/b;rm -rf /', '$(id)/x', 'a/b c', '../x', 'a/..', 'x'.repeat(97) + '/n', 'http://huggingface.co/a/b', 'https://evil.com/a/b', 'https://huggingface.co.evil.com/a/b', 'a/b@c@d', 'file:///etc/passwd'])('refuses %j', bad => {
    expect(() => parseHfInput(bad)).toThrow()
  })
  it('a short or non-hex revision is dropped, never passed on', () => {
    expect(parseHfInput('acme/asr@main')).toEqual({ repo: 'acme/asr' })
    expect(parseHfInput(`acme/asr@${SHA.slice(0, 7)}`)).toEqual({ repo: 'acme/asr' })
  })
})

describe('model ids', () => {
  it('only repo@40-hex is a model id', () => {
    expect(parseModelId(formatModelId('acme/asr', SHA))).toEqual({ repo: 'acme/asr', rev: SHA })
    for (const bad of ['small', 'acme/asr', 'acme/asr@main', `acme/asr@${SHA}@x`, `../x@${SHA}`, `acme/asr@${'G'.repeat(40)}`, null, undefined, '']) expect(isHfModel(bad), String(bad)).toBe(false)
  })
})

describe('compat', () => {
  it('OK: public, ungated, ASR, safetensors, no custom code, small', () => {
    expect(compat(base).verdict).toBe('ok')
  })
  it.each([
    ['not speech recognition', { pipelineTag: 'text-generation' }, /not a speech-recognition/],
    ['no pipeline tag', { pipelineTag: null }, /unknown/],
    ['private', { private: true }, /private/],
    ['gated', { gated: true }, /gated/],
    ['pickle only', { formats: ['pickle'] }, /pickle/],
    ['no weights at all', { formats: [] }, /no safetensors/],
    ['onnx only', { formats: ['onnx'] }, /no safetensors/],
    ['custom code (auto_map)', { customCode: true }, /custom code/],
    ['over the size cap', { sizeBytes: REFUSE_BYTES + 1 }, /Too large/],
  ] as const)('refuses: %s', (_n, over, why) => {
    const r = compat({ ...base, ...over } as HfInspection)
    expect(r.verdict).toBe('refuse'); expect(r.reasons.join(' ')).toMatch(why)
  })
  it('size: warn above 3 GB, refuse above 8 GB, boundaries inclusive of the lower band', () => {
    expect(compat({ ...base, sizeBytes: WARN_BYTES }).verdict).toBe('ok')
    expect(compat({ ...base, sizeBytes: WARN_BYTES + 1 }).verdict).toBe('warn')
    expect(compat({ ...base, sizeBytes: REFUSE_BYTES }).verdict).toBe('warn')
    expect(compat({ ...base, sizeBytes: REFUSE_BYTES + 1 }).verdict).toBe('refuse')
  })
  it('pickle next to safetensors is allowed (only safetensors are downloaded); unknown size, other library and no licence only warn', () => {
    expect(compat({ ...base, formats: ['safetensors', 'pickle'] }).verdict).toBe('ok')
    expect(compat({ ...base, sizeBytes: null }).verdict).toBe('warn')
    expect(compat({ ...base, library: 'nemo' }).verdict).toBe('warn')
    expect(compat({ ...base, license: null }).verdict).toBe('warn')
  })
  it('lists every reason, in words', () => {
    const r = compat({ ...base, gated: true, formats: ['pickle'], customCode: true })
    expect(r.reasons).toHaveLength(3)
  })
})

describe('inspect', () => {
  it('reads sha, licence, languages, formats and sums the safetensors file sizes', async () => {
    const f = fake(api())
    const i = await inspect('acme/asr', f)
    expect(i).toMatchObject({ repo: 'acme/asr', rev: SHA, pipelineTag: 'automatic-speech-recognition', library: 'transformers', license: 'mit', gated: false, private: false, sizeBytes: 2 * GB, formats: ['safetensors'], languages: ['en', 'de'], customCode: false })
    expect(f.mock.calls[0]![0]).toBe('https://huggingface.co/api/models/acme/asr?blobs=true')
  })
  it('pins a revision through the revision endpoint and refuses an answer for another commit', async () => {
    const f = fake(api({ sha: SHA2 }))
    await expect(inspect('acme/asr', f, SHA)).rejects.toThrow(/changed/)
    expect(f.mock.calls[0]![0]).toBe(`https://huggingface.co/api/models/acme/asr/revision/${SHA}?blobs=true`)
  })
  it('detects custom code from auto_map and from the custom_code tag', async () => {
    expect((await inspect('acme/asr', fake(api({ config: { auto_map: { AutoModel: 'm.X' } } })))).customCode).toBe(true)
    expect((await inspect('acme/asr', fake(api({ tags: ['custom_code'] })))).customCode).toBe(true)
  })
  it('falls back to the parameter count x dtype when no file sizes are listed; gated "auto"/"manual" counts as gated', async () => {
    const i = await inspect('acme/asr', fake(api({ siblings: [{ rfilename: 'model.safetensors' }], safetensors: { parameters: { F32: 100, BF16: 100 }, total: 200 }, gated: 'manual' })))
    expect(i.sizeBytes).toBe(600); expect(i.gated).toBe(true)
  })
  it('classifies pickle weights and reads the licence from tags when the card has none', async () => {
    const i = await inspect('acme/asr', fake(api({ cardData: {}, tags: ['license:apache-2.0'], siblings: [{ rfilename: 'pytorch_model.bin', size: 5 }, { rfilename: 'x.ckpt' }] })))
    expect(i.formats).toEqual(['pickle']); expect(i.license).toBe('apache-2.0'); expect(i.sizeBytes).toBeNull()
  })
  it('404 → not found; 401/403 → private+gated (refused); other errors and a missing sha throw', async () => {
    await expect(inspect('acme/asr', fake({}, 404))).rejects.toThrow(/not found/)
    const r = compat(await inspect('acme/asr', fake({}, 401)))
    expect(r.verdict).toBe('refuse')
    await expect(inspect('acme/asr', fake({}, 500))).rejects.toThrow(/500/)
    await expect(inspect('acme/asr', fake(api({ sha: 'main' })))).rejects.toThrow(/commit/)
  })
  it('never builds a URL from an unvalidated id', async () => {
    const f = fake(api())
    await expect(inspect('a/b?x=1', f)).rejects.toThrow(/Invalid/)
    await expect(inspect('acme/asr', f, 'main')).rejects.toThrow(/Invalid/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('check + install gate', () => {
  it('checkHfModel returns the pinned id and the verdict (no download happens)', async () => {
    const f = fake(api())
    const c = await checkHfModel('https://huggingface.co/acme/asr', f)
    expect(c).toMatchObject({ model: `acme/asr@${SHA}`, repo: 'acme/asr', rev: SHA, license: 'mit', verdict: 'ok', languages: ['en', 'de'] })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('assertHfInstallable re-checks the stored commit and throws the reasons for a refused model', async () => {
    await expect(assertHfInstallable(`acme/asr@${SHA}`, fake(api()))).resolves.toBeUndefined()
    await expect(assertHfInstallable(`acme/asr@${SHA}`, fake(api({ siblings: [{ rfilename: 'a.bin', size: 1 }] })))).rejects.toThrow(/pickle/)
    await expect(assertHfInstallable(`acme/asr@${SHA}`, fake(api({ gated: 'auto' })))).rejects.toThrow(/gated/)
    await expect(assertHfInstallable('acme/asr', fake(api()))).rejects.toThrow(/pinned/)
  })
})

describe('stripLangTags', () => {
  it('removes <xx-XX> tags and tidies spaces', () => {
    expect(stripLangTags('<en-US> hello  there')).toBe('hello there')
    expect(stripLangTags('hi <de-DE>wie geht es')).toBe('hi wie geht es')
    expect(stripLangTags('a < b and c > d')).toBe('a < b and c > d')
  })
})
