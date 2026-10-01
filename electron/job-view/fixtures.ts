// Synthetic report with the same structure as a real career-ops evaluation (no real data).
export const REPORT = `# Evaluation: Acme Corp — Senior Platform Engineer

**Date:** 2026-09-27
**Archetype:** Platform Engineer
**Score:** 3.8/5
**Legitimacy:** High Confidence
**Work Auth:** ⚠️ Unstated
**URL:** https://jobs.example.com/acme/123
**PDF:** not generated
**Batch ID:** abc123

---

## Job Description (archived verbatim)

**About the Role**
Build the internal platform.

**What You'll Do**
- Run Kubernetes clusters
- Improve CI/CD

**What You'll Bring**
- 5+ years of experience
- Terraform

## Machine Summary

\`\`\`yaml
company: "Acme Corp"
role: "Senior Platform Engineer"
score: 3.8
legitimacy_tier: "High Confidence"
archetype: "Platform Engineer"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "No Terraform at scale"
top_strengths:
  - "Kubernetes in production"
  - "CI/CD ownership"
advertised_comp: "$120,000 - $150,000 USD"
\`\`\`

## A) Role Summary

| Attribute | Value |
|---|---|
| **Domain** | Developer platform |
| **Remote** | Hybrid |

### Work-Authorization Check

Not stated in the posting.

## B) CV Match

| Requirement | Importance | Match | JD signal | Evidence / gap |
|---|---|---|---|---|
| Kubernetes | critical (stated) | ✅ Strong | "Run Kubernetes clusters" | Ran prod clusters |
| Terraform | high (stated) | ⚠️ Partial | "Terraform" | Used in a side project |
| Mentoring | medium | ❌ Missing | "mentor" | No evidence |

### Gaps and Mitigation

1. **Terraform at scale (⚠️ Partial — High):**
   - *Risk:* Screened out on IaC.
   - *Mitigation:* Lead with the side project.
2. **Mentoring (❌ Missing — Medium):**
   - *Risk:* Low.
   - *Mitigation:* Mention code review.

## C) Level and Strategy

Senior fits.

## D) Compensation and Demand

- **Advertised Range:** \`$120,000 - $150,000 USD\`

### Global Score

| Dimension | Score | Notes |
|---|---|---|
| CV match | 4.0/5 | strong |
| Compensation | 3.5/5 | fair |
| Global | 3.8/5 | |

## E) Personalization Plan

| # | Section | Current State | Proposed Change | Why |
|---|---|---|---|---|
| 1 | Summary | Generic | Platform focus | Matches the JD |

## F) Interview Plan

### STAR+R Stories

| # | Requirement | Story | S | T | A | R | Reflection |
|---|---|---|---|---|---|---|---|
| 1 | Kubernetes | Cluster migration | s | t | a | r | x |

### Likely Red-Flag Questions & Answers

**Q: Why leave?** A: Growth.

## G) Posting Legitimacy

Looks real.

**Legitimacy Tier:** **High Confidence**

## Risk Summary

| Risk | Level |
|---|---|
| Visa | Medium |

## Extracted Keywords

- Kubernetes
- Terraform
- CI/CD
`

// German headings, no letters, no machine summary, no keywords.
export const REPORT_DE = `# Bewertung: Beispiel GmbH — Entwickler

**Score:** 2,9/5

## Rollenzusammenfassung

| Attribut | Wert |
|---|---|
| Ort | Berlin |

## CV-Abgleich

| Anforderung | Wichtigkeit | Übereinstimmung | Beleg |
|---|---|---|---|
| Java | hoch | ✅ | 5 Jahre |
`
