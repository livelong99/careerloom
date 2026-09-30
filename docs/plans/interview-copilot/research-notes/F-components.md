# F. UI component library research (dry run, nothing installed, repo untouched)

Date of research: 2026-10-01. Tags: VERIFIED = read from repo/API/docs this session; INFERENCE = my reasoning; UNVERIFIED = could not confirm.

## 0. Our setup (VERIFIED, read from repo)
- `components.json`: style new-york, rsc false, tailwind.config "", css `renderer/styles/tw.css`, cssVariables true, alias `@/components/ui`, icons lucide.
- `tw.css`: `@layer theme, base, components, utilities;` imports only `tailwindcss/theme.css` + `utilities.css` (NO preflight) + `tw-animate-css`. Tokens are mapped with `@theme inline` (`--color-primary: var(--accent)`, etc). A scoped `[data-slot]` mini-preflight lives in `@layer base`.
- Consequence (INFERENCE): anything from a shadcn-style registry that sets `data-slot` gets our mini-preflight. Anything without `data-slot` (raw `<div>`, `<button>`, `<p>`, `<h3>`, `<ul>`) sits on top of unlayered legacy CSS (`plain.css`/`careerloom.css`). Expect bare `button`/`p`/`ul` default-margin and font leaks. Budget a review pass for each pulled file.
- Already in `renderer/components/ui` (VERIFIED, `ls`): accordion, alert-dialog, alert, badge, button-group, button, card, checkbox, collapsible, command, dialog, dropdown-menu, empty, field, hover-card, input, item, kbd, label, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, table, tabs, textarea, toggle-group, toggle-switch, toggle, tooltip.
- Not present: switch (we have `toggle-switch.tsx`), avatar, input-group, combobox, badge variants beyond ours, message/bubble/marker, drawer.
- Also already in `renderer/components/` (VERIFIED): `Markdown.tsx`, `SegTabs.tsx`, `CommandPalette.tsx`, `Hint.tsx`, `Badges.tsx`, `chat/`, `kit/`, `Skeleton`. Check these before adding anything.
- package.json already has (VERIFIED): radix-ui 1.6.7, cmdk, sonner, cva, lucide-react, tw-animate-css, marked 18, tailwind 4.3.3, react 19.3. NOT present: `motion`, `ai`, `streamdown`, `react-markdown`, `use-stick-to-bottom`.
- CSP: no CSP string found in repo with my grep (grep failed on zsh glob, not re-run). UNVERIFIED. Treat as "assume strict `default-src 'self'`".

## (a) Per-library table

| Library | Licence (repo) | Maintenance | Install syntax | Deps pulled | TW4 no-preflight / our tokens | Static-CSP note |
|---|---|---|---|---|---|---|
| Vercel AI Elements | Apache-2.0 (LICENSE text "Copyright 2023 Vercel, Inc." + Apache 2.0; GitHub API reports NOASSERTION because file is not standard-formatted) https://raw.githubusercontent.com/vercel/ai-elements/main/LICENSE | Repo pushed 2026-09-01, last commit seen 2026-08-21, latest release `ai-elements@1.9.0` 2026-03-12, 2.4k stars https://github.com/vercel/ai-elements | `npx ai-elements@latest` (all) or `npx ai-elements@latest add message`; "alternatively shadcn CLI with registry URL" (exact URL not retrieved). Requires CSS-variables mode. https://raw.githubusercontent.com/vercel/ai-elements/main/README.md | Heavy. `packages/elements/package.json` lists `ai` ^6, `streamdown` ^2.4, `@streamdown/{cjk,code,math,mermaid}`, `motion`, `shiki`, `katex`, `@xyflow/react`, `use-stick-to-bottom`, `media-chrome`, `@rive-app/react-webgl2`. CLI installs only what each component imports (INFERENCE from imports per file). | Works on shadcn tokens, so `@theme inline` mapping applies (INFERENCE). Needs `data-slot`-less pieces reviewed. | `persona.tsx` fetches `.riv` files from `ejiidnob33g9ap1r.public.blob.vercel-storage.com` (VERIFIED, line 59+). Would violate strict CSP. Do not use `persona`. |
| prompt-kit | MIT https://github.com/ibelick/prompt-kit | Last commit 2026-09-28, 3.1k stars | `npx shadcn@latest add prompt-kit/[component]` https://raw.githubusercontent.com/ibelick/prompt-kit/main/README.md (docs site returned 403 to fetch) | Root package.json lists `ai`, `marked`, `motion`, `react-markdown`, `remark-gfm`, `shiki`, `use-stick-to-bottom`. Per component: `text-shimmer`, `loader` use only `cn` (+ `motion` for shimmer? text-shimmer imports only `cn`/react per my grep: it does NOT import motion); `response-stream` only react + cn; `thinking-bar` uses text-shimmer + lucide; `markdown` uses `marked` + `react-markdown` + `remark-gfm` + `remark-breaks`; `chat-container` uses `use-stick-to-bottom`; `ui/text-morph` uses `motion/react`. | Shadcn-style, same as above (INFERENCE). Its components are small, plain React; good fit. | Nothing remote seen (VERIFIED for files I opened). |
| assistant-ui | MIT https://github.com/assistant-ui/assistant-ui | Pushed 2026-09-30, 12.4k stars, frequent releases | Own CLI / packages (`@assistant-ui/react`); not a pure copy-paste registry. UNVERIFIED exact syntax (did not fetch docs). | Runtime package + styled components; it is a chat runtime, not just UI. | Headless primitives; ours would style them (INFERENCE). | Not needed; we already own the chat loop in `electron/`. Skip. |
| Magic UI | MIT https://github.com/magicuidesign/magicui | Last commit 2026-09-20, 22.4k stars | `pnpm dlx shadcn@latest add @magicui/globe` (docs example; equivalent `npx shadcn@latest add @magicui/<name>`) https://magicui.design/docs/installation | Most effects need `motion`; some more (globe = cobe). | Marketing-style effects; mostly no `data-slot`; expect preflight leaks (INFERENCE). | Self-contained. |
| Aceternity UI | "MIT, free tier" is from a third-party summary only; repo LICENSE not located (no public repo found by `gh search`). Pro/All-Access is paid, cannot redistribute as a component library. UNVERIFIED. https://opensource.builders/os-alternatives/aceternity-ui | Site live; repo unknown | Site says "compatible with the shadcn CLI" https://ui.aceternity.com/ ; exact `@aceternity/...` syntax UNVERIFIED (install docs URL 404) | `motion`, often `clsx`/`tailwind-merge` | Landing-page effects, high preflight dependence (INFERENCE) | Self-contained. Skip (licence unverifiable, wrong category for an app). |
| Origin UI -> coss ui | **coss repo is AGPL-3.0** (VERIFIED via API + LICENSE header) https://github.com/cosscom/coss . Old Origin UI repo `cruip/origin-ui` returned 404; Origin UI described as Radix-based, "limited support" https://tailkits.com/components/coss-ui/ | coss pushed 2026-09-30 | Registry `https://coss.com/ui/r/{name}.json` (search summary, https://github.com/shadcn-ui/ui/issues/8586) so `npx shadcn@latest add https://coss.com/ui/r/<name>.json` (INFERENCE on exact form) | Built on Base UI, not Radix: adds `@base-ui/react`, mixes with our Radix set | Different primitive lib (INFERENCE: visual/behaviour drift) | Self-contained. **Do not use: AGPL, same problem as the 17 VoiceStudio files already flagged.** |
| Kibo UI | MIT https://github.com/haydenbleasel/kibo | Last commit 2026-05-04 (5 months old), last release v1.1.5 2025-10-29; not archived | `npx kibo-ui add <name>` or shadcn add (docs, https://www.kibo-ui.com/docs). URL form of registry UNVERIFIED (my curl of `/r/status.json` returned nothing) | Per package. `packages/` list (VERIFIED): announcement, avatar-stack, banner, calendar, choicebox, code-block, color-picker, combobox, comparison, dialog-stack, dropzone, editor, gantt, glimpse, image-crop, kanban, list, marquee, mini-calendar, pill, qr-code, rating, relative-time, sandbox, snippet, spinner, status, table, tags, ticker, tree, video-player... **No stepper/wizard** (tree search for stepper|steps|wizard: no hits). | shadcn-based (INFERENCE OK) | Self-contained |
| 21st.dev registry | Per-component, set by each author; site says code lands "as your code" https://21st.dev/ . No single licence; check each. | Live | Each component shows a `npx shadcn@latest add "<url>"` command (site text; exact URL shape UNVERIFIED). Free tier limits copying to 2 per day; unlimited is paid membership. | Varies per author (often motion) | Varies | Varies. Our `magic` MCP for 21st.dev currently fails auth ("Not authenticated"), so it cannot be used from here until the key is refreshed. |
| shadcn/ui (new-york-v4) | MIT https://github.com/shadcn-ui/ui | Commit 2026-09-30, `shadcn@4.21.0` 2026-09-04 | `npx shadcn@latest add <name>` (docs use `pnpm dlx shadcn@latest add message`) https://ui.shadcn.com/docs/components/message | radix-ui, cva, lucide; some add `cmdk`, `sonner`, `input-otp` | Native target. | Self-contained |

shadcn/ui `new-york-v4/ui` file list (VERIFIED from GitHub API): includes `attachment, bubble, marker, message, message-scroller, input-group, native-select, combobox, kbd, spinner, switch, empty, field, item, sonner, slider, toggle-group, progress, tabs, sheet, resizable, tooltip, badge, button-group`. The chat primitives `message`, `bubble`, `marker`, `message-scroller` are new and are in the core registry (not experimental per docs, https://ui.shadcn.com/docs/components/message).

## (b) SHORTLIST mapped to needs

Legend: PRESENT = already in `renderer/components/ui`.

| Need | Pick | Status / exact command | Notes |
|---|---|---|---|
| Command menu | shadcn `command` | PRESENT (and `CommandPalette.tsx`) | none |
| Toasts | shadcn `sonner` | PRESENT | none |
| Kbd / hotkey hints | shadcn `kbd` | PRESENT | none |
| Slider | shadcn `slider` | PRESENT | none |
| Switch | `toggle-switch.tsx` | PRESENT (our name). `npx shadcn@latest add switch` only if we want the stock one | |
| Segmented control | `toggle-group` / `SegTabs.tsx` | PRESENT | |
| Progress / Tabs / Sheet / Spinner / Tooltip / Resizable / Empty / Field / Item / Badge | shadcn | PRESENT | |
| Transcript list with speaker bubbles | shadcn `message` + `bubble` + `marker` + `message-scroller` | `npx shadcn@latest add message bubble marker message-scroller` ; also pulls `avatar` (INFERENCE from docs: Avatar, Bubble, Marker, Spinner) | Core registry, MIT, no extra npm deps beyond radix/cva/lucide (VERIFIED imports: react, cva, radix-ui Slot, lucide, button). Caveat: `bubble` uses CSS `oklch(from var(--primary) ...)` relative colours (VERIFIED); fine in current Chromium/Electron (INFERENCE, check our Electron major) but our hex tokens will work. Alternative if we want stick-to-bottom without `message-scroller`: prompt-kit `chat-container` (adds `use-stick-to-bottom`). |
| Message streaming text | prompt-kit `response-stream` (typewriter/fade, pure React) | `npx shadcn@latest add prompt-kit/response-stream` | Zero extra deps (VERIFIED imports). Already have `marked` + `Markdown.tsx` for formatted output; do not add Streamdown unless markdown-in-stream flicker is a real problem. |
| Shimmer / "thinking" / loader / typing dots | prompt-kit `text-shimmer`, `loader`, `thinking-bar` | `npx shadcn@latest add prompt-kit/text-shimmer prompt-kit/loader prompt-kit/thinking-bar` | text-shimmer and loader import only `cn` (VERIFIED first lines; I did not read the whole files, so check for `motion` when pulled). Fallback: hand-build with `tw-animate-css` + one CSS keyframe. |
| Reasoning collapsible | prompt-kit `reasoning` (uses Markdown + collapsible) or hand-build on our `collapsible` | `npx shadcn@latest add prompt-kit/reasoning` | AI Elements `reasoning` needs streamdown + 4 streamdown plugins; avoid. |
| Suggestion cards | AI Elements `suggestion` (no external imports, VERIFIED) or prompt-kit `prompt-suggestion` | `npx ai-elements@latest add suggestion` or `npx shadcn@latest add prompt-kit/prompt-suggestion` | Both are thin pill buttons. A "streaming suggestion card" (card appears then fills) is product-specific: hand-build from `card` + `skeleton` + `response-stream`. |
| Stepper for setup | none | hand-build | Kibo has no stepper (VERIFIED). Use `Item` + `Progress` + state. |
| Status badges | our `badge` + Kibo `status`/`pill` optional | `npx kibo-ui add status` (UNVERIFIED syntax) | Ours likely enough. |
| Waveform / level meter | none in any lib | hand-build | AI Elements has no waveform (my grep of repo tree for wave|live: no hit). Its voice group is audio-player (media-chrome), mic-selector (no waveform), persona (Rive + remote .riv files), speech-input (browser SpeechRecognition), transcription, voice-selector. prompt-kit has none. |
| Resizable panels | shadcn `resizable` | PRESENT | |

## (c) Hand-build (no lib fits)
1. Live waveform / level meter: `AudioContext` + `AnalyserNode` -> `<canvas>` or ~24 CSS bars driven by a rAF loop; about 60 lines. A `ponytail:` comment for the fixed bar count.
2. Setup stepper: list of steps with status (done/active/todo) using `Item` + `Badge` + `Progress`.
3. Streaming suggestion card (card with skeleton -> text fill, accept/dismiss, `Kbd` hint): compose `card`, `skeleton`, `response-stream`, `kbd`.
4. Any capture/consent indicator (recording dot, pulsing): CSS keyframe with `tw-animate-css`.
5. Anything that depends on loading remote assets (Persona/Rive, web fonts).

## (d) Peer-dep / bundle-size risks
- AI Elements is the heavy one: `ai` ^6 (Vercel AI SDK), `motion` ^12, `streamdown` + `shiki` 3.22 (+ optional `katex`, mermaid, `@xyflow/react`, `media-chrome`, `@rive-app/react-webgl2`) per its package.json (VERIFIED). The CLI adds only per-file imports, but `message.tsx` alone imports `ai` (types) + streamdown + four `@streamdown/*` plugins, and `reasoning.tsx` imports streamdown + plugins. `conversation` imports `ai` + `use-stick-to-bottom`. Our Electron main already has its own agent loops (Zen); adding the `ai` package to the renderer only for types is unnecessary weight.
- `streamdown` deps (VERIFIED): unified/remark/rehype-raw/rehype-sanitize/marked 18/... ; `marked` ^18 matches what we already have. Still a large tree vs our `Markdown.tsx`.
- `motion` (~tens of KB gz; number not verified) would be a first-time addition; prompt-kit `text-morph` and Magic UI/Aceternity need it. The shortlist avoids it.
- shiki: ships grammars lazily but increases install size; we already render code somewhere via `Markdown.tsx`; skip.
- Electron: bundle size matters little for load time (local file), more for installer size. Nothing ML bundled rule is unaffected.
- React 19.3 / Tailwind 4.3: prompt-kit targets react ^19 / tailwind ^4.1 (VERIFIED package.json); AI Elements react 19.2.3 (VERIFIED).
- Unlayered legacy CSS can override utilities (unlayered beats layered). Any pulled component using bare tags needs a check for `p`, `button`, `ul`, `h*` rules in `plain.css`.

## (e) Licence obligations
- shadcn/ui, prompt-kit, Kibo UI, Magic UI, assistant-ui: MIT. Obligation: keep copyright + licence notice when copying code. Add each to `THIRD_PARTY_NOTICES.md` (the file already exists per the overview memory).
- Vercel AI Elements and Streamdown: Apache-2.0 ("Copyright 2023 Vercel, Inc."; GitHub marks NOASSERTION). Obligation: include Apache-2.0 text + NOTICE if any, and state changes in modified files. Permissive, compatible with a closed repo.
- coss ui: AGPL-3.0. Network-copyleft; copying into Careerloom would make derived files AGPL. Avoid. Consistent with the existing rule "Licences matter: VoiceStudio is AGPL".
- Aceternity: free tier licence not verifiable from source; Pro is paid and non-redistributable. Avoid, or re-verify the licence on their site before any copy.
- 21st.dev: per-author; must record origin URL + licence per component; free tier has a daily copy cap.
- The `magic` (21st.dev) MCP server is unauthenticated in this session; any 21st.dev work needs a fresh key from https://21st.dev/mcp.

## Could not verify
- Exact shadcn registry URL form for AI Elements, Kibo, Aceternity, 21st.dev (docs pages 404/403 or summarised).
- Whether prompt-kit `text-shimmer`/`loader` import `motion` beyond the first lines I read (text-morph does).
- Repo CSP (grep errored on zsh glob; not re-run).
- Electron major version (for CSS relative colour syntax in shadcn `bubble`).
- Aceternity repo licence; Origin UI old repo licence (404).
