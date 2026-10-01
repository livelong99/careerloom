# C. Knowledge-base design options (design reasoning = INFERENCE; repo facts cite A-careerloom-blocks.md)

## C1. Schema (TypeScript, `electron/kb/types.ts`; shared with renderer like `copilot/types.ts`)

```ts
type KbQuestionType = 'behavioural' | 'technical' | 'system-design' | 'coding' | 'situational' | 'recruiter'   // superset of QuestionType
type Provenance = 'sourced' | 'generated' | 'user'          // every item is exactly one; 'generated' is labelled in the UI
type SkillNode = { id: string; name: string; family: string | null; origin: 'jd' | 'gap' | 'cv' | 'taxonomy' | 'user';
                   expected: 'aware' | 'working' | 'strong' | 'expert'; weight: number /* 0..1 job relevance */; inCv: boolean }
type SourceRef = { id: string; url: string; title: string; host: string; kind: 'official-doc' | 'eng-blog' | 'github' | 'qa-site' | 'forum' | 'company-page' | 'other';
                   licence: string | null /* e.g. CC BY-SA 4.0 */; fetchedAt: number; contentHash: string; trust: 0 | 1 | 2 }   // no page text stored, only hash
type KbItem = {
  id: string                         // hash(normalised text)
  text: string                       // the question, paraphrased in our words
  type: KbQuestionType; skills: string[] /* SkillNode ids */; difficulty: 1 | 2 | 3 | 4 | 5
  provenance: Provenance; sources: Array<{ sourceId: string; note: string /* ≤200 chars paraphrase */ }>
  seen: number                       // distinct sources that surfaced it: 'frequency' signal
  confidence: number                 // 0..1 = f(seen, trust, provenance)
  idealOutline: string[]             // 3–6 bullets, generated from sources + JD, labelled
  rubric: Array<{ criterion: string; good: string; weak: string }>   // 3–5, feeds scoring
  followUps: string[]; redFlags: string[]
  hooks: { storyIds: string[]; gap: string | null; cvFacts: string[] }   // personalisation, resolved at read time, not stored raw cv
  user: { pinned: boolean; hidden: boolean; edited: boolean; notes: string | null }
  stats: { asked: number; lastScore: number | null; avgScore: number | null }   // written by practice/debrief
}
type KbNotes = { company: string[]; role: string[]; interviewerStyle: string[]; loop: string[] }   // short bullets with source ids
type KbManifest = { schema: 1; jobId: string; inputHash: string /* hash(JD structure + gaps + role/company) */; researchedAt: number;
                    runner: string; model: string | null; costUsd: number; searches: number; pages: number; status: 'complete' | 'partial' | 'failed'; coverage: Record<string, number> }
```
Constraints: ≤ 400 items/job (hard), ≤ 8 MB/job; item text ≤ 300 chars; `idealOutline` is generated and carries no verbatim source text.

## C2. Storage options

| Option | Fit | Cost |
|---|---|---|
| **A. Per-job folder of JSON (+ in-memory BM25 built at open)** `userData/kb/<jobId>/{manifest,items,sources,skills,notes}.json` | Matches every existing store (`sessions/`, `ats/`, `jdStructure` cache). Zero deps. 400 items ⇒ index builds in ms. Export/import = zip/copy of a folder. User edits are plain read-modify-atomic-write. | Cross-job search (e.g. "all questions about Kafka across my jobs") needs loading several folders; fine at tens of jobs. |
| B. `node:sqlite` single DB + FTS5 | Real FTS, cross-job queries | Needs Electron-bundled Node ≥ 22.5 and FTS5 compiled in (see `E-interviewer-echo.md` §3 for the verdict); experimental flag status; no precedent in repo; schema migrations. |
| C. `better-sqlite3` | Mature | **Native dependency ⇒ needs a gate** (task rule) + rebuild per Electron ABI + packaging. Rejected. |

**Recommendation (INFERENCE): A**, with the item/index code behind a `KbStore` interface so B can replace it if cross-job search becomes a requirement. Embeddings are an *optional* enhancer: if the pre-screen model is installed (`findRuntime()`), batch-embed the ≤400 item texts once into `vectors.f32` (384-d typical for small encoders, UNVERIFIED for the installed model) and rerank; otherwise BM25 only.

## C3. Retrieval for LIVE (budget < 50 ms, prefix-stable prompt)

1. **At session start (not on the hot path):** build `kbPrefix` = ≤ ~700 tokens: top 6 skills by `weight` with expected level, top 8 pinned/high-confidence items (question + one-line outline), company/role notes (3 bullets). Appended as `## QUESTION BASE` **after** the stable sections so a KB edit invalidates only the tail of the cacheable prefix. Counted inside `MAX_PREFIX_TOKENS` (6000): trimmed before the cv, after job + stories.
2. **Per detected question (hot path):** in-memory BM25 over `text + skills + followUps` (tokenised once at open) with a type filter from the detector; top-3 items ≤ 150 tokens go into the **user turn** (`KB MATCHES:` block, fenced with the same `neutralize()`), never the prefix. Expected cost: BM25 over ≤ 400 short docs is sub-millisecond in JS (INFERENCE; the latency harness in plan.md measures it; published figures in E note).
3. **Output:** `Suggestion.proof[].source` gains `kb:<itemId>` entries ⇒ the overlay shows a "From your question base" chip; the fact-check guard continues to treat only cv/job/stories as candidate-truth (KB material is *interview-side* knowledge, never claims about the candidate).

## C4. Versioning / refresh
- Cache key = `inputHash` (JD structure hash + gaps + role + company + `schema`). Same hash ⇒ open instantly, no spend.
- Refresh policy: auto-**suggest** (never auto-run, never auto-spend) when `researchedAt` > 30 days or `inputHash` changed; "Refresh" re-runs and **merges** by `item.id`, preserving `user.*` and `stats.*`; removed items are soft-hidden for one cycle.
- Resumable: pipeline checkpoints per phase in `run.json` (phase, queries done, fetched urls, spend) so Stop/crash resumes.
- Import/export: folder ⇄ single `.json` (`kb-export.json`, manifest + items + sources, no page text); import re-validates with the same schema guard and re-labels provenance `user` for unknown items.

## C5. Hallucination control (hard rules enforced in code, not prompt)
1. An item is `sourced` only if ≥ 1 `SourceRef` exists, fetched in this run, and the extractor's quoted evidence span appears (normalised substring match) in that page text. Else it is dropped or demoted to `generated`.
2. `generated` items (LLM filling coverage gaps from JD/skills) are always labelled, get `confidence ≤ 0.4`, and are capped at 30 % of the bank.
3. `idealOutline`/`rubric`/`followUps` are *always* generated; shown as "Suggested outline", never as a sourced fact.
4. URLs are never produced by the LLM: they come from search results/fetch only (the extractor returns indices into the fetched-page list).
