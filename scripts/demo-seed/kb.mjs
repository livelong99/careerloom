// Job knowledge base for one demo job (Helios Labs, Senior Backend Engineer, Data Platform): the files the app's
// own research pipeline would have committed. Sources use the reserved .example TLD.

import fs from 'node:fs'
import path from 'node:path'

const SKILLS = [
  ['kafka', 'Kafka', 'Streaming', 'jd', 'strong', 0.95, true], ['postgres', 'PostgreSQL', 'Data stores', 'jd', 'strong', 0.9, true], ['go', 'Go', 'Languages', 'jd', 'strong', 0.85, true],
  ['data-modelling', 'Data modelling', 'Data stores', 'jd', 'working', 0.7, true], ['kubernetes', 'Kubernetes', 'Platform', 'jd', 'working', 0.6, true],
  ['observability', 'Observability', 'Platform', 'jd', 'working', 0.55, true], ['stream-processing', 'Stream processing', 'Streaming', 'gap', 'working', 0.65, false],
  ['api-design', 'API design', 'Backend', 'jd', 'strong', 0.6, true], ['leadership', 'Mentoring', 'Behavioural', 'jd', 'working', 0.5, true], ['cost', 'Cost optimisation', 'Platform', 'cv', 'aware', 0.35, true],
]

const SOURCES = [
  ['s1', 'https://engineering.heliolabs.example/blog/exactly-once-ingestion', 'How we got to effectively-once ingestion', 'eng-blog', 2],
  ['s2', 'https://docs.kafkaworks.example/design/delivery-semantics', 'Delivery semantics and idempotent producers', 'official-doc', 2],
  ['s3', 'https://github.example/heliolabs/ingest-core', 'heliolabs/ingest-core: README and design notes', 'github', 1],
  ['s4', 'https://qa.devforum.example/questions/4412/backpressure-in-consumers', 'Handling backpressure in a consumer group', 'qa-site', 1],
  ['s5', 'https://qa.devforum.example/questions/3057/partition-key-choice', 'Choosing a partition key for time-series events', 'qa-site', 1],
  ['s6', 'https://interviewnotes.example/helios-labs', 'Candidate notes: Helios Labs interview loop', 'forum', 0],
  ['s7', 'https://careers.heliolabs.example/engineering', 'Helios Labs engineering careers page', 'company-page', 2],
  ['s8', 'https://pgdocs.example/current/transaction-isolation', 'PostgreSQL: transaction isolation', 'official-doc', 2],
  ['s9', 'https://engineering.heliolabs.example/blog/on-call-without-burnout', 'On-call without burnout', 'eng-blog', 2],
]

// text, type, skills, difficulty, provenance, [sourceIds with notes], outline, followUps, redFlags, gap, cvFacts
const ITEMS = [
  ['Design an ingestion pipeline that takes 200k sensor events per second and makes them queryable within five seconds.', 'system-design', ['kafka', 'data-modelling', 'stream-processing'], 4, 'sourced', [['s1', 'Describes the same latency target and a Kafka-to-ClickHouse path'], ['s3', 'Design notes on batching and idempotent writes']], ['Clarify guarantees and query patterns', 'Partitioning and ordering', 'Batching vs latency', 'Failure and replay'], ['What happens when a consumer falls behind?', 'How do you size partitions?'], ['Ignores replay and duplicates'], 'Stream processing at this volume', ['Kafka order-event pipelines cut sync delay from 15 min to 20 s']],
  ['How do you get effectively-once results from an at-least-once log?', 'technical', ['kafka'], 4, 'sourced', [['s2', 'Idempotent producers and transactional consumers'], ['s1', 'Dedup keys in the sink']], ['Name the delivery guarantees', 'Idempotent writes with a natural key', 'Transactions where the sink supports them'], ['Where does it still break?'], ['Claims exactly-once without conditions'], null, ['Settlement ledger reconciling 4M transactions a day']],
  ['Walk me through how you would choose a partition key for time-series events.', 'technical', ['kafka', 'data-modelling'], 3, 'sourced', [['s5', 'Hot-partition trade-offs for device ids vs time buckets']], ['Access pattern first', 'Cardinality and skew', 'Ordering needs'], ['What if one device is 100x noisier?'], ['Picks timestamp as the key'], null, []],
  ['A consumer group is lagging by 40 minutes. What do you check, in order?', 'situational', ['kafka', 'observability'], 3, 'sourced', [['s4', 'Lag triage: broker, consumer, downstream sink']], ['Confirm the lag is real', 'Look at consumer throughput and rebalances', 'Check the sink', 'Scale or shed load'], ['How would you stop it happening again?'], ['Restarts everything first'], null, ['Alert rules and runbooks adopted by a 14-person team']],
  ['Explain transaction isolation levels in PostgreSQL and when you would use serializable.', 'technical', ['postgres'], 3, 'sourced', [['s8', 'Read committed, repeatable read, serializable and anomalies']], ['Anomalies each level prevents', 'Cost of serializable retries', 'A concrete example from a ledger'], ['How do you handle serialization failures?'], ['Mixes up repeatable read with serializable'], null, ['Rebuilt the settlement ledger on PostgreSQL']],
  ['Tell me about a time you improved the reliability of a data pipeline.', 'behavioural', ['observability', 'leadership'], 2, 'sourced', [['s9', 'The team asks for a concrete incident-driven improvement'], ['s6', 'Reported in the behavioural round']], ['Situation and impact', 'What you changed', 'How you measured the result'], ['What would you do differently?'], ['No measurable result'], null, ['Reconciliation checks with zero unexplained breaks over twelve months']],
  ['Write a function that merges k sorted event streams into one ordered stream.', 'coding', ['go'], 3, 'sourced', [['s6', 'Reported as the coding exercise']], ['Heap of heads', 'Complexity', 'Handling ties and closed streams'], ['How does this change with unbounded streams?'], ['Sorts the concatenation'], null, []],
  ['Why do you want to work on a data platform rather than product features?', 'recruiter', ['data-modelling'], 1, 'sourced', [['s7', 'Platform mission statement']], ['Connect to past platform work', 'Customers are internal engineers'], [], ['Generic answer'], null, ['Terraform staging environments in 12 minutes']],
  ['Describe how you would design the schema for storing device readings and their calibration history.', 'system-design', ['postgres', 'data-modelling'], 3, 'generated', [], ['Entities and cardinalities', 'Slowly changing calibration data', 'Retention and partitioning'], ['How does the query plan change at a billion rows?'], [], 'Time-series schema design', []],
  ['How do you roll out a breaking schema change to a topic with twelve consumers?', 'situational', ['kafka', 'api-design'], 4, 'sourced', [['s1', 'Schema registry and compatibility rules'], ['s2', 'Consumer upgrade ordering']], ['Compatibility mode', 'Dual-publish window', 'Consumer-by-consumer cutover', 'Rollback'], ['Who signs off?'], ['Big-bang release'], null, ['Pact contract tests across eleven services']],
  ['What would make you comfortable being on call for this platform?', 'behavioural', ['observability', 'leadership'], 2, 'sourced', [['s9', 'Runbooks, alert quality and rotation size']], ['Alert quality', 'Runbooks', 'Escalation and support'], [], ['Dismisses on-call'], null, ['On-call runbooks adopted by a 14-person team']],
  ['Your Kubernetes consumers are OOM-killed under load. How do you diagnose and fix it?', 'situational', ['kubernetes', 'observability'], 3, 'sourced', [['s4', 'Memory growth from unbounded buffers']], ['Metrics and heap profile', 'Bound buffers and add backpressure', 'Right-size requests and limits'], ['How do you prove the fix?'], ['Only raises the limit'], null, ['Migrated 24 services to Kubernetes']],
  ['How do you decide between ClickHouse and PostgreSQL for a new analytical workload?', 'technical', ['postgres', 'data-modelling'], 3, 'generated', [], ['Query shape and volume', 'Update patterns', 'Operational cost'], [], [], null, ['ClickHouse and PostgreSQL reporting pipelines']],
  ['Tell me about a time you disagreed with a design and how it was resolved.', 'behavioural', ['leadership'], 2, 'sourced', [['s6', 'Asked in the hiring-manager round']], ['Context and stakes', 'How you argued with data', 'Outcome and relationship'], ['What did you learn?'], ['Blames the other party'], null, ['Led a four-engineer squad through a risk-engine rewrite']],
  ['How would you reduce the cloud bill of a Kafka-heavy platform by a quarter without hurting latency?', 'system-design', ['kafka', 'cost'], 4, 'generated', [], ['Measure first: storage vs compute vs network', 'Retention and compaction', 'Right-size brokers and tiered storage'], ['What would you not touch?'], [], null, ['AWS spend down 27% by right-sizing Kafka and RDS']],
  ['Explain how you would test an ingestion service end to end without a production Kafka cluster.', 'technical', ['kafka', 'go'], 3, 'sourced', [['s3', 'Test harness with an in-process broker']], ['Contract tests', 'In-process or containerised broker', 'Fault injection'], [], ['Mocks everything'], null, ['Contract tests reduced release defects by 41%']],
  ['What are the first three things you would want to learn in your first month here?', 'recruiter', [], 1, 'sourced', [['s7', 'Onboarding expectations']], ['Customers and data flows', 'On-call and incident history', 'Roadmap and constraints'], [], [], null, []],
  ['Which parts of the Helios data platform would you want to own in the first year?', 'situational', ['leadership', 'data-modelling'], 2, 'user', [], ['Pick one reliability and one cost goal', 'Explain why you can deliver them'], [], [], null, []],
]

const DIFF_RUBRIC = {
  technical: [['Correctness', 'States the guarantee precisely, with its conditions', 'Hand-waves or overclaims'], ['Trade-offs', 'Names the cost of each option', 'Presents one option as free']],
  'system-design': [['Requirements', 'Clarifies scale, latency and guarantees first', 'Starts drawing boxes'], ['Failure modes', 'Covers replay, duplicates and backpressure', 'Only the happy path']],
  behavioural: [['Specifics', 'Concrete situation with numbers', 'Generic statements'], ['Ownership', 'Clear personal contribution', 'Says "we" throughout']],
  coding: [['Approach', 'Picks the right structure and explains complexity', 'Brute force only'], ['Edge cases', 'Empty, duplicate and closed inputs', 'Misses edge cases']],
  situational: [['Prioritisation', 'Orders checks by likelihood and cost', 'Tries everything at once'], ['Prevention', 'Adds a guardrail afterwards', 'Stops at the fix']],
  recruiter: [['Motivation', 'Links the role to past work', 'Generic enthusiasm']],
}

// The same input hash the app computes (job-view posting + missing keywords), so the base does not read as stale.
function appInputHash({ dist, root, cv, job }) {
  const { parseReport } = dist('job-view/reportParse.js')
  const { deterministicPosting } = dist('job-view/jdStructure.js')
  const { keywordCoverage } = dist('job-view/keywords.js')
  const report = parseReport(fs.readFileSync(path.join(root, job.report), 'utf8'))
  const posting = deterministicPosting(report.jd, { title: job.title, company: job.company, location: job.location })
  const gaps = keywordCoverage([...report.keywords, ...(posting?.techStack ?? []), ...(posting?.skills ?? [])], cv).filter(k => k.status === 'missing').map(k => k.keyword)
  const { inputHash } = dist('kb/hash.js')
  return inputHash({ jd: { stack: posting?.techStack ?? [], skills: posting?.skills ?? [], req: posting?.requirements ?? null }, gaps, role: job.title || posting?.title || 'Untitled role', company: job.company || posting?.company || '' })
}

export function seedKb({ dist, kbDir, jobId, now, runner, model, root, cv, job }) {
  const { openKbStore } = dist('kb/store.js')
  const { makeItem } = dist('kb/research/item.js')
  const store = openKbStore(() => kbDir)
  const t0 = now - 4 * 86_400_000
  const sources = SOURCES.map(([id, url, title, kind, trust]) => ({ id, url, title, host: new URL(url).host, kind, licence: kind === 'official-doc' ? 'CC BY 4.0' : null, fetchedAt: t0, contentHash: 'demo'.padEnd(16, '0') + id, trust }))
  const trustOf = Object.fromEntries(sources.map(s => [s.id, s.trust]))
  const items = ITEMS.map(([text, type, skills, difficulty, provenance, srcs, idealOutline, followUps, redFlags, gap, cvFacts], i) => {
    const sourcesRef = srcs.map(([sourceId, note]) => ({ sourceId, note }))
    const base = makeItem({ text, type, skills, difficulty, provenance, sources: sourcesRef, trust: Math.max(0, ...srcs.map(s => trustOf[s[0]])) })
    return {
      ...base, seen: provenance === 'sourced' ? Math.max(1, sourcesRef.length + (i % 2)) : base.seen, idealOutline, followUps, redFlags,
      rubric: (DIFF_RUBRIC[type] ?? []).map(([criterion, good, weak]) => ({ criterion, good, weak })),
      hooks: { storyIds: [], gap, cvFacts },
      user: { pinned: i === 0 || i === 4, hidden: false, edited: provenance === 'user', notes: i === 0 ? 'Practice this one out loud.' : null },
      stats: i < 4 ? { asked: 2, lastScore: 3.6 + i * 0.3, avgScore: 3.4 + i * 0.25 } : base.stats,
    }
  })
  store.commit(jobId, {
    manifest: { schema: 1, jobId, inputHash: appInputHash({ dist, root, cv, job }), researchedAt: t0, runner, model, costUsd: 0.31, searches: 14, pages: 23, status: 'complete', coverage: { stackexchange: 5, github: 3, companyPages: 4, articles: 6 } },
    items, sources,
    skills: SKILLS.map(([id, name, family, origin, expected, weight, inCv]) => ({ id, name, family, origin, expected, weight, inCv })),
    notes: {
      company: ['Helios Labs builds energy analytics for utilities; about 120 engineers.', 'Engineering blog posts describe an ingestion-first architecture on Kafka and ClickHouse.'],
      role: ['The data platform team owns ingestion, storage and the internal query API.', 'Senior engineers carry a design-review responsibility for their area.'],
      interviewerStyle: ['Prefers concrete numbers and trade-offs over buzzwords.', 'Asks follow-ups on failure handling.'],
      loop: ['Recruiter screen, coding exercise, system design, hiring-manager conversation.'],
    },
  })
  return { items: items.length }
}
