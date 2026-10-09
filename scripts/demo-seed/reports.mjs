// Builds career-ops style evaluation reports (A-G blocks, Machine Summary, keywords) for the demo jobs.
// Deterministic: the same job always produces the same text.

const FAMILIES = {
  be: {
    archetype: 'Backend Engineer',
    reqs: [
      ['Go or Java services at scale', 'critical', 'Rebuilt the Ironbridge settlement ledger in Go: 4M transactions a day'],
      ['PostgreSQL and relational modelling', 'critical', 'Tuned PostgreSQL reporting 3 h to 25 min; ledger on PostgreSQL'],
      ['Event streaming with Kafka', 'high', 'Kafka order-event pipelines at Campfire, sync delay 15 min to 20 s'],
      ['Kubernetes and AWS', 'high', 'Migrated 24 services to Kubernetes on AWS with Terraform'],
      ['API design and gRPC', 'high', 'gRPC connection pooling cut p95 latency by 38%'],
      ['Mentoring and design review', 'medium', 'Led a four-engineer squad; two promotions in 18 months'],
      ['Payments or fintech domain', 'medium', 'Settlement ledger and risk-engine work'],
    ],
    gaps: [['Multi-region active-active data stores', 'Medium', 'Point to the Ledgerline failover design and the Kafka replication work at Campfire.'], ['Formal on-call leadership', 'Low', 'Offer the runbooks and alert rules written at Pixelmill as evidence.']],
    keywords: ['Go', 'Java', 'PostgreSQL', 'Kafka', 'gRPC', 'Kubernetes', 'AWS', 'Terraform', 'microservices', 'distributed systems', 'observability', 'code review'],
    does: ['Own services that sit on the critical path of the product and keep their latency and correctness budgets', 'Design APIs and event contracts with product and platform teams', 'Improve reliability: SLOs, alerting, incident follow-up', 'Review code and mentor engineers across the team'],
    comp: [50, 75],
  },
  pl: {
    archetype: 'Platform / SRE Engineer',
    reqs: [
      ['Kubernetes in production', 'critical', 'Ran 24 services on Kubernetes; ArgoCD delivery'],
      ['Infrastructure as code (Terraform)', 'critical', 'Terraform staging environments in 12 min instead of two days'],
      ['Observability and alerting', 'high', 'Alert rules and runbooks adopted by a 14-person team; Tracewell project'],
      ['CI/CD pipelines', 'high', 'Deploy time 45 to 7 minutes'],
      ['Incident response and on-call', 'high', 'Primary on-call at Ironbridge for payment services'],
      ['Cloud cost optimisation', 'medium', 'AWS spend down 27% by right-sizing Kafka and RDS'],
      ['Service mesh / networking', 'medium', 'Limited: gRPC pooling, no mesh in production'],
    ],
    gaps: [['Service mesh in production', 'Medium', 'Mention the gRPC pooling work and a short Istio proof of concept.'], ['Platform product mindset (internal customers)', 'Low', 'Frame the staging-environment automation as a self-service platform.']],
    keywords: ['Kubernetes', 'Terraform', 'ArgoCD', 'AWS', 'SRE', 'observability', 'Prometheus', 'incident response', 'CI/CD', 'FinOps', 'platform engineering', 'Linux'],
    does: ['Build the paved road: self-service deploys, environments and observability for product teams', 'Run the clusters and the delivery pipeline with clear SLOs', 'Lead incident reviews and turn them into platform improvements', 'Keep cloud spend visible and predictable'],
    comp: [48, 70],
  },
  da: {
    archetype: 'Data Engineer',
    reqs: [
      ['SQL and warehouse modelling', 'critical', 'ClickHouse and PostgreSQL reporting pipelines'],
      ['Orchestration (Airflow)', 'critical', 'Airflow jobs for nightly reconciliation at Ironbridge'],
      ['Streaming with Kafka', 'high', 'Kafka order-event pipelines at Campfire'],
      ['Python data tooling', 'high', 'FastAPI and Python services at Campfire'],
      ['dbt and data quality', 'medium', 'dbt models for finance reporting; no formal data-quality framework'],
      ['Spark / large-scale batch', 'medium', 'Not on the CV'],
      ['Stakeholder communication', 'medium', 'Finance and risk teams were the main consumers'],
    ],
    gaps: [['Spark at scale', 'Medium', 'Lead with ClickHouse volumes and the nightly 4M-row reconciliation.'], ['Data-quality framework ownership', 'Low', 'Describe the reconciliation checks as data contracts.']],
    keywords: ['SQL', 'Airflow', 'dbt', 'Kafka', 'ClickHouse', 'Python', 'data modelling', 'ETL', 'data quality', 'warehouse', 'Spark', 'orchestration'],
    does: ['Build and operate the pipelines that feed analytics and product features', 'Model data so it is trustworthy and cheap to query', 'Work with analysts and product on metric definitions', 'Monitor freshness and quality, and fix what breaks'],
    comp: [40, 60],
  },
  sec: {
    archetype: 'Security Engineer',
    reqs: [
      ['AWS IAM and cloud security', 'critical', 'IAM least-privilege review for 24 services'],
      ['Detection engineering', 'critical', 'Not on the CV; closest is alert design at Pixelmill'],
      ['Go or Python tooling', 'high', 'Go and Python services throughout'],
      ['Kubernetes security', 'high', 'CKA certified; admission policies for one cluster'],
      ['Incident response', 'high', 'Primary on-call and post-incident reviews'],
      ['Compliance (SOC 2, ISO 27001)', 'medium', 'Supported the SOC 2 audit evidence for payments'],
      ['Threat modelling', 'medium', 'Design reviews for the risk engine'],
    ],
    gaps: [['Detection engineering depth', 'High', 'Be upfront; position as a backend engineer who will build the detection pipeline, not tune rules.'], ['No security-titled role', 'Medium', 'Lead with SOC 2 evidence and the IAM review.']],
    keywords: ['AWS IAM', 'detection engineering', 'SIEM', 'Kubernetes security', 'Go', 'Python', 'incident response', 'SOC 2', 'threat modelling', 'zero trust', 'EDR', 'CloudTrail'],
    does: ['Build the pipelines that turn raw telemetry into detections', 'Review designs and harden cloud and cluster configuration', 'Respond to incidents and write the follow-up', 'Support compliance work with evidence and automation'],
    comp: [45, 65],
  },
  oth: {
    archetype: 'Embedded / Systems Engineer',
    reqs: [
      ['C/C++ firmware', 'critical', 'No C/C++ on the CV'],
      ['RTOS and drivers', 'critical', 'Not on the CV'],
      ['MQTT / device protocols', 'high', 'Device-cloud integration work at Pixelmill'],
      ['Linux internals', 'high', 'Linux production experience, no kernel work'],
      ['Python tooling', 'medium', 'Python services and scripts throughout'],
      ['Cloud connectivity', 'medium', 'Strong: AWS and Kafka ingestion'],
    ],
    gaps: [['C/C++ firmware', 'High', 'Hard requirement; the role is not a fit without it.'], ['RTOS experience', 'High', 'No mitigation available.']],
    keywords: ['C++', 'embedded', 'RTOS', 'firmware', 'MQTT', 'Linux', 'Yocto', 'drivers', 'Python', 'CAN bus', 'IoT', 'testing'],
    does: ['Write and test firmware for edge devices', 'Bring up boards and debug at the hardware boundary', 'Define the device-to-cloud protocol with the backend team', 'Maintain the OTA update path'],
    comp: [30, 45],
  },
}

const r1 = n => Math.round(n * 10) / 10
const clamp = n => Math.max(1, Math.min(5, n))
const pad = n => String(n).padStart(3, '0')
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
export const reportFile = (n, company, date) => `${pad(n)}-${slug(company)}-${date}.md`

function matchesFor(score, count) {
  const strong = Math.max(1, Math.round((score - 2) * count / 3))
  return Array.from({ length: count }, (_, i) => (i < strong ? 'strong' : i < strong + Math.ceil((count - strong) / 2) ? 'partial' : 'missing'))
}
const MARK = { strong: '✅ Strong', partial: '⚠️ Partial', missing: '❌ Missing' }

export function makeReport({ n, company, domain, title, url, date, score, family, location, ats }) {
  const f = FAMILIES[family]
  const fits = matchesFor(score, f.reqs.length)
  const decision = score >= 4 ? 'Apply' : score >= 3.4 ? 'Consider' : 'Skip'
  const [lo, hi] = f.comp
  const worldwide = /worldwide/i.test(location)
  const comp = worldwide ? '$95,000 - $130,000 USD' : `INR ${lo} - ${hi} LPA`
  const missing = f.reqs.filter((_, i) => fits[i] === 'missing').map(r => r[0])
  const strengths = f.reqs.filter((_, i) => fits[i] === 'strong').slice(0, 3).map(r => r[0])
  const dims = [['CV match', clamp(score + 0.2)], ['North Star alignment', clamp(score - 0.1)], ['Compensation', clamp(score + 0.1)], ['Cultural signals', clamp(score - 0.2)], ['Red flags', clamp(5 - score)]]
  const jd = `**About ${company}**\n${company} builds ${domain} products used by teams across India and beyond. The engineering team is around 80 people working in small, product-aligned squads.\n\n**What You'll Do**\n${f.does.map(d => `- ${d}`).join('\n')}\n\n**What You'll Bring**\n${f.reqs.slice(0, 5).map(r => `- ${r[0]}`).join('\n')}\n- 5+ years of professional experience\n\n**Location**\n${location}${worldwide || /remote/i.test(location) ? ' (remote)' : ' (hybrid, two days a week in the office)'}`
  const cvRows = f.reqs.map((r, i) => `| ${r[0]} | ${r[1]} (stated) | ${MARK[fits[i]]} | "${r[0].split(' ').slice(0, 3).join(' ')}" | ${r[2]} |`).join('\n')
  const gaps = f.gaps.slice(0, missing.length ? 2 : 1).map((g, i) => `${i + 1}. **${g[0]} (${i === 0 && missing.length ? '❌ Missing' : '⚠️ Partial'} — ${g[1]}):**\n   - *Risk:* ${g[1] === 'High' ? 'Likely screened out at the first technical round.' : 'Probed in the technical interview.'}\n   - *Mitigation:* ${g[2]}`).join('\n')
  const plan = [['Summary', 'Backend and platform engineer…', `Lead with ${domain} and ${f.reqs[0][0].toLowerCase()}`, 'Mirrors the posting\'s first requirement'], ['Experience', 'Ironbridge: Rebuilt the settlement ledger…', `Move the ${f.reqs[1][0].toLowerCase()} bullet first`, 'Critical requirement, strongest proof'], ['Skills', 'Languages / Platform / Data', `Reorder to put ${f.keywords.slice(0, 3).join(', ')} first`, 'ATS keyword weighting']]
  return `# Evaluation: ${company} — ${title}

**Date:** ${date}
**Archetype:** ${f.archetype}
**Score:** ${score.toFixed(1)}/5
**Legitimacy:** High Confidence
**Work Auth:** ✅ Authorized in India
**URL:** ${url}
**PDF:** ${score >= 3.5 ? 'generated' : 'not generated'}
**Batch ID:** demo-${pad(n)}

---

## Job Description (archived verbatim)

${jd}

## Machine Summary

\`\`\`yaml
company: "${company}"
role: "${title}"
score: ${score.toFixed(1)}
legitimacy_tier: "High Confidence"
archetype: "${f.archetype}"
final_decision: "${decision}"
hard_stops: []
soft_gaps:
${(missing.length ? missing : [f.gaps[0][0]]).map(m => `  - "${m}"`).join('\n')}
top_strengths:
${strengths.map(s => `  - "${s}"`).join('\n')}
advertised_comp: "${comp}"
risk_level: "${score >= 4 ? 'Low' : score >= 3.4 ? 'Medium' : 'High'}"
next_action: "${decision === 'Apply' ? 'Tailor the CV and apply this week' : decision === 'Consider' ? 'Tailor the CV; decide after a recruiter call' : 'Skip unless the requirements change'}"
\`\`\`

## A) Role Summary

| Attribute | Value |
|---|---|
| Domain | ${domain} |
| Function | ${f.archetype} |
| Seniority | ${/Staff|Principal/.test(title) ? 'Staff' : 'Senior'} |
| Remote | ${worldwide ? 'Remote — Worldwide' : /remote/i.test(location) ? 'Remote within India' : 'Hybrid'} |
| Location | ${location} |
| ATS | ${ats} |
| TL;DR | ${f.does[0]} |

### Work-Authorization Check

Posting is open to candidates based in India; no sponsorship needed.

## B) CV Match

| Requirement | Importance | Match | JD signal | Evidence / gap |
|---|---|---|---|---|
${cvRows}

### Gaps and Mitigation

${gaps}

## C) Level and Strategy

The posting targets senior engineers (5+ years). At seven years the candidate sits at the top of the band, which supports a Senior offer and gives room to ask for scope. Lead with measurable outcomes (latency, cost, reliability), then the mentoring record.

## D) Compensation and Demand

- **Advertised Range:** \`${comp}\`
- **Market read:** ${worldwide ? 'USD bands for remote roles from India run lower than US bands; expect the lower half.' : `Senior ${f.archetype.toLowerCase()} roles in this city cluster around INR ${lo + 5}-${hi - 5} LPA total compensation.`}
- **Demand:** ${score >= 4 ? 'High: many open roles with this profile' : 'Moderate: the role is niche for this profile'}.

## E) Personalization Plan

| Section | Current | Proposed | Why |
|---|---|---|---|
${plan.map(p => `| ${p.join(' | ')} |`).join('\n')}

## F) Interview Plan

- **Technical:** ${f.reqs[0][0]}; design a service with a strict latency and correctness budget
- **Behavioural:** a time you changed a plan after an incident; mentoring example
- **Questions to ask:** how the team measures reliability; what the first 90 days look like

## G) Posting Legitimacy

Posted on the company's own ${ats} board eleven days ago; named hiring team; salary band present. No signs of a ghost posting.

## Score Breakdown

| Dimension | Score | Notes |
|---|---|---|
${dims.map(([d, v]) => `| ${d} | ${r1(v).toFixed(1)} | ${d === 'Red flags' ? (score >= 3.5 ? 'None material' : 'A few concerns, see block B') : d === 'Compensation' ? 'In the target band' : 'See block B'} |`).join('\n')}

## Keywords

${f.keywords.map(k => `- ${k}`).join('\n')}
`
}

export { FAMILIES }
