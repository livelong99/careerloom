// ATS analyses (resume-level + five jobs), scored by the app's own buildReport with the agent's extraction
// written by hand: requirements and quote-backed judgements, no model call and no PDF render (page checks are estimated).
import { FAMILIES } from './reports.mjs'

const SETS = {
  be: [['Go', true], ['PostgreSQL', true], ['Kafka', true], ['Kubernetes', false], ['gRPC', false], ['Spark', false]],
  pl: [['Kubernetes', true], ['Terraform', true], ['AWS', true], ['Go', false], ['Prometheus', false], ['Istio', false]],
}
const QUOTE = { Go: 'Rebuilt the settlement ledger in Go', PostgreSQL: 'ledger in Go and PostgreSQL', Kafka: 'Kafka-based order-event pipelines', Kubernetes: 'Migrated 24 services from VM deployments to Kubernetes', gRPC: 'gRPC connection pooling', Terraform: 'Terraform and ArgoCD', AWS: 'monthly AWS spend', Prometheus: null, Spark: null, Istio: null }
const HINTS = { Spark: 'Add a short Spark or Flink project, or name the ClickHouse batch volumes you ran.', Istio: 'Mention the gRPC pooling work and any service-mesh proof of concept.', Prometheus: 'Name the alerting stack you used at Pixelmill and Ironbridge.' }
const COURSES = {
  Spark: { title: 'Data Processing with Spark: Fundamentals', provider: 'OpenLearn Labs', url: 'https://learn.openlearn.example/courses/spark-fundamentals', free: true, hours: 12, skill: 'Spark', why: 'Closes the batch-processing gap named in five postings' },
  Istio: { title: 'Service Mesh in Practice with Istio', provider: 'CloudSchool', url: 'https://cloudschool.example/istio-in-practice', free: false, hours: 9, skill: 'Istio', why: 'Hands-on traffic management and mTLS labs' },
}

export function seedAts({ dist, file, write, now, cv, evaluated, kbJob }) {
  const { buildReport } = dist('ats/analyze.js')
  const { openStore, jobStoreDir, sha } = dist('ats/store.js')
  const { htmlOf, onePagePdf } = dist('ats/fixtures.js')
  // The page checks read the same text a clean one-column template renders; similarities are fixed stand-ins for the local encoder.
  const sim = async ({ queries }) => ({ best: queries.map(q => (QUOTE[q.replace(' experience', '')] ? 0.66 + (q.length % 9) / 100 : 0.5)) })
  const deps = { now: () => now, render: async () => ({ pdf: new Uint8Array(1), html: htmlOf(cv) }), pages: async () => onePagePdf(cv), sim }
  const run = async (dir, id, jd, family, tail) => {
    const set = SETS[family]
    const reqs = set.map(([skill, required], i) => ({ id: `r${i + 1}`, text: `${skill} experience`, skill, required }))
    const judgements = reqs.filter(r => QUOTE[r.skill]).map(r => ({ req_id: r.id, match: 'exact', cv_quote: QUOTE[r.skill], certain: true }))
    const hints = Object.fromEntries(reqs.filter(r => !QUOTE[r.skill]).map(r => [r.skill, HINTS[r.skill]]))
    const courses = reqs.filter(r => COURSES[r.skill]).map(r => ({ ...COURSES[r.skill], verified_at: now - 3 * 86_400_000 }))
    const a = { id, createdAt: now - tail * 3600_000, templateId: 'standard', jd, key: sha(id), extraction: { reqs, judgements, notes: [] }, agentFindings: [], hints, courses, notes: [], plan: 'Lead with the ledger rebuild and the 38% latency result; move Kubernetes below the payments bullets.' }
    const { report } = await buildReport(deps, a, cv)
    const analysis = { ...a, report }
    const store = openStore(dir)
    store.save(analysis)
    store.cachePut(analysis)
  }
  const jd = (title, set, fam) => `${title}\n\nAbout the team\nYou will join a product-aligned engineering squad that owns services end to end, from design through on-call, and works closely with product managers and designers to ship changes every week.\n\nWhat you'll do\n${FAMILIES[fam].does.map(d => `- ${d}`).join('\n')}\n\nWhat you'll bring\n${set.map(([s, req]) => `- ${req ? 'Strong' : 'Preferred'}: ${s}`).join('\n')}\n- 5+ years of professional experience building and running production services\n- Clear written communication, careful code review and a habit of measuring results\n\nHow we work\nSmall teams, written design documents, blameless incident reviews and a bias for boring, well-understood technology. We value people who leave systems simpler than they found them and who help the engineers around them grow.`
  const jobs = [kbJob, ...evaluated.filter(j => j !== kbJob && j.score >= 4.1).slice(0, 4)]
  return Promise.all([
    run(file('ats'), 'demo-ats-resume', jd(kbJob.title, SETS.be, 'be'), 'be', 5),
    ...jobs.map((j, k) => run(jobStoreDir(file('ats'), j.url), `demo-ats-${k}`, jd(j.title, SETS[j.family === 'pl' ? 'pl' : 'be'], j.family === 'pl' ? 'pl' : 'be'), j.family === 'pl' ? 'pl' : 'be', 20 + k * 9)),
  ])
}
