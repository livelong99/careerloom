import { writeScript } from './sidecar-script'

// Hugging Face speech model decode sidecar (transformers ASR pipeline), same framing as parakeet-script.ts.
// stdin frames: [type u8][len u32 BE][payload], type 1 config JSON {repo, rev, cache, device, language, lookahead_ms}, 4 decode
// [id u32 BE][kind u8][PCM16 mono 16 kHz], 3 flush. stdout JSON lines: {ev:'ready', device, reason, lookahead_ms} | {ev:'decoded', id, text} | {ev:'error', id?, message}.
// Safety: only safetensors + json/txt files are downloaded (no .py, no pickle), trust_remote_code is always False, a config with
// auto_map is refused, and the session loads the local snapshot only (the caller also sets HF_HUB_OFFLINE=1).
// `fetch <repo> <rev> <cache>` and `selftest <repo> <rev> <cache> <device>` are the installer's steps. language 'auto' passes nothing;
// otherwise it is passed where the model takes it (Whisper's generate_kwargs; other models once, dropped for good if they reject it).
// lookahead_ms is carried for streaming models; v1 decodes whole chunks produced by buffer.ts.
export const SCRIPT = String.raw`
import json, os, re, struct, sys, warnings

ALLOW = ['*.safetensors', '*.json', '*.txt', '*.model', '*.tiktoken']
DENY = ['*.bin', '*.pt', '*.pth', '*.ckpt', '*.pkl', '*.pickle', '*.py']
TAG = re.compile(r'<[a-z]{2,3}-[A-Z]{2}>')

def emit(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def snapshot(repo, rev, cache, offline):
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, revision=rev, cache_dir=cache, allow_patterns=ALLOW, ignore_patterns=DENY, local_files_only=offline)

def pick_device(want):
    import torch
    mps = getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available()
    if want == 'cpu': return 'cpu', None
    if want == 'cuda': return ('cuda', None) if torch.cuda.is_available() else ('cpu', 'CUDA is not available')
    if torch.cuda.is_available(): return 'cuda', None
    return ('mps', None) if mps else ('cpu', None)

class Model:
    def __init__(self, pipe, language):
        self.pipe, self.language = pipe, language
        self.kind = getattr(getattr(pipe, 'model', None), 'config', None) and pipe.model.config.model_type
        self.lang_ok = language not in (None, 'auto')

    def kwargs(self):
        if not self.lang_ok: return {}
        if self.kind == 'whisper': return {'generate_kwargs': {'language': self.language.split('-')[0].lower(), 'task': 'transcribe'}, 'chunk_length_s': 30}
        return {'generate_kwargs': {'language': self.language}}

    def run(self, x):
        arg = {'raw': x, 'sampling_rate': 16000}
        try:
            out = self.pipe(arg, **self.kwargs())
        except (TypeError, ValueError):
            if not self.lang_ok or self.kind == 'whisper': raise
            self.lang_ok = False  # this model takes no language option: use it without
            out = self.pipe(arg)
        return TAG.sub('', (out.get('text') if isinstance(out, dict) else str(out)) or '').strip()

def decode(model, raw):
    import numpy as np
    x = np.frombuffer(raw, dtype='<i2').astype('float32') / 32768.0
    if len(x) < 1600: return ''  # under 100 ms: nothing to transcribe
    with np.errstate(all='ignore'), warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return model.run(x)

def load(path, want, language):
    with open(os.path.join(path, 'config.json')) as f: cfg = json.load(f)
    if cfg.get('auto_map'): raise RuntimeError('This model needs custom code, which is never run')
    import numpy as np
    from transformers import pipeline
    device, reason = pick_device(want)
    pipe = pipeline('automatic-speech-recognition', model=path, device=device, trust_remote_code=False)
    m = Model(pipe, language)
    noise = (np.random.default_rng(0).standard_normal(16000) * 200).astype('<i2').tobytes()
    for _ in range(2): decode(m, noise)  # warm the kernels before ready is reported
    return m, device, reason

def serve():
    inp = sys.stdin.buffer
    def read(n):
        b = b''
        while len(b) < n:
            c = inp.read(n - len(b))
            if not c: return None
            b += c
        return b
    head = read(5)
    if not head or head[0] != 1: emit({'ev': 'error', 'message': 'expected config frame'}); return
    cfg = json.loads(read(struct.unpack('>I', head[1:])[0]))
    model, device, reason = load(snapshot(cfg['repo'], cfg['rev'], cfg['cache'], True), cfg.get('device', 'auto'), cfg.get('language', 'auto'))
    emit({'ev': 'ready', 'device': device, 'reason': reason, 'lookahead_ms': cfg.get('lookahead_ms')})
    while True:
        head = read(5)
        if not head: break
        n = struct.unpack('>I', head[1:])[0]
        body = read(n) if n else b''
        if head[0] == 3: break
        if head[0] != 4 or body is None or len(body) < 5: continue
        rid = struct.unpack('>I', body[:4])[0]
        try:
            emit({'ev': 'decoded', 'id': rid, 'text': decode(model, body[5:])})
        except Exception as e:
            emit({'ev': 'error', 'id': rid, 'message': str(e)})

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    try:
        if cmd == 'serve': serve()
        elif cmd == 'fetch':
            print(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], False))
        elif cmd == 'selftest':
            _, device, reason = load(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], True), sys.argv[5] if len(sys.argv) > 5 else 'auto', 'auto')
            print(json.dumps({'ok': True, 'device': device, 'reason': reason}))
    except Exception as e:
        emit({'ev': 'error', 'message': str(e)}); sys.exit(1)
`

export const hfScript = (dir: string): string => writeScript(dir, SCRIPT)
