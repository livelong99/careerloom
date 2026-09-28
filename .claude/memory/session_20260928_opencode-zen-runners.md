---
name: 20260928-opencode-zen-runners
description: Two free runners — `opencode` (CLI, `opencode run --format json`) and `zen` (Careerloom's own in-process agent loop on the OpenCode Zen API); Paperclip/deepseek-harness evaluated and rejected as a base
metadata:
  type: project
---

**Task:** Let users run Careerloom for free via OpenCode — attach the opencode CLI, or use the OpenCode Zen API (optional key)
**Branch:** claude/practical-noether-pk57g8 · **Date:** 2026-09-28

**Files changed:**
- `electron/runner.ts`: RunnerId + `opencode`/`zen`; `CliRunner` type; opencode argv (`--command career-ops` for /career-ops prompts, `--session`, `--model`); opencode JSON parsers (format, summed `step_finish` usage, sessionID, `error` → failed).
- `electron/opencode.ts` (new): OPENCODE_CONFIG_CONTENT permission config (edit, bash `node *`/`npm run *` only, web, skill dirs), browser MCP config (`*` deny + read-only tools), `OPENCODE_API_KEY` env, Zen `/models` list (chat/completions ids only), default model `big-pickle`.
- `electron/zen-agent.ts` (new): tool loop over `https://opencode.ai/zen/v1/chat/completions` (`Bearer public` without key), AGENTS.md system prompt, career-ops SKILL.md inlined for `/career-ops` prompts, 80-turn cap, 429/5xx retry, sessions in `userData/zen-sessions/` (0600, 30-day prune).
- `electron/zen-tools.ts` (new): read/write/edit/list/glob/grep confined to career-ops (+ skill dirs read-only; no .git/.env; symlink-safe), `node <script in root>` / `npm run` without a shell, webfetch (no private hosts, manual redirects), websearch (DuckDuckGo HTML).
- `electron/mcp-client.ts` (new): minimal MCP stdio client (initialize/tools/list/tools/call) for zen browser boards.
- `electron/context.ts`: `startZen` (launchTask) branch in startAgent/startAgentPrompt; `cliEnv` for opencode; launchTask `onExit`; `readOpencodeKey`; models for every runner but `api`.
- `electron/integrations/browser-*.ts`: browser boards on opencode (env config) and zen (in-process MCP, read-only allowlist).
- `electron/main.ts`, `readiness.ts`, `chat.ts`, `contract.ts`, `preload.ts`: model lists, second secret `opencode`, OpenCode readiness (no sign-in), resumable sessions, resume only with the same runner.
- Renderer: Settings rows + Zen key field, onboarding (Zen = zero-install option; an agent is always available), RunsDrawer continue, RunnerBars tints.
- `electron/zen.test.ts` (new, 10 tests incl. fake-MCP browser run and mocked Zen loop).

**Decisions made:**
- Own ~480-line loop instead of a dependency: Paperclip (MIT) is an orchestration control plane over CLIs + Postgres, wrong layer; deepseek-harness `dsh` (MIT) fits but is ~518 MB node_modules, dev-preview, no in-process API — possible later as an optional installed runner.
- Zen runner speaks /chat/completions only (GPT/Claude/Gemini/Grok/Qwen Zen models use other endpoints and are filtered out).
- Kept the OpenRouter `api` runner untouched (career-ops script, 4 modes).

**Blockers & resolutions:**
- opencode.ai is blocked by this cloud environment's network policy → no live run; behavior verified from opencode source (2026-09-28) + mocked tests.

**State:** implemented, typecheck/tests/build green; not live-tested; not committed

**Next steps:** live test on the Mac (free model evaluate, chat resume, browser board on both runners); confirm `OPENCODE_API_KEY` is the env the CLI reads; confirm opencode MCP permission keys (`clbrowser_<tool>`); consider abort of in-flight Zen requests on cancel; free-model data-retention note for résumés.
