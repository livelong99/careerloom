---
name: careerloom-overview
description: START HERE — Careerloom current state (v0.1.1), architecture map, how to run/test/ship, and the consolidated open-items list
metadata:
  type: project
---

**What it is:** Electron + React desktop job-search engine over [career-ops](https://github.com/career-ops-hq/career-ops).
Repo: github.com/livelong99/careerloom (private). Latest release **v0.1.1** (2026-09-28): mac dmg arm64/x64 + Windows NSIS x64/arm64, unsigned. package.json is **0.2.0** (OpenCode + Zen runners), not yet tagged/built.

**Screens:** Overview · Jobs (full-width table, pre-screen, evaluate) · Boards (board table, editor sheet, Scans history, New scan) · Resume · Agent (chat) · Monitoring · Integrations · Settings · Onboarding (6 steps incl. optional Local model).

**Architecture map (electron/):**
- `main.ts` FEATURES handler registry, IPC `careerloom:<method>`, preload bridge `window.careerloom`; types in `contract.ts` (re-exported by `renderer/lib/types.ts`).
- Runners `runner.ts` (claude / codex `exec --sandbox workspace-write` / agy sandboxed project / opencode `run --format json` / OpenRouter); `zen` = in-process agent loop on OpenCode Zen (`zen-agent.ts`, `zen-tools.ts`, `mcp-client.ts`, `opencode.ts`); `context.ts` launch/launchTask, run history + `run-logs/`.
- Jobs: `jobs.ts`, `jobs-data.ts` (pipeline+tracker merge), `jobs-batch.ts` (per-job career-ops batch worker, ensureTracker).
- Pre-screen: `prescreen*.ts` (rules: location→function→seniority), `fit-sidecar.ts` (verdict-small base + gated personal layer), `prescreen-model.ts` (install to ~/.careerloom/model).
- Boards: default = India starter pack (24 boards, `category:` Common/Tech/Finance/Consulting, disabled) in `portal-defaults.ts` `presetBoards`; career-ops' portals.example.yml no longer seeded. `integrations/sources.ts`, `portal-*.ts`, `web-board*.ts` (Firecrawl→JSON-LD→agent), `browser-*.ts` (Chrome cookies via tldts + @playwright/mcp@0.0.82, read-only tools, nav lock), `scan-history.ts`.

**Run / test / ship:**
- `npm run dev` · `npm run typecheck` (both tsconfigs) · `npm test` (vitest, 376 tests at v0.1.1) · `npm run build`.
- Installers: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac` and `--win` (nsis toolset pinned 1.2.1 for Apple Silicon). Release: tag `v<semver>` (update checker reads that), draft → upload assets one by one → publish.
- QA on a **cloned profile + copied career-ops folder**, never the user's real data (seed/scans write to portals.yml / pipeline.md).

**Open items (supersede the "Next steps" in older session files):**
- Live-test OpenCode + Zen runners on the Mac (opencode.ai blocked in cloud); then tag v0.2.0.
- Replace 17 VoiceStudio-derived UI files (AGPL-3.0, listed in THIRD_PARTY_NOTICES.md) with shadcn/ui MIT versions.
- Repo is private → downloads + in-app update check only work for the owner until made public.
- Browser boards: cost ~$0.47/LinkedIn page; next options B (Careerloom scrolls + targeted snapshot + Haiku) and C (no-LLM extractors for LinkedIn/Naukri/Indeed/Glassdoor) — user hasn't chosen.
- "Pre-screen new jobs after scan" hook (scans end in main; needs prescreen call on exit).
- Windows untested (DPAPI cookies, npx.cmd, torch CPU install); live Codex browser run untested.
- Code signing / notarization; user's pipeline has ~5.2k queued jobs from the old seeded default boards — Boards → Add board → "Switch to India starter pack…" removes those boards (hides their unevaluated jobs).
- India starter pack URLs/fetch modes are from web research that couldn't open the pages (sandbox) — verify each board scans on the Mac.

Related: [[careerloom-user-root]], [[careerloom-working-preferences]], [[agy-headless-permissions]].
