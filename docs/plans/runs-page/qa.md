# Runs page: real-app QA

Run on a **cloned profile** (`--user-data-dir` copy with synthetic run history; keys/cookies not copied) and a copied career-ops folder whose `scan.mjs` is a zero-cost fake that prints a credential-looking line. Job-linked runs are seeded against two real jobs of the cloned list. One Electron instance on CDP port 9444; the user's own app (real profile) was not touched. Driver: `scripts/runs-qa/after.mjs` (before shots: `before.mjs` on commit af862ce).

**33/33 PASS.**

| Area | Check | Result | Detail |
|---|---|---|---|
| nav | `sidebar-runs-item` | PASS | ["Monitoring ⌘6","Runs ⌘7"] |
| nav | `shortcut-cmd-7` | PASS | Runs |
| live | `running-run-first-and-selected` | PASS | Scan QA Fake Corunningscan · scriptOct 1, 07:12 PM4s… |
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
| filter | `filter-status-failed` | PASS | 9 of 69 |
| filter | `filter-search` | PASS | rows=1 |
| a11y | `keyboard-nav` | PASS | Scan QA Fake Corunningscan · s -> Scan QA Fake Cocancelledscan · |
| a11y | `a11y-roles` | PASS | {"roles":[true,true,true,true],"active":true} |
| nav | `palette-runs-entry` | PASS | Go to > Runs |
| actions | `stop-running-run` | PASS | status=cancelled |
| actions | `delete-confirm-cancel-keeps` | PASS | rows=70 |
| actions | `delete-run` | PASS | 70 -> 69 |
| nav | `retention-chip` | PASS | Settings > Monitoring |
| jobs | `job-card` | PASS | Job Distinguished Engineer, Core DevOps — gitlab steps=6 |
| jobs | `job-timeline-chips` | PASS | chips=6 (4 job-view/evaluate/ats runs + report #1 CV + cover letter) |
| jobs | `row-shows-job` | PASS | Tailor résumédoneDistinguished Engineer, Core DevOps — gitlabOpen jobagent · claudeOct 1,  |
| jobs | `group-by-job` | PASS | [{"head":"Engineering Manager — gitlab2Open job","n":2},{"head":"Distinguished Engineer, Core DevOps — gitlab6 |
| jobs | `job-timeline-oldest-first` | PASS | Evaluate gitlab — Distinguished Engineer, Core DevOps > Structure job posting > Tailor résumé > Write cover le |
| jobs | `group-by-status` | PASS | ["running","failed","cancelled","done"] |
| jobs | `job-filter` | PASS | run-opt-qa-job-8,run-opt-qa-job-7 |
| jobs | `job-filter-none` | PASS | rows=61 |
| jobs | `missing-job-no-card` | PASS | Structure job posting |
| jobs | `open-match-lands-on-match-tab` | PASS | tab=Match |
| secrets | `no-secret-anywhere` | PASS | DOM + web storage after all views |

Screenshots (evidence/): `before-drawer-{dark,light}.png` (old side drawer; it printed the sentinel key live), `after-live-run-dark.png`, `after-big-log-{dark,light}.png`, `after-failed-filter-dark.png`, `after-job-card-dark.png`, `after-grouped-by-job-{dark,light}.png`, `after-runs-{dark,light}.png`.
