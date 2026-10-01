# Job Knowledge Base + AI-interviewer practice — Implementation plan (Phase 3)

Inputs: `research.md` (G1 approved with defaults), `design.md` + `prototype/`. Branch base: `feat/resume-job-copilot`. Docs only: nothing here is built yet. Tags as in research.md (V/I/U).

## 1. Context and scope

Deliver, for each Job: (a) a researched, indexed **question base**; (b) **practice** whose questions come from it, asked by an **AI interviewer that speaks** (TTS) while the existing live-style cues and suggestions stay visible; (c) **live-session retrieval** from the same base. G1 decisions in force: Brave via user key (Settings › API keys) with a keyless "fewer results" path; every item labelled sourced/generated, generated filterable; Indian-English voice wanted in M2 (installed macOS en_IN voices by default, offline); premium TTS in M4; research runs appear in the Runs page as run kind `job-research`.
Out of scope: scraping Glassdoor/LeetCode/Reddit/Blind/LinkedIn/Indeed/Medium; hiring-decision scoring; cloud sync; cross-job search (M4 gate).

## 2. Dependencies on other branches

| Dependency | State | Handling |
|---|---|---|
| Copilot (overlay, engine, practice, sessions, STT, screenshots) | on base | extended in place by WP4/WP5/WP7 through the owners named in §11 |
| Settings rebuild (12 pages, key manager) | on base | `PageId` + `KeyId` additions (WP6) |
| Job page (6 tabs, `reportParse`, `jdStructure`) | on base | new tab (WP3), reads `Structured` posting |
| **Runs page** (separate agent, replaces the side drawer) | in flight | We only emit run records: `launchTask({runner:'research', mode:'job-research', label:'Job research · <title>', input:<jobId>})`; WP0 widens the `mode` string union if it is typed (it is `string` in `contract.ts:34` action, V; `RunRecord.mode` type to confirm). The KB tab links with `goToRun(runId)`; if the Runs page is not merged, the link falls back to the existing runs drawer. No Runs-page code is written here. |
| Pre-screen model (optional) | on base | reused only for offline embedding rerank/dedupe in M4; never on the hot path |

## 3. Architecture

```
renderer                              main (electron/)                                 external
─────────                             ──────────────────                               ────────
Job›KB tab ──kb* IPC──────────────►  kb/handlers ─► kb/store (JSON) ─► kb/index (BM25)
Practice page ─copilotStart(plan)─►  copilot/handlers ─► interviewer/runner ──┐
Settings›Interview prep ─►           kb/config  ·  settings/keys                │ uses
overlay ◄─ events (question, caption,   interviewer/{select,persona,probe,score}│
           ttsState, suggestion) ───    ─► copilot/engine (cues, unchanged) ◄───┤ KB matches in user turn
overlay playback (AudioContext) ◄PCM─  tts/{service,say,kokoro,openrouter,split} ┘
mic frames ─► audio-in ─► echo-gate ─► STT (existing)
                                      kb/research/pipeline ─► search/{brave,exa,serper,searxng} ──► web APIs
                                         ─► fetch(http→cdp→firecrawl, SSRF+robots) ─► pages
                                         ─► extract/classify/generate (helper-tier LLM, no tools)
                                         launched by context.launchTask (Runs, cancel, log)
```

### 3.1 Module map (new files; sizes are targets, ≤ 500 lines each)

```
electron/kb/
  types.ts            KbItem, SkillNode, SourceRef, KbNotes, KbManifest, ResearchPlan, ResearchProgress   (WP0)
  config.ts           interview.json load/validate/migrate (§7)                                          (WP6)
  store.ts            per-job folder read/write, atomic, locks, merge-by-id, import/export                (WP1)
  bm25.ts             tokenizer + BM25 (k1 1.2, b .75), field boosts, in-memory                           (WP1)
  retrieve.ts         retrieve(jobId, query, {type,k}), kbPrefix(jobId, budgetTokens), selectionPool()     (WP1)
  hash.ts             inputHash, contentHash, query/page cache keys                                       (WP1)
  sources.ts          allow-list tiers, denylist (§9), licence tags, attribution strings                  (WP2)
  research/
    plan.ts           queries from jdStructure + gaps + skills table; privacy filter                     (WP2)
    search/{adapter,brave,exa,serper,searxng,fake}.ts   SearchBackend interface + adapters             (WP2)
    fetch.ts          http → raw CDP (browserPageText) → Firecrawl; SSRF; robots; 1 req/s/host; caps    (WP2)
    robots.ts         robots.txt cache (24 h), RFC 9309 parse                                            (WP2)
    extract.ts        page text → candidate items (schema-validated JSON, evidence spans)                (WP2)
    guard.ts          injection markers, URL/markdown stripping, evidence-span check                      (WP2)
    dedupe.ts         normalise + shingle Jaccard ≥ .8 merge, `seen` count                               (WP2)
    classify.ts       type/skill/difficulty (rules first, helper LLM for the rest)                        (WP2)
    generate.ts       outline/rubric/follow-ups + gap-fill generated items (cap 30 %)                    (WP2)
    budget.ts         spend/time caps, cost meter (reuse copilot/cost.ts), degrade to partial             (WP2)
    pipeline.ts       phases, checkpoints in run.json, resume, progress events                           (WP2)
  handlers.ts         `kb*` IPC (stubs in WP0, real in WP1/WP2)
electron/interviewer/
  types.ts            InterviewPlan, InterviewerState, Turn, Rubric                                      (WP0)
  select.ts           next-question scoring (§6.2)                                                        (WP4)
  persona.ts          system prompt builder (style, seniority, strictness, mode)                          (WP4)
  probe.ts            follow-up checklist + LLM phrasing, ≤ 2 per question                                (WP4)
  runner.ts           `createInterviewerRunner` implementing the existing PracticeRunner interface        (WP4)
  score.ts            per-question rubric scoring, stats write-back                                      (WP4)
electron/tts/
  adapter.ts          TtsEngine { id, voices(), synth(text, voice, speed, signal): AsyncIterable<Pcm> }   (WP5)
  say.ts              macOS `say --file-format=WAVE --data-format=LEI16@24000 -o` → PCM; voice list      (WP5)
  kokoro.ts, kokoro-script.ts, install.ts    ONNX sidecar, on-demand install (prescreen-model pattern) (WP5)
  openrouter.ts       /api/v1/audio/speech, pcm output, sentence-sized requests                           (WP5)
  split.ts            sentence splitter for streamed LLM tokens                                           (WP5)
  service.ts          engine selection + fallback chain, prefetch of sentence N+1, cancel                  (WP5)
electron/copilot/echo-gate.ts    half-duplex gate, tail, push-to-interrupt, headphone barge-in           (WP5)
renderer/overlay/playback/       PCM queue → AudioContext, gapless, cancel, `ttsState` events            (WP5)
renderer/components/kb/**        BankTable, CoverageRail, ItemSheet, ResearchRun, Empty states            (WP3)
renderer/components/job/KnowledgeTab.tsx                                                                 (WP3)
renderer/sections/copilot/Practice.tsx (rewrite) + components/copilot/{ModePicker,VoicePicker,FocusSkills,SessionSummary}.tsx   (WP4)
renderer/overlay/{InterviewerRow,Caption,InterviewControls}.tsx                                           (WP4)
renderer/components/settings/pages/InterviewPrep.tsx                                                      (WP6)
```

### 3.2 Data flow: research (one job)
1. `kbResearchStart(jobId, {depth, budgetUsd, minutes, allowAgent})` → `kb/handlers` checks consent (first run), key/fallback, estimate; `launchTask` → run id returned.
2. **plan**: `jdStructure` (`techStack`, `skills`, `aboutCompany`) + report gaps/keywords + `extractSkills` ⇒ ranked `SkillNode[]` (weight = JD emphasis × gap boost); ~18–20 queries from templates; every query passes `privacyFilter` (rejects strings containing cv facts, emails, phone numbers, or ≥ 6-word spans copied from `cv.md`).
3. **search**: adapter chain (Brave → Exa → Serper → SearXNG) with per-adapter budget; results de-duped by canonical URL; denylisted hosts removed; cache lookup (7 d).
4. **fetch** (concurrency 6, 1 req/s/host): robots.txt; SSRF guard (reuse `validateScrapeTarget`+`assertPublicResolution`); HTTP→JSON-LD/text; empty ⇒ CDP (one Chrome at a time) ⇒ Firecrawl; page cache 14 d; text capped 12k chars; **no page text persisted**, only `contentHash`.
5. **extract**: helper-tier model, fetched text inside delimiters, no tools; returns `[{text, type?, skills?, evidence, note}]`; `guard` verifies the evidence span occurs in the page text and strips URLs/markdown; failures dropped.
6. **dedupe → classify → rank → generate** (outline/rubric/follow-ups in batches of 8; gap-fill generated items only where coverage < need, cap 30 % of bank, `confidence ≤ .4`).
7. **commit**: write `items.json` etc. atomically, merge into an existing KB by `item.id` preserving `user.*`/`stats.*`; manifest `status: complete|partial|failed`; emit progress events throughout (also written to run log).

### 3.3 Data flow: practice turn (text then voice)
`runner.start()` → `select.next(state)` picks an item → persona prompt (+item rubric) → LLM streams the question (or uses the item text verbatim for sourced items; the LLM only rephrases tone) → `split.ts` → `tts.service.speak(sentence)` while `sink.question/line` publish caption text immediately → cues/suggestions run exactly as in live (the engine receives the question) → user answers (STT, or typed) → on end-of-turn `runner.feed()` → `probe` decides follow-up (checklist) or next question → at end `score.ts` writes `Scorecard` + `KbItem.stats` and the heat-map data.

## 4. IPC contract (TypeScript, additive; frozen at G-A)

```ts
// electron/kb/types.ts (excerpt; full schema in research-notes/C-kb-design.md)
export type KbStatus = 'none' | 'running' | 'complete' | 'partial' | 'failed' | 'stale'
export type KbSummary = { jobId: string; status: KbStatus; researchedAt: number | null; items: number; sourcedPct: number; sources: number; costUsd: number; inputChanged: boolean; runId: string | null; coverage: Array<{ skillId: string; name: string; have: number; need: number; expected: Expected; inCv: boolean }> }
export type KbFilter = { types?: KbQuestionType[]; skills?: string[]; difficulty?: [number, number]; provenance?: Provenance[]; sourceKinds?: string[]; hidden?: boolean; text?: string }
export type ResearchOptions = { depth: 'quick' | 'standard' | 'deep'; budgetUsd: number; minutes: number; allowAgent: boolean; noSearch?: boolean }
export type ResearchEstimate = { usdLow: number; usdHigh: number; minutes: number; backend: 'brave' | 'exa' | 'serper' | 'searxng' | 'none'; needsKey: boolean }
export type ResearchProgress = { runId: string; phase: 'plan' | 'search' | 'fetch' | 'extract' | 'dedupe' | 'generate' | 'commit'; done: number; total: number; spentUsd: number; elapsedMs: number; pages: number; itemsFound: number; skipped: number; note?: string }
export type InterviewPlan = { mode: 'recruiter' | 'mixed' | 'behavioural' | 'technical' | 'system-design' | 'coding'; minutes: number | null; focusSkills: string[]; difficulty: 'adaptive' | 'easier' | 'match' | 'harder'; includeGenerated: boolean; persona: { style: string; seniority: string; strictness: 1|2|3|4|5; name: string }; voice: { engine: 'system' | 'kokoro' | 'openrouter'; voiceId: string; speed: number }; echo: 'speakers' | 'headphones'; itemIds?: string[] }

export interface KbApi {
  kbSummary(jobId: string): KbSummary
  kbList(jobId: string, filter?: KbFilter): KbItemView[]                // views never include raw cv text
  kbItem(jobId: string, itemId: string): KbItemDetail                   // incl. sources, whyForYou (computed at read time)
  kbEstimate(jobId: string, opts: ResearchOptions): ResearchEstimate
  kbResearchStart(jobId: string, opts: ResearchOptions): { runId: string }
  kbResearchStop(runId: string): void
  kbItemUpdate(jobId: string, itemId: string, patch: Partial<Pick<KbItem, 'text'|'type'|'skills'|'difficulty'>> & { pinned?: boolean; hidden?: boolean; notes?: string | null }): KbItemView
  kbItemAdd(jobId: string, item: { text: string; type: KbQuestionType; skills: string[]; difficulty: 1|2|3|4|5 }): KbItemView
  kbItemRemove(jobId: string, itemId: string): void                     // user items only; others are hidden
  kbExport(jobId: string): string                                        // path written under userData/exports
  kbImport(jobId: string, file: string): { added: number; skipped: number }
  kbSearchKeyTest(): { ok: boolean; backend: string; message?: string }
  kbOpenSource(sourceId: string): boolean                                // http(s) allow-list → shell.openExternal
  interviewVoices(): Array<{ engine: TtsEngineId; id: string; name: string; lang: string; offline: boolean; installed: boolean; sizeMb: number | null; note: string | null }>
  interviewPreviewVoice(engine: TtsEngineId, voiceId: string, speed: number): void
  interviewInstallVoice(engine: 'kokoro'): { runId: string }
  interviewPlanPreview(jobId: string, plan: InterviewPlan): { questions: number; sourced: number; usd: number; minutes: number }
}
// Existing StartRequest gains: `interview?: InterviewPlan` (practice only). Absent ⇒ today's behaviour (report questions).
export type KbEvents = {
  kbProgress: ResearchProgress                                   // also mirrored in the run log
  kbChanged: { jobId: string }
  interviewerState: { state: 'speaking' | 'thinking' | 'listening' | 'idle'; questionId: string | null; voice: string | null }
  ttsPlayback: { phase: 'started' | 'ended' | 'cancelled'; utteranceId: string }   // renderer → main, feeds echo gate
}
// PCM to overlay: send (not invoke) channel `careerloom:ttsAudio` { utteranceId, seq, pcm16: ArrayBuffer, sampleRate: 24000, last: boolean }
```
Rules: every handler validates input (jobId pattern, ids, lengths) like `copilot/store.ts` `checkId`; errors return the existing `Envelope` shape with actionable `actions` (`manage-key`, `change-model`).

## 5. Data model and storage

```
userData/kb/
  <jobId>/manifest.json   { schema:1, jobId, inputHash, researchedAt, runner, model, costUsd, searches, pages, status, coverage }
  <jobId>/items.json      KbItem[]   (≤ 400, ≤ 300 chars text)
  <jobId>/sources.json    SourceRef[] (url, title, host, kind, licence, fetchedAt, contentHash, trust) — no page text
  <jobId>/skills.json     SkillNode[]
  <jobId>/notes.json      KbNotes  (company/role/interviewer-style/loop bullets with source ids)
  <jobId>/run.json        checkpoint (phase, queries done, urls fetched, spend) — deleted on completion
  _cache/queries/<hash>.json   {query, backend, results[{url,title,snippet≤200}], at}    TTL 7 d
  _cache/pages/<hash>.json     {url, status, contentHash, extracted[], at}               TTL 14 d (extraction result, not page text)
  _company/<slug>.json        shared company/role notes reused by jobs at the same company (TTL 30 d)
userData/interview.json         config (§7)
userData/copilot/sessions/…     existing; SessionDetail gains optional `interview?: { planHash; itemIds[]; perQuestion: Array<{itemId; score; criteria; hintUsed; skipped}> }`
```
All writes: `writeAtomic` pattern (tmp + rename, mode 0600/0700 dirs like `copilot/store.ts`); a per-job in-process mutex serialises research commits and user edits. Corrupt file ⇒ `.bak` restore (as `settings-file.ts`). Deleting a Job leaves the KB until the user deletes it (snapshot shown). `KbItem.id = sha1(normalised text)` so refresh merges stably.
Disk budget: ≤ 8 MB/job (assert in `store.ts`); `_cache` pruned at app start (> TTL or > 50 MB).

## 6. Algorithms

### 6.1 Retrieval (live and practice)
- Index: documents = `text + skill names + followUps + idealOutline`; fields boosted ×3 / ×2 / ×1; tokenizer lowercases, splits on non-alphanumerics keeping `c++`, `c#`, `.net`, `node.js`; light suffix strip (s, es, ing, ed); stop-words removed; **BM25 k1=1.2, b=0.75** (the FTS5 defaults, V sqlite.org/fts5). Built at KB open (≤ 400 docs, ms), cached in memory per job, invalidated by `kbChanged`.
- `retrieve(jobId, {text, type, k=3})`: BM25 score × `(0.6 + 0.4·confidence)` × type match (1.0 same type, 0.7 other) × skill-in-question bonus (+0.15 per skill node whose canonical name or alias appears in the question), pinned ×1.1, hidden excluded. Budget: **p95 < 5 ms @ 400 items** target, hard ceiling 50 ms (harness fails otherwise).
- `kbPrefix(jobId, tokens=700)`: top skills by weight with expected level (≤ 6 lines) + top 8 items (pinned ∪ highest confidence, question + one-line outline) + 3 company/role note bullets; deterministic ordering (stable bytes ⇒ prompt-cache friendly); trimmed from the end.
- Optional (M4, gated): `vectors.f32` from the pre-screen sidecar for offline rerank/dedupe; **never** on the live path (the sidecar is a one-shot subprocess, V `fit-sidecar.ts`).

### 6.2 Question selection (practice)
`score(item) = jobWeight(skills) × (1 + 0.8·weakSkill) × novelty × typeBalance × (0.7 + 0.3·confidence) × pinBoost`, where `weakSkill` = the skill is a focus skill, a CV gap, or its `stats.avgScore` < 3; `novelty` = 0.2 if asked in the last 5 sessions else 1; `typeBalance` steers to the mode's mix (mixed loop target 3 behavioural : 4 technical : 1 design); generated items excluded if `includeGenerated=false`; deterministic seed from `sessionId` so tests are reproducible; difficulty ramp per `InterviewPlan.difficulty` (+1 after two answers ≥ 4, −1 after two ≤ 2). Opening: one recruiter-style warm-up from a small built-in set; closing: "any questions for me?" then wrap-up.

### 6.3 Probing
Checklist per answer (LLM returns booleans, code decides): missing S/T/A/R element, no metric, "we" without "I", no trade-off, no example. At most 2 probes/question, always for the weakest element; strictness scales probe probability (1 → 0.2, 5 → 0.9). Probe wording by the LLM from a fixed template set (keeps depth up, V-s PolyInterview follow-up weakness).

### 6.4 Scoring
Per question: criteria from `KbItem.rubric` (3–5) + the 4 existing Scorecard axes, each 1–5 with an evidence quote from the transcript; the prompt receives only the question, rubric and the user's answer (not the cv, keeping the call cheap and private); output validated by `parseScorecard`-style guard (existing `debrief.ts` pattern); results ranges not points in UI copy. Stats write-back: `asked++`, `lastScore`, `avgScore` EMA 0.5.

### 6.5 Echo gate and barge-in
State machine in main (`echo-gate.ts`) driven by `ttsPlayback` events:
`idle → speaking (drop mic frames, STT paused) → tail (350 ms, tunable) → listening`. `echo:'speakers'` ⇒ gate always on; push-to-interrupt hotkey (default `Space` while the panel is focused or `⌃⌥I` globally) cancels TTS ⇒ `cancelled` ⇒ tail ⇒ listening. `echo:'headphones'` ⇒ no gate; VAD barge-in when speech ≥ 300 ms and ≥ 2 words (Pipecat/Vapi-style thresholds, V) cancels TTS. Text-echo filter: any STT final whose normalised text has ≥ 0.8 token overlap with the last 2 spoken sentences is discarded. `getUserMedia` keeps `echoCancellation: true` as a bonus only (research E §1.2). Mic-leak self-test (Settings and first Practice start, speakers mode): plays a 1 s tone via the same path, measures mic RMS; if above threshold, shows "Your mic is picking up the speakers: use headphones or keep Speakers mode" (never silently changes mode).

### 6.6 TTS pipeline
LLM tokens → `split.ts` (sentence boundary on `. ! ? …` + newline, min 20 chars, abbreviation guard, flush on stream end) → `service.speak` queues sentences; **render sentence N+1 while N plays**; opening question pre-rendered during session start (system `say` costs ≈ 1.0–1.7 s per sentence, V local n=1, so the first audio is delayed unless pre-rendered). Engines return 24 kHz mono PCM16 chunks; renderer `AudioContext` schedules them gapless; `cancel()` fades 30 ms. Fallback chain on error/missing: selected engine → Kokoro (if installed) → OpenRouter Kokoro (if key) → system voice; a toast names the fallback. The voice picker lists installed `en_IN` system voices first (V: Aman, Rishi, Tara on the dev Mac), re-read via `say -v '?'` each time Settings opens (voices vary per Mac).

## 7. Config schema (`interview.json`, `version: 1`, same load/validate/clamp pattern as `copilot/config.ts`)

```ts
type InterviewConfig = {
  version: 1
  research: { model: string | null /* helper tier if null */; depth: 'quick'|'standard'|'deep'; budgetUsd: number /*0.30, clamp .05–2*/; minutes: number /*5, clamp 1–20*/;
              allowAgent: boolean /*false*/; search: { backend: 'brave'|'exa'|'serper'|'searxng'; fallbackOrder: string[]; searxngUrl: string | null };
              sources: Record<'stackexchange'|'github'|'taxonomy'|'hn'|'companyPages'|'articles', boolean>; consentVersion: string | null; refreshAfterDays: number /*30*/ }
  voice: { engine: 'system'|'kokoro'|'openrouter'; voiceId: string | null; speed: number /*.7–1.3*/; echo: 'speakers'|'headphones'; tailMs: number /*350, clamp 150–800*/; pushToInterrupt: string /* accelerator */ }
  kb: { retentionDays: number | null /* null = keep */; maxItems: 400 }
}
```
Defaults live in `defaults.ts` next to the type (as `copilot/defaults.ts`). Migration: none needed (new file). `copilot.json.practice.readAloud` is **read-through**: if true and `interview.json` absent, `voice.engine='system'` is used for old report-question practice; the toggle moves to the new voice section and `readAloud` stays in the type for compatibility (no destructive migration). Settings keys (`settings/keys.ts` `KeyId`): add `brave`, `exa`, `serper` (search) and, in M4, `cartesia`/`azure-speech`; `neededByRunners` stays empty (they are feature keys) so the "your runner needs" banner is unaffected. The secret names follow `secretName(id)`.

## 8. Renderer structure
Job page: `TABS` gains `['kb','Knowledge base']` + `TabsContent` → `KnowledgeTab` (props `jobId`), data via `useAsync`/`usePolled` on `kbSummary`, `kbList`; progress via `onCopilotEvent`-style subscription `onKbEvent('kbProgress')`. Practice page rewritten per design §3.2 (form state in `components/copilot/selection.ts`); `startPractice` builds `InterviewPlan`. Overlay panel: `InterviewerRow`, `Caption`, `InterviewControls` render only when `state.interview` is present; the cue/suggestion components are untouched; the chip is a new `KbChip` inside `SuggestionCard` shown when `suggestion.proof[].source` starts with `kb:`. Settings: `PageId` adds `'interview-prep'` after `copilot`; `PAGE_GROUPS` Workflows entry; deep links via `data-setting-id`. All strings sentence case; no new UI dependency (design §4).

## 9. Security, privacy and ToS compliance model

| Control | Implementation | Test |
|---|---|---|
| Outgoing queries contain role/company/skills only | `plan.ts` builds from structured fields; `privacyFilter` rejects emails, phones, ≥ 6-word spans from `cv.md`, user name | property test over 200 generated plans + a cv fixture full of PII |
| Allowed sources are explicit | `sources.ts` tier table (research §B2); user toggles can only *disable*; the never-fetch list is a **code constant** (linkedin.com, indeed.*, glassdoor.*, teamblind.com, leetcode.com, reddit.com, medium.com + subdomains) checked in `fetch.ts` and again in `sources.classify()` | unit test per host incl. subdomain and redirect-to-denied |
| robots.txt and politeness | `robots.ts` (RFC 9309 groups, longest match, 24 h cache); honest `User-Agent: Careerloom/<version>`; 1 req/s/host, global concurrency 6; `Retry-After`/429 backoff; disallowed ⇒ skipped, counted, never retried | fixture robots files |
| SSRF | reuse `validateScrapeTarget` + `assertPublicResolution`; https only; redirects re-validated each hop; response cap 2 MB; text cap 12k chars | existing tests + redirect-to-private fixture |
| Prompt injection | extraction/classification/generation calls use text-only neutral runs (`runText`) with **no tools**; page text inside `<<<PAGE_DATA … PAGE_DATA>>>` fence (reuse `neutralize`); JSON-schema output; URLs/markdown stripped; injection-marker pages dropped and counted; research never has cv access; separate from résumé workspace | poisoned-page fixture ("ignore previous instructions…", fake JSON, fake URL) ⇒ no item, no URL, logged |
| Hallucination control | evidence-span check; URLs only from search/fetch (LLM returns page indices); generated cap 30 % and `confidence ≤ .4`; outline/rubric always badged | property tests: every `sourced` item has ≥ 1 fetched source and span ⊂ page text |
| Copyright | per item: our wording ≤ 300 chars, note ≤ 280 chars, licence tag, retrieved-at, attribution rendered; no answer bodies; CC BY-SA / CC BY attribution strings from `sources.ts` | snapshot test of attribution rendering |
| Keys | `readSecret/writeSecret` via `settings/keys.ts`; never sent to renderer (only last 4); test-call stores no key | existing key tests extended |
| Consent | first research run dialog lists provider, fetch hosts, what is sent (role/skills/company), cost cap; `consentVersion` stored; changes to provider/sources re-prompt | UI test |
| Renderer CSP | unchanged (`connect-src 'self'`): all network in main; TTS audio as PCM over IPC into `AudioContext` (no `media-src` change) | CSP smoke test in cloned-profile QA |
| External links | `kbOpenSource(sourceId)` resolves id → stored URL in main; http(s) only | unit |
| AI-voice disclosure | "AI-generated voice" label in the voice picker and panel | UI test |
| Interview content safety | persona prompt forbids protected-trait/personal questions unless the user enables "rehearse tricky questions"; no medical/legal advice; scoring on content only | prompt tests with a scripted LLM |
Open compliance items before wider release (research, Open verification): read SO/Reddit/Glassdoor/Blind/LeetCode/Medium ToS in a browser, Brave storage clause, Tavily/Exa/Serper storage terms, counsel review of the summary policy (**Gate G-D**).

## 10. Cost and latency budgets

| Path | Budget | How enforced |
|---|---|---|
| Research per job | ≤ $0.30 and ≤ 5 min (default); typical ≈ $0.13 / 2–4 min (research §B5) | `budget.ts` pre-estimates, hard-stops at cap, marks `partial`; per-day cap in config later |
| Search spend | ≈ 20 × $0.005 (Brave) ; free $5 credit ≈ 50 jobs | counted per call from adapter price table (constants with `asOf` date, re-verified at release) |
| Live retrieval | p95 < 5 ms, ceiling 50 ms | `scripts/kb-latency.mjs` in CI-less manual gate; test fails above ceiling |
| Prefix size | `## QUESTION BASE` ≤ 700 tokens; total prefix ≤ 6000 (existing cap); KB trimmed before cv | unit test on `buildGrounding` |
| Practice turn (target) | end-of-answer → first audio ≈ 1.5–2 s: EOT ≤ 500 ms + next-question pick < 5 ms or probe LLM TTFT ≤ 600 ms + first sentence to TTS ≤ 300 ms + first audio ≤ 300 ms (Kokoro, to verify) | trace stages extended (`interviewer.*`) reusing `copilot/trace.ts`; shown in the debrief footer in dev |
| Practice session cost | LLM ≈ $0.02–0.05 (nano-class) + TTS $0 local / ≈ $0.02 OpenRouter Kokoro / ≈ $1.1 premium (M4) | `interviewPlanPreview` shows an estimate before Start |
| RAM | one heavy process at a time: Kokoro sidecar starts on session start and stops 60 s after the session; never while a research CDP browser is open; Whisper + Kokoro together are checked by `assertMemory()` (as `prescreen-model.ts`) | spike S-T1 measures on the 16 GB Mac |

## 11. Work packages (parallel Orca agents; one writer per worktree; each owns its files; shared files are WP0's)

Branch per package `livelong99/kb-wpN-<slug>` off integration branch `livelong99/kb-int`; milestone gates reported to the lead with `orca orchestration ask`; cloned-profile QA; live API spend per package ≤ $1 unless stated. Header-comment and style rules as in the Copilot plan (ponytail: minimal diffs, reuse, files < 500 lines). Heartbeat every 5 minutes, one `worker_done` each.

### WP0 — Contract, shell, config skeleton (integration owner; small; first)
Files: `electron/kb/types.ts`, `electron/interviewer/types.ts`, `electron/kb/handlers.ts` (stubs → `{status:'not-implemented'}`), `electron/contract.ts` (+ re-export), `electron/main.ts` (FEATURES entry), `electron/preload.ts`, `renderer/lib/types.ts`, `renderer/components/settings/pages.ts` (`'interview-prep'` + empty page stub), `renderer/sections/Job.tsx` (tab + stub), `electron/settings/keys.ts` (`brave|exa|serper` ids), `electron/kb/config.ts` skeleton + defaults + `config.test.ts`, run-mode union widening if typed.
Accept: `npm run typecheck && npm test` green; stub tab and stub Settings page render; `interview.json` round-trips; contract tagged in the dispatch. **Gate G-A.**

### WP1 — KB store, index, retrieval (after G-A)
Files: `electron/kb/{store,bm25,retrieve,hash,schema-guard,import-export}.ts` + tests, `electron/kb/fixtures/**` (golden KBs: 40-item and 400-item, original synthetic text), `scripts/kb-latency.mjs`, `electron/kb/relevance.test.ts` + `fixtures/labelled.json`.
Accept: store round-trip/merge-by-id keeps `user.*` & `stats.*`; atomic write + `.bak` restore tests; size/limit enforcement; import rejects malformed/oversized files; **relevance eval: 60 labelled (question → expected item) pairs, recall@3 ≥ 0.85, MRR ≥ 0.7** (thresholds proposed, adjust at G-R); latency harness p95 < 5 ms @ 400 items; `kbPrefix` ≤ 700 tokens and byte-stable across calls.

### WP2 — Research pipeline (after G-A; parallel with WP1 using the §4 types)
Files: `electron/kb/sources.ts`, `electron/kb/research/**`, `electron/kb/research/fixtures/**` (synthetic HTML/JSON pages written for the tests, incl. robots files, a poisoned page, a redirect-to-private, paginated results), `scripts/kb-research-dry.mjs`.
Accept: pipeline end to end on fake search + fake fetch produces a valid KB; budget stop yields `partial`; resume after a mid-fetch kill reproduces the same KB without re-spending (fake counters); privacy property test; denylist, robots, SSRF, poison tests green; backends contract-tested with recorded fixtures (Brave/Exa/Serper response shapes copied from their docs in the notes); **S-R1 live dry run** on 3 real jobs of the lead's cloned profile with `CL_LIVE_RESEARCH=1`, cap $1 total, produces `docs/plans/job-knowledge-base/spikes/S-R1.md` (yield: items/job, % sourced, cost, time, failures per host).
**Gate G-R:** lead reviews S-R1 (yield, cost, ToS observations) and confirms default depth/model/budget and allowed sources.

### WP3 — KB UI (after G-A; consumes the contract with a fake backend)
Files: `renderer/components/kb/**`, `renderer/components/job/KnowledgeTab.tsx`, `renderer/lib/kbFake.ts` (dev-only fake data behind `?fakeKb=1`), tests.
Accept: screens match `prototype/shots/kb-*` (ready, running, empty, nokey, partial, offline, stale) in light + dark within review; keyboard: row focus, Enter opens sheet, Esc closes; table filters/sort; thread classes by provenance; every control has an accessible name; no dead controls (audit like the 19-page audit); Playwright-less RTL tests for states.

### WP4 — Interviewer engine + Practice (text first; after G-A; M1)
Files: `electron/interviewer/**`, `electron/copilot/practice.ts` (**owner for this change**: add `QuestionSource` seam, keep `createPracticeRunner` intact for the report path), `electron/copilot/live-wiring.ts` (owner of the one branch choosing the runner by `req.interview`), `electron/copilot/handlers.ts` (`interviewPlanPreview`, `copilotStart` accepts `interview`), `electron/copilot/debrief.ts` (per-question rubric prompt), `renderer/sections/copilot/Practice.tsx`, `renderer/components/copilot/{ModePicker,VoicePicker,FocusSkills,SessionSummary}.tsx`, `renderer/overlay/{InterviewerRow,Caption,InterviewControls}.tsx`, `renderer/sections/copilot/Sessions.tsx` (heat map, per-question rows).
Accept: with a scripted LLM + golden KB, a 30-min mixed loop selects the expected mix, never repeats within a session, honours focus skills and `includeGenerated=false`, ramps difficulty, ≤ 2 probes per question; **cues and suggestions identical to live for the same question** (golden event-trace test comparing `copilotQuestion/Suggestion` sequences with and without `interview`); typed-answer fallback works; old report-question practice still passes `practice.test.ts` unchanged; debrief shows rubric rows + heat map + feeds `KbItem.stats` and a `skill-signal.json` read by SkillUpTab (one small read in `components/job/SkillUpTab.tsx`, owned here).
**Gate G-P (M1):** lead reviews a text-interviewer practice run on a cloned profile (fake mic or typed) with real OpenRouter key, cap $0.50.

### WP5 — TTS service, playback, echo gate (after G-A; M2)
Files: `electron/tts/**`, `electron/copilot/echo-gate.ts`, `electron/copilot/audio-in.ts` (**owner for the gate hook only**), `renderer/overlay/playback/**`, `electron/tts/kokoro-script.ts` + install (pattern of `prescreen-model.ts`; new pip packages `kokoro-onnx`, `onnxruntime` pinned with hashes, **needs gate**), `renderer/components/settings/pages/LocalModels.tsx` (Kokoro row only, coordinated with WP6), `scripts/tts-latency.mjs`.
Spikes first (time-boxed, report to `spikes/`): **S-T1** Kokoro first-audio and RAM next to Whisper on the 16 GB Mac (one process at a time; no concurrent model loads); **S-E1** echo test: system voice and Kokoro through `AudioContext` with speakers, `echoCancellation` true/false, measure whether the mic STT transcribes the TTS, ducking, `getSettings()`; **S-V1** `say -v '?'` en_IN voices render quality by ear + latency table.
Accept: engine contract tests with a fake engine; sentence splitter table tests (abbreviations, decimals, ellipsis, stream end); gapless queue test (fake clock); cancel < 50 ms; fallback chain test; gate unit tests (frames dropped while speaking + tail; push-to-interrupt; headphone barge-in thresholds; text-echo filter); no playback before an explicit Start (a11y test); renderer plays PCM without CSP changes.
**Gate G-T:** S-T1 + S-V1 numbers (first-audio p50/p95, RAM) decide the default voice order. **Gate G-E:** S-E1 decides whether `speakers` defaults to half-duplex only (expected) or enables VAD barge-in.

### WP6 — Settings (after G-A; parallel)
Files: `renderer/components/settings/pages/InterviewPrep.tsx` (+ test), `electron/kb/config.ts` (full validation), `electron/settings/keys-test.ts` (Brave test call = one tiny query; stores nothing), Manage-in-Settings chips (`goToSettings('interview-prep', id)`) in WP3/WP4 files via props only.
Accept: page matches `prototype/shots/settings-*`; keys never echoed; allowed-sources toggles cannot enable the never-fetch group; deep links work; search-provider change re-prompts consent; `Reset` restores defaults.

### WP7 — Live-session surfacing (M3; after G-P and G-R)
Files: `electron/copilot/context.ts` (append `## QUESTION BASE` section; owner for this change only), `electron/copilot/prompts.ts` + `engine.ts` (KB matches in the user turn; owner for this change), `electron/copilot/guard.ts` (treat `kb:` proof as interview-side, never candidate claims), `renderer/overlay/KbChip.tsx`, tests.
Accept: prefix growth ≤ 700 tokens and the cv is still trimmed first; cached-token ratio does not regress in `scripts/copilot-latency.mjs`; retrieval adds < 50 ms to the trace (stage `kb`); suggestions that used KB items show the chip; fact-check unaffected (KB text never counts as a candidate fact — adversarial test where a KB item mentions a number the candidate does not have).

### WP8 — M4 (later, separate dispatches)
Premium TTS (Cartesia first; Azure/Polly en-IN as cheaper options; ElevenLabs alternative), opt-in agent top-up, embedding rerank/dedupe via the sidecar (new `embed` command, gated), cross-job search via `node:sqlite` FTS5 after the packaged-Electron check (spike S-F1), Reddit/HN link-out helpers, company-fact sharing across jobs.

### Sequencing
```
WP0 ─G-A─┬─ WP1 (store/index) ───────────────┐
         ├─ WP2 (research) ─ S-R1 ─G-R───────┤
         ├─ WP3 (KB UI, fake backend) ───────┼─ integration (kb-int) + cloned-profile QA ─ G-P ─ M1
         ├─ WP4 (interviewer + practice) ────┤
         ├─ WP6 (settings) ──────────────────┘
         └─ WP5 (TTS, echo; S-T1/S-E1/S-V1) ─G-T/G-E─ M2   ·   WP7 (live) after G-P+G-R ─ M3   ·   WP8 M4
```
Integration owner merges WP0 → WP1 → WP2 → WP6 → WP3 → WP4 (→ WP5 → WP7), runs `npm run typecheck && npm test && npm run build`, resolves `package.json`/`main.ts`/`pages.ts` conflicts. Parallelism limit: **max 2 agents running heavy work (models, Chrome) at once** (16 GB Mac shared, working-preference); WP1/3/6 are light.

## 12. Test strategy

| Layer | What | Where |
|---|---|---|
| Unit | bm25/tokenizer, hash keys, merge, sentence splitter, gate state machine, budget, privacy filter, guard (evidence/URL/markdown), selector, probe checklist, config clamp/migrate | `*.test.ts` beside modules (vitest, node env, `fileParallelism:false`, electron mocked) |
| Fakes | `FakeSearch`, `FakeFetch` (HTML fixtures), `FakeLlm` (scripted JSON), `FakeTts` (deterministic PCM sine, programmable latency), fake clock | `electron/kb/research/fixtures`, `electron/tts/fake.ts` |
| Golden | 40- and 400-item KBs; expected research output for fixture jobs; expected practice mix; event-trace parity (practice vs live cues) | `electron/kb/fixtures`, `electron/interviewer/fixtures` |
| Relevance eval | 60 labelled pairs, recall@3 / MRR, run in `npm test` (fast), threshold in test | `electron/kb/relevance.test.ts` |
| Latency harness | `scripts/kb-latency.mjs` (retrieval), `scripts/tts-latency.mjs` (first audio per engine; manual, one engine at a time), `scripts/copilot-latency.mjs` extended with `kb` stage | manual gates, numbers committed to `spikes/` |
| Property | sourced ⇒ source + evidence; no PII in queries; denylist; KB ≤ limits | fast-check-free: seeded generators (no new dep) |
| Security | poisoned page, robots, SSRF redirects, key non-leak, `openExternal` allow-list | `electron/kb/research/*.test.ts` |
| Renderer | RTL state tests for KB tab, Practice form, Interview Prep page, overlay interviewer row (reduced-motion), a11y names | `renderer/**/*.test.tsx` |
| QA on cloned profile | real app with `--user-data-dir` copy + copied career-ops folder (never real data, never quit the installed app mid-run; remove `SingletonLock`); scripted with the existing `scripts/settings-qa` style; fake mic, fake search for determinism, one capped live run per gate | evidence PNGs in `docs/plans/job-knowledge-base/qa/` |
| Live (opt-in env) | `CL_LIVE_RESEARCH=1`, `CL_LIVE_TTS=1`, caps $1 / $0.50 | skipped by default |

## 13. Packaging
No native Node dependency. New runtime installs happen on demand (nothing ML in the installers): Kokoro ONNX int8 weights + `kokoro-onnx`/`onnxruntime` into `~/.careerloom/tts` (venv, pinned versions + hashes, memory check, self-test; **gate before adding the pip pins**); `say` needs nothing (macOS). Windows: system voices through `speechSynthesis` or PowerShell SAPI are untested (U) ⇒ Windows ships KB + research + typed practice in M1 and voice in a later milestone after a Windows spike. Licences: Kokoro Apache-2.0 and kokoro-onnx MIT (V research D) added to `THIRD_PARTY_NOTICES.md` when installed code is vendored; attribution strings for O*NET/CC BY-SA sources live in `sources.ts`. Firecrawl/SearXNG (AGPL-3.0) stay separate user-run processes, never bundled.

## 14. Rollout
| Milestone | Contents | Exit |
|---|---|---|
| **M1** | WP0–WP4, WP6: research + KB browser + practice questions from the KB with typed or voice (existing STT) answers + **text interviewer**; old report path kept as fallback | G-R, G-P; cloned-profile QA 100 % checks; cost/time within caps |
| **M2** | WP5: TTS (system en_IN voices, Kokoro local, OpenRouter Kokoro), echo gate, captions, Replay/Skip/Hint | G-T, G-E; mic-leak self-test; a11y checks |
| **M3** | WP7: live retrieval + `KbChip` | latency/trace regression-free; adversarial fact-check test |
| **M4** | WP8: premium TTS, agent top-up, embeddings rerank, cross-job search, Windows voice | per package |

## 15. Provisional defaults (change here first)
Search Brave → Exa → Serper → SearXNG; fetch HTTP → CDP → Firecrawl; model = helper tier, nano-class; depth Standard; cap $0.30 / 5 min; agent top-up off; sources all Tier-A/B on, never-fetch group locked; generated cap 30 %; refresh *suggested* after 30 d; KB retention until deleted; voice engine order installed en_IN system voice → Kokoro → OpenRouter Kokoro → system; speed 1.0; echo `headphones` only if the user picks it, otherwise `speakers` (half-duplex) — **default is `speakers`** (safe), tail 350 ms; probes ≤ 2; strictness 3; practice length 30 min; includeGenerated on; `answerMinutes` soft timer 2 min (existing).

## 16. Risks

| # | Risk | Mitigation / owner |
|---|---|---|
| 1 | Sourced yield too low | S-R1 measures; honest labels; user can add/import; link-out buttons (WP2/WP3) |
| 2 | Brave storage clause / key friction | facts + URLs only; keyless fallback; adapter swap (WP2) |
| 3 | Copyright/ToS drift | allow-list in code with `asOf`, G-D review, no answer bodies (WP2) |
| 4 | Prompt injection | §9 controls + poison tests (WP2) |
| 5 | Echo on speakers | half-duplex default; S-E1; self-test (WP5) |
| 6 | Kokoro latency/RAM with Whisper | S-T1; one heavy process; OpenRouter/`say` fallbacks (WP5) |
| 7 | `say` per-sentence latency ≈ 1–1.7 s | pre-render opening; N+1 prefetch; Kokoro default if faster (WP5) |
| 8 | Prefix budget overflow in live | 700-token cap, trim order, test (WP7) |
| 9 | Contract churn between packages | G-A freeze; additive-only changes through WP0 |
| 10 | Runs-page integration drift | emit plain run records; link falls back to drawer (WP0) |
| 11 | Cost overrun / runaway agents | hard caps, preview estimate, agent top-up opt-in (WP2) |
| 12 | Scope creep into hiring-style scoring | copy + code: practice only, content-only scoring (WP4) |

## 17. Open questions for the user (G2)
1. Confirm defaults in §15, especially `speakers` + half-duplex (no barge-in on speakers) and Brave as the default search key.
2. OK to add pinned pip dependencies for Kokoro (`kokoro-onnx`, `onnxruntime`) behind the on-demand install gate?
3. Should M1 ship with the old report-question practice as the automatic fallback when no KB exists (recommended), or require research first?
4. Premium TTS for M4: Cartesia vs Azure/Polly en-IN (cheaper, slower); pick when M2 numbers exist?
5. Company-fact sharing across jobs at the same company in M1 (saves ≈ 50 % on second jobs) or M4?
6. Which three real jobs should S-R1 use (cloned profile only)?
