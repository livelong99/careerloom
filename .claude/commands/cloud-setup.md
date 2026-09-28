---
description: Bootstrap a cloud session — install the coding plugins, graft and (optionally) Ruflo, then load project memory
---

Set up this cloud session for Careerloom. Install tooling at **user scope** only — never commit plugin,
skill, graft or MCP files to the repo. Run each step, report what succeeded or failed, and keep going on
failure.

1. **Coding plugins** (media/design-tool plugins are intentionally excluded). Add the marketplaces, then install:

   ```bash
   claude plugin marketplace add DietrichGebert/ponytail
   claude plugin marketplace add affaan-m/everything-claude-code
   claude plugin marketplace add bmad-labs/skills
   claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
   claude plugin marketplace add anthropics/claude-plugins-official
   claude plugin install ponytail@ponytail --scope user
   claude plugin install everything-claude-code@everything-claude-code --scope user
   claude plugin install bmad-skills@bmad-skills --scope user
   claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill --scope user
   claude plugin install frontend-design@claude-plugins-official --scope user
   ```

   If a marketplace is already added or a plugin is already installed, treat that as success.

2. **graft** (repo context graph; MIT, `@nanonets/graft`):

   ```bash
   npm install -g @nanonets/graft@0.20.0
   graft build .
   graft init . --no-agents --no-statusline --no-global -y
   ```

   `graft/` is gitignored. If `graft init` edits tracked files (e.g. `CLAUDE.md`), do **not** commit those edits —
   run `git diff --stat` and restore them with `git checkout -- <file>` once the session has picked them up.

3. **Ruflo MCP** (optional — only if `npx` can reach the registry):

   ```bash
   claude mcp add claude-flow --scope user -- npx -y ruflo@latest mcp start
   ```

   If it fails, continue: CLAUDE.md's Ruflo steps are skipped when the tools aren't registered.

4. **Project dependencies:** `npm ci`, then `npm run typecheck && npm test` to confirm the checkout is healthy.

5. **Memory:** read `.claude/memory/MEMORY.md` and `.claude/memory/project_careerloom_overview.md` (start here),
   then `.claude/memory/feedback_working_preferences.md`. New session notes go in `.claude/memory/` using the
   schema of the existing `session_*.md` files, with a pointer added to `MEMORY.md`.

6. Finish with a short summary: what is installed, what failed and why, and that **plugins and skills load in the
   next session** — tell the user to start a new session (or `/resume`) so they appear. Note what can't run in the
   cloud: packaging the macOS app, the local verdict-small model install, and browser boards that need Chrome cookies.
