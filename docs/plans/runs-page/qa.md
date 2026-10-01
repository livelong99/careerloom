# Runs page: real-app QA

Run on a **cloned profile** (`--user-data-dir` copy with synthetic run history only; keys/cookies not copied) and a copied career-ops folder whose `scan.mjs` is a zero-cost fake that prints a credential-looking line. One Electron instance on CDP port 9444; the user's own app (real profile) was not touched. Driver: `scripts/runs-qa/after.mjs` (before shots: `before.mjs` on commit af862ce).

| Area | Check | Result | Detail |
|---|---|---|---|
| nav | `sidebar-runs-item` | PASS | ["Monitoring ⌘6","Runs ⌘7"] |
| nav | `shortcut-cmd-7` | PASS | Runs |
| live | `running-run-first-and-selected` | PASS | Scan QA Fake Corunningscan · scriptOct 1, 07:00 PM4s… |
| live | `elapsed-ticks` | PASS | 4s -> 7s |
| live | `live-log-streams` | PASS | 1QA fake scan starting2[001] fetched board page 1 · found 1  |
| secrets | `live-log-redacted` | PASS | credential line hidden + bare key masked; hidden=1 leak=false |
| nav | `deeplink-selects-run` | PASS | Scan all portals (big log) |
| log | `big-log-1600-lines` | PASS | domRows=60 |
| log | `big-log-windowed` | PASS | domRows=60 |
| secrets | `big-log-redacted` | PASS | credential line hidden + bare key masked; leak=false |
| log | `step-jump` | PASS | timeline step scrolled the viewer to line 501 |
| log | `follow-tail-bottom` | PASS | 0[1600] board page 1600 fetched · 7 jobs |
| nav | `deeplink-failed-run` | PASS | Scan 3 portals (failed) |
| filter | `filter-status-failed` | PASS | 7 of 58 |
| filter | `filter-search` | PASS | rows=1 |
| a11y | `keyboard-nav` | PASS | Scan QA Fake Corunningscan · s -> Scan QA Fake Cocancelledscan · |
| a11y | `a11y-roles` | PASS | {"roles":[true,true,true,true],"active":true} |
| nav | `palette-runs-entry` | PASS | Go to > Runs |
| actions | `stop-running-run` | PASS | status=cancelled |
| actions | `delete-confirm-cancel-keeps` | PASS | rows=59 |
| actions | `delete-run` | PASS | 59 -> 58 |
| nav | `retention-chip` | PASS | Settings > Monitoring |
| secrets | `no-secret-anywhere` | PASS | DOM + web storage after all views |

Screenshots: `before-drawer-{dark,light}.png` (old side drawer; note it printed the sentinel key live), `after-live-run-dark.png`, `after-big-log-{dark,light}.png`, `after-failed-filter-dark.png`, `after-runs-{dark,light}.png`.
