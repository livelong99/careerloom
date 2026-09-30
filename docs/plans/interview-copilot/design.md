# Interview Copilot — Design (Phase 2)

Prototype: `prototype/index.html` (plain HTML/CSS/JS, no build). Screenshots: `prototype/shots/` (dark + light). Tokens are copied from `renderer/styles/{plain,careerloom}.css`; sample copy is original. Fonts fall back to the system UI font in the prototype; the app ships Inter Variable.
Re-render a shot: `prototype/shoot.sh <out.png> <W,H> "<page>?theme=dark#<id>"` (headless Chrome, one at a time).

## 1. Design intent

| Axis | Choice | Why |
|---|---|---|
| Config screen | Native Careerloom: `--canvas` sidebar, rounded `--page` workspace, 32 px controls, Badge tones, teal accent | Must feel like Resume/Jobs, not a new product |
| Overlay | Its own compact character on the same tokens: solid dimmed surface, one amber **thread** on the left edge when a question is live | Glanceable; amber = "a question is active", nowhere else |
| The one memorable thing | The thread: amber edge + question banner + suggestion all hang off one line | Echoes the Loom brand without decoration |
| Colour use | Red = capturing (chip dot), teal = action, amber = question/warning, blue = interviewer speaker label | Colour never the only signal: every state also has text |
| Motion | Only: chip dot pulse (2.2 s), level bars, streaming caret, card fade-in (180 ms). Off under `prefers-reduced-motion` | Calm, never competes with the call |
| Type | 13.5 px body (user-scalable 12–18), 15 px "Say first" line, mono for timers/keys | One glance reads the headline line |
| Kept plain | No gradients, glow, glass decoration; blur only as legibility aid | |

Skills applied: ui-ux-pro-max (accessibility/touch/forms/animation priorities, desktop-only subset) and frontend-design (design plan → review against brief → build → screenshot critique). Plan review found two generic defaults and changed them: (1) a cream-and-terracotta look — replaced by the app's existing teal/amber tokens; (2) identical rounded cards everywhere — overlay panel is one continuous surface with hairline dividers, cards are used only in the config screen.

## 2. Information architecture

New sidebar item **Copilot** (under Job search, after Resume; `Section = 'copilot'`). Workspace with side-nav like Resume:

```
Prepare        Setup · Practice
Live settings  Audio · Transcription · Answer engine · Coaching style
Overlay        Appearance · Hotkeys
Trust          Privacy & consent
After          Sessions & debrief
```

Header actions (always visible): **Preview overlay**, **Start live session…** (opens the consent gate), **Start practice** (primary). Practice is the primary path on purpose.

| Page | Content | Backend it reads |
|---|---|---|
| Setup | Readiness strip (context / mic / system audio); job picker; interview type; "what the copilot will know" (posting, report, résumé facts, STAR stories, token estimate) | `job-view` (posting, `reportParse` interview plan), `readCv`, `currentProfile` |
| Practice | Mock questions from the report (+ custom), follow-ups, read aloud, timer | report interview plan |
| Audio | Mic device + level; system audio toggle, permission status + fix steps, virtual-device source, headphone tip | `systemPreferences`, capture probe |
| Transcription | Cloud vs on-device, provider, key status, language, end-of-speech wait, vocabulary, data-flow sentence | provider adapters, `safeStorage` |
| Answer engine | Fast/Balanced/Deep with cost per interview, escalate for design/coding, provider + model, fact check, vision vs OCR | streaming runner, `factCheck` |
| Coaching style | Cues / Cues+STAR / Full script, length, tone, one-line persona, quote résumé, never invent numbers; live preview | prompt builder |
| Appearance | Layout, 3×3 position, width, text size, opacity (≥60 %), theme, click-through, above full-screen, reduced motion; live preview | overlay window manager |
| Hotkeys | Table with conflict status, "Stop everything now" fixed | `globalShortcut` |
| Privacy & consent | Always-on items (consent per session, Listening chip), retention, local-only, redaction, hide-from-capture **not offered** | session store |
| Sessions & debrief | Sessions table, scorecard, improve-this-answer, push to résumé bullets / job notes | session store, Resume/Job pages |

## 3. Flows

1. **Practice (default):** Copilot → Setup → Start practice → overlay in Practice mode (teal chip) → mock interviewer asks → suggestions appear on demand → debrief.
2. **Live:** Start live session… → **consent gate** (mic always; system audio off unless switched on; two required checkboxes; optional jurisdiction + consent line; "Practice instead") → overlay opens unfocused → Listening chip with timer stays until stop.
3. **Question loop (live):** interviewer finishes → banner with type badge (amber thread lights) → **Answer** (⌃⌥A) or auto-answer if enabled → Say first → Then cover → STAR (collapsed) → Proof from résumé + "Numbers checked" → follow-up/clarify/summarise/screenshot actions.
4. **Trouble:** STT disconnect → inline panel with retry/on-device; system audio silent → steps + "Continue with mic only"; both keep the chip honest.
5. **Stop:** ⌃⌥⇧X or the red stop or tray "Stop now" → capture off first, UI second → Stopped panel: delete transcript now / open debrief.

## 4. Overlay spec

Two densities of one component (`renderOverlay(el, state, opts)` in the prototype).

- **Strip** 780 px, one row: Listening chip · (question type badge + 2-line question) · **Answer** · expand · stop. Idle/listening strips show the last transcript fragment muted.
- **Panel** 440 px default (360–560): header (chip, mini meter, `1.1 s · $0.02`, collapse, stop) → question banner → scrolling suggestion card (max ≈ 420 px, bottom fade) → action row (Answer, Follow-up, Clarify, Screenshot, Summarise, each with key hint) → last 2–3 transcript lines with speaker labels (Interviewer blue / You teal) → footer meters + engine/model.
- **States** (all in `overlay.html?view=gallery`): idle, listening, question detected, answering (streamed caret + shimmer rows), answered, permission missing, error, stopped; plus click-through (55 % opacity + dashed outline, hold ⌃⌥ to interact) and Practice chip.
- **Suggestion card:** *Say first* (one sentence) · *Then cover* (3 bullets) · *STAR skeleton* (disclosure, only real steps) · *Proof from your résumé* (quote + `cv.md · employer, year`) · fact-check line.
- **Status honesty:** the chip is driven by capture state, never by UI state; red dot whenever audio is being captured, "mic only" text when system audio is off; it is not hideable in live mode.
- **Window behaviour** (verify on signed builds; see research §D): frameless transparent, level `floating`/`status` (raise only if the user opts in), `showInactive`, non-focusable panel so hotkeys, not clicks, drive it; click-through with hover-region IPC; fixed-size window with inner resize; per-display bounds.

## 5. Component mapping

| UI piece | Source | Status |
|---|---|---|
| Side-nav shell, cards, rows | Resume workspace pattern + `card`, `item`, `field` | present |
| Segmented controls | `toggle-group` / `SegTabs` | present |
| Switches, sliders, selects, badges, tooltips, sheets, progress | `toggle-switch`, `slider`, `select`, `badge`, `tooltip`, `sheet`, `progress` | present |
| Hotkey chips | `kbd` | present |
| Consent gate | `alert-dialog` / `dialog` | present |
| Command menu | `CommandPalette` (add Copilot actions) | present |
| Transcript bubbles | shadcn `message bubble marker message-scroller` | **add** (MIT) |
| Streaming text / shimmer / loader | prompt-kit `response-stream text-shimmer loader` | **add** (MIT, small) |
| Suggestion card, level meter, setup stepper, recording chip | hand-built (`card`+`skeleton`+`response-stream`+`kbd`; `AnalyserNode` bars; `Item`+`Progress`; CSS keyframe) | build |
| Avoid | coss ui/Origin (AGPL), AI Elements `message`/`reasoning`/`persona`, Aceternity, Magic UI | — |

Prototype uses none of the libraries; it reproduces the look with plain CSS so the real build can swap in the shadcn/prompt-kit pieces above. Exact add commands are in `research.md` §F (dry-run only).

## 6. Accessibility notes

- Keyboard: every overlay action has a global hotkey and is reachable by Tab when the window is focused; consent gate is a modal dialog with labelled checkboxes and Esc to cancel; "Start live session" stays disabled until both boxes are ticked.
- Contrast: body ≥ 4.5:1 on the solid-dimmed surface in both themes (opacity floor 60 %); state always has text + icon, not colour alone (Listening / Mic only / Offline / Stopped).
- Screen readers: chip has `role="status"` with source in its label; streaming text should sit in one `aria-live="polite"` region updated per sentence, not per token; transcript is `aria-live="off"` by default. A focusable non-overlay "reader view" of the same session lives in the app window (non-focusable overlay cannot be reached by focus).
- Motion: only four small animations, all removed under `prefers-reduced-motion` and via `?motion=off` in the prototype.
- Targets: overlay buttons are 28 px (desktop pointer, ≥ 24 px WCAG 2.2); config controls 32 px.
- Text size 12–18 px setting and Windows/macOS text scaling must not clip the strip (2-line clamp on the question).

## 7. Deliberately left out

Hide-from-screen-share toggle (research §D/§E); any stealth/"undetectable" wording; mobile companion; voice identification/diarisation; auto-typing answers into other apps; storing raw audio; team/sharing features; live coaching on the user's own speech (pace/filler words) — candidate for later.

## 8. Prototype map

| File | What |
|---|---|
| `config.html#setup…#sessions` | 10 config pages, consent gate (`?gate=1&checked=1`), `?theme=light` |
| `overlay.html?view=stage` | Overlay above a fake call, state + layout switcher |
| `overlay.html?view=gallery` / `strips` | All panel / strip states |
| `css/tokens.css` | Careerloom tokens (values only) |
| `shots/*.png` | 22 screenshots (dark + light) |
