---
name: 20260928-prescreen-model-webboards
description: "Careerloom pre-screen v2 (rules + verdict-small public base + gated personal layer), evaluate-state fix, any-job-board via Firecrawl, browser boards via Chrome cookies + Playwright MCP"
metadata:
  node_type: memory
  type: project
  originSessionId: deac2367-bf24-4ed3-8108-2de3c6ff242f
  modified: 2026-09-27T18:51:14.334Z
---

**Task:** Pre-screen model choice/training, evaluate bug, generic + browser job boards
**Branch:** main (uncommitted; installers in release/ predate this work)
**Date:** 2026-09-28

**Files changed:**
- `electron/jobs-batch.ts`: ensureTracker() creates data/applications.md; merge before each batch (tracker missing stranded results)
- `electron/jobs-data.ts`: done pipeline rows `[x] [N](…)` = evaluated w/ score; SKIP → evaluated
- `electron/prescreen*.ts`, `prescreen-geo.ts`, `prescreen-model.ts`, `fit-sidecar.ts`, `fit-base-head.ts`: gates location→function→seniority, then verdict-small (torch CPU) base (TechWolf/ESCO ISCO-3 head, 102 KB embedded) × keyword prior; personal layer gated (≥5/class, CV +2pts & lower logloss, ±3 logit budget, 400 replay titles)
- `renderer/components/onboarding/ModelStep.tsx`: optional "Local model" onboarding step, installs ~/.careerloom/model (python ≥3.10 venv + weights)
- `electron/integrations/web-board*.ts`, `browser-*.ts`, `AddWebBoardDialog.tsx`: any board via Firecrawl→JSON-LD→agent JSON→career-ops local-parser; `fetch: browser` = Chrome cookies (domain-scoped via tldts) + @playwright/mcp@0.0.82 --allowed-origins, read-only tools
- `electron/main.ts`: sweepCookieTemp() at startup; package.json: +tldts dependency
- `renderer/components/jobs/prescreen.tsx`/`JobsTable.tsx`: QuickFeedback 👍/👎 per row; cold-start note no longer an error toast

**Decisions made:**
- Model = Manav2op/verdict-small@085a41e0 on CPU (benchmark: 0.965 acc, best with few labels, 0.75 GB); laya-mlx & laya-decide removed. Alternatives: Julia-1 (0.970, heavier), Laya English (0.901).
- Nothing ML bundled in installers; user installs model in onboarding. CUDA not used (no gain at title scale).
- Public base alone ties rules (0.832); base×rules default = 0.897. Personal layer anti-pollution: 20% flipped labels cost ≤0.6 pts vs 17 pts user-only.
- Browser boards skip robots.txt (own session, per-domain ToS ack); Firecrawl boards enforce it. Antigravity unsupported for browser boards.

**Blockers & resolutions:**
- Parallel model loads hung the 16 GB Mac → one model process at a time, MPS watermarks 0.5/0.4, memory checks.
- Security review: partial PSL leaked cross-site cookies → tldts fail-closed; navigate exfil → --allowed-origins.
- A running `npm run dev` holds the single-instance lock → test with `--user-data-dir` clone (scratchpad ud2).

**Publish (2026-09-28):** private repo github.com/livelong99/careerloom, history squashed to clean initial commit (old history on local branch backup/pre-publish, unpushed); MIT LICENSE + THIRD_PARTY_NOTICES.md (17 VoiceStudio-derived UI files documented as AGPL-3.0, pending replacement — user's choice); release v0.1.0 with dmg arm64/x64 + Setup.exe + SHA256SUMS; launch video brag-output/brag.mp4 (gitignored).

**State:** done

**Next steps:**
- Replace VoiceStudio-derived renderer/components/ui/* with shadcn/ui MIT versions
- Repo is private: update checker + downloads need it public
- Live Codex browser run; Windows untested (DPAPI, npx.cmd, torch CPU install)
- Decide gate threshold (2 pts conservative at ~50 labels) and headline fallback when profile has no target roles
