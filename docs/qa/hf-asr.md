# Any Hugging Face speech model (Copilot STT engine `hf`)

Users paste a Hugging Face model id or link in **Settings → Local models → Add a Hugging Face model**, check it, install it, then select/benchmark it like any other engine. NVIDIA Nemotron 3.5 ASR ships as a curated one-click row on the same engine.

## Design

| Piece | File |
|---|---|
| Parse id/URL, read metadata, verdict (pure, `fetch` injected) | `electron/copilot/stt/hf-models.ts` |
| Adapter (chunker + sidecar decoder, strips `<xx-XX>` tags) | `electron/copilot/stt/hf.ts` |
| Python sidecar (transformers ASR pipeline) | `electron/copilot/stt/hf-script.ts` |
| Pins, Nemotron constants, default options | `electron/copilot/stt/runtime.ts` (`PINS.hf`, `HF_*`, `NEMOTRON_*`) |
| Install argv, remove | `electron/copilot/stt/install.ts` (`installCommands('hf')`, `removeHfModel`) |
| IPC | `copilotHfCheck(input)`, `copilotRemoveStt(model)`; `copilotInstallStt(model)` routes `repo@sha` ids to `hf` |
| UI | `HfModelCard.tsx` (Local models), language row in Copilot → Transcription |

- Model id everywhere is `owner/name@<40-hex commit>`. `cfg.stt.model` for engine `hf` is dropped to `null` unless it matches (config.ts).
- Install dir `~/.careerloom/stt/hf/` (venv, `models/` HF cache, `ready.json` with the list of installed ids). One venv, many models; `ready.json.pin` = `PINS.hf`.
- Device: `auto` picks CUDA, else MPS (Apple silicon), else CPU; `cpu`/`cuda` honoured (CUDA falls back to CPU with a reason in the ready line). Reported in `ready.device`.
- Language (`cfg.stt.hf.language`, default `en-US`, or `auto`): passed to Whisper-type models through `generate_kwargs`; other models get it once and drop it for good if they reject it. `<xx-XX>` tags are stripped in the sidecar and again in `hf.ts`. `cfg.stt.hf.lookahead` (0/3/6/13 frames = 80/320/560/1120 ms) goes into the sidecar config as `lookahead_ms`; v1 decodes through the chunker so it is carried, not used.

## Safety decisions

1. **Weights**: only public, ungated models with `safetensors`. Pickle-only (`.bin/.pt/.ckpt`) is refused with the reason. A repo that also ships pickle files is allowed because only safetensors + `*.json/txt/model/tiktoken` are downloaded (`allow_patterns`, and `.bin/.pt/.pth/.ckpt/.pkl/.pickle/.py` in `ignore_patterns`).
2. **No custom code**: `trust_remote_code=False` always; `auto_map` in the API's config or the `custom_code` tag is refused at check time, and the sidecar re-reads `config.json` and refuses `auto_map` after download. No `.py` file is ever downloaded.
3. **Pinned commit**: Check returns the sha; the download uses `revision=<sha>`. The main process re-inspects at that sha right before installing (`assertHfInstallable`), so a verdict forged by the renderer or a repo changed since the check cannot be installed. A rev that is not a full sha (branch, short sha) is ignored, never passed on.
4. **Inputs**: repo id regex `^[A-Za-z0-9._-]{1,96}/[A-Za-z0-9._-]{1,96}$` (dot-only segments rejected), URLs only `https://huggingface.co` / `www.`; the API URL is built from the validated id with `encodeURIComponent`. All subprocesses use argv arrays (no shell string); the id is also re-validated in `installCommands`.
5. **Size**: warn > 3 GB, refuse > 8 GB (sum of safetensors file sizes, else parameters × dtype bytes; unknown size = warning). Gated/private (also 401/403 answers) refused.
6. **Offline at run time**: the session sets `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and loads the local snapshot path. The only network calls are the metadata check (main process, fixed host) and the installer's download.
7. Remove deletes only that repo's `models--owner--name` folder and its `ready.json` entry.

## Tests (all with fakes: no network, no Python, no weights)

`hf-models.test.ts` (parse, compat matrix, size boundaries, rev pinning, mocked HF API shapes, install gate), `hf.test.ts` (adapter on a fake sidecar: config frame, tag stripping, not-installed), `engines.test.ts` (Nemotron constant, list rows, install argv incl. torch index per platform/GPU, injection ids refused, remove, script safety strings, benchmark selection), `config.test.ts` (model/lang/lookahead validation), `handlers.test.ts` (IPC slots), `HfModelCard.test.tsx` (check → verdict states, install disabled on refusal, use/remove, licence note).

## NOT run / unverified (for the lead's real run)

- **No Python package installed, no model downloaded or loaded, no real transformers call.** `hf-script.ts` was only syntax-compiled.
- `NEMOTRON_REV` is a placeholder (40 zeros): fill it with the current sha from `https://huggingface.co/api/models/nvidia/nemotron-3.5-asr-streaming-0.6b`. Until then the curated row's install fails at the commit check.
- Package pins (`transformers==5.13.0`, `torch==2.9.1`, `huggingface_hub==1.2.3`, `soundfile==0.13.1`, `numpy==2.2.6`) were written from the plan, not resolved by pip; confirm they exist/co-install. Torch index URLs (`cu128`, `cpu`) likewise.
- Whether `pipeline("automatic-speech-recognition")` accepts a raw-array dict for `AutoModelForRNNT` (Nemotron), whether it takes a `language` option, and how it expects the `<xx-XX>` tag, are unknown; the sidecar falls back to a call without `language` on `TypeError/ValueError`. The 20 s partial / 50 s segment limits in `buffer.ts` were tuned for other engines.
- MPS behaviour/speed, the CUDA path, Windows, and benchmark numbers for `hf` are untested. The 16 GB memory check (`assertMemory`) is the existing one, not sized per model.
- The size/licence/language fields come from the HF API shape as documented (`siblings[].size` with `?blobs=true`, `cardData`, `config.auto_map`, `gated`); only mocked responses were tested. Licence text is shown by name (`cardData.license_name`/`license`), not the full text; the card links nothing.
