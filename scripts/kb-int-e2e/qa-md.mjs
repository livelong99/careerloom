// QA only: turns docs/plans/job-knowledge-base/qa/int/results.json into the pass/fail table of qa.md (the prose around it is hand-written).
import fs from 'node:fs'
const dir = process.env.EV_DIR || 'docs/plans/job-knowledge-base/qa/int'
const r = JSON.parse(fs.readFileSync(`${dir}/results.json`, 'utf8'))
const ids = Object.keys(r).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
const rows = ids.map(id => `| ${id} | ${r[id].name} | ${r[id].pass ? 'PASS' : '**FAIL**'} | ${r[id].detail.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 140)} |`)
console.log(`| # | Check | Result | Evidence |\n|---|---|---|---|\n${rows.join('\n')}\n\n${ids.filter(i => r[i].pass).length}/${ids.length} pass`)
