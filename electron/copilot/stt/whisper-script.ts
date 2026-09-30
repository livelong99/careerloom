import { writeScript } from './sidecar-script'

// Whisper (mlx-whisper) decode sidecar (plan §3.2, S2). stdin frames: [type u8][len u32 BE][payload], type 1 config JSON
// {repo, rev, cache, language, vocab}, 4 decode [id u32 BE][kind u8][PCM16 mono 16 kHz], 3 flush. stdout JSON lines:
// {ev:'ready'} | {ev:'decoded', id, text} | {ev:'error', id?, message}. VAD and chunking live in main (buffer.ts).
// `fetch <repo> <rev> <cache>` / `selftest <repo> <rev> <cache>` are the installer's steps. The session never uses the network.
export const SCRIPT = String.raw`
import json, struct, sys

def emit(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def snapshot(repo, rev, cache, offline):
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, revision=rev, cache_dir=cache, local_files_only=True) if offline else snapshot_download(repo, revision=rev, cache_dir=cache)

def decode(path, raw, language, prompt):
    import numpy as np
    import mlx_whisper
    x = np.frombuffer(raw, dtype='<i2').astype('float32') / 32768.0
    r = mlx_whisper.transcribe(x, path_or_hf_repo=path, language=language, fp16=True, condition_on_previous_text=False, verbose=None, initial_prompt=prompt or None)
    return r['text'].strip()

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
    decode(path, b'\0\0' * 16000, language, '')  # load the weights before reporting ready
    emit({'ev': 'ready'})
    while True:
        head = read(5)
        if not head: break
        n = struct.unpack('>I', head[1:])[0]
        body = read(n) if n else b''
        if head[0] == 3: break
        if head[0] != 4 or body is None or len(body) < 5: continue
        rid = struct.unpack('>I', body[:4])[0]
        try:
            emit({'ev': 'decoded', 'id': rid, 'text': decode(path, body[5:], language, prompt)})
        except Exception as e:
            emit({'ev': 'error', 'id': rid, 'message': str(e)})

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    try:
        if cmd == 'serve': serve()
        elif cmd == 'fetch':
            print(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], False))
        elif cmd == 'selftest':
            decode(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], True), b'\0\0' * 16000, 'en', ''); print('ok')
    except Exception as e:
        emit({'ev': 'error', 'message': str(e)}); sys.exit(1)
`

export const whisperScript = (dir: string): string => writeScript(dir, SCRIPT)
