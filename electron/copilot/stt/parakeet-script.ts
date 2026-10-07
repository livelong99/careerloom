import { writeScript } from './sidecar-script'

// NVIDIA Parakeet TDT 0.6B v3 (ONNX int8 via onnx-asr + onnxruntime, CPU) decode sidecar, same framing as faster-whisper-script.ts.
// stdin frames: [type u8][len u32 BE][payload], type 1 config JSON {repo, rev, cache, cpu_threads}, 4 decode [id u32 BE][kind u8]
// [PCM16 mono 16 kHz], 3 flush. stdout JSON lines: {ev:'ready', device} | {ev:'decoded', id, text} | {ev:'error', id?, message}.
// Parakeet is an offline (non-streaming) model like Whisper: main owns VAD + chunking (buffer.ts), the sidecar only decodes whole
// utterances, so a long question arrives in one piece. It has no prompt, so the "words to recognise" list is ignored.
// `fetch <repo> <rev> <cache>` and `selftest <repo> <rev> <cache>` are the installer's steps. The session never uses the network.
export const SCRIPT = String.raw`
import json, os, struct, sys, warnings

FILES = ['config.json', 'vocab.txt', 'nemo128.onnx', 'encoder-model.int8.onnx', 'decoder_joint-model.int8.onnx']
NAME = 'nemo-parakeet-tdt-0.6b-v3'

def emit(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def snapshot(repo, rev, cache, offline):
    from huggingface_hub import snapshot_download
    return snapshot_download(repo, revision=rev, cache_dir=cache, allow_patterns=FILES, local_files_only=offline)

def decode(model, raw):
    import numpy as np
    x = np.frombuffer(raw, dtype='<i2').astype('float32') / 32768.0
    if len(x) < 1600: return ''  # under 100 ms: nothing to transcribe
    with np.errstate(all='ignore'), warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return (model.recognize(x, sample_rate=16000) or '').strip()

def load(path, threads):
    # Weights stay resident; two dummy decodes warm the kernels before ready is reported.
    import numpy as np, onnxruntime as ort, onnx_asr
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    m = onnx_asr.load_model(NAME, path=path, quantization='int8', providers=['CPUExecutionProvider'], sess_options=so)
    noise = (np.random.default_rng(0).standard_normal(16000) * 200).astype('<i2').tobytes()
    for _ in range(2): decode(m, noise)
    return m

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
    model = load(snapshot(cfg['repo'], cfg['rev'], cfg['cache'], True), cfg.get('cpu_threads', 4))
    emit({'ev': 'ready', 'device': 'cpu', 'reason': None})
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
            load(snapshot(sys.argv[2], sys.argv[3], sys.argv[4], True), 4)
            print(json.dumps({'ok': True, 'device': 'cpu'}))
    except Exception as e:
        emit({'ev': 'error', 'message': str(e)}); sys.exit(1)
`

export const parakeetScript = (dir: string): string => writeScript(dir, SCRIPT)
