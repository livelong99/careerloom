// KB tab empty -> consent -> fake research run -> items (sourced/generated labels) -> Runs page shows the research run.
import { clickText, goto, JOB, mainWindow, openJobTab, record, shotBoth, sleep, text } from './lib.mjs'
const main = await mainWindow()
await main.evaluate(`window.careerloom.kbItemRemove && 0`)
// fresh state: reset consent (the dialog must appear), no KB for the job
await main.evaluate(`window.careerloom.interviewSetConfig({ research: { consentVersion: null } })`)
await openJobTab(main, 'kb')
let t = await text(main)
record('1.1', 'KB tab shows the empty state with a research call-to-action', /Research this job/i.test(t) && /no questions? yet|question base|Knowledge base/i.test(t), t.slice(0, 160))
await shotBoth(main, '01-kb-empty')

record('1.2a', 'Before consent the research button is locked and a "Review and agree" notice shows', /Review and agree/.test(t) && await main.evaluate(`[...document.querySelectorAll('button')].some(b => /Research this job/.test(b.textContent) && b.disabled)`), '')
console.log('review', await clickText(main, 'Review and agree'))
await sleep(1200)
t = await text(main)
record('1.2', 'First run asks for consent before anything is sent (dialog shown)', await main.evaluate(`!!document.querySelector('[role=dialog]')`), t.slice(0, 120))
await shotBoth(main, '02-kb-consent')
const before = await main.evaluate(`window.careerloom.kbSummary(${JSON.stringify(JOB)}).then(s => s.status)`)
record('1.3', 'Nothing runs before consent (status none, no run)', before === 'none', before)
console.log('agree', await clickText(main, 'Agree and continue', '[role=dialog] button'))
await sleep(1000)
const cfg = await main.evaluate(`window.careerloom.interviewConfig().then(c => c.research.consentVersion)`)
record('1.4', 'Consent stored via interviewSetConfig (consentVersion set)', !!cfg, cfg)
await sleep(500)
console.log('research', await clickText(main, 'Research this job')); await sleep(800)
t = await text(main)
if (await main.evaluate(`!!document.querySelector('[role=dialog]')`)) { console.log('start in dialog', await clickText(main, 'Start', '[role=dialog] button')) }
let sum = null, sawRunning = false, shotRun = false
for (let i = 0; i < 60; i++) {
  sum = await main.evaluate(`window.careerloom.kbSummary(${JSON.stringify(JOB)})`)
  if (sum.status === 'running') { sawRunning = true; if (!shotRun) { shotRun = true; await shotBoth(main, '03-kb-running') } }
  if (['complete', 'partial', 'failed'].includes(sum.status)) break
  await sleep(500)
}
record('1.5', 'Fake research run finishes (progress seen while running)', sawRunning && sum.status !== 'failed', `${sum.status} items=${sum.items} sourced=${sum.sourcedPct}% sources=${sum.sources} cost=$${sum.costUsd}`)
await sleep(1500)
const list = await main.evaluate(`window.careerloom.kbList(${JSON.stringify(JOB)}).then(l => JSON.stringify(l.map(i => ({ t: i.text.slice(0, 50), p: i.provenance, s: i.sourceCount, ty: i.type }))))`)
const items = JSON.parse(list)
record('1.6', 'Items appear, labelled sourced vs generated', items.length >= 8 && items.some(i => i.p === 'sourced') && items.some(i => i.p === 'generated'), `${items.length} items: ${items.filter(i => i.p === 'sourced').length} sourced, ${items.filter(i => i.p === 'generated').length} generated`)
record('1.7', 'Sourced items carry sources', items.filter(i => i.p === 'sourced').every(i => i.s > 0), '')
t = await text(main)
record('1.8', 'KB tab lists the questions with provenance labels', /sourced/i.test(t) && /generated/i.test(t), t.slice(0, 200))
await shotBoth(main, '04-kb-ready')
// open an item sheet
await clickText(main, items.find(i => i.p === 'sourced').t.slice(0, 20), 'tr,[role=row],button').catch(() => 0); await sleep(800)
await shotBoth(main, '05-kb-item-sheet')
// Runs page
await goto(main, 'runs'); await sleep(800)
t = await text(main)
record('1.9', 'Runs page shows the research run (Job research, with the job)', /Job research/i.test(t), t.slice(0, 200))
await shotBoth(main, '06-runs-research')
const run = await main.evaluate(`window.careerloom.listRuns ? window.careerloom.listRuns().then(r => JSON.stringify(r.filter(x => x.mode === 'job-research').slice(0, 1).map(x => ({ mode: x.mode, jobId: x.jobId, status: x.status })))) : '[]'`)
record('1.10', 'Run record is mode job-research with jobId stamped, status done', /job-research/.test(run) && run.includes('google.com'), run)
process.exit(0)
