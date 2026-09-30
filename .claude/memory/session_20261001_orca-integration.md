---
name: 20261001-orca-integration
description: Orca-orchestrated build of the Resume rework + fast browser driver, their integration branch, and the launch of the selected-job page agent
metadata:
  type: project
---

**Task:** Run Claude agents via Orca for (B) fast browser driver, (R) Resume rework, then integrate; start (J) selected-job page.
**Branches (local only, nothing pushed):** `livelong99/feat-browser-driver`, `livelong99/feat-resume-rework`, merged into `livelong99/integration-resume-browser` (worktree `~/orca/workspaces/Careerloom/integration-resume-browser`); `livelong99/feat-job-page` in progress.

**Decisions made:**
- Browser: the model-driven path (jev-ultrafast + openjev Laya/Verdict) FAILED its spike (40-60% / 17-55% on a 4-way choice; an if/else oracle scored 100%). Shipped deterministic CDP extractors + generic card finder + agent fallback: LinkedIn 25 jobs / 14.7 s / $0 vs $0.47 / 148 s. Write-up: docs/experiments/browser-jev-spike.md.
- Orca: `/usr/local/bin/orca` symlink is root-only; use `/Applications/Orca.app/Contents/Resources/bin/orca`. Supervised flow: run-create -> task-create -> `worker-start --worktree new-top-level --base-branch <branch> --agent claude --setup skip` -> `check --wait` -> reply/ack -> `worker-release`. Briefs live in /private/tmp/careerloom-orca/*.md.
- A Bash hook in this setup false-positives on `git commit --no-edit` and on any command text containing the hook-skip flag name (even inside a heredoc): use `git commit -m` and write notes with the file tool.
- Agents must never use bare `sed -i` on macOS (it created 38 stray `*-E` backup files once).

**Patterns confirmed:** decision gates after milestones caught real issues (stray files; a 240k-token analysis run, fixed to text-only runs at 24k); deterministic-first plus a cheap small model; a fact gate before and after any rewrite.

**State:** in_progress (J running; integration branch verified: 577 tests, typecheck and build green; smoke-tested on a cloned profile)

**Next steps:**
- Review J at the M1/M2 gates, merge J into the integration branch, final QA.
- Ask the user before pushing the integration branch, opening a PR, releasing, or updating the installed app.
