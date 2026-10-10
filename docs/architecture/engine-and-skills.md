# Careerloom engine and skills: architecture plan

Status: phase 0 shipped in 0.4.1 (skill registry, Settings › Skills, runner injection, Agent `/skill` picker and image attachments). Phases 1 to 4 are proposed. Last updated 2026-10-10.

## 1. Why

Today Careerloom is a UI over [career-ops](https://github.com/career-ops-hq/career-ops). Its tracker, pipeline inbox,
reports, portals file and "modes" (prompt playbooks) all live in a career-ops folder, and many main-process modules
read or write those files directly. Two consequences:

1. Careerloom cannot ship a feature, or fix a bug, that needs a change in career-ops' file formats or prompts.
2. A better playbook than career-ops cannot be dropped in.

Target: **Careerloom owns its data and business logic. Playbooks are skills.** career-ops becomes one optional skill
pack the agent can follow, not the substrate.

## 2. Principles

- **Code owns state, skills own judgement.** Parsing, scoring, dedupe, persistence, validation and scheduling are
  deterministic code. The agent is asked only for what needs judgement (evaluate fit, write prose, research).
- **Capabilities are the seam.** The app asks for a capability (`evaluate-job`), never for a specific skill.
  A binding maps each capability to a skill; the default binding is a built-in skill we ship.
- **Skills are the open Agent Skills format**: a folder with `SKILL.md` (YAML frontmatter `name`, `description`) plus
  optional `references/` and `scripts/`. Anything that follows the format installs. Careerloom adds an optional
  `careerloom.json` that declares which capabilities a skill provides.
- **Progressive disclosure for tokens.** Only `name` + `description` (about 30 tokens per skill) reach the model up
  front. The body loads when the skill is selected or the agent asks for it.
- **Strangler, not rewrite.** Each capability moves off career-ops behind a flag with parity tests, one at a time.

## 3. What career-ops provides today (the seams)

| Surface | Where it is used | Replacement |
|---|---|---|
| `data/applications.md` tracker table | `electron/careerops.ts`, `tracker-actions.ts`, `jobs-data.ts`, `metrics.ts` | Engine store: `applications` |
| `data/pipeline.md` inbox | `careerops.ts`, `jobs-data.ts`, `jobs-batch.ts` | Engine store: `jobs` |
| `reports/*.md` evaluations | `careerops.ts`, `job-view/reportParse.ts`, `eval-pipeline/stage4-write.ts` | Engine store: `evaluations` (markdown kept as an export) |
| `portals.yml` boards | `integrations/portal-*.ts`, `sources.ts` | Engine store: `boards` |
| `cv.md`, `config/profile.yml` | `resume-profile.ts`, `resume.ts` | Engine store: `profile` |
| Modes (`scan`, `pipeline`, `deep`, `followup`, `pdf`, `batch`, `patterns`, `interview-prep`, `apply`) | `runner.ts` `MODES`, `jobs-batch.ts`, `integrations/skills.ts` | Built-in skills bound to capabilities |
| `scan.mjs`, batch worker scripts | `jobs-batch.ts`, `scan-history.ts` | Already partly replaced by the raw-CDP driver and web-board extractors |

Careerloom already owns: pre-screen, staged evaluation pipeline, fast browser driver, résumé/ATS, interview KB,
Copilot. Those stay and become engine services.

## 4. Target architecture

```
renderer (React)
   │  window.careerloom.*  (IPC contract.ts)
main process
   ├─ Engine services (deterministic, tested)
   │    pipeline · scanner · evaluator · tracker · resume · followups · analytics
   │         │ read/write
   │    Engine store  (<dataRoot>/careerloom/ : JSON + atomic writes, one file per collection;
   │                   node:sqlite when the schema outgrows files)
   ├─ Capability router   capability ─► binding ─► skill   (Settings › Skills)
   ├─ Skill registry      install · inspect · enable · update · remove · inject
   └─ Runners             claude · codex · agy · opencode · zen · api   (+ skill injection adapters)
```

### 4.1 Capabilities

A capability is a typed contract between the engine and a skill.

```ts
type Capability = 'evaluate-job' | 'scan-board' | 'tailor-resume' | 'cover-letter' | 'interview-prep'
                | 'followup' | 'deep-research' | 'pattern-analysis' | 'apply-assist'
type CapabilityContract = {
  id: Capability
  input: JsonSchema      // what the engine passes (job, profile, board…)
  output: JsonSchema     // what the engine validates and stores
  budget: { maxInputTokens: number; maxTurns: number }
}
```

The engine builds the input, runs the bound skill through a runner, validates the structured output against the
schema, and stores it. A skill that returns prose where JSON is required fails validation and the run is marked
failed with the reason, never silently accepted.

### 4.2 Skills

Folder layout (Agent Skills standard):

```
my-skill/
  SKILL.md            frontmatter: name, description, (license, allowed-tools)
  careerloom.json     optional: { "provides": [{ "capability": "evaluate-job", "entry": "SKILL.md" }], "version": "1.2.0" }
  references/ scripts/ assets/
```

Installed to `<userData>/skills/<id>/`; the registry file `<userData>/skills.json` records source, ref, content hash,
enabled flag and install time. See `electron/skills/types.ts` for the shared types.

Sources: GitHub shorthand or git URL (`owner/repo[/subdir][@ref]`), a local folder, a `.zip`. A curated index can be
added later without changing the install path.

Install pipeline: **fetch → inspect → consent → copy → register.**
- *Inspect* parses `SKILL.md`, rejects missing/invalid frontmatter, enforces size caps (default 5 MB, 500 files),
  rejects symlinks escaping the folder and path traversal, and lists scripts and binaries as warnings.
- *Consent* shows the user the name, description, source, size, whether it contains scripts, and the capabilities
  it claims. Nothing is copied before the user confirms.
- *Update* is explicit (never automatic): re-fetch, show the diff of `SKILL.md` and scripts, confirm.
- Skills never run code themselves. Scripts execute only through the active runner's own sandbox and permissions.

### 4.3 Runner injection

| Runner | How enabled skills reach it |
|---|---|
| Claude Code | copy or symlink into the run's working folder under `.claude/skills/<id>/` |
| Codex | `.codex/skills/<id>/` when supported, else an index block in `AGENTS.md` pointing at the files |
| Antigravity | the scoped project's skill folder, plus index in its instructions |
| OpenCode | `.opencode/skill/<id>/` |
| Zen / API (in-process) | system prompt lists `name: description`; two tools, `list_skills` and `read_skill(id, file?)`, load bodies on demand |

All adapters remove what they injected when the run ends. A per-run explicit selection (the Agent screen's
`/skill` picker) overrides the default enabled set for that run only.

### 4.4 career-ops after the change

- Ships as an optional **skill pack** (its modes as skills with `careerloom.json` bindings). Install from Settings ›
  Skills like any other.
- **Importer**: reads a career-ops folder once (tracker, pipeline, reports, portals, cv) into the engine store, with
  a dry-run summary. After import nothing reads the folder.
- **Legacy mode** while migrating: engine services read career-ops files through an adapter (`electron/careerops.ts`
  becomes `adapters/careerops`) so the UI keeps working during phases 1 to 3.
- Onboarding stops requiring a career-ops folder; the first step becomes "choose where Careerloom keeps your data".

## 5. Token optimisation

1. Progressive disclosure of skills (§2). Measure: tokens before the first tool call, per runner.
2. Deterministic pre-work in code: parse, dedupe, pre-screen, structure reports. The staged evaluation pipeline
   already cuts 8.2 h to 2.5 min per 1000 jobs; the rest follow it.
3. Structured outputs only (schemas in §4.1): no re-parsing prose, shorter replies.
4. Stable prompt prefix: skill index and profile first, per-job data last, so provider prompt caches hit.
5. Cache by input hash: an unchanged job + profile + skill version never re-runs.
6. Per-capability budgets (`maxInputTokens`, `maxTurns`) enforced by the router; overruns fail the run.
7. Use graft (or an equivalent symbol index) for agent runs that touch code or large folders, so retrieval returns
   spans instead of whole files.

## 6. Phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0 (shipped in 0.4.1)** | Skill registry, install/inspect/consent, Settings › Skills, runner injection, Agent screen `/skill` picker and image attachments | Install a skill from git, folder and zip; enabled skill visible to every runner; tests |
| **1** | Engine store + career-ops importer + adapter. Tracker, pipeline, reports read from the store | Import a real folder; Jobs, Overview and Monitoring identical on store vs legacy |
| **2** | Capabilities move one by one to built-in skills: `evaluate-job`, `tailor-resume`, `cover-letter`, `interview-prep`, then `followup`, `pattern-analysis` | Per capability: schema, parity test against career-ops output on fixtures, flag default on |
| **3** | `scan-board` fully on our scanners; onboarding no longer needs career-ops; career-ops optional pack | Fresh install with no career-ops folder completes setup and a scan |
| **4** | Capability binding UI, update flow with diff, curated skill index | Switch evaluate-job to another skill without a rebuild |

## 7. Risks and open decisions

- **Store format**: JSON files per collection first (matches the rest of the app, easy to inspect and back up);
  move to `node:sqlite` only if query needs outgrow it. Decide at the start of phase 1.
- **Skill trust**: skills are instructions the agent follows, so a malicious one can try prompt injection or ask the
  agent to run scripts. Mitigations are consent, hash pinning, no auto-update, and the runner sandbox. A signed
  index is out of scope until there is a curated source.
- **Runner skill support differs.** Codex and Antigravity conventions are least stable; adapters are isolated so a
  change touches one file.
- **Parity cost**: evaluation quality must not regress. Keep a fixture set of 20 jobs with recorded career-ops
  reports and compare score deltas and section completeness before flipping a flag.
- **License**: career-ops content is not copied into the repo. The pack is installed from its own source by the user.

## 8. Contract for phase 0 (shared by parallel work)

Types live in `electron/skills/types.ts`. IPC (all via `window.careerloom`):

```
skillsList(): InstalledSkill[]
skillsInspect(source: SkillSource): SkillPreview
skillsInstall(source: SkillSource, opts?: { confirmedScripts?: boolean }): InstalledSkill
skillsSetEnabled(id: string, enabled: boolean): InstalledSkill
skillsRemove(id: string): void
skillsUpdate(id: string): SkillPreview            // preview first; install applies
```

A run request may carry `skills?: string[]` (explicit set for that run) and `attachments?: Attachment[]`.
Attachments are written to `<userData>/attachments/<runId>/` and deleted with the run.

## 9. Phase 0 as shipped

- Code: `electron/skills/` (`parse`, `zip`, `inspect`, `registry`, `inject`, `handlers`, `ipc`); UI in Settings › Skills;
  Agent attachments in `electron/attachments.ts` and `electron/image-support.ts`.
- Git refs must be a branch or tag. The update preview does not show a diff yet.
- Injection folders for Codex (`.codex/skills`) and Antigravity (`.agent/skills`) follow current conventions and are the
  least certain; the API runner receives no skills.
- Image flags: Codex `-i`, OpenCode `-f`; Claude Code and Antigravity get the file path in the prompt; Zen sends image
  parts to vision models.
