// Demo data for the README screenshots: every name, company, address and URL below is fictional.
// URLs use the reserved .example TLD, so nothing here can resolve or point at a real posting.

export const CANDIDATE = {
  name: 'Aarav Mehta', email: 'aarav.mehta@example.com', phone: '+91 90000 12345', city: 'Bengaluru', country: 'India',
  linkedin: 'linkedin.com/in/aarav-mehta-demo', github: 'github.com/aarav-mehta-demo', headline: 'Senior Backend & Platform Engineer',
}

export const PROFILE_YML = `candidate:
  full_name: "${CANDIDATE.name}"
  title: "${CANDIDATE.headline}"
  email: "${CANDIDATE.email}"
  phone: "${CANDIDATE.phone}"
  location: "${CANDIDATE.city}, ${CANDIDATE.country}"
  linkedin: "${CANDIDATE.linkedin}"
  github: "${CANDIDATE.github}"

target_roles:
  primary:
    - "Senior Backend Engineer"
    - "Staff Platform Engineer"
  archetypes:
    - name: "Backend Engineer"
      level: "Senior"
      fit: "primary"
    - name: "Platform / SRE Engineer"
      level: "Senior"
      fit: "secondary"
    - name: "Data Engineer"
      level: "Senior"
      fit: "adjacent"

narrative:
  headline: "Backend engineer who ships payment and data platforms"
  exit_story: "7 years building ledger, risk and ingestion services; now looking for platform ownership."
  superpowers:
    - "Money-moving systems that stay correct under load"
    - "Cutting infrastructure cost without cutting reliability"
    - "Mentoring engineers through design reviews"

compensation:
  target_range: "INR 55-75 LPA"
  currency: "INR"
  minimum: "INR 45 LPA"
  location_flexibility: "Bengaluru hybrid or remote within India"

location:
  country: "India"
  city: "Bengaluru"
  timezone: "IST"
  visa_status: "Indian citizen, no sponsorship needed"
  authorized_in: ["India"]
  needs_sponsorship: false

language:
  output: en

spend_tier: standard
`

export const CV_MD = `# Aarav Mehta — Senior Backend & Platform Engineer

aarav.mehta@example.com · +91 90000 12345 · Bengaluru, India · [LinkedIn](https://linkedin.com/in/aarav-mehta-demo) · [GitHub](https://github.com/aarav-mehta-demo)

## Summary

Backend and platform engineer with seven years of experience building payment, ledger and data-ingestion services in Go, Python and Java on AWS, Kubernetes and PostgreSQL.

## Experience

### Senior Software Engineer — Ironbridge Payments (June 2023–Present)

- Rebuilt the settlement ledger in Go and PostgreSQL, reconciling 4 million transactions a day with zero unexplained breaks over twelve months
- Cut p95 payment-authorisation latency by 38% across nine services by adding Redis caching and gRPC connection pooling
- Migrated 24 services from VM deployments to Kubernetes with Terraform and ArgoCD, reducing deploy time from 45 to 7 minutes
- Led a four-engineer squad through a risk-engine rewrite, mentoring two engineers to promotion in 18 months
- Lowered monthly AWS spend by 27% (about 11 lakh rupees) by right-sizing Kafka and RDS clusters

### Software Engineer II — Campfire Commerce (July 2021–May 2023)

- Designed the catalogue API in Python and FastAPI serving 2.5 million requests per day at 99.95% uptime
- Built Kafka-based order-event pipelines that cut inventory sync delay from 15 minutes to 20 seconds
- Introduced contract tests with Pact across eleven services, reducing release defects by 41% in three quarters
- Automated staging environments with Terraform, provisioning in 12 minutes instead of two days

### Software Engineer — Pixelmill Software (August 2019–June 2021)

- Delivered REST and batch integrations in Java and Spring Boot for six enterprise clients
- Tuned PostgreSQL queries and indexes, taking a nightly reporting job from 3 hours to 25 minutes
- Wrote the on-call runbooks and alerting rules adopted by the 14-person engineering team

## Projects

- **Ledgerline** — Open-source double-entry ledger library in Go with PostgreSQL, used by 300 developers
- **Tracewell** — Small OpenTelemetry sampling proxy in Rust that reduced trace storage by 60% in a side deployment

## Education

### B.Tech in Computer Science — Deccan Institute of Technology (July 2015–May 2019)

## Certifications

- AWS Certified Solutions Architect – Associate
- Certified Kubernetes Administrator (CKA)

## Skills

- **Languages:** Go, Python, Java, SQL, Rust
- **Platform:** AWS, Kubernetes, Docker, Terraform, ArgoCD, Kafka, Redis
- **Data:** PostgreSQL, ClickHouse, Airflow, dbt
- **Practices:** Distributed systems, observability, incident response, code review, mentoring
`

// ats = provider id; host = fake careers host
export const COMPANIES = [
  { name: 'Northwind', ats: 'greenhouse', host: 'boards.greenhouse.example', slug: 'northwind', domain: 'logistics software' },
  { name: 'Helios Labs', ats: 'lever', host: 'jobs.lever.example', slug: 'helios-labs', domain: 'energy analytics' },
  { name: 'Quillstack', ats: 'ashby', host: 'jobs.ashby.example', slug: 'quillstack', domain: 'developer tools' },
  { name: 'Fernwood Systems', ats: 'workday', host: 'fernwood.wd5.workday.example', slug: 'fernwood', domain: 'enterprise infrastructure' },
  { name: 'Tidewater Pay', ats: 'greenhouse', host: 'boards.greenhouse.example', slug: 'tidewater-pay', domain: 'payments' },
  { name: 'Lumenpath', ats: 'ashby', host: 'jobs.ashby.example', slug: 'lumenpath', domain: 'education technology' },
  { name: 'Brightforge', ats: 'lever', host: 'jobs.lever.example', slug: 'brightforge', domain: 'industrial IoT' },
  { name: 'Cobalt Harbor', ats: 'greenhouse', host: 'boards.greenhouse.example', slug: 'cobalt-harbor', domain: 'cloud security' },
  { name: 'Meridian Cloud', ats: 'workday', host: 'meridian.wd1.workday.example', slug: 'meridian', domain: 'cloud infrastructure' },
  { name: 'Saffron Analytics', ats: 'lever', host: 'jobs.lever.example', slug: 'saffron-analytics', domain: 'product analytics' },
  { name: 'Kestrel Robotics', ats: 'ashby', host: 'jobs.ashby.example', slug: 'kestrel-robotics', domain: 'warehouse robotics' },
  { name: 'Orchard Health', ats: 'greenhouse', host: 'boards.greenhouse.example', slug: 'orchard-health', domain: 'health technology' },
  { name: 'Paperplane Commerce', ats: 'lever', host: 'jobs.lever.example', slug: 'paperplane', domain: 'e-commerce' },
  { name: 'Zephyr Mobility', ats: 'workable', host: 'apply.workable.example', slug: 'zephyr-mobility', domain: 'fleet telematics' },
]

// [company index, title, location, status ('' = new, 'Q' = queued in pipeline.md), score, family]
// families: be = backend, pl = platform/SRE, da = data, sec = security, oth = other
const B = 'Bengaluru, India', R = 'Remote (India)', H = 'Hyderabad, India', P = 'Pune, India'
export const JOBS = [
  [0, 'Senior Backend Engineer, Payments Routing', B, 'Applied', 4.4, 'be'],
  [0, 'Staff Platform Engineer', B, 'Evaluated', 3.9, 'pl'],
  [0, 'Engineering Manager, Fulfilment', B, '', null, 'oth'],
  [0, 'Site Reliability Engineer', R, 'Q', null, 'pl'],
  [0, 'Account Executive, Enterprise', 'Mumbai, India', '', null, 'oth'],
  [1, 'Senior Backend Engineer, Data Platform', R, 'Interview', 4.6, 'be'],
  [1, 'ML Platform Engineer', R, 'Evaluated', 4.1, 'pl'],
  [1, 'Senior Software Engineer, Ingestion', B, 'Evaluated', 4.3, 'be'],
  [1, 'Product Designer', R, '', null, 'oth'],
  [1, 'Solutions Architect', 'London, United Kingdom', '', null, 'oth'],
  [2, 'Senior Backend Engineer', 'Remote — Worldwide', 'Evaluated', 3.7, 'be'],
  [2, 'Staff Software Engineer, Infrastructure', 'Remote — Worldwide', '', null, 'pl'],
  [2, 'Developer Advocate', 'Remote (EMEA)', '', null, 'oth'],
  [2, 'Senior Platform Engineer', R, 'Applied', 4.2, 'pl'],
  [2, 'Technical Writer', 'Remote — Worldwide', '', null, 'oth'],
  [3, 'Senior Software Engineer, Storage', P, 'Rejected', 3.4, 'be'],
  [3, 'Principal Engineer, Distributed Systems', P, '', null, 'be'],
  [3, 'Technical Program Manager', H, '', null, 'oth'],
  [3, 'Backend Engineer II', P, 'Q', null, 'be'],
  [4, 'Senior Backend Engineer, Ledger', B, 'Offer', 4.8, 'be'],
  [4, 'Backend Engineer, Risk Engine', B, 'Applied', 4.5, 'be'],
  [4, 'Staff Engineer, Payments Infrastructure', B, '', null, 'pl'],
  [4, 'Compliance Analyst', 'Mumbai, India', '', null, 'oth'],
  [4, 'Site Reliability Engineer', B, 'Evaluated', 4.0, 'pl'],
  [5, 'Senior Backend Engineer, Learning Platform', H, 'Evaluated', 3.6, 'be'],
  [5, 'Data Engineer', H, 'Rejected', 3.3, 'da'],
  [5, 'Curriculum Lead', H, '', null, 'oth'],
  [5, 'Senior Software Engineer', H, 'Q', null, 'be'],
  [6, 'Senior Backend Engineer, Device Cloud', P, 'Interview', 4.4, 'be'],
  [6, 'Embedded Software Engineer', P, 'Evaluated', 2.8, 'oth'],
  [6, 'Platform Engineer, Edge', P, 'Evaluated', 3.8, 'pl'],
  [6, 'Sales Manager, APAC', 'Singapore', '', null, 'oth'],
  [6, 'Senior DevOps Engineer', R, '', null, 'pl'],
  [7, 'Senior Security Engineer', R, 'Evaluated', 3.5, 'sec'],
  [7, 'Senior Backend Engineer, Detection', R, 'Applied', 4.1, 'be'],
  [7, 'Cloud Security Architect', R, '', null, 'sec'],
  [7, 'Recruiter, Engineering', R, '', null, 'oth'],
  [7, 'Software Engineer, Agents', R, 'Q', null, 'be'],
  [8, 'Staff Site Reliability Engineer', H, '', null, 'pl'],
  [8, 'Backend Engineer, Control Plane', H, 'Rejected', 3.6, 'be'],
  [8, 'Cloud Support Engineer', H, '', null, 'oth'],
  [8, 'Director of Engineering', 'Seattle, United States', '', null, 'oth'],
  [9, 'Senior Data Engineer', B, 'Evaluated', 3.8, 'da'],
  [9, 'Backend Engineer, Metrics API', B, 'Interview', 4.3, 'be'],
  [9, 'Analytics Engineer', R, 'Evaluated', 3.0, 'da'],
  [9, 'Data Scientist', B, '', null, 'da'],
  [9, 'Senior Software Engineer, Platform', B, 'Q', null, 'pl'],
  [10, 'Senior Backend Engineer, Fleet Services', B, 'Evaluated', 4.0, 'be'],
  [10, 'Senior DevOps Engineer', B, '', null, 'pl'],
  [10, 'Mechanical Design Engineer', B, '', null, 'oth'],
  [10, 'Platform Engineer', B, 'Q', null, 'pl'],
  [11, 'Senior Backend Engineer, Patient Records', 'Gurugram, India', 'Evaluated', 3.5, 'be'],
  [11, 'Backend Engineer', R, '', null, 'be'],
  [11, 'Clinical Product Manager', 'Gurugram, India', '', null, 'oth'],
  [11, 'Site Reliability Engineer', 'Gurugram, India', '', null, 'pl'],
  [12, 'Senior Backend Engineer, Catalog', B, 'Applied', 4.2, 'be'],
  [12, 'Staff Backend Engineer, Checkout', B, '', null, 'be'],
  [12, 'Platform Engineer, Developer Experience', R, 'Evaluated', 4.1, 'pl'],
  [12, 'Growth Marketing Manager', B, '', null, 'oth'],
  [12, 'Backend Engineer, Search', B, 'Q', null, 'be'],
  [13, 'Software Engineer, Telematics', 'Chennai, India', '', null, 'be'],
  [13, 'Operations Analyst', 'Chennai, India', '', null, 'oth'],
  [13, 'Senior Software Engineer', R, '', null, 'be'],
]

// Starter-pack boards that get switched on in the demo, and a few scan runs for Boards > Scans.
export const ENABLED_BOARDS = ['Naukri', 'LinkedIn Jobs', 'Instahyre', 'Wellfound India', 'hirist.tech', 'Cutshort']
