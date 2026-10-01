# F. Frontend component shortlist (builds on `docs/plans/interview-copilot/research-notes/F-components.md`, VERIFIED there; vetting not repeated)

Rule: **no new UI dependency**. Everything below is already in `renderer/components/ui` or `package.json`, or hand-built (< 80 lines each). Licences of anything pulled later were vetted in the earlier note (shadcn/prompt-kit MIT; coss ui AGPL and Aceternity excluded; AI Elements `persona` excluded: remote `.riv` assets vs strict CSP).

| Need | Pick | Status |
|---|---|---|
| KB browser table (sort, filter, row select, density) | `@tanstack/react-table` (in `package.json`, used by Jobs table) + `ui/table` + `ui/toggle-group` for type filter + `ui/select` for skill/difficulty/source | PRESENT |
| Coverage-per-skill rail | `ui/progress` + `ui/badge` in an `ui/item` row; click filters the table | PRESENT, compose |
| Item detail (sources, outline, rubric, follow-ups, "why this for you") | `ui/sheet` (side panel, as Job drawer predecessor) with `ui/collapsible` sections; `Markdown.tsx` for outline | PRESENT |
| Source chips ("Stack Overflow · CC BY-SA", "Generated") | `ui/badge` tones + `lucide` icons; external link via main-process `shell.openExternal` allow-listed to http(s) | PRESENT |
| Pin / hide / edit / add own | `ui/dropdown-menu`, `ui/button` icon, inline `ui/input`/`ui/textarea`, `ui/alert-dialog` for bulk hide | PRESENT |
| Research progress stepper (plan → search → fetch → extract → dedupe → rank), cost/time meter, Stop | hand-build: `ui/item` rows with status glyph + `ui/progress` + `ui/spinner`; live log via existing run broadcast (`careerloom:run`) and `RunsDrawer` pattern | HAND-BUILD (no stepper in any vetted lib) |
| Empty / error / partial states | `ui/empty`, `ui/alert`, `EmptyNote` | PRESENT |
| Interviewer transcript with captions | shadcn `message` + `bubble` + `marker` + `message-scroller` (already shortlisted for Copilot overlay; reuse the overlay's transcript list) | reuse of Copilot decision |
| Streaming caption text | prompt-kit `response-stream` | reuse of Copilot decision |
| Interviewer avatar + speaking/listening/thinking | hand-build: initials disc (`Avatar`-less, plain div) with 3 CSS states, ring pulse via `tw-animate-css`; `prefers-reduced-motion` falls back to static ring + text label | HAND-BUILD |
| Voice wave / mic level | hand-build (rAF + 24 bars) — same as the Copilot meter; TTS side driven by amplitude envelope or fake pulse when engine gives no PCM | HAND-BUILD |
| Question card (type, skill chips, difficulty dots, source count) | `ui/card` + `ui/badge` | PRESENT |
| Scorecard + skill heat map | hand-build: CSS grid (skill × criterion) with 5-step token ramp (`--accent` mix) and numeric text in each cell (colour is never the only signal); existing `ScoreCard` in `sections/copilot/Sessions.tsx` is the base | HAND-BUILD |
| Voice picker with preview | `ui/select` + `ui/button` (Play/Stop) + `ui/slider` for rate | PRESENT |
| Keyboard hints (replay, skip, hint) | `ui/kbd` | PRESENT |
| Settings page rows | `components/copilot/Group`/`Row`, `settings` `Note`, `KeyField` | PRESENT |

A11y notes (design-level, INFERENCE): interviewer captions are live text in an `aria-live="polite"` region separate from the cue cards; TTS never auto-plays before an explicit Start (WCAG 2.2 SC 1.4.2 Audio Control — see E note for the wording); every colour state has a text twin; focus order: question → cues → controls.
