import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import type { JobListing } from './contract'
import { runSidecar, sidecarScript, SCRIPT } from './fit-sidecar'
import {
  buildExamples, cleanPolicy, defaultPolicy, keywordPrior, keywordSignals, labelHash, personalReady, locationGate, profileHash, readProfile, readStore, screen, seniorityGate, withStaleness, writeStore,
} from './prescreen-core'
import { parseLocation } from './prescreen-geo'
import { findRuntime, installCommands, modelDir, MODEL_KEY, parseVmStat, pythonCandidates, pythonVersionOk, REV, venvPython } from './prescreen-model'

const PROFILE_YML = `
candidate:
  location: "Bengaluru, India"
target_roles:
  primary:
    - "Senior Software Engineer (Backend / Full-Stack)"
    - "GenAI / AI Application Engineer"
  archetypes:
    - name: "Workflow Automation / Internal Platform Engineer"
      level: "Mid-Senior"
      fit: "secondary"
    - name: "Forward Deployed / Solutions Engineer"
      level: "Mid"
      fit: "adjacent"
narrative:
  headline: "Full-stack engineer shipping
    GenAI systems"
  exit_story: "4 years at Dell building internal platforms"
location:
  city: Bengaluru
  country: India
  authorized_in: [ "India", "UAE" ]
`
const profile = readProfile(PROFILE_YML, '# Profile\n\nIgnored when the yml has a headline.')
const INDIA = { countries: ['India'], remoteAnywhere: false, years: 4 }

describe('readProfile', () => {
  it('pulls roles (minus adjacent), levels, headline, countries and years', () => {
    expect(profile.roles).toEqual([
      'Senior Software Engineer (Backend / Full-Stack)', 'GenAI / AI Application Engineer', 'Workflow Automation / Internal Platform Engineer',
    ])
    expect(profile).toMatchObject({ levels: ['Mid-Senior', 'Mid'], headline: 'Full-stack engineer shipping GenAI systems', location: 'Bengaluru, India', countries: ['India', 'United Arab Emirates'], years: 4 })
    expect(defaultPolicy(profile)).toEqual({ countries: ['India', 'United Arab Emirates'], remoteAnywhere: false, years: 4 })
    expect(readProfile(PROFILE_YML, '', '## Summary\n### Not this\n## Experience\n### Software Engineer II — Dell\n### Older role\n').targets).toEqual([
      ['Senior Software Engineer (Backend / Full-Stack)', 1], ['GenAI / AI Application Engineer', 1],
      ['Workflow Automation / Internal Platform Engineer', 0.5], ['Forward Deployed / Solutions Engineer', 0.25],
      ['Full-stack engineer shipping GenAI systems', 0.5], ['Software Engineer II', 0.5],
    ])
  })

  it('falls back to _profile.md / cv.md and survives bad yaml', () => {
    const p = readProfile('target_roles:\n  primary: ["x"]', '<!-- note -->\n# Title\n\n| a | b |\nSE II at Dell.\n', 'Developer with 6+ years of experience')
    expect(p).toMatchObject({ headline: 'SE II at Dell.', years: 6, countries: [] })
    expect(readProfile('{{ not yaml', '').roles).toEqual([])
  })

  it('cleans policies from the renderer', () => {
    expect(cleanPolicy({ countries: ['usa', 'India', 'India', 3], remoteAnywhere: 'yes', years: -1 })).toEqual({ countries: ['United States', 'India'], remoteAnywhere: false, years: null })
    expect(cleanPolicy(null)).toEqual({ countries: [], remoteAnywhere: false, years: null })
  })
})

describe('location', () => {
  it('parses sites, aliases, cities and regions', () => {
    expect(parseLocation('Remote, Canada; Remote, United Kingdom; Remote, US').map(s => s.kind === 'country' && s.country)).toEqual(['Canada', 'United Kingdom', 'United States'])
    for (const l of ['Bangalore, India', 'Remote, Bangalore', 'Gurgaon', 'Hybrid - Pune', 'Noida, Uttar Pradesh', 'Bengaluru, Karnataka, India', 'Remote · Hyderabad']) {
      expect(parseLocation(l), l).toEqual([{ kind: 'country', country: 'India' }])
    }
    expect(parseLocation('Remote Ireland')).toEqual([{ kind: 'country', country: 'Ireland' }])
    expect(parseLocation('Remote · EMEA')[0]).toMatchObject({ kind: 'region', name: 'EMEA' })
    expect(parseLocation('Remote')).toEqual([{ kind: 'anywhere' }])
    expect(parseLocation('Toronto / Remote, KSA')).toEqual([{ kind: 'country', country: 'Canada' }, { kind: 'country', country: 'Saudi Arabia' }])
    expect(parseLocation('')).toEqual([])
  })

  it('passes allowed countries, fails elsewhere, is unsure on anywhere/regions', () => {
    expect(locationGate('Bangalore, India', INDIA)).toEqual({ verdict: 'pass', reason: 'Location: India' })
    expect(locationGate('Remote, Canada; Remote, Bengaluru', INDIA)?.verdict).toBe('pass')
    expect(locationGate('Remote, Canada; Remote, UK', INDIA)).toEqual({ verdict: 'fail', reason: 'Location: Canada, United Kingdom — you\'re searching India' })
    expect(locationGate('Remote', INDIA)).toEqual({ verdict: 'unsure', reason: 'Location: remote anywhere — check it hires in India' })
    expect(locationGate('Remote', { ...INDIA, remoteAnywhere: true })?.verdict).toBe('pass')
    expect(locationGate('APAC', INDIA)?.verdict).toBe('unsure')
    expect(locationGate('Remote, North America', INDIA)?.verdict).toBe('fail')
    expect(locationGate('Remote; Remote, United States', INDIA)?.verdict).toBe('unsure')
    expect(locationGate('Remote, Ohio', INDIA)).toBeNull()
    expect(locationGate(null, INDIA)).toBeNull()
    expect(locationGate('Remote, US', { ...INDIA, countries: [] })).toBeNull()
  })
})

describe('gates', () => {
  it('seniority needs known years', () => {
    expect(seniorityGate('Staff Backend Engineer', 4)).toBe('Seniority: Staff roles usually need 8+ years; you have 4')
    expect(seniorityGate('Distinguished Engineer, Core DevOps', 11)).toContain('Distinguished roles usually need 12+')
    expect(seniorityGate('Staff Backend Engineer', 9)).toBeNull()
    expect(seniorityGate('Senior Backend Engineer', 4)).toBeNull()
    expect(seniorityGate('Principal Engineer', null)).toBeNull()
  })

  const v = (title: string, location: string | null, fit: number | null = null, fb?: boolean) => screen({ title, location }, keywordSignals(title, profile), profile, INDIA, fit, fb)
  it('runs location → function → seniority → model, in that order', () => {
    expect(v('Account Executive', 'Remote, Canada', 0.95)).toMatchObject({ bucket: 'unlikely', gate: 'location' })
    expect(v('Account Executive', 'Bangalore, India', 0.95)).toMatchObject({ bucket: 'unlikely', gate: 'function', reason: 'Function: account executive role' })
    expect(v('Staff Backend Engineer', 'Bangalore, India', 0.95)).toMatchObject({ bucket: 'unlikely', gate: 'seniority' })
    expect(v('Senior Backend Engineer', 'Bangalore, India', 0.9)).toMatchObject({ bucket: 'likely', gate: 'model' })
    expect(v('Senior Backend Engineer', 'Bangalore, India', 0.12)).toMatchObject({ bucket: 'unlikely', gate: 'model', reason: 'Model: 0.12 fit — unlike your target roles' })
    expect(v('Solutions Architect', 'Bangalore, India', 0.5)).toMatchObject({ bucket: 'uncertain', gate: 'model' })
    expect(v('Senior Backend Engineer', 'Remote', 0.9)).toMatchObject({ bucket: 'uncertain', gate: 'location' })
    expect(v('Senior Backend Engineer', 'Remote, Canada', null, true)).toMatchObject({ bucket: 'likely', gate: 'feedback' })
  })

  it('falls back to keywords without a model', () => {
    expect(v('Senior Backend Engineer (Go)', 'Bangalore, India')).toMatchObject({ bucket: 'likely', gate: 'keywords', reason: 'Target role (backend) · Location: India' })
    expect(v('Solutions Architect', null)).toMatchObject({ bucket: 'uncertain', reason: 'No clear signal' })
    for (const t of ['Senior Corporate Counsel', 'Business Development Representative', 'Engineering Manager, Plan', 'Chief of Staff, CRO']) expect(v(t, null).bucket, t).toBe('unlikely')
    expect(keywordSignals('Software Engineer, Sales Platform', profile).otherFunction).toBeNull()
    expect(keywordSignals('Engineering Manager, Plan', { ...profile, roles: ['Engineering Manager'] }).otherFunction).toBeNull()
  })
})

const job = (id: string, title: string, extra: Partial<JobListing> = {}): JobListing => ({
  id, url: id, title, company: 'x', portalId: null, ats: null, location: null, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [],
  state: 'new', status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false, ...extra,
})

describe('training labels', () => {
  it('uses real labels only (feedback 5 > tracker 3), each with its keyword prior', () => {
    const ex = buildExamples([
      job('a', 'Distinguished Engineer', { reportNum: 1, score: 2.5, status: 'SKIP' }),
      job('b', 'Backend Engineer', { reportNum: 2, score: 4.1, status: 'Evaluated' }),
      job('c', 'Account Executive'),
      job('d', 'Senior Backend Engineer'),
      job('e', 'Solutions Architect', { reportNum: 3, score: 3.2 }),
      job('f', 'Sales Engineer'),
    ], profile, { f: { relevant: true, text: 'Sales Engineer', at: 'now' }, gone: { relevant: false, text: 'Payroll Specialist', at: 'now' } })
    expect(ex).toEqual(expect.arrayContaining([
      { text: 'Sales Engineer', label: 1, weight: 5, kw: 0.9 }, { text: 'Payroll Specialist', label: 0, weight: 5, kw: 0.1 },
      { text: 'Distinguished Engineer', label: 0, weight: 3, kw: 0.9 }, { text: 'Backend Engineer', label: 1, weight: 3, kw: 0.9 },
    ]))
    expect(ex).toHaveLength(4) // no keyword pseudo-labels; a middling score (3.2) is no label
  })

  it('keyword prior: other function .1, target role .9, else .5', () => {
    expect(keywordPrior(keywordSignals('Account Executive', profile))).toBe(0.1)
    expect(keywordPrior(keywordSignals('Senior Backend Engineer', profile))).toBe(0.9)
    expect(keywordPrior(keywordSignals('Solutions Architect', profile))).toBe(0.5)
  })

  it('adds the personal layer only from 5 labels of each class', () => {
    const lab = (pos: number, neg: number) => [...Array(pos).fill(1), ...Array(neg).fill(0)].map((label, i) => ({ text: `t${i}`, label, weight: 5, kw: 0.5 }))
    expect(personalReady(lab(5, 5))).toBe(true)
    expect(personalReady(lab(4, 20))).toBe(false)
    expect(personalReady(lab(20, 4))).toBe(false)
  })

  it('label hash ignores order and changes with the model revision', () => {
    const ex = [{ text: 'a', label: 1 as const, weight: 5, kw: 0.9 }, { text: 'b', label: 0 as const, weight: 3, kw: 0.1 }]
    expect(labelHash(ex, MODEL_KEY)).toBe(labelHash([...ex].reverse(), MODEL_KEY))
    expect(MODEL_KEY).toContain(REV)
    expect(labelHash(ex, MODEL_KEY)).not.toBe(labelHash(ex, MODEL_KEY.replace(REV, 'other-rev')))
  })
})

describe('local model install', () => {
  it('needs Python 3.10+', () => {
    for (const [v, ok] of [['3.10.0', true], ['3.12.8', true], ['4.0.0', true], ['3.9.6', false], ['2.7.18', false], [null, false]] as const) expect(pythonVersionOk(v), String(v)).toBe(ok)
    expect(pythonCandidates('win32')).toEqual([['py', ['-3']], ['python', []]])
    expect(pythonCandidates('darwin')[0]).toEqual(['python3.13', []])
    expect(venvPython('/m', 'win32')).toBe(path.join('/m', 'venv', 'Scripts/python.exe'))
  })

  it('builds per-platform argv: one pip call on mac, CPU-only torch index elsewhere', () => {
    const mac = installCommands('darwin', '/w', '/s.py')
    expect(mac.map(([l]) => l)).toEqual(['Packages', 'Model', 'Self-test'])
    expect(mac[0]![1]).toEqual(['-m', 'pip', 'install', '--disable-pip-version-check', 'torch==2.14.0', 'transformers>=5.17,<6', 'scikit-learn>=1.5', 'safetensors', 'huggingface_hub'])
    expect(mac.flatMap(([, a]) => a)).not.toContain('--index-url')
    const win = installCommands('win32', 'C:\\w', 'C:\\s.py')
    expect(win.map(([l]) => l)).toEqual(['Packages', 'Packages', 'Model', 'Self-test'])
    expect(win[0]![1]).toEqual(['-m', 'pip', 'install', '--disable-pip-version-check', 'torch==2.14.0', '--index-url', 'https://download.pytorch.org/whl/cpu'])
    expect(win[1]![1]).not.toContain('torch==2.14.0')
    expect(win[2]![1].slice(-3)).toEqual(['Manav2op/verdict-small', REV, 'C:\\w'])
    expect(win[3]![1]).toEqual(['C:\\s.py', 'selftest', 'C:\\w'])
  })

  it('counts reclaimable macOS pages as free', () => {
    const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  100.\nPages active: 999.\nPages inactive: 200.\nPages speculative: 10.\nPages purgeable: 5.\n'
    expect(parseVmStat(vm)).toBe(315 * 16384)
    expect(parseVmStat('garbage')).toBeNull()
  })

  it('only counts a finished install of this revision', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-'))
    fs.mkdirSync(path.dirname(venvPython(dir)), { recursive: true }); fs.writeFileSync(venvPython(dir), '')
    fs.mkdirSync(path.join(dir, 'weights')); fs.writeFileSync(path.join(dir, 'weights', 'model.safetensors'), '')
    expect(findRuntime(dir)).toBeNull() // no ready.json: interrupted install
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ model: 'Manav2op/verdict-small@old' }))
    expect(findRuntime(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ model: MODEL_KEY }))
    expect(findRuntime(dir)).toEqual({ python: venvPython(dir), weights: path.join(dir, 'weights'), model: MODEL_KEY })
  })
})

describe('persistence', () => {
  it('merges results, keeps policy/feedback, reads v1 files, marks stale on policy change', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prescreen-'))
    expect(readStore(root)).toEqual({ feedback: {}, results: {} })
    const hash = profileHash(profile, INDIA)
    const e = { bucket: 'likely' as const, fit: 0.8, reason: 'x', gate: 'model' as const, signals: { otherFunction: null, targetRole: 'engineer' }, at: 'now', profileHash: hash, method: 'model' as const }
    writeStore(root, { results: { a: e }, policy: INDIA })
    writeStore(root, { results: { b: { ...e, bucket: 'unlikely' } } })
    const stored = readStore(root)
    expect(Object.keys(stored.results)).toEqual(['a', 'b'])
    expect(stored.policy).toEqual(INDIA)
    expect(withStaleness(stored.results, hash).a!.stale).toBe(false)
    expect(withStaleness(stored.results, profileHash(profile, { ...INDIA, remoteAnywhere: true })).a!.stale).toBe(true)
    fs.writeFileSync(path.join(root, 'data', 'careerloom-prescreen.json'), JSON.stringify({ old: e }))
    expect(readStore(root).results.old).toEqual(e)
    fs.writeFileSync(path.join(root, 'data', 'careerloom-prescreen.json'), '[1]')
    expect(readStore(root)).toEqual({ feedback: {}, results: {} })
  })
})

// A stand-in for the python sidecar: same stdin/stdout protocol, no torch.
const FAKE = `
let s = ''
process.stdin.on('data', d => { s += d }).on('end', () => {
  const r = JSON.parse(s)
  if (r.cmd === 'embed') process.stdout.write(JSON.stringify({ n: r.texts.length, dim: 384, model: r.model }))
  else if (r.cmd === 'train') process.stdout.write(JSON.stringify({ w: [1], b: 0, accuracy: 0.9, n: r.examples.length, pos: 1, neg: 1 }))
  else if (r.cmd === 'predict') process.stdout.write(JSON.stringify({ p: r.texts.map(() => 0.5) }))
  else if (r.cmd === 'hang') setTimeout(() => {}, 60000)
  else if (r.cmd === 'big') process.stdout.write('x'.repeat(3_000_000))
  else if (r.cmd === 'crash') { process.stderr.write('Traceback: boom\\n'); process.exit(2) }
  else { process.stdout.write(JSON.stringify({ error: 'ValueError: unknown cmd' })); process.exit(1) }
})
`

describe('fit sidecar protocol', () => {
  const call = (body: object, t?: number) => runSidecar<Record<string, unknown>>(process.execPath, ['-e', FAKE], body, t)
  it('round-trips JSON and surfaces errors, crashes, timeouts and oversized output', async () => {
    expect(await call({ cmd: 'embed', model: MODEL_KEY, texts: ['a', 'b', 'c'] })).toEqual({ n: 3, dim: 384, model: MODEL_KEY })
    expect(await call({ cmd: 'train', examples: [{}, {}] })).toMatchObject({ n: 2, accuracy: 0.9 })
    expect(await call({ cmd: 'predict', texts: ['a', 'b'] })).toEqual({ p: [0.5, 0.5] })
    await expect(call({ cmd: 'nope' })).rejects.toThrow('ValueError: unknown cmd')
    await expect(call({ cmd: 'crash' })).rejects.toThrow('exited (2): Traceback: boom')
    await expect(call({ cmd: 'hang' }, 200)).rejects.toThrow('timed out')
    await expect(call({ cmd: 'big' })).rejects.toThrow('oversized')
    await expect(runSidecar('/nonexistent/python', [], {})).rejects.toThrow()
  })

  it('writes the script and the shipped base head once', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-'))
    const file = sidecarScript(dir)
    expect(fs.readFileSync(file, 'utf8')).toBe(SCRIPT)
    expect(fs.readFileSync(path.join(dir, 'verdict_isco3.npz')).subarray(0, 2).toString()).toBe('PK') // npz = zip
    const mtime = fs.statSync(file).mtimeMs
    expect(sidecarScript(dir)).toBe(file)
    expect(fs.statSync(file).mtimeMs).toBe(mtime)
  })
})

// The sidecar's model math, run in real Python (numpy/scipy/sklearn — the installed model venv or python3).
// Skipped where no such Python exists; the encoder itself is never loaded here.
const PY = [venvPython(modelDir()), 'python3'].find(py => spawnSync(py, ['-c', 'import numpy, scipy, sklearn'], { shell: false }).status === 0)
const MATH = `
import numpy as np
import careerloom_fit as m
L = m.logit
# prior: logits add; the neutral keyword prior (.5) leaves the base as is
assert abs(m.prior(np.array([.5]), [.9])[0] - .9) < 1e-9
assert abs(m.prior(np.array([.8]), [.5])[0] - .8) < 1e-9
assert abs(m.prior(np.array([.8]), [.1])[0] - m.sig(L(np.array(.8)) + L(np.array(.1)))) < 1e-9
# trust budget: the layer moves the default's logit by at most DELTA = 3
X = np.zeros((2, 4)); p0 = np.array([.2, .7])
up = m.predict_personal(X, p0, {'a': 1, 'b': 100, 'w': [0] * 4}); assert np.allclose(L(up), L(p0) + 3), up
dn = m.predict_personal(X, p0, {'a': 1, 'b': -100, 'w': [0] * 4}); assert np.allclose(L(dn), L(p0) - 3), dn
same = m.predict_personal(X, p0, {'a': 1, 'b': 0, 'w': [0] * 4}); assert np.allclose(same, p0)
# target groups: smallest set covering 80% of the weighted occupation mass
base = {'classes': ['a', 'b', 'c']}
m.occupation_probs = lambda b, X: X
assert m.target_groups(base, np.array([[.85, .1, .05]]), [1]) == ['a']
assert m.target_groups(base, np.array([[.5, .3, .2]]), [1]) == ['a', 'b']
assert m.target_groups(base, np.array([[.1, .2, .7], [.9, .05, .05]]), [1, .25]) == ['c', 'a']  # c .57, a .26, b .17
# gate: needs 5 per class; ships only when CV beats the default on accuracy (>= 2 pts) AND log-loss
rng = np.random.default_rng(0)
X = rng.normal(size=(60, 6)); y = (X[:, 0] > 0).astype(float); w = np.full(60, 5.0)
Xr = rng.normal(size=(40, 6)); br = np.full(40, .5)
assert m.gate(X[:9], np.full(9, .5), np.r_[np.ones(4), np.zeros(5)], w[:9], Xr, br) == (False, 0.0, 0.0)
ship, d_acc, d_ll = m.gate(X, np.full(60, .5), y, w, Xr, br)   # uninformative default, signal in the titles
assert ship and d_acc >= .02 and d_ll < 0, (ship, d_acc, d_ll)
ship, d_acc, d_ll = m.gate(X, np.where(y == 1, .97, .03), y, w, Xr, br)   # default already right: nothing to gain
assert not ship and d_acc < .02, (ship, d_acc, d_ll)
print('ok')
`
describe.skipIf(!PY)('sidecar model math (Python)', () => {
  it('prior, trust budget, target groups and the gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitmath-'))
    sidecarScript(dir)
    const r = spawnSync(PY!, ['-c', MATH], { cwd: dir, shell: false, encoding: 'utf8', timeout: 60_000 })
    expect(r.stderr).toBe('')
    expect(r.stdout.trim()).toBe('ok')
  })
})
