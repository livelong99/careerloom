// Source of the Kokoro ONNX sidecar (kokoro-onnx 0.6.1), written to ~/.careerloom/tts/bin on install. Framed protocol: see the header comment.
export const KOKORO_SCRIPT = String.raw`# Careerloom Kokoro sidecar: JSON lines in on stdin, framed PCM16 out on stdout.
# in : {"id":1,"text":"...","voice":"af_heart","speed":1.0} | {"op":"voices"} | {"op":"quit"}
# out: frames <u32 id><u32 nbytes><pcm16 24 kHz mono LE>; nbytes==0 ends request id; id 0 = JSON control reply (nbytes of UTF-8 JSON follow).
import asyncio, json, struct, sys
import numpy as np
from kokoro_onnx import Kokoro

def emit(rid, payload):
    sys.stdout.buffer.write(struct.pack('<II', rid, len(payload)) + payload)
    sys.stdout.buffer.flush()

async def serve(k):
    loop = asyncio.get_running_loop()
    emit(0, json.dumps({'ready': True}).encode())
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            return
        try:
            req = json.loads(line)
        except ValueError:
            continue
        if req.get('op') == 'quit':
            return
        if req.get('op') == 'voices':
            emit(0, json.dumps({'voices': sorted(k.get_voices())}).encode())
            continue
        rid = int(req['id'])
        try:
            async for samples, _sr in k.create_stream(req['text'], voice=req.get('voice', 'af_heart'), speed=float(req.get('speed', 1.0)), lang='en-us'):
                emit(rid, (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        except Exception as e:  # report, keep serving
            emit(0, json.dumps({'error': str(e)[:200], 'id': rid}).encode())
        emit(rid, b'')

def selftest(k):
    samples, sr = k.create('Hello, this is a test.', voice='af_heart', speed=1.0, lang='en-us')
    if sr != 24000 or len(samples) < 2400:
        sys.exit('self-test failed: no audio')
    print('self-test ok')

def main(model, voices, flag=None):
    k = Kokoro(model, voices)
    if flag == '--selftest':
        selftest(k)
        return
    asyncio.run(serve(k))

if __name__ == '__main__':
    main(*sys.argv[1:4])
`
