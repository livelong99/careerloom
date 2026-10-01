# Job Knowledge Base + AI-interviewer practice — Design (Phase 2)

Prototype: `prototype/index.html` (plain HTML/CSS/JS, no build). Shots in `prototype/shots/` (dark + light). Tokens are copied from the Copilot prototype, which copied `renderer/styles/{plain,careerloom}.css`. Re-render: `prototype/shoot.sh <out.png> <W,H> "<page>?theme=dark&state=…"` (one headless Chrome at a time). Sample copy is original (fictional company).
G1 decisions applied: Brave key via Settings › API keys with a keyless "fewer results" path; sourced vs generated labelled everywhere and filterable; **Indian-English voice by default** (installed macOS en_IN voices, offline); premium TTS stays M4; research runs appear in the Runs page as a run kind.

## 1. Design intent

| Axis | Choice | Why |
|---|---|---|
| Look | Native Careerloom: `--canvas` sidebar, rounded `--page` workspace, 32 px controls, Badge tones, teal accent, amber **thread** | Must read as Jobs/Copilot/Settings, not a new product (brief) |
| The one memorable thing | **The provenance thread**: a 3 px edge on every question row. Solid teal = sourced (has a link), dashed amber = generated (no source), blue = yours | Reuses the amber thread idea from the overlay; makes the honesty rule from G1 visible at a glance, in the table, the detail sheet, the practice summary and the debrief |
| Colour | Teal = action/sourced, amber = generated/warning/gap, blue = yours, red = stop | Colour is never the only signal: every state also has a word ("Sourced", "Generated", "Yours") |
| Structure | Table for the bank (the app's native list pattern), side sheet for detail, flat rows instead of nested cards | Avoids the identical-rounded-cards look; the table is where users spend their time |
| Motion | Only: avatar ring while the interviewer speaks, wave bars, step pulse. Off under `prefers-reduced-motion` and the `data-motion="off"` setting | Calm; speaking state also has a text label |
| Type | Inter 13.5 px body; 15 px for the line you actually read (caption, "Say first") | Same scale as Copilot overlay |

Skills applied: **frontend-design** (plan → review against the brief → build → screenshot critique) and **ui-ux-pro-max** (desktop subset: accessibility, focus, forms, feedback states). Plan review: the first draft used an absolute-positioned detail sheet that hid the table's right-hand columns; fixed by making it a real second column. A second draft listed skill as its own column; moved into the question's meta line so Type/Level/Origin stay legible at 1 100 px. Rejected defaults: gradient hero stats, big-number KPI row, numbered steps for non-sequences (the research stepper *is* a sequence, so it is numbered by position and status).

## 2. Information architecture

```
Jobs › [job] › tabs:  Overview · Job · Match · Skill-up · Documents · Report · Knowledge base (new)
Copilot › Practice (redesigned)   ·   Copilot › Sessions & debrief (extended)
Runs (page being built elsewhere) — new run kind "Job research"
Settings › Interview prep (new page, Workflows group, after Copilot)  ·  API keys gets "Brave Search" (+ Exa/Serper later)
Local models › gets "Interviewer voice (Kokoro)" next to Transcription
Live overlay — suggestion cards gain a "From your question base" chip
```
`PageId` gains `'interview-prep'`; Job `TABS` gains `['kb','Knowledge base']` after `report`; no new sidebar item.

## 3. Screens

### 3.1 Job › Knowledge base (`kb.html`, `shots/kb-*`)
- **Status strip:** badge (Up to date / Partial / Stale), researched time, question count, **% sourced**, sources, cost; actions Refresh, Add question, Practise this job; **"Run in Runs ↗"** deep-links to the research run (G1). Refresh is suggested, never automatic (banner "Researched 41 days ago. Refresh?").
- **Coverage per skill:** one tile per skill node (name, count, bar, "Covered" or amber "Need N more", expected level, "not on your résumé" when it is a gap). Click filters the bank. Dashed/amber = gap, same colour as the thread.
- **Filters:** type segmented control, skill/difficulty/source selects, **Hide generated** switch (G1: generated can be filtered out), legend for the thread.
- **Bank table:** columns Question (+ skill badge, source line, "seen in N sources", pin glyph), Type, Level (5 dots + `aria-label`), Origin. Row click opens the sheet. Hidden items stay dimmed with an "Unhide" in the sheet.
- **Detail sheet:** type + provenance badges; pin / hide / edit / **Practise this**; **Why this one for you** (links to a gap or STAR story; computed from the user's data at read time, never stored); sources list (title, kind, licence, our short summary, external link opens in the system browser); **Suggested outline** (always badged Generated); "What a good answer shows" rubric (strong vs weak); likely follow-ups; red flags; your history (asked N times, last score).
- **Running state:** stepper (Plan queries → Search → Read pages → Extract → Dedupe & rank → Write outlines) with per-step bars and counts, elapsed time, spend vs cap, pages read, questions found so far, **Stop**, and "View run in Runs". Live region `role="status" aria-live="polite"`. Items found so far appear in the table as they land (partial bank is usable).
- **Empty:** explains what will happen, estimated cost/time, **Research this job**, or Add a question yourself.
- **No search key:** "Web search needs a key" → Add a key in Settings, or "Research without search" (reads pasted pages + posting, generated items clearly labelled; expect fewer results — G1).
- **Partial (budget/time hit):** amber banner "Partial results — budget reached… Continue for up to $0.10 more"; weak skills flagged in coverage.
- **Offline / fetch failure:** red banner, shows last bank, Refresh disabled with reason.
- **Stale input:** when the JD or evaluation changed (`inputHash`), banner "Posting changed since this was researched" with Refresh.

### 3.2 Copilot › Practice (`practice.html`)
Single page, left form + right "This session" summary (questions ≈ N, mix, sourced count, estimated cost, voice cost) so the user sees what they will get before starting.
1. **Job** select + KB readiness note (46 questions · 64 % sourced, link to the KB tab). If no KB: inline "Research this job first (≈ $0.13, 3 min)" or "Practise with the report's questions" (current behaviour, kept as fallback).
2. **Interview:** 6 mode cards (Recruiter screen, Mixed loop, Behavioural, Technical depth, System design, Coding); length (15/30/45/No limit); **focus skills** chips (gaps dashed and preselected); difficulty (Adaptive/Easier/Match/Harder); "Include generated questions" switch.
3. **Interviewer:** style (company-style preset), seniority, strictness slider, **voice list** (installed Indian-English system voices first with ▶ preview and "works offline"; Kokoro with size and an honest "not Indian-accented"; cloud row locked until a key exists), speed, **Speakers/Headphones** segmented control with the one-sentence consequence.
4. **Start practice · N questions.** The old report-question list (`QuestionList`) moves behind "Choose questions yourself" for users who want manual control.

### 3.3 In-session panel (`session.html`)
The same overlay panel as live. Additions only: an **interviewer row** (avatar + name/role + state Speaking / Thinking / Listening to you + wave) and a **caption** line (spoken words highlighted as TTS progresses); the user's live transcript line; controls **Replay (R) · Skip (S) · Hint · Answer ⌃⌥A**; a **mic badge** ("Mic paused" while the interviewer speaks on speakers, "Mic on" otherwise). Cues, Say first, bullets, STAR, Proof and Numbers-check are the unchanged live components, fed by the same events — the engine receives the AI interviewer's question exactly as it would an STT line.
- Question source chip `From your question base` appears when the question or the suggestion drew on a KB item; clicking opens the item in Careerloom.
- **Live variant:** only the chip is added to the existing suggestion card (third panel in `shots/session-gallery-*`).
- Hint = reveals the next rubric cue (scored: hint use is recorded). Replay re-speaks the last question. Skip records "skipped".
- Pause/stop: existing stop button and panic hotkey stop TTS first, capture second.

### 3.4 Debrief (`debrief.html`)
Tiles (overall, structure, specifics, concision, delta vs last), per-question rows with the interviewer's one-line evidence quote, score and origin badge; **skill heat map** (skill × criterion; number in every cell, lighter = needs work); **What this changes** (Skill-up reorder, next-practice weighting, résumé note). Copy states scores are rough AI estimates; scored on content only.

### 3.5 Settings › Interview prep (`settings.html`)
Cards: **Research** (model for reading pages with cost hint, depth Quick/Standard/Deep, limit $ and minutes, opt-in extra agent pass), **Search and sources** (provider + key status with "Manage in API keys" chip, keyless fallback status, fetch order, **allowed-sources checklist** with licence line; the never-fetch group shown disabled with the reason), **Interviewer voice** (engine select + Preview, Kokoro install chip → Local models, premium cloud row "Coming later", speed, speakers/headphones), **Question bases** (refresh suggestion age, retention, import/export). Footer note links to Runs. "Manage in Settings" chips: KB tab status strip → Interview prep; Practice voice row → Interview prep; empty/no-key states → API keys.

## 4. Component mapping (no new UI dependency)

| UI | Component | Source |
|---|---|---|
| Tabs | `ui/tabs` (`TABS` array in `sections/Job.tsx`) | present |
| Bank table | `@tanstack/react-table` + `ui/table`; `ui/toggle-group`; `ui/select`; `ui/toggle-switch` | present |
| Provenance thread | one CSS class on the row's first cell (`data-prov="sourced\|generated\|user"`) | new, 10 lines |
| Coverage tiles | `ui/item` + `ui/progress` + `ui/badge` | present |
| Detail sheet | `ui/sheet` (side) with `ui/collapsible` sections; `Markdown.tsx` for outline | present |
| Stepper | `ui/item` rows + `ui/progress` + `ui/spinner`; progress fed by the existing `careerloom:run` broadcast | hand-build |
| Empty/errors | `ui/empty`, `ui/alert`, `EmptyNote` | present |
| Practice form | `components/copilot/Group/Row`, `SegTabs`, `ui/slider`, `ui/select`, chips = `ui/toggle` | present |
| Voice row | `ui/item` + icon button (▶/■) + `ui/badge` | present |
| Interviewer row | avatar disc (div) + rAF wave bars (shared with Copilot level meter) | hand-build |
| Captions/transcript | shadcn `message`/`bubble` (Copilot decision) + prompt-kit `response-stream` | reuse |
| Heat map | CSS grid with `color-mix` ramp, number in each cell | hand-build |
| Settings page | `pages.ts` entry + `Group/Row/Note/KeyField` | present |

## 5. Accessibility
Interviewer speech always has captions in an `aria-live="polite"` region separate from the cue cards; TTS never plays before an explicit Start (WCAG 2.2 SC 1.4.2); Replay/Skip/Hint/Answer are buttons with visible shortcuts and keyboard focus rings; speaking-state animation is decorative and also labelled in text; time-box is soft (never cuts off) with a **No limit** mode (SC 2.2.1); text-answer fallback when the mic is unavailable; speed control; heat-map cells carry numbers, thread has text twins; dots have `aria-label="difficulty 4 of 5"`; all new strings are sentence case with specific verbs ("Research this job", "Practise this", "Continue for up to $0.10 more").

## 6. States and errors (every one has a screen or a spec line)

| State | Treatment |
|---|---|
| No KB yet | Empty card with cost/time estimate |
| No search key | Explain + "Add a key" + "Research without search" |
| Research running | Stepper, live counts, partial bank browsable |
| Budget/time cap hit | Amber banner, partial badge, continue-for-more action |
| Offline / all fetches fail | Red banner, last bank shown, Refresh disabled |
| Source blocked / robots disallow | Row in the run log "skipped: robots.txt", never retried; counted in "pages skipped" |
| Injection marker found | Page dropped, run log line, no UI alarm (counted) |
| Stale (age or inputHash) | Banner with Refresh |
| TTS engine missing | Voice row shows Install; session falls back to the next engine (Kokoro → OpenRouter Kokoro → system voice) with a toast naming the fallback |
| Mic leakage detected (self-test) | Suggest Headphones or Speakers mode; never silently changes mode |
| STT unavailable | Type-answer box appears in the panel |
| KB large (> 400 items) | Oldest generated items auto-pruned; message in the status strip |

## 7. Copy rules
Sentence case, active voice, same verb across the flow (Research → "Researching…" → "Research finished"); errors state what happened and the next action; never "AI-powered" marketing; the interviewer voice is labelled "AI-generated". Vendor-neutral wording in anything public (project rule): runners/search providers are named only where the user configures them.

## 8. What the prototype does not show (build from this spec)
Add-question dialog (text, type, skills, difficulty); edit-item inline form; bulk hide; import/export dialogs; Runs-page row for "Job research" (owned by the Runs-page agent: we only emit `kind: 'job-research'` with label, log, cost, status); first-run consent text for web research (lists search provider and fetch hosts, reuses the browser-acknowledgement pattern).
