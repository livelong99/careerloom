---
name: 20261001-bundle-bootstrap
description: First-launch auto-install of node/python/git/career-ops/opencode, Windows setup.exe with embedded runtimes, faster-whisper CUDA STT; branch feat/bundle-app (Copilot merged in)
type: project
---

**Task:** bundle all dependencies, install at first launch, agent-pasteable fix prompt on failure, Windows installer carries runtimes, CUDA STT for Copilot on Windows
**Branch:** feat/bundle-app (merged feat/resume-job-copilot first). Uncommitted.
**Date:** 2026-10-01

**Files changed:**
- `electron/runtime/*`: paths, manifest, download (sha256 + tar), bootstrap steps, failure-prompt (redacted), tests
- `build/runtime-manifest.json`, `scripts/fetch-runtime.mjs`, `package.json`, `release.yml`: Node 22 / Python 3.12 (PBS) / MinGit embedded per win arch via extraResources; manifest shipped at resources/runtime-manifest.json
- `electron/copilot/stt/{gpu,faster-whisper,faster-whisper-script}.ts` + runtime/install/engines: CTranslate2 CUDA12 engine (no torch), defaultEngine() picks it on win/linux with usable NVIDIA GPU
- `renderer/components/bootstrap/*`, `Onboarding.tsx`, `App.tsx`: setup screen, Copy fix prompt, Retry

**Decisions made:**
- Windows embeds runtimes (no admin, offline); mac/linux download same manifest assets to ~/.careerloom/runtime. Alternatives: NSIS download-at-install.
- Heavy model installs (prescreen ~1.4 GB, STT) auto-run after core steps, non-blocking.
- Copilot merged into this branch rather than split.

**Blockers & resolutions:**
- Review: manifest unpackaged, career-ops retry adopting half-installed folder, redaction on Windows paths, non-atomic swap → all fixed.

**State:** in_progress (nothing run on Windows/GPU; typecheck + 1585 tests green on Mac)

**Next steps:**
- Build `npm run package:win` on Windows/CI, install on a clean VM, run first-launch end to end
- Run Copilot "Benchmark on this computer" on an NVIDIA machine; verify ctranslate2 4.6.0 + cuDNN 9.1/cuBLAS 12.4 pins
- Live-test mac first-launch on a cloned profile (CAREERLOOM_NO_BOOTSTRAP=1 skips auto-start)
- Bump version to 0.3.0 and tag when ready
