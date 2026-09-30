import fs from 'node:fs'
import path from 'node:path'

// Moonshine streaming sidecar (plan §3.2). stdin frames: [type u8][len u32 BE][payload], type 1 config JSON,
// 2 PCM16 mono 16 kHz, 3 flush. stdout: JSON lines {ev: ready|partial|final|endOfTurn|error, text, t0, t1} (ms).
// `selftest <model> <cache>` / `fetch <model> <cache>` are the installer's steps. Importable without running.
export const SCRIPT = String.raw`
import json, struct, sys
from pathlib import Path

ARCHS = {'tiny': 'TINY_STREAMING', 'small': 'SMALL_STREAMING', 'medium': 'MEDIUM_STREAMING'}

def emit(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def load(model, provider, cache, interval=0.5):
    from moonshine_voice import Transcriber, ModelArch, get_model_for_language
    path, arch = get_model_for_language('en', getattr(ModelArch, ARCHS[model]), cache_root=Path(cache))
    opts = {} if provider in ('auto', 'cpu') else {'ort_providers': provider}
    return Transcriber(path, arch, update_interval=interval, options=opts)

def ms(x): return int(round(float(x) * 1000))

def serve():
    import numpy as np
    from moonshine_voice.transcriber import TranscriptEventListener
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
    tr = load(cfg['model'], cfg.get('provider', 'auto'), cfg['cache'])
    stream = tr.create_stream(update_interval=0.5)
    class L(TranscriptEventListener):
        def on_line_text_changed(self, e):
            l = e.line; emit({'ev': 'partial', 'text': l.text, 't0': ms(l.start_time), 't1': ms(l.start_time + l.duration)})
        def on_line_completed(self, e):
            l = e.line; t = {'text': l.text, 't0': ms(l.start_time), 't1': ms(l.start_time + l.duration)}
            emit({'ev': 'final', **t}); emit({'ev': 'endOfTurn', 'text': '', 't0': t['t1'], 't1': t['t1']})
    stream.add_listener(L()); stream.start()
    emit({'ev': 'ready'})
    while True:
        head = read(5)
        if not head: break
        n = struct.unpack('>I', head[1:])[0]
        body = read(n) if n else b''
        if head[0] == 2 and body:
            stream.add_audio((np.frombuffer(body, dtype='<i2').astype('float32') / 32768.0).tolist(), 16000)
        elif head[0] == 3: break
    stream.stop(); tr.close()

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    try:
        if cmd == 'serve': serve()
        elif cmd == 'fetch':
            load(sys.argv[2], 'cpu', sys.argv[3]).close(); print('ok')
        elif cmd == 'selftest':
            tr = load(sys.argv[2], 'cpu', sys.argv[3]); s = tr.create_stream(update_interval=0.5); s.start()
            s.add_audio([0.0] * 16000, 16000); s.stop(); tr.close(); print('ok')
    except Exception as e:
        emit({'ev': 'error', 'message': str(e)}); sys.exit(1)
`

/** Write the script into `dir` (once per content change) and return its path. */
export function sidecarScript(dir: string): string {
  const file = path.join(dir, 'careerloom_stt.py')
  let cur = ''
  try { cur = fs.readFileSync(file, 'utf8') } catch { /* first run */ }
  if (cur !== SCRIPT) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, SCRIPT) }
  return file
}
