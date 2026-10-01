# Job Knowledge Base + AI-interviewer practice — Research (Phase 1)

Date 2026-10-01 · Branch `livelong99/kb-research-plan` (base: copilot work, af862ce) · Docs only, no product code. Not legal advice.
Evidence lives in `research-notes/` (A repo blocks · B1 sources/ToS · B2 search backends · C KB design · D TTS · E interviewer/echo/retrieval · F components). Tags: **V** verified (read at the URL), **V-s** seen only in a search snippet/secondary page, **I** inference, **U** unverified. Prices drift; re-read before building.

## 0. G1 decisions at a glance

| # | Decision | Recommendation |
|---|---|---|
| 1 | Sources | Tiered allow-list (§B3): API/dataset sources automated; open-web pages surfaced by search fetched robots-respecting, **question + ≤280-char paraphrase + link + attribution only**; LinkedIn/Indeed/Glassdoor/Blind/LeetCode/Reddit/Medium never fetched (link-out only) |
| 2 | Search backend | Brave Search API (user key) default; Exa optional 2nd; Serper 3rd; local SearXNG "best effort, no key". Fetch: plain HTTP → raw CDP → existing Firecrawl. Provider-native search not default |
| 3 | Pipeline | Deterministic (plan → search → fetch → extract → dedupe → classify → rank) with a bounded, opt-in agent top-up when coverage is low. Cap $0.30 / 5 min, resumable |
| 4 | KB storage/retrieval | Per-job JSON folder (source of truth) + in-memory BM25 (own ~60 lines, **no new dependency**); `node:sqlite` FTS5 and local embeddings are gated upgrades |
| 5 | TTS | Default **Kokoro-82M** (Apache-2.0) local sidecar, installed on demand; zero-install fallback macOS `say`; no-install cloud fallback Kokoro on OpenRouter. Premium **Cartesia Sonic** (M4), ElevenLabs Flash alternative |
| 6 | Echo | Half-duplex gating by default on speakers (+ push-to-interrupt); VAD barge-in only with the "I'm on headphones" toggle; do **not** rely on AEC |
| 7 | Cost/time per job | ≈ $0.10–0.20, 2–4 min with a nano-class helper model (§B5) |
| 8 | Practice | Same sink/overlay as live ⇒ cues + suggestions unchanged; AI interviewer swaps the *line source* only (§E) |

## A. Our building blocks (V, repo)

Full table: `research-notes/A-careerloom-blocks.md`. What matters:
- `electron/copilot/practice.ts` already emits interviewer lines through the same sink live STT uses; `questionsFromReport` is the only question source (STAR table, `**Q:**`, gaps, 6 generic). `practice.readAloud` exists as a config flag + UI row but **nothing implements it** (no `speechSynthesis`/`say` in repo).
- Grounding `buildGrounding` has a 6000-token prefix cap and trims the cv first; KB must fit in ≈ 700 tokens of prefix and put per-question matches in the user turn.
- Reusable: `launchTask` (progress, cancel, history), `runText({tier:'helper'})` text-only runs, OpenRouter SSE provider + cost meter + `prices.json`, `jdStructure` content-hash cache pattern, `ats/skills.ts` canonical skill table, `settings/keys.ts` key manager, `Group/Row` settings kit, Job page `TABS`, `store.ts` + `debrief.ts` scorecards, Whisper/Moonshine STT.
- **Missing, must be built:** a search client (Firecrawl client has only `/v1/scrape`), TTS, the KB itself, interviewer logic.
- **No database dependency** (`dependencies`: pdfjs-dist, react-resizable-panels, sonner, tldts, yaml). All state is JSON/jsonl in `userData`.
- Embeddings only exist as the optional pre-screen sidecar (`ats/embed.ts` `sim` command, null when not installed).

## B. Web research pipeline

### B1. What to search (privacy: role/skills/company only, never cv text or PII; I)
Inputs from `jdStructure` (title, company, `techStack`, `skills`, `aboutCompany`), report gaps/keywords, and the canonical skill table. Query templates (≈ 20): `"<company> interview process <role>"`, `"<company> engineering blog <stack>"`, `"<skill> interview questions <level>"` ×(top 8 skills ∪ top 4 gaps), `"<role> system design interview"`, `"<company> culture values hiring"`, plus site-scoped queries for Tier-A sources. Skills ranked by JD emphasis × gap-weight; gaps get extra queries (they drive weak-spot practice).

### B2. Where questions legitimately live (V from `B1-sources-tos.md`)

| Tier | Source | Access | Licence / ToS | Verdict |
|---|---|---|---|---|
| A | Stack Exchange API | API + key | CC BY-SA (attribution: link + author) [V-s], quota 300/day keyless, 10k/day with key [V-s secondary] | ALLOWED-API, summary + link + author |
| A | GitHub lists: system-design-primer **CC BY 4.0**, h5bp Front-end-Developer-Interview-Questions **MIT**, kdn251/interviews **MIT** (V via GitHub licence API); Devinterview-io repos: **no licence** | REST (search 30 req/min authed, V docs.github.com/en/rest/search/search) | licence read at ingest, never hard-coded | API for permissive; Devinterview = link + own summary only |
| A | O*NET DB (**CC BY 4.0**, commercial OK, attribution string given), Wikidata (CC0), Wikipedia (CC BY-SA 4.0) | download / API | V | taxonomy + entity seeds (skills, tasks, company entities) |
| A | Hacker News Firebase API (MIT repo, no rate limit; HTML robots Crawl-delay 30) | API | V | low-volume, cached |
| A | dev.to API | api-key | no licence in docs [V absence] | metadata + link only |
| B | Company engineering blogs / careers / "how we hire" | polite HTTP, honour robots.txt (RFC 9309: "not a form of access authorization", V) | default all-rights-reserved (I) | short paraphrase + link |
| B | Cert exam outlines (AWS, GCP, MS, CNCF) | fetch | no reuse terms stated (V absence) | domain names as facts + link |
| B | Open-web interview-prep articles surfaced by search | polite HTTP + robots.txt | copyright stays with author | extract **the question itself + our paraphrased note**, link, never answers/bodies |
| C | LinkedIn (User Agreement §8.2 bans scrapers, V), Indeed, Glassdoor, Blind, LeetCode Discuss, Reddit, Medium | — | bans or unreadable ToS (V-s/U) | **no automated fetch**; "Search in browser" deep links the user opens themselves |

Copyright stance (I, from US Copyright Office "no formula" fair-use page V https://www.copyright.gov/fair-use/): questions are short and largely factual; we store the question in our wording, ≤ 2-sentence note, URL, licence tag and fetch date, and **never** the source's answer text. Attribution rendered wherever an item shows. Counsel review before distributing the app to others (open item).

**Honest limitation (I, flagged for G1):** legitimately fetchable sources give plenty of *skill/stack/process* facts and a moderate number of real questions; high-signal company-specific question reports sit behind Tier C. Expect a typical bank of ~40–80 items per job where ~50–70 % are sourced and the rest labelled "generated". Do not market it as "real questions from Glassdoor".

### B3. Search/fetch backends (V from `B2-search-backends.md`)

| Backend | Price | Free tier | Licence / limits | Use |
|---|---|---|---|---|
| **Brave Search API** | $5 / 1k requests | $5 monthly credit (≈ 1k queries, I) | 50 qps; **storing results requires a storage-rights plan** ⇒ store facts+URLs only | **Default** |
| Exa | $4–7 / 1k | $10 credit, resets monthly | rate limit not published (U) | optional 2nd (company discovery) |
| Serper | ≈ $1/1k at entry (V-s, secondary) | 2,500 free queries | ToS on storing U | 3rd fallback |
| Tavily | $0.008/credit | 1,000 credits/mo | — | not chosen (similar to Exa, no edge) |
| Firecrawl cloud/self-host | 1 credit/scrape, 2 per 10 search results; Free = 2 req/min (⇒ 30 fetches ≥ 15 min, breaks 5-min target) | 1k credits | self-host **AGPL-3.0** (run unmodified, separate process); whether self-host `/search` needs a SearXNG is U | fetch fallback only (client already in app) |
| SearXNG (self-host) | $0 | — | AGPL-3.0; JSON must be enabled; upstream engines suspend on 429/CAPTCHA (≈ 70 searches in 2.5 min reported to suspend several) | keyless "best effort" mode |
| Provider-native web search | Anthropic $10/1k; OpenAI $10–25/1k; Gemini 3.x $14/1k after 5k free; OpenRouter Exa $0.007/req | partly | citation display required (Anthropic) | opt-in only (price + opaque) |
| Google CSE | — | — | **closed to new customers**, existing must move by 2027-01-01 | not an option |
| Bing Search API | — | — | **retired 2025-08-11** (V-s) | not an option |
| DuckDuckGo | — | — | no official web-search API | not an option |
| Jina Reader | token-based | free key | Reader vs model licence scope U | not chosen |

Fetch order (I): plain HTTP (+ JSON-LD) → raw CDP (`browserPageText`, one headless Chrome at a time) when empty → Firecrawl scrape. All through the existing SSRF guard (`validateScrapeTarget` + `assertPublicResolution`, https only, private ranges and redirects blocked).

### B4. Agent loop vs deterministic pipeline (V https://www.anthropic.com/engineering/multi-agent-research-system)
Agents use ≈ 4× tokens of chat and multi-agent ≈ 15×; parallel tool calls cut research time up to 90 %; token usage explains 80 % of variance on BrowseComp. Our task is bounded and repetitive (same fields per job) ⇒ **deterministic pipeline** with the LLM only at *plan queries*, *extract*, *classify/rank*, *generate outline/rubric*. Cost is then enforceable in code. Opt-in **agent top-up** (cap 5 extra searches, helper model) only when coverage of required fields (≥ 1 item per top-8 skill, company notes, process notes) is below threshold.

### B5. Cost / time per job (I arithmetic on V prices)
Assumptions: 20 searches, 30 fetches (local, $0), ≈ 120k input + 40k output tokens across extract/classify/generate. Prices from repo `prices.json` (V, OpenRouter 2026-10-01): gpt-4.1-nano $0.10/$0.40 per M, claude-haiku-4.5 $1/$5.

| Config | Search | LLM | Total | Time |
|---|---|---|---|---|
| **Default: Brave + local fetch + nano-class helper** | $0.10 (free credit covers ≈ 50 jobs) | ≈ $0.03 | **≈ $0.13** | 2–4 min (fetch concurrency 6–8, I; **measure**) |
| Brave + haiku-class | $0.10 | ≈ $0.32 | ≈ $0.42 ⇒ **over cap** | — |
| Keyless SearXNG + CDP + nano | $0 | ≈ $0.03 | ≈ $0.03, unreliable | longer |
| Anthropic native search | $0.20 + result tokens | + | > $0.30 likely | — |
Guard rails: hard per-job cap (default $0.30, 5 min), per-day cap, token meter reusing `createCostMeter`, phase checkpoints for resume, degrade to "partial" with an honest banner. Model tier guidance: helper tier (nano-class) for extract/classify; one mid-tier call for rubric/outline generation if budget allows.

### B6. Cache and refresh (I; B2 §6)
Query cache 7 d; page cache 14 d (If-None-Match where supported; content-hash skips unchanged extraction); job KB keyed on `inputHash` (JD structure + gaps + role + company + schema); refresh is **suggested not automatic** (age > 30 d or hash changed); negative cache 24 h; company facts shareable across jobs of the same company (key by company) so a second job at the same company costs ≈ 50 %.

### B7. Hallucination control (enforced in code)
Sourced item needs ≥ 1 fetched `SourceRef` **and** the extractor's evidence span found (normalised substring) in that page's text; URLs come only from search/fetch results (LLM returns indices); generated items labelled, capped at 30 % of bank and `confidence ≤ 0.4`; outline/rubric/follow-ups always labelled "suggested". UI shows provenance chip on every item.

### B8. Privacy and prompt injection (V OWASP LLM01 https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
Queries: role, company, skills only (a unit test asserts no cv text/email/phone in any outgoing query; `aidefence_has_pii`-style regex check). Extraction call: fetched text as quoted data inside delimiters (reuse `neutralize()` pattern), **no tools, no file/shell/network**, JSON-schema-validated output, URLs/markdown stripped unless allow-listed, pages with injection markers dropped and logged, runs apart from the résumé workspace. SSRF guard on every fetch. Fetched text never reaches an agent run that has tools or the cv. Consent: first research run shows what is sent where (search provider, fetch hosts); browser (CDP) fetch reuses the existing browser acknowledgement model.

## C. KB design (I; `research-notes/C-kb-design.md`)
Schema: `SkillNode` (expected proficiency, job weight, inCv), `SourceRef` (url, kind, licence, hash, trust), `KbItem` (text, type, skills, difficulty, provenance sourced/generated/user, sources+note, confidence, idealOutline, rubric, followUps, redFlags, personalisation hooks, user pin/hide/edit, stats), `KbNotes` (company/role/interviewer-style/loop), `KbManifest`. Limits 400 items / 8 MB per job.
Storage options: (A) per-job JSON folder + in-memory BM25 — **recommended**; (B) `node:sqlite` FTS5 — **feasible**: Electron 43 bundles Node 24.17.0 / Chromium 150 (V https://www.electronjs.org/blog/electron-43-0), FTS5 was enabled in Node 22.16 (V nodejs/node#57621) and I confirmed `create virtual table … using fts5` + `bm25()` runs on this machine's Node 22.20 (V, local; still experimental-warning there). Not confirmed inside packaged Electron 43 (U) ⇒ gate; (C) better-sqlite3 — native dep, rejected.
Retrieval for live (I): at session start build ≤ 700-token `## QUESTION BASE` appended **after** the stable sections; per detected question run BM25 over ≤ 400 short docs (sub-ms in JS, I; FTS5 reports ms-scale on millions of rows V-s) and add top-3 (≤ 150 tokens) to the **user turn** (fenced); sources shown as `kb:<id>` chips. Embeddings optional: query embedding ≈ 10–30 ms (transformers.js MiniLM q8 median 12.2 ms, V-s sitepoint; bge-small MIT 33M/384-d V model card) but our existing sidecar is one-shot subprocess so per-question embedding would break the 50 ms budget ⇒ **BM25 on the hot path, embeddings only offline for rerank/dedupe**.

## D. TTS (V/V-s from `D-tts.md`)

| Option | Licence | Cost / 30-min session (≈ 27k chars, I) | First audio | Notes |
|---|---|---|---|---|
| macOS `say -o` (+ afplay/decode) | OS | $0 | not measured | zero install; robotic; no Siri neural voices via public API (V-s) |
| Chromium `speechSynthesis` in Electron | OS | $0 | — | `getVoices()` empty-array history (electron#22844, V); behaviour on Electron 43 U |
| **Kokoro-82M (ONNX int8 sidecar)** | **Apache-2.0** (V HF) | $0 | none vendor-published; "near real-time on M1" (V), 12–79× RT (V-s) ⇒ **measure** | ~80 MB quantised (V kokoro-onnx), American+British voices; **no confirmed en-IN voice** |
| Kokoro on OpenRouter | service | ≈ $0.017 ($0.62/M chars, V) | network | already-held key, no install |
| Cartesia Sonic 3.x | proprietary | ≈ $1.1 (I at Pro rate) | 90 ms model-side; ≈ 166–190 ms with network (V-s) | WebSocket, Hinglish/Hindi supported (V) |
| ElevenLabs Flash v2.5 | proprietary | ≈ $1.08 ($0.04/1k chars V) | ≈ 75 ms excl. network (V) | WebSocket streaming |
| Azure Neural HD / Polly Generative | proprietary | $0.59 / $0.81 | streaming from LLM tokens (V) | en-IN voices U |
| OpenAI gpt-4o-mini-tts | proprietary | ≈ $0.45 | Coval p95 3.9 s (V Gradium page) | mandatory AI-voice disclosure; not for real time |
| Piper | **GPL-3.0** (maintained fork; original read-only Oct 2025) | $0 | fast (RTF ≈ 0.008 V-s) | per-voice licences, no en-IN ⇒ legal review; not chosen |
| F5-TTS | **weights CC-BY-NC** | — | — | rejected |
| Orpheus 3B / Sesame CSM / Chatterbox | Apache/Apache/MIT | — | — | too heavy next to Whisper on 16 GB; Mac numbers U |

**Recommendation:** default = Kokoro local sidecar (same on-demand install pattern as Whisper; Python already required there); selection order at runtime: installed Kokoro → OpenRouter Kokoro (if key) → macOS `say`. **Premium (M4):** Cartesia Sonic; ElevenLabs Flash as alternative. Pipeline: LLM token stream → sentence splitter → TTS per sentence → 24 kHz PCM chunks queued into one `AudioContext` (gapless, cancellable for barge-in). Voice/accent/speed/persona per provider in Settings; always show an "AI voice" label (OpenAI requires it; harmless elsewhere). First-audio on this Mac is an **S-spike** (not run here: no model runs allowed).

## E. AI interviewer, echo, accessibility

**Persona prompt (I):** `{company style, seniority, strictness 1–5, mode}` + grounding of the KB item (question, rubric, follow-up checklist) + never reveal rubric; one question at a time; speakable sentences ≤ 25 words; no personal/illegal questions unless the user opts in to rehearse handling them.
**Flow (I, informed by E §2):** opening (1 warm-up) → core questions selected by `score = jobWeight × (1 + weakSkillBoost) × novelty × typeBalance` → ≤ 2 probes per question from a checklist (missing S/T/A/R element, no metric, "we" vs "I", no trade-off) because LLM follow-ups were rated weakest on depth in PolyInterview (3.13/5, V-s arXiv 2607.10310) → time-box (soft timer, `practice.answerMinutes`, never cuts off; extra-time mode for WCAG 2.2.1) → candidate questions → wrap-up. Difficulty ramp: +1 after two strong answers, −1 after two weak, user override.
**Modes:** recruiter screen · behavioural · technical depth per skill · system design (requirements → estimate → design → deep dive → trade-offs) · coding (typed or screenshot, existing screenshot path) · mixed full loop.
**Scoring:** per-criterion 1–5 with evidence quotes (BARS-style anchors), ranges not point scores; extends existing `Scorecard`; results update `KbItem.stats` and skill heat map, feed Match/Skill-up. Fairness: score only content, never accent/voice/name; label as AI-generated practice, not predictive of hiring (NYC LL144 / NIST AI RMF cited as context only, V).
**Cues stay visible:** live-style detector/engine run on the AI interviewer's question exactly as on STT text — the practice sink already feeds `copilotQuestion/Transcript/Suggestion` ⇒ **no overlay change** (A, V). A "From your question base" chip shows when the question came from the KB.
**Answer path:** local Whisper/Moonshine STT with adaptive endpointing (existing). Voice and typed answers both supported.
**Echo (V from E §1):** Chromium AEC reference is the browser playout path; Web Audio output is reported as *not* cancelled, AEC adapts slowly, and Electron has an AEC-no-effect issue (electron#47043, closed not planned) ⇒ treat AEC as a bonus. Default **half-duplex**: drop mic audio/STT while TTS plays + 300–500 ms tail (I, tune by test); **push-to-interrupt** hotkey; **VAD barge-in only when "I'm on headphones"** (no web API for headphone detection, V-s; user toggle + optional device-label hint); text-echo filter drops STT finals that fuzzy-match the last spoken TTS sentence. Pre-session mic check plays a tone and measures leakage. Frameworks (LiveKit, Pipecat, Vapi) all expose thresholds (min words/duration, e.g. Vapi `voiceSeconds` 0.2 s, V) but no built-in fix for speaker leakage.
**Latency budget per turn (I; target):** user stops → EOT (≤ 500 ms adaptive) → next-question pick (BM25, < 5 ms) or follow-up LLM (TTFT ≤ 600 ms with nano-class) → first sentence to TTS (≤ 300 ms) → first audio (Kokoro local ≤ 300 ms to verify) ⇒ ≈ 1.5–2 s, comparable to a human pause. Cost per 30-min mock: LLM ≈ $0.02–0.05 (nano) + TTS $0 (local) / $0.02 (OpenRouter Kokoro) / ≈ $1.1 premium + STT $0 local.
**Accessibility (V W3C WCAG 2.2):** no autoplay (start from click; SC 1.4.2), interviewer captions always on (live text region), rate control, replay question, text-answer fallback, extra-time mode, keyboard operable.
**Safety:** no medical/legal advice; refuse harassment content; interviewer prompt forbids protected-trait questions; transcripts follow existing retention.

## F. Frontend components (V; `research-notes/F-components.md`)
No new UI dependency. Reuse `@tanstack/react-table`, `ui/{table,tabs,sheet,badge,progress,item,empty,select,slider,kbd,collapsible,dropdown-menu,alert-dialog}`, the Copilot decisions (shadcn `message/bubble/marker/message-scroller`, prompt-kit `response-stream`). Hand-build: research stepper, interviewer avatar + voice wave (rAF bars; `prefers-reduced-motion` fallback), skill heat map (CSS grid, number in each cell), question card. Excluded: coss ui (AGPL), Aceternity (licence unverifiable), AI Elements `persona` (remote assets vs CSP).

## G. Top risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Fetchable legal sources yield fewer *real* questions than users expect | Honest provenance labels; generated items capped; link-out buttons for Glassdoor/Blind/LeetCode/Reddit; user can paste/import their own |
| 2 | Brave storage-rights clause / ToS drift | Store facts + URLs only; backend interface so Exa/Serper/SearXNG swap in; read ToS pages before launch |
| 3 | Copyright of fetched pages | ≤ 280-char paraphrase, no answers/bodies, attribution, robots.txt, deny-list; counsel review before wider distribution |
| 4 | Prompt injection from pages | §B8 controls + tests with poisoned fixtures |
| 5 | TTS leaks into mic on speakers | half-duplex default; headphones toggle; mic-leak self-test |
| 6 | Kokoro latency/RAM next to Whisper on 16 GB | Spike S-T1 before M2; run one heavy process at a time (existing preference); OpenRouter/`say` fallbacks |
| 7 | No Indian-English local voice | cloud voice (Cartesia Hinglish/Azure/Polly en-IN, U) in M4; user warned in voice picker |
| 8 | `node:sqlite` experimental / FTS5 in packaged Electron | not on the critical path (JSON+BM25 first); smoke test gate |
| 9 | Cost overrun | hard caps, nano-class default, preview estimate before run |
| 10 | Python/ONNX install friction (Kokoro) | reuse onboarding model step; cloud fallback if install fails |

## H. Open questions for the user
1. Search key: OK to require a Brave key (free credit) for web research, with keyless SearXNG as best-effort fallback? Or prefer Exa/Serper as default?
2. Is a ~50–70 % sourced / rest-labelled-generated question bank acceptable, given Glassdoor/LeetCode/Reddit are link-out only?
3. TTS default: local Kokoro (needs install, free) vs OpenRouter Kokoro (no install, ~$0.02/session). Is an Indian-English voice a must for M2?
4. Premium TTS: Cartesia vs ElevenLabs preference (needs account/key)?
5. Echo: confirm half-duplex + headphones-toggle as the default (no barge-in on speakers).
6. Authorise the optional agent top-up (higher cost, opt-in)?
7. Do you want the KB shared across jobs at the same company (company facts reused)?

## Open verification items (not done here: no model runs / blocked pages)
Read SO/Reddit/Glassdoor/Blind/LeetCode/Medium ToS in a browser; Tavily/Exa/Serper storage terms; Firecrawl self-host `/search`; Kokoro first-audio + RAM; packaged-Electron FTS5 check; AEC behaviour on Electron 43/macOS; `say -v '?'` on the target Mac; en-IN voice availability.
