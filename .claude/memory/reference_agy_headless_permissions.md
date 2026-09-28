---
name: agy-headless-permissions
description: How Antigravity CLI (agy) permissions work headlessly and how Careerloom grants them (scoped project, not global settings)
metadata:
  type: reference
---

`agy -p` auto-denies any tool needing a permission it can't prompt for ("headless mode cannot prompt for…") and still exits 0.
Grants live in agy project configs `~/.gemini/config/projects/<id>.json` → `permissionGrants.permissionGrants.allow` (forms: `command(<prefix>)`, `read_file(<abs path>)`, `write_file(<abs path>)`, `read_url(<domain>|*)`, `mcp(<server>/<tool>)`; never `command(*)`), plus `settings.internetPolicy`/`fileAccessPolicy` (`AGENT_SETTING_POLICY_ALLOW|ASK|DENY`) and `autoExecutionPolicy`. Select with `agy --project <id>`; `--mode accept-edits` auto-accepts edits. Global CLI settings: `~/.gemini/antigravity-cli/settings.json`. Models: `agy models` (id<TAB>label), `--model`.
Careerloom: `electron/agy-project.ts` writes project `careerloom` (career-ops root + skill dirs; node, npm run, read_url). Prefix grants were NOT enough: agy's agent uses shell (`git check-ignore`, `find -exec grep`) → soft-deny at a later step ends the turn with "no output produced" (logged as `soft-denying tool confirmation "RunCommand"` in ~/.gemini/antigravity-cli/log; command text is in conversations/*.db). Fix: agy runs with `--sandbox --dangerously-skip-permissions` — the macOS sandbox refuses writes outside the workspace (verified: `echo > ~/probe` → operation not permitted). Readiness probes (`agy models`) log as project "CLI Project" — not the failing run. Related: [[20260927-evaluate-jobs-fix]]

**Streaming:** `agy -p … --output-format stream-json` emits NDJSON: `{"event":"init","conversation_id"}` (resume with `--conversation <id>`), `step_update` with `step_type:"tool"` + `state:"ACTIVE"` + `tool_name`/`tool_info.parameters` (CommandLine, AbsolutePath…), `step_type:"agent_response"` + `text_delta` (fragments, no newlines), and `{"event":"result","result":{"status":"SUCCESS",usage,duration_seconds}}`. Careerloom's `agyFormatter()` in electron/runner.ts turns these into the same "▸ tool" + live text log as claude; verified live token-by-token 2026-09-27.
