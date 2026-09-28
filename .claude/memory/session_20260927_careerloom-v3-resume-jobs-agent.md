---
name: 20260927-careerloom-v3-resume-jobs-agent
description: Careerloom v3 — Resume workspace (live PDF hero, agent extraction, Firecrawl research), Jobs screen replaces Pipeline/Inbox, Agent chat (paperclip Tasks) replaces Runs, global Runs drawer
metadata:
  type: project
---

**Task:** Resume redesign; replace Pipeline+Runs with Jobs + Agent chat; skills live on their own screens.
**Branch:** main (uncommitted)
**Date:** 2026-09-27

**Files changed:**
- Lead: `electron/runner.ts` (argsForPrompt resume/addDirs/systemAppend, claudeSessionId), `electron/context.ts` (sessionId, onExit, setSkillContext, startAgentPrompt opts), `main.ts` (skill context from integrations registry, jobs/chat handlers), `electron/contract.ts` (Resume v2/Jobs/Chat types), `RunsDrawer.tsx`, App nav (Overview/Jobs/Resume/Agent/Monitoring/Integrations/Settings), CSP `frame-src blob:`, `.workspace` class, removed indigo.css `section{margin-top}`.
- Builders: `electron/resume-{agent,pdf,profile}.ts`, `electron/jobs{,-data}.ts`, `electron/chat.ts` + sections/components.

**Decisions made:**
- Installed skills attached to every agent run via `--add-dir` + `--append-system-prompt` (user: career-ops + skills are the engine).
- Template preview = hidden sandboxed BrowserWindow printToPDF (own partition, only data/file URLs) → blob iframe. No pdf.js, no plugins:true.
- Per-portal guidelines in career-ops `modes/_custom.md` managed block (sanitized headings).
- Subset scans via `CAREER_OPS_PORTALS=<temp yml> node scan.mjs`; batch eval = append pipeline.md + `/career-ops pipeline`.
- Chat resumes claude sessions (`--resume`); codex/agy start fresh per message.
- Inbox folded into Jobs ("Evaluate a link"); tracker table/kanban live in Jobs.

**Blockers & resolutions:**
- Unlayered codeburn CSS (`.body > *` 1180px cap, `.panel` flex column, `section` margin) broke Tailwind layouts → `.workspace` class, removed doc-chrome rule.

**State:** done — 277 tests, both tsc, build green; live QA incl. chat session resume (codeword test).

**Next steps:**
- Each chat message costs ~$0.5 base context (career-ops CLAUDE.md); consider a lighter system prompt / `--model` choice for chat.
- Resume export formats beyond PDF were dropped from the screen; re-add DOCX/LaTeX if wanted.
- Commit when user approves.
