import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { BASE_HEAD_B64 } from './fit-base-head'

// Job-fit sidecar: a frozen encoder (Manav2op/verdict-small, PyTorch on CPU) embeds job titles. A shipped
// base head (ISCO-3 occupation classifier trained on public ESCO/JobBERT data) scores relevance to the
// profile's target occupations with zero labels; a small personal layer, anchored to that default and
// replayed against public titles, is used only when repeated CV on the user's labels shows it beats the base.
// One-shot: JSON on stdin → JSON on stdout, so the model is unloaded as soon as each request finishes.
// Commands (targets = [[profile text, weight]]): embed {texts} → {dim, n}; targets {targets} → {groups};
// prior {texts, kw, targets} → {p, groups} (the zero-label default); personal_fit {examples [{text, label,
// weight, kw}], targets} → {layer | null, ship, reason, gain, dLogloss, groups, n, pos, neg};
// predict {texts, kw, targets, layer | null} → {p, groups}.
// `python careerloom_fit.py selftest <weights>` is the installer's last step. Importable (tests) without running.
// Script and base head ship as strings (compiled into dist/electron) and are written next to the embedding cache.

const MAX_OUT = 2_000_000 // a runaway child can't exhaust main's memory

export const SCRIPT = String.raw`
import hashlib, json, os, sys
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
import numpy as np

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verdict_isco3.npz')
MASS, REPLAY_W, LAM_E, LAM_AB, DELTA, GATE_ACC, GATE_REPEATS = 0.8, 1.0, 0.3, 1.0, 3.0, 0.02, 3
_enc = {}

def encoder(weights):
    # texts -> (n, 384): "query: " prefix, max 64 tokens, batches of 16, masked mean-pool, CPU. Loaded once per process.
    if weights in _enc: return _enc[weights]
    import torch
    from transformers import AutoModel, AutoTokenizer
    torch.set_num_threads(min(4, max(1, (os.cpu_count() or 2) // 2)))
    tok = AutoTokenizer.from_pretrained(weights)
    model = AutoModel.from_pretrained(weights).eval()
    def fn(texts):
        out = []
        for i in range(0, len(texts), 16):
            b = tok(['query: ' + t for t in texts[i:i + 16]], padding=True, truncation=True, max_length=64, return_tensors='pt')
            with torch.inference_mode():
                h = model(**b).last_hidden_state
            m = b['attention_mask'].unsqueeze(-1).to(h.dtype)
            out.append(((h * m).sum(1) / m.sum(1)).float().numpy())
        return np.concatenate(out)
    _enc[weights] = fn
    return fn

def embed(req, texts):
    cache = os.path.join(req['cache'], hashlib.sha1((req['model'] + req['weights']).encode()).hexdigest()[:12])
    os.makedirs(cache, exist_ok=True)
    files = [os.path.join(cache, hashlib.sha1(t.encode()).hexdigest() + '.npy') for t in texts]
    out = [np.load(f) if os.path.exists(f) else None for f in files]
    miss = [i for i, v in enumerate(out) if v is None]
    if miss:
        fn = encoder(req['weights'])
        for i, v in zip(miss, fn([texts[i] for i in miss])):
            out[i] = v
            np.save(files[i], v)
    return np.stack(out).astype(np.float64)

# ————— base head: P(title's occupation is one of the profile's target ISCO-3 groups) —————

def load_base():
    h = np.load(BASE, allow_pickle=False)
    return {k: h[k].astype(np.float64) for k in ('mean', 'scale', 'coef', 'intercept')} | {'classes': [str(c) for c in h['classes']], 'replay_titles': [str(t) for t in h['replay_titles']]}

def occupation_probs(base, X):
    z = ((X - base['mean']) / base['scale']) @ base['coef'].T + base['intercept']
    p = np.exp(z - z.max(1, keepdims=True))
    return p / p.sum(1, keepdims=True)

def target_groups(base, X, weights):
    # Smallest set of ISCO-3 codes covering MASS of the profile strings' weighted occupation distribution.
    p = (occupation_probs(base, X) * np.asarray(weights, dtype=np.float64)[:, None]).sum(0) / np.sum(weights)
    order = np.argsort(-p)
    return [base['classes'][i] for i in order[:int(np.searchsorted(np.cumsum(p[order]), MASS)) + 1]]

def base_relevance(base, X, groups):
    return occupation_probs(base, X)[:, np.isin(base['classes'], groups)].sum(1)

def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p) - np.log1p(-p)

def sig(z):
    return 1 / (1 + np.exp(-z))

def prior(base_rel, kw):
    # Zero-label default: logit(base relevance) + logit(keyword prior .1 / .5 / .9).
    return sig(logit(base_rel) + logit(np.asarray(kw, dtype=np.float64)))

def groups_for(req, base):
    return target_groups(base, embed(req, [t for t, _ in req['targets']]), [w for _, w in req['targets']])

def defaults(req, texts, kw):
    base = load_base()
    groups = groups_for(req, base)
    X = embed(req, texts)
    return base, groups, X, prior(base_relevance(base, X, groups), kw)

# ————— personal layer: z = a*logit(p0) + b + w.x, anchored to (1, 0), replayed on public titles —————

def fit_personal(X, p0, y, w, Xr, br):
    from scipy.optimize import minimize
    X = np.r_[X, Xr]; L = logit(np.r_[p0, br]); t = np.r_[y, br]
    w = np.r_[w, np.full(len(Xr), REPLAY_W)]; w = w / w.sum()
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Z = (X - mu) / sd
    def f(th):
        a, b, we = th[0], th[1], th[2:]
        p = sig(a * L + b + Z @ we)
        g = w * (p - t)
        loss = -(w * (t * np.log(p + 1e-9) + (1 - t) * np.log(1 - p + 1e-9))).sum() + (LAM_AB * ((a - 1) ** 2 + b ** 2) + LAM_E * (we @ we)) / 100
        return loss, np.r_[g @ L + 2 * LAM_AB * (a - 1) / 100, g.sum() + 2 * LAM_AB * b / 100, Z.T @ g + 2 * LAM_E * we / 100]
    th = minimize(f, np.r_[1.0, 0.0, np.zeros(X.shape[1])], jac=True, method='L-BFGS-B').x
    wr = th[2:] / sd
    return {'a': float(th[0]), 'b': float(th[1] - wr @ mu), 'w': wr.tolist()}

def predict_personal(X, p0, layer):
    z0 = logit(p0)  # the layer moves the default's logit by at most DELTA
    return sig(np.clip(layer['a'] * z0 + layer['b'] + X @ np.asarray(layer['w']), z0 - DELTA, z0 + DELTA))

def gate(X, p0, y, w, Xr, br):
    # Repeated stratified 5-fold CV on the user's labels: ship only if accuracy gains >= GATE_ACC and log-loss drops.
    from sklearn.model_selection import RepeatedStratifiedKFold
    if min(np.bincount(y.astype(int), minlength=2)) < 5: return False, 0.0, 0.0
    pp = np.zeros((GATE_REPEATS, len(y)))
    for k, (a, b) in enumerate(RepeatedStratifiedKFold(n_splits=5, n_repeats=GATE_REPEATS, random_state=0).split(X, y)):
        pp[k // 5, b] = predict_personal(X[b], p0[b], fit_personal(X[a], p0[a], y[a], w[a], Xr, br))
    acc = lambda P: float(np.mean((P >= .5) == (y == 1)))
    ll = lambda P: float(np.mean(-(y * np.log(np.clip(P, 1e-4, 1)) + (1 - y) * np.log(np.clip(1 - P, 1e-4, 1)))))
    d_acc, d_ll = acc(pp) - acc(p0[None]), ll(pp) - ll(p0[None])
    return bool(d_acc >= GATE_ACC and d_ll < 0), round(d_acc, 4), round(d_ll, 4)

def personal_fit(req):
    ex = req['examples']
    base, groups, X, p0 = defaults(req, [e['text'] for e in ex], [e['kw'] for e in ex])
    y = np.array([e['label'] for e in ex], dtype=np.float64)
    w = np.array([e['weight'] for e in ex], dtype=np.float64)
    Xr = embed(req, base['replay_titles']); br = base_relevance(base, Xr, groups)
    ship, d_acc, d_ll = gate(X, p0, y, w, Xr, br)
    layer = fit_personal(X, p0, y, w, Xr, br) if ship else None
    pos, neg = int(y.sum()), int(len(y) - y.sum())
    reason = None if ship else 'labels' if min(pos, neg) < 5 else 'no-gain'
    return {'layer': layer, 'ship': ship, 'reason': reason, 'gain': d_acc, 'dLogloss': d_ll, 'groups': groups, 'n': len(y), 'pos': pos, 'neg': neg}

def predict(req):
    base, groups, X, p0 = defaults(req, req['texts'], req['kw'])
    p = predict_personal(X, p0, req['layer']) if req['cmd'] == 'predict' and req.get('layer') else p0
    return {'p': [round(float(x), 4) for x in p], 'groups': groups}

def selftest(weights):
    E = encoder(weights)(['Backend Engineer', 'Senior Software Engineer', 'Account Executive'])
    E = E / np.linalg.norm(E, axis=1, keepdims=True)
    assert E.shape == (3, 384), E.shape
    assert E[0] @ E[1] > E[0] @ E[2], 'embeddings look wrong'
    print('self-test ok: cos(backend, senior swe)=%.3f > cos(backend, account exec)=%.3f' % (E[0] @ E[1], E[0] @ E[2]))

def main():
    req = json.load(sys.stdin)
    if req['cmd'] == 'embed':
        X = embed(req, req['texts']); res = {'n': int(X.shape[0]), 'dim': int(X.shape[1])}
    elif req['cmd'] == 'targets': res = {'groups': groups_for(req, load_base())}
    elif req['cmd'] in ('prior', 'predict'): res = predict(req)
    elif req['cmd'] == 'personal_fit': res = personal_fit(req)
    else: raise ValueError('unknown cmd %r' % req['cmd'])
    json.dump(res, sys.stdout)

if __name__ != '__main__':
    pass
elif sys.argv[1:2] == ['selftest']:
    selftest(sys.argv[2])
else:
    try:
        main()
    except Exception as e:
        json.dump({'error': '%s: %s' % (type(e).__name__, e)}, sys.stdout)
        sys.exit(1)
`

/** Base head version: retrain the personal layer when the shipped head changes. */
export const BASE_HEAD_VERSION = createHash('sha256').update(BASE_HEAD_B64).digest('hex').slice(0, 12)

/** Write the script and base head into `dir` (once per content change) and return the script's path. */
export function sidecarScript(dir: string): string {
  const write = (name: string, data: Buffer) => {
    const file = path.join(dir, name)
    let cur: Buffer | null = null
    try { cur = fs.readFileSync(file) } catch { /* first run */ }
    if (!cur?.equals(data)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, data) }
    return file
  }
  write('verdict_isco3.npz', Buffer.from(BASE_HEAD_B64, 'base64'))
  return write('careerloom_fit.py', Buffer.from(SCRIPT))
}

const live = new Set<ReturnType<typeof spawn>>()
/** Kill in-flight sidecars (app quit). */
export const killSidecars = () => { for (const c of live) c.kill('SIGKILL') }

/** Spawn `bin args` (argv only, no shell), send `input` as JSON, resolve the JSON it prints. `{error}` bodies throw. */
export function runSidecar<T>(bin: string, args: string[], input: unknown, timeoutMs = 180_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    live.add(child)
    let out = ''
    let err = ''
    let failed: Error | null = null
    const kill = (e: Error) => {
      failed ??= e
      child.kill()
      setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }, 3000).unref()
    }
    const timer = setTimeout(() => kill(new Error(`Fit model timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d: string) => { out += d; if (out.length > MAX_OUT) kill(new Error('Fit model sent an oversized response')) })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => { err = (err + d).slice(-4000) })
    child.on('error', e => { failed ??= e })
    child.on('close', code => {
      clearTimeout(timer)
      live.delete(child)
      if (failed) return reject(failed)
      let body: (T & { error?: string }) | null = null
      try { body = JSON.parse(out) } catch { /* below */ }
      if (body && typeof body === 'object' && typeof body.error === 'string') return reject(new Error(body.error))
      if (code !== 0 || !body) return reject(new Error(`Fit model exited (${code ?? 'signal'})${err.trim() ? `: ${err.trim().split('\n').slice(-2).join(' ').slice(0, 400)}` : ''}`))
      resolve(body)
    })
    child.stdin.on('error', () => { /* surfaced via close */ })
    child.stdin.end(JSON.stringify(input))
  })
}
