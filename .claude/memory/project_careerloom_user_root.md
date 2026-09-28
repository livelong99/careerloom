---
name: careerloom-user-root
description: The user's real Careerloom career-ops folder and CLI readiness setup (auto-validated on folder select)
metadata:
  type: project
---

The user's actual career-ops folder for Careerloom is `/Users/perkypanda/Documents/Interview/career-ops` (git repo, node_modules installed, skills for .claude/.agents/.antigravitycli). Test against this for real-data checks; the scratchpad career-ops is only sample data.

**Why:** user selected it in Careerloom (2026-09-27) and asked that selecting a folder auto-validates and enables Claude Code, Codex and Antigravity.

**How to apply:** `electron/readiness.ts` probes each CLI token-free (`--version`, `claude auth status`, `codex login status`, `agy models`), checks skill files, prepares agy's scoped project ([[agy-headless-permissions]]), and main auto-switches the runner if the active one isn't ready. All three were READY on 2026-09-27.
