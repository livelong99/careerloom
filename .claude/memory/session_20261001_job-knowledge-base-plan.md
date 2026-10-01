---
name: 20261001-job-knowledge-base-plan
description: Research + design + plan (docs only) for per-job web-researched question base, AI-interviewer practice with TTS, live retrieval; G1 approved, G2 pending
type: project
---

**Task:** Job Knowledge Base + AI-interviewer practice with TTS (research -> design -> plan, no product code)
**Branch:** livelong99/kb-research-plan
**Date:** 2026-10-01

**Files changed:**
- `docs/plans/job-knowledge-base/{research,design,plan}.md`: phase 1-3 outputs; evidence in `research-notes/` (A repo blocks, B1 sources/ToS, B2 search backends, C KB design, D/D2 TTS + en-IN voices, E interviewer/echo/retrieval, F components)
- `docs/plans/job-knowledge-base/prototype/`: static HTML (kb, practice, session, debrief, settings) + 16 dark/light shots, `shoot.sh`

**Decisions made (G1, user via lead):**
- Brave via user key in Settings > API keys, keyless best-effort path with "fewer results" notice. Alternatives: Exa/Serper/SearXNG as fallbacks.
- ~50-70% sourced is fine if every item is labelled sourced/generated and generated is filterable (the "provenance thread" UI device).
- Indian-English voice wanted in M2: installed macOS en_IN voices (Aman, Rishi, Tara; offline, verified on dev Mac) default; Kokoro has no en-IN; cloud en-IN (Azure/Polly/Google) in M4. Premium TTS (Cartesia) is M4.
- Research runs are a Runs-page run kind `job-research`; the Runs page itself is another agent's work.
- Storage: per-job JSON + in-memory BM25, no new dependency (node:sqlite FTS5 works on Node 22.20 locally; Electron 43 bundles Node 24.17, packaged check pending).
- Echo: half-duplex gating default on speakers, barge-in only with headphones toggle; AEC not relied on.

**Patterns used / confirmed:**
- Practice already feeds the overlay via the same sink as live STT, so an AI interviewer only swaps the question source; cues/suggestions need no overlay change.
- Parallel read-only research agents each writing one notes file; fetch tool summaries make many prices V-s (snippet-level), tagged as such.

**Blockers & resolutions:**
- `/usr/local/bin/orca` symlink unreadable in the sandbox -> use `/Applications/Orca.app/Contents/Resources/bin/orca`.
- Primary ToS pages (SO, Reddit, Glassdoor, LeetCode, Medium) blocked to fetcher -> marked UNVERIFIED, listed as pre-launch reads (gate G-D).

**State:** in_progress (G2 pending)

**Next steps:**
- Lead approves plan at G2; dispatch WP0 (contract) then WP1/2/3/4/6 per plan.md section 11.
- Run spikes S-T1 (Kokoro latency/RAM), S-E1 (echo), S-V1 (en_IN voices), S-R1 (live research dry run, cap $1) when their WPs start.
