// Skill vocabulary, canonicalisation and requirement matching. Pure.
// Hand-curated for this app (the career-ops vocabulary informed the coverage, nothing is copied verbatim).
// Family = "a recruiter would call these neighbours": a taxonomy match earns partial credit, never full.

import type { CvModel } from './model'

// Canonical | aliases ; separated | family
const TABLE = `
JavaScript|js;ecmascript|js-lang
TypeScript|ts|js-lang
Python||py-lang
Java||jvm-lang
Kotlin||jvm-lang
Scala||jvm-lang
Go|golang|systems-lang
Rust||systems-lang
C++|cpp|systems-lang
C||systems-lang
C#|csharp|dotnet
.NET|dotnet;asp.net|dotnet
Ruby||ruby
PHP||php
Swift||apple
SQL|t-sql;pl/sql|sql
Shell|bash;shell scripting;zsh|scripting
React|react.js;reactjs|js-ui
Angular|angularjs|js-ui
Vue|vue.js;vuejs|js-ui
Svelte||js-ui
Next.js|nextjs|js-ui
Redux||js-state
HTML||web
CSS|sass;scss;tailwind;tailwind css|web
Node.js|node;nodejs|js-backend
Express|express.js|js-backend
NestJS|nest.js|js-backend
Spring Boot|spring|jvm-backend
Django||py-backend
Flask||py-backend
FastAPI||py-backend
Rails|ruby on rails|ruby
Laravel||php
GraphQL||api
REST|rest api;rest apis;restful;restful apis|api
gRPC||api
Microservices|microservice;micro-services|architecture
System Design|large-scale system design;distributed systems;system architecture|architecture
Event-Driven Architecture|event driven;event-driven|architecture
PostgreSQL|postgres|rdbms
MySQL|mariadb|rdbms
SQL Server|microsoft sql server;mssql|rdbms
Oracle|oracle db|rdbms
SQLite||rdbms
MongoDB|mongo|nosql
DynamoDB||nosql
Cassandra||nosql
Redis||cache
Memcached||cache
Elasticsearch|elastic search;opensearch|search
PgVector|pgvector;vector database;vector databases;vector db|vector-db
Pinecone||vector-db
Firebase|firestore|baas
Kafka|apache kafka|queue
RabbitMQ||queue
SQS|aws sqs|queue
AWS|amazon web services|cloud
Azure|microsoft azure|cloud
GCP|google cloud|cloud
S3|aws s3|cloud-storage
Lambda|aws lambda|serverless
Cloud Foundry|pcf;pivotal cloud foundry|paas
Docker|containers;containerization|containers
Kubernetes|k8s|containers
Helm||containers
Terraform||iac
Ansible||iac
CloudFormation||iac
CI/CD|ci cd;cicd;ci/cd pipelines;continuous integration;continuous delivery;continuous deployment|ci
Jenkins||ci
GitHub Actions||ci
GitLab CI|gitlab ci/cd||ci
GitLab||vcs
Git|github|vcs
Linux|unix||os
Prometheus||observability
Grafana||observability
Datadog||observability
Splunk||observability
ELK|elk stack;kibana;logstash|observability
OpenTelemetry|otel|observability
Jest||unit-test
JUnit|testng;nunit;xunit;mstest|unit-test
pytest||unit-test
Mockito||unit-test
Selenium|selenium grid|e2e-test
Playwright||e2e-test
Cypress||e2e-test
Postman||api-test
TDD|test-driven development;test driven development|practice
BDD|behavior-driven development;cucumber|practice
Unit Testing|unit tests;automated testing;test automation|practice
Camunda|bpmn|workflow
Airflow|apache airflow|workflow
n8n||workflow
Jira||pm-tool
Agile|scrum;kanban|process
Code Review|code reviews|practice
Mentoring|mentorship;mentor|leadership
Leadership|team lead;tech lead;technical leadership|leadership
Stakeholder Management|cross-functional collaboration;cross-functional teams|leadership
NLP|natural language processing|ml
Machine Learning|ml;deep learning|ml
GenAI|generative ai;gen ai|llm
LLM|llms;large language models;large language model|llm
RAG|retrieval augmented generation;retrieval-augmented generation|llm
Prompt Engineering||llm
LangChain||llm-framework
LlamaIndex||llm-framework
Embeddings|text embeddings|llm
PyTorch||ml-framework
TensorFlow||ml-framework
scikit-learn|sklearn|ml-framework
Pandas||data-science
NumPy||data-science
Spark|pyspark;apache spark|big-data
Hadoop||big-data
Snowflake||warehouse
BigQuery||warehouse
Redshift||warehouse
Databricks||warehouse
dbt||warehouse
Tableau||bi
Power BI|powerbi|bi
Looker||bi
Data Visualization|data visualisation|bi
ETL|data pipelines;data pipeline;data processing|data-eng
Web Development|web applications;web application|web
Automation|automating;process automation|practice
Security|application security;appsec|security
OAuth|oauth2;sso|security
Performance Optimization|performance tuning|practice
Debugging|troubleshooting|practice
Next Steps||none
`.trim()

type Def = { name: string; family: string; aliases: string[] }
const DEFS: Def[] = TABLE.split('\n').map(l => {
  const [name = '', aliases = '', family = ''] = l.split('|')
  return { name, family, aliases: aliases.split(';').filter(Boolean) }
}).filter(d => d.family !== 'none')

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const CASE_SENSITIVE = new Set(['Go', 'C', 'Rust', 'Swift', 'Git', 'Spring Boot', 'Express', 'Oracle', 'Lambda', 'Shell', 'Jira', 'Agile', 'REST', 'Security', 'Automation', 'Leadership', 'Mentoring', 'Debugging']) // everyday words
const BY_NAME = new Map(DEFS.map(d => [d.name.toLowerCase(), d]))
const ALIAS = new Map<string, Def>()
for (const d of DEFS) { ALIAS.set(d.name.toLowerCase(), d); for (const a of d.aliases) ALIAS.set(a.toLowerCase(), d) }

const PATTERNS: Array<{ def: Def; re: RegExp }> = DEFS.map(d => {
  // longest alternatives first so "Spring Boot" beats "Spring"
  const forms = [d.name, ...d.aliases].sort((a, b) => b.length - a.length).map(esc)
  return { def: d, re: new RegExp(`(?<![\\w.+#])(?:${forms.join('|')})(?![\\w+#]|\\.\\w)`, CASE_SENSITIVE.has(d.name) ? '' : 'i') }
})

/** Canonical skill names mentioned in free text. */
export function extractSkills(text: string): Set<string> {
  const out = new Set<string>()
  for (const { def, re } of PATTERNS) if (re.test(text)) out.add(def.name)
  return out
}

/** A requirement's skill string → canonical name, or null when it is not in the vocabulary. */
export function canonicalize(skill: string): string | null {
  return ALIAS.get(skill.trim().toLowerCase())?.name ?? null
}

export const familyOf = (canonical: string): string | null => BY_NAME.get(canonical.toLowerCase())?.family ?? null

// ————— Stem matching (for skills outside the vocabulary: "CI pipelines" vs "pipeline") —————

export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z0-9+#]/g, '')
  if (w.length <= 3) return w
  for (const [suffix, repl] of [['ization', 'ize'], ['isation', 'ise'], ['ies', 'y'], ['ing', ''], ['ed', ''], ['s', ''], ['ly', '']] as const) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) { w = w.slice(0, w.length - suffix.length) + repl; break }
  }
  return w.length > 4 && w.endsWith('e') ? w.slice(0, -1) : w
}
const STOP = new Set(['and', 'or', 'of', 'the', 'a', 'in', 'with', 'for', 'to', 'on', 'using', 'experience'])
export const stems = (text: string): string[] => text.split(/[^A-Za-z0-9+#]+/).filter(w => w && !STOP.has(w.toLowerCase())).map(stem).filter(Boolean)

// ————— The CV side —————

export type CvIndex = {
  /** Canonical skills anywhere in the résumé. */
  all: Set<string>
  /** Canonical skills mentioned inside an experience/project bullet (the strong evidence). */
  inBullets: Set<string>
  /** Stems of every word in the résumé, for non-vocabulary skills. */
  stems: Set<string>
  lower: string
}

export function buildCvIndex(cv: CvModel): CvIndex {
  const bulletText = cv.bullets.filter(b => b.evidence).map(b => b.text).join('\n')
  return { all: extractSkills(cv.markdown), inBullets: extractSkills(bulletText), stems: new Set(stems(cv.markdown)), lower: cv.markdown.toLowerCase() }
}

export type MatchKind = 'exact' | 'stem' | 'synonym' | 'taxonomy' | 'none'
export const MATCH_WEIGHT: Record<MatchKind, number> = { exact: 1, stem: 0.9, synonym: 0.8, taxonomy: 0.6, none: 0 }

export type SkillMatch = { kind: MatchKind; weight: number; via?: string }

/**
 * How well the résumé covers one JD skill. Deterministic ladder: exact (same canonical skill or literal phrase),
 * stem, then taxonomy neighbour. A model-judged synonym is passed in already quote-checked by the caller.
 */
export function matchSkill(skill: string, idx: CvIndex, judgedSynonym?: string): SkillMatch {
  const canon = canonicalize(skill)
  if (canon && idx.all.has(canon)) return { kind: 'exact', weight: 1, via: canon }
  if (!canon && idx.lower.includes(skill.trim().toLowerCase())) return { kind: 'exact', weight: 1, via: skill }
  const want = stems(skill)
  if (!canon && want.length > 0 && want.every(s => idx.stems.has(s))) return { kind: 'stem', weight: MATCH_WEIGHT.stem, via: skill }
  if (judgedSynonym) return { kind: 'synonym', weight: MATCH_WEIGHT.synonym, via: judgedSynonym }
  const fam = canon ? familyOf(canon) : null
  if (fam) for (const have of idx.all) if (have !== canon && familyOf(have) === fam) return { kind: 'taxonomy', weight: MATCH_WEIGHT.taxonomy, via: have }
  return { kind: 'none', weight: 0 }
}
