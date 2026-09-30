// Pure, tolerant parser: career-ops evaluation markdown -> ReportView. Never throws; what it cannot find
// is left empty and named in `warnings`. Heading letters and column names drift (locale modes), so sections
// are recognised by letter OR keyword and table columns by keyword.
import { parse as parseYaml } from 'yaml'

import type { ReportBlock, ReportGap, ReportSection, ReportView, MatchStatus } from './types'

type Table = { headers: string[]; rows: string[][] }
const EMPTY: Omit<ReportView, 'warnings'> = {
  company: null, role: null, score: null, legitimacy: null, date: null, archetype: null, workAuth: null, url: null, batchId: null,
  decision: null, hardStops: [], softGaps: [], topStrengths: [], advertisedComp: null, riskLevel: null, nextAction: null, workAuthCheck: null,
  jd: null, cvMatch: [], gaps: [], scores: [], personalization: [], keywords: [], roleAttributes: [], risks: [], sections: [],
}

const KINDS: Array<[string, RegExp]> = [
  ['jd', /job description|archived|stellenbeschreibung|descripci[oó]n del puesto|description du poste/i],
  ['machine', /machine summary/i],
  ['keywords', /keyword|schl[uü]sselw|palabras clave|mots.cl[eé]s/i],
  ['risk', /risk summary|risiko|riesgo|risque/i],
  ['cvMatch', /cv match|cv.?abgleich|match.*cv|coincidencia|correspondance/i],
  ['roleSummary', /role summary|rollen|resumen del (rol|puesto)|r[eé]sum[eé] du poste/i],
  ['plan', /personali[sz]ation|personalisierung|personalizaci[oó]n/i],
  ['interview', /interview|vorstellungs|entrevista|entretien/i],
  ['comp', /compensation|verg[uü]tung|gehalt|compensaci[oó]n|r[eé]mun[eé]ration/i],
  ['legitimacy', /legitimacy|legitimit|legitimidad|seri[oö]s/i],
  ['level', /level and strategy|level|strategie|nivel|niveau/i],
]
const stripMd = (s: string) => s.replace(/\*\*|__|`/g, '').trim()
const num = (s: string | undefined | null): number | null => {
  const m = s?.match(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*5)?/)
  const n = m ? Number(m[1]!.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : [])
const text = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : null

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
}

/** Split a section body into markdown, `###` headings and pipe tables (kept in order). */
export function toBlocks(body: string): ReportBlock[] {
  const out: ReportBlock[] = []
  let md: string[] = []
  const flush = () => { const t = md.join('\n').trim(); if (t) out.push({ kind: 'md', text: t }); md = [] }
  const lines = body.split('\n')
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (/^\s*```/.test(l)) fence = !fence
    if (!fence) {
      const h = l.match(/^(#{3,6})\s+(.*)$/)
      if (h) { flush(); out.push({ kind: 'heading', level: h[1]!.length, text: stripMd(h[2]!) }); continue }
      if (l.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
        flush()
        const headers = cells(l).map(stripMd)
        const rows: string[][] = []
        i += 2
        while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!))
        i--
        out.push({ kind: 'table', headers, rows })
        continue
      }
    }
    md.push(l)
  }
  flush()
  return out
}

const tablesOf = (s: ReportSection | undefined): Table[] => (s?.blocks ?? []).flatMap(b => (b.kind === 'table' ? [b] : []))
const col = (t: Table, re: RegExp) => t.headers.findIndex(h => re.test(h))
const at = (r: string[], i: number) => (i >= 0 ? stripMd(r[i] ?? '') : '')

function statusOf(s: string): MatchStatus {
  if (/❌|missing|fehl|gap|\bnone\b|\bno\b|falta/i.test(s)) return 'missing'
  if (/⚠|partial|teil|adjacent|weak|parcial/i.test(s)) return 'partial'
  if (/✅|✔|strong|match|exact|\bja\b|\byes\b|stark|fuerte/i.test(s)) return 'match'
  return 'unknown'
}

function splitSections(md: string): { head: string; sections: Array<{ title: string; body: string }> } {
  const lines = md.split('\n')
  const sections: Array<{ title: string; body: string[] }> = []
  const head: string[] = []
  let fence = false
  for (const l of lines) {
    if (/^\s*```/.test(l)) fence = !fence
    const h = !fence ? l.match(/^##\s+(.+?)\s*$/) : null
    if (h) sections.push({ title: stripMd(h[1]!), body: [] })
    else (sections.at(-1)?.body ?? head).push(l)
  }
  return { head: head.join('\n'), sections: sections.map(s => ({ title: s.title, body: s.body.join('\n').trim() })) }
}

function parseGaps(body: string): ReportGap[] {
  const parts = body.split(/^\s*\d+\.\s+/m).slice(1)
  return parts.map(p => {
    const title = stripMd(p.split('\n')[0]!.replace(/:\s*$/, ''))
    const pick = (re: RegExp) => stripMd(p.match(re)?.[1] ?? '').trim()
    return { title, risk: pick(/\*?Risk\*?:\*?\s*([^\n]+)/i) || null, mitigation: pick(/\*?Mitigation\*?:\*?\s*([^\n]+)/i) || null }
  }).filter(g => g.title)
}

export function parseReport(md: string): ReportView {
  const warnings: string[] = []
  try {
    return parseUnsafe(md ?? '', warnings)
  } catch (err) {
    return { ...EMPTY, warnings: [...warnings, `Report could not be fully read: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

function parseUnsafe(md: string, warnings: string[]): ReportView {
  const { head, sections: raw } = splitSections(md)
  const v: ReportView = { ...EMPTY, hardStops: [], softGaps: [], topStrengths: [], cvMatch: [], gaps: [], scores: [], personalization: [], keywords: [], roleAttributes: [], risks: [], sections: [], warnings }

  const title = head.match(/^#\s+(.+)$/m)?.[1]
  if (title) {
    const t = stripMd(title.replace(/^[^:]{2,30}:\s*/, ''))
    const [company, ...role] = t.split(/\s+[—–]\s+|\s+-\s+/)
    v.company = company?.trim() || null
    v.role = role.join(' — ').trim() || null
  }
  for (const m of head.matchAll(/^\*\*([^*:]+):\*\*\s*(.+)$/gm)) {
    const k = m[1]!.trim().toLowerCase()
    const val = stripMd(m[2]!)
    if (k === 'score') v.score = num(val)
    else if (/legitimacy|legitimit/.test(k)) v.legitimacy = val
    else if (k === 'date' || k === 'datum' || k === 'fecha') v.date = val
    else if (/archetype|arch[eé]typ/.test(k)) v.archetype = val
    else if (/work auth/.test(k)) v.workAuth = val
    else if (k === 'url') v.url = val
    else if (/batch/.test(k)) v.batchId = val
  }

  for (const r of raw) {
    const letter = r.title.match(/^([A-H])\)/)?.[1] ?? null
    const kind = KINDS.find(([, re]) => re.test(r.title))?.[0] ?? null
    const key = kind ?? (letter ? ({ A: 'roleSummary', B: 'cvMatch', C: 'level', D: 'comp', E: 'plan', F: 'interview', G: 'legitimacy' } as Record<string, string>)[letter]! : null)
    if (key === 'jd') { v.jd = r.body || null; continue }
    if (key === 'machine') {
      try {
        const y = parseYaml(r.body.match(/```ya?ml\s*\n([\s\S]*?)```/)?.[1] ?? r.body) as Record<string, unknown> | null
        if (y && typeof y === 'object') {
          v.company = text(y.company) ?? v.company
          v.role = text(y.role) ?? v.role
          v.score = typeof y.score === 'number' ? y.score : v.score
          v.legitimacy = text(y.legitimacy_tier) ?? v.legitimacy
          v.archetype = text(y.archetype) ?? v.archetype
          v.decision = text(y.final_decision)
          v.hardStops = list(y.hard_stops); v.softGaps = list(y.soft_gaps); v.topStrengths = list(y.top_strengths)
          v.advertisedComp = text(y.advertised_comp); v.riskLevel = text(y.risk_level); v.nextAction = text(y.next_action)
        }
      } catch { warnings.push('Machine Summary is not valid YAML') }
      continue
    }
    const section: ReportSection = { id: `s${v.sections.length}`, letter, kind: key, title: r.title, blocks: toBlocks(r.body) }
    v.sections.push(section)
    const tables = tablesOf(section)
    if (key === 'keywords') v.keywords = r.body.split('\n').flatMap(l => { const m = l.match(/^\s*[-*]\s+(.+)$/); return m ? [stripMd(m[1]!)] : [] })
    else if (key === 'roleSummary') {
      v.roleAttributes = tables[0]?.rows.map(r0 => ({ label: stripMd(r0[0] ?? ''), value: stripMd(r0[1] ?? '') })).filter(a => a.label && a.value) ?? []
      const wa = section.blocks.findIndex(b => b.kind === 'heading' && /work.?auth|arbeits|autorizaci/i.test(b.text))
      const nb = wa >= 0 ? section.blocks[wa + 1] : undefined
      v.workAuthCheck = nb?.kind === 'md' ? nb.text : null
    } else if (key === 'risk') v.risks = tables[0]?.rows.map(r0 => ({ label: stripMd(r0[0] ?? ''), value: stripMd(r0[1] ?? '') })).filter(a => a.label) ?? []
    else if (key === 'cvMatch') {
      const t = tables.find(x => col(x, /requirement|anforderung|requisito|exigence/i) >= 0) ?? tables[0]
      if (t) {
        const [ri, ii, mi, si, ei] = [/requirement|anforderung|requisito|exigence/i, /importance|wichtig|importan/i, /match|[uü]bereinstimm|coincid|correspond/i, /signal/i, /evidence|beleg|evidencia|preuve|gap/i].map(re => col(t, re))
        v.cvMatch = t.rows.map(row => ({ requirement: at(row, ri >= 0 ? ri : 0), importance: at(row, ii) || null, status: statusOf(at(row, mi)), match: at(row, mi), jdSignal: at(row, si) || null, evidence: at(row, ei) || null })).filter(r => r.requirement)
      }
      v.gaps = parseGaps(r.body)
    } else if (key === 'plan') {
      const t = tables[0]
      if (t) {
        const [si, ci, pi, wi] = [/section|abschnitt|secci/i, /current|aktuell|actual/i, /proposed|vorgeschlagen|propuest/i, /why|warum|por qu/i].map(re => col(t, re))
        v.personalization = t.rows.map(row => ({ section: at(row, si >= 0 ? si : 1), current: at(row, ci >= 0 ? ci : 2), proposed: at(row, pi >= 0 ? pi : 3), why: at(row, wi >= 0 ? wi : 4) })).filter(r => r.proposed)
      }
    }
    for (const t of tables) {
      if (col(t, /dimension|dimensi[oó]n|kriterium/i) === 0 && col(t, /score|punkt|puntuaci/i) > 0 && !v.scores.length) {
        const si = col(t, /score|punkt|puntuaci/i), ni = col(t, /note|comment|kommentar|nota/i)
        v.scores = t.rows.flatMap(row => { const value = num(at(row, si)); return value === null ? [] : [{ dimension: at(row, 0), value, note: at(row, ni) || null }] })
      }
    }
  }
  if (!raw.length) warnings.push('No sections found: this does not look like an evaluation report')
  else {
    if (!v.cvMatch.length) warnings.push('No CV-match table found')
    if (!v.decision && !v.topStrengths.length) warnings.push('No Machine Summary found')
    if (!v.jd) warnings.push('No archived job description found')
  }
  return v
}
