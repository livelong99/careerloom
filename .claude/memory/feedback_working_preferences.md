---
name: careerloom-working-preferences
description: How the user wants work done on Careerloom — commits, attribution, resources, QA safety, public-facing wording, installs
metadata:
  type: feedback
---

- **Commit/push/release only when asked.** No `Co-Authored-By` or "Generated with" lines (project CLAUDE.md rule).
  **Why:** user owns authorship. **How to apply:** conventional messages, ask before committing.
- **Public-facing text stays vendor-neutral:** README, release notes, videos, share copy never credit Claude/Anthropic; supported runners may be listed neutrally (Claude Code, Codex, Antigravity, OpenRouter).
- **16 GB Mac: one model/heavy process at a time.** Parallel model loads hung the machine. Cap memory, check `memory_pressure` first, render with ≤3 workers.
- **Never quit/replace the installed app mid-run.** Check `/Applications/Careerloom.app` has no child processes (scan.mjs, claude, codex, agy) before swapping; a mid-scan quit killed a user's scan on 2026-09-28.
- **QA on clones only:** `--user-data-dir` copy + career-ops copy with settings.json root repointed; remove the copied SingletonLock.
- **Nothing ML bundled in installers** — model/Python installs happen in onboarding.
- **Style:** ponytail (minimal diffs, reuse, <500-line files), ui-ux-pro-max for UI work, verify in the running app with screenshots before reporting.
- **Licences matter:** check before vendoring code/data (VoiceStudio is AGPL; onetake is PolyForm Noncommercial — never copy into the repo).

Related: [[careerloom-overview]].
