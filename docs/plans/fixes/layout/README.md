# FIX-UI: Copilot + Settings layout

Real Electron app on a cloned profile (`--user-data-dir` copy, copied career-ops). Drivers: `scripts/layout-qa/{shots,controls,click}.mjs`.
`before/` and `after/` are 1280 px full-height shots of all 7 Copilot pages and 12 Settings pages, dark + light; `after-w1000/` is Settings at 1000 px.

Root causes
- Appearance: grid `minmax(0,26rem)_1fr` let the 780-1200 px overlay preview's min-content crush the controls column. Now `26rem_minmax(0,1fr)`, preview scales (zoom) to its card.
- Row: control `shrink-0` beside a `min-w-0` label gave one-word-per-line labels; Row now wraps (label min 12rem).
- Settings > Copilot: `[&_section[aria-label]]:pt-0` stripped top padding from every nested Group (title tight to border); now only the page frames.
- Tier cards fixed 3 columns with nowrap pills -> auto-fit columns, wrapping pills. Models rows and error Notes wrap long ids/messages.
- Settings > Agent permissions table used codeburn's unlayered mono/nowrap/right-aligned td; now `.prose-table`.

Controls audit (hit-test + real toggles): no dead controls. Disabled-by-design: overlay preview buttons, Privacy-mode dependents until it is on (the toggle opens the consent notice first), unavailable runners' "Use this runner", "Never invent numbers" (locked on).
