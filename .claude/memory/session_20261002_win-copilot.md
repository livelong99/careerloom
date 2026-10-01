---
name: 20261002-win-copilot
description: Interview Copilot enabled on Windows (capabilities gate, SAPI system voice, ms-settings links, tray icon, labels); worktree cleanup 33→55 GB; commit 6af1741 pushed to PR #3
type: project
---

**Task:** clean old Orca worktrees, then enable Copilot on Windows. **Branch:** livelong99/win-copilot → pushed to feat/resume-job-copilot (PR #3), commit 6af1741. **Date:** 2026-10-02

**Cleanup:** removed 40 merged+clean worktrees via `orca worktree rm` (every tip was an ancestor of feat/resume-job-copilot); kept Bundle-App (dirty, live terminal). Parallel removal hit 98% CPU (Orca + fseventsd/mds) → gate each removal on ≥50% idle.

**Files changed (32):**
- `electron/copilot/capabilities.ts`: copilot + live on win32 (mac live still Apple silicon)
- `electron/copilot/audio-perms.ts`, `defaults.ts`: `ms-settings:` panes, screen = granted on Windows, `askForMediaAccess` optional, platform error text
- `electron/tts/say.ts`: Windows SAPI voices via PowerShell (text via temp file, voice quote-escaped)
- `electron/copilot/tray-icons.ts`, `overlay-runtime.ts`: mid-gray idle ring on Windows (black vanishes on dark taskbar)
- `renderer/lib/platform.ts` `copilotSupportedHere()`: App, Sidebar, Copilot + Settings pages, InterviewPrep; `kbdLabel`/`accelLabel` show `Ctrl+Alt+A`; recorder uses `Super`; Dock + Screen Recording rows hidden on Windows
- error strings → "macOS and Windows only" (copilot/kb/interviewer handlers); tests updated, Windows cases added

**State:** typecheck + 2139 tests green on Mac. NOT run on Windows hardware.
**Next steps:** Windows VM/CI: `npm run package:win`, install, mic permission, hotkeys (Ctrl+Alt+letter = AltGr on EU layouts), SAPI voice, content protection (needs Win10 2004+), faster-whisper CUDA vs Moonshine. System-audio capture still "coming soon" (Electron loopback is the Windows path). Commit when asked.
