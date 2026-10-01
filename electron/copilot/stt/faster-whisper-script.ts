import { writeScript } from './sidecar-script'

// faster-whisper (CTranslate2) decode sidecar, same framing as whisper-script.ts. stdin frames: [type u8][len u32 BE][payload],
// type 1 config JSON {repo, rev, cache, language, vocab, device, compute_type, cpu_threads}, 4 decode [id u32 BE][kind u8][PCM16 mono
// 16 kHz], 3 flush. stdout JSON lines: {ev:'ready', device, reason?} | {ev:'decoded', id, text} | {ev:'error', id?, message}.
// CUDA 12 comes from the nvidia-cublas-cu12 / nvidia-cudnn-cu12 wheels (no toolkit): their DLL dirs are registered before
// ctranslate2 is imported. If CUDA fails to load or warm up the sidecar falls back to CPU int8 and says why in `reason`.
// VAD and chunking live in main (buffer.ts), so vad_filter stays off. `fetch <repo> <rev> <cache>` and
// `selftest <repo> <rev> <cache> <device> <compute_type>` are the installer's steps. The session never uses the network.
export const SCRIPT = String.raw`
import glob, json, os, struct, sys

def emit(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def add_cuda_libs():
    # pip wheels put cublas/cudnn under site-packages/nvidia/<lib>/bin (Windows) or /lib (Linux); the loader must see them first.
    sub = 'bin' if os.name == 'nt' else 'lib'
    dirs = []
    for base in sys.path:
        dirs += sorted(glob.glob(os.path.join(base, 'nvidia', '*', sub)))
    for d in dirs:
        if os.name == 'nt':
            os.add_dll_directory(d)
            os.environ['PATH'] = d + os.pathsep + os.environ.get('PATH', '')
    if os.name != 'nt':
        import ctypes
        for pat in ('libcublasLt.so*', 'libcublas.so*', 'libcudnn.so*'):
            for d in dirs:
                for f in sorted(glob.glob(os.path.join(d, pat))):
                    try: ctypes.CDLL(f, mode=ctypes.RTLD_GLOBAL); break
                    except OSError: pass

def snapshot(repo, rev, cache, offline):
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, revision=rev, cache_dir=cache, local_files_only=True) if offline else snapshot_download(repo, revision=rev, cache_dir=cache)

def decode(model, raw, language, prompt):
    import numpy as np
    x = np.frombuffer(raw, dtype='<i2').astype('float32') / 32768.0
    segs, _ = model.transcribe(x, language=language, beam_size=1, temperature=0.0, condition_on_previous_text=False,
                               without_timestamps=True, vad_filter=False, initial_prompt=prompt or None)
    return ' '.join(s.text.strip() for s in segs).strip()

def load(path, device, compute_type, threads):
    # Weights stay resident; two dummy decodes warm the kernels/cuDNN before ready is reported. CUDA failure -> CPU int8.
    if device == 'cuda': add_cuda_libs()
    from faster_whisper import WhisperModel
    plan = [(device, compute_type)] + ([('cpu', 'int8')] if device == 'cuda' else [])
    reason = None
    for dev, ct in plan:
        try:
            m = WhisperModel(path, device=dev, compute_type=ct, cpu_threads=threads if dev == 'cpu' else 0)
            for _ in range(2): decode(m, b'\0\0' * 16000, 'en', '')
            return m, dev, reason
        except Exception as e:
            reason = str(e)[:300]
    raise RuntimeError(reason or 'model failed to load')

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
    path = snapshot(cfg['repo'], cfg['rev'], cfg['cache'], True)
    language = cfg.get('language', 'en')
    prompt = ', '.join(cfg.get('vocab') or [])
    model, dev, reason = load(path, cfg.get('device', 'cpu'), cfg.get('compute_type', 'int8'), cfg.get('cpu_threads', 4))
    emit({'ev': 'ready', 'device': dev, 'reason': reason})
    while True:
        head = read(5)
        if not head: break
        n = struct.unpack('>I', head[1:])[0]
        body = read(n) if n else b''
        if head[0] == 3: break
        if head[0] != 4 or body is None or len(body) < 5: continue
        rid = struct.unpack('>I', body[:4])[0]
        try:
            emit({'ev': 'decoded', 'id': rid, 'text': decode(model, body[5:], language, prompt)})
        except Exception as e:
            emit({'ev': 'error', 'id': rid, 'message': str(e)})

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    try:
        if cmd == 'serve': serve()
        elif cmd == 'fetch':
            print(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], False))
        elif cmd == 'selftest':
            _, dev, reason = load(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], True), sys.argv[5], sys.argv[6], 4)
            print(json.dumps({'ok': True, 'device': dev, 'reason': reason}))
    except Exception as e:
        emit({'ev': 'error', 'message': str(e)}); sys.exit(1)
`

export const fasterWhisperScript = (dir: string): string => writeScript(dir, SCRIPT)
