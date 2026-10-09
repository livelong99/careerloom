// Two finished Interview Copilot practice sessions (with the AI interviewer) and their debriefs, written through the app's session store.
const QA = {
  helios: [
    ['Design an ingestion pipeline that takes 200k sensor events per second and makes them queryable within five seconds.', 'system-design', 'I would start by clarifying the guarantee: effectively-once into the store, five-second freshness, and query patterns by device and time. Producers write to Kafka partitioned by device id, with a time bucket to avoid hot keys. A Go consumer batches into ClickHouse using a natural dedup key, so replays are safe. I would add lag and end-to-end freshness metrics, and a dead-letter topic. At Campfire a similar pipeline took inventory sync from fifteen minutes down to twenty seconds.', 4.2],
    ['How do you get effectively-once results from an at-least-once log?', 'technical', 'You make the writes idempotent. Each event carries a natural key, the sink upserts on it, and offsets are committed after the write. Where the sink supports transactions you can commit offsets and data together. It still breaks if the key is not stable across retries, so I test replays explicitly. In the ledger I rebuilt, reconciliation proves no breaks.', 3.9],
    ['A consumer group is lagging by forty minutes. What do you check, in order?', 'situational', 'First confirm the lag is real and growing, not a metrics artefact. Then rebalances and consumer throughput, then the downstream sink, because slow writes are the usual cause. Scale out only if partitions allow it, otherwise shed load or increase batch size. Afterwards add an alert on lag growth rate so we find out in minutes, not after forty.', 3.6],
    ['Tell me about a time you improved the reliability of a data pipeline.', 'behavioural', 'At Ironbridge the nightly reconciliation kept failing silently. I added row-count and checksum checks per stage, an alert on the first failed check and a runbook. Unexplained breaks went to zero over twelve months, and on-call pages for it dropped from weekly to none.', 4.4],
    ['Which parts of the Helios data platform would you want to own in the first year?', 'situational', 'Ingestion reliability first, since it is where I have the most evidence, and cost second. I would want to measure storage versus compute versus network spend before touching anything.', 3.3],
  ],
  saffron: [
    ['Walk me through the design of a metrics API that serves dashboards with p95 under 200 milliseconds.', 'system-design', 'Pre-aggregate by common dimensions in ClickHouse, cache hot queries with short TTLs in Redis, and push cardinality limits into the query layer. I would expose a narrow, versioned API with explicit time-range limits, and track p95 per endpoint.', 4.0],
    ['How do you keep a rollup table consistent with raw events?', 'technical', 'Treat the raw table as the source of truth, make rollups rebuildable per time bucket, and compare counts between them on a schedule. Late events trigger a re-aggregation of the affected buckets.', 3.8],
    ['Tell me about a disagreement over a technical design.', 'behavioural', 'On the risk-engine rewrite two of us disagreed about a shared library versus a service. I wrote a short comparison with latency and ownership costs, we ran a one-week spike, and the data favoured a service. We shipped that and kept the relationship good.', 3.7],
  ],
}

const TIPS = {
  helios: [[1, 'Strong opening: you clarified the guarantee before drawing anything. Name the partition count you would start with.', 'I would start with the guarantee: effectively-once into the store with five-second freshness.'], [3, 'Good order of checks. Lead with the one number that proves the lag is real.', null], [5, 'Tie the answer to one concrete first-year outcome rather than two goals.', null]],
  saffron: [[1, 'Good use of pre-aggregation. Say what the cache invalidation rule is before the interviewer asks.', null], [3, 'Clear story, but state the result in numbers (the spike length and the latency difference).', 'We ran a one-week spike; the service path cut p95 by a third, so we shipped it.']],
}
const CRIT = [['Correctness', 'Names the guarantee and its conditions'], ['Trade-offs', 'Weighs batching against latency'], ['Specifics', 'Uses numbers from past work'], ['Concision', 'Stays on the question']]

export function seedCopilot({ dist, file, now, kbJob, evaluated }) {
  const { openSessionStore } = dist('copilot/store.js')
  const { itemId } = dist('kb/hash.js')
  const store = openSessionStore(file('copilot'))
  const saffron = evaluated.find(j => j.company === 'Saffron Analytics' && /Metrics/.test(j.title))
  const make = (id, job, key, ago, scoreBand) => {
    const t0 = now - ago
    const qs = QA[key]
    let t = t0
    const transcript = []
    const questionsList = []
    const perQuestion = []
    qs.forEach(([text, type, answer, score], i) => {
      questionsList.push({ id: `${id}-q${i + 1}`, text, type: type === 'system-design' ? 'system-design' : type === 'behavioural' ? 'behavioural' : 'technical', confidence: 0.96, at: t, auto: false })
      transcript.push({ id: `${id}-l${i * 2}`, speaker: 'interviewer', text, final: true, t0: t, t1: t + 9000 })
      transcript.push({ id: `${id}-l${i * 2 + 1}`, speaker: 'you', text: answer, final: true, t0: t + 11000, t1: t + 11000 + answer.length * 55 })
      perQuestion.push({ itemId: itemId(text), score, hintUsed: i === 2, skipped: false, criteria: CRIT.map(([criterion, evidence], c) => ({ criterion, score: Math.max(1, Math.min(5, Math.round(score + (c === 2 ? -0.4 : c === 3 ? 0.2 : 0)))), evidence })) })
      t += 11000 + answer.length * 55 + 6000
    })
    const scorecard = { structure: scoreBand[0], specifics: scoreBand[1], evidence: scoreBand[2], concision: scoreBand[3], notes: TIPS[key].map(([q, tip, suggestedLine]) => ({ questionId: `${id}-q${q}`, tip, suggestedLine })) }
    const avg = Math.round(((scoreBand[0] + scoreBand[1] + scoreBand[2] + scoreBand[3]) / 4) * 10) / 10
    store.save({
      id, startedAt: t0, endedAt: t, mode: 'practice', jobId: job.url, jobTitle: job.title, company: job.company, questions: qs.length, durationSec: Math.round((t - t0) / 1000), score: avg,
      transcript, questionsList, suggestions: [], scorecard,
      interview: { planHash: `demo-plan-${key}`, itemIds: perQuestion.map(p => p.itemId), perQuestion },
    })
  }
  make('demo-practice-helios', kbJob, 'helios', 2 * 86_400_000 + 3600_000, [4.2, 3.8, 3.9, 3.7])
  make('demo-practice-saffron', saffron, 'saffron', 6 * 3600_000, [3.9, 3.6, 3.7, 4.1])
}
