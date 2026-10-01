// Settings > Interview prep values apply: speed + headphones reach the Practice form and the running voice; budget clamps the
// estimate; changing the search provider asks for consent again. Needs QA=<scratch dir> (app.log).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { attach, clickText, goto, JOB, mainWindow, openJobTab, OUT, press, record, shotBoth, sleep, text, waitTarget } from './lib.mjs'

const QA = process.env.QA
const logLines = () => fs.readFileSync(`${QA}/app.log`, 'utf8').split('\n').filter(l => l.includes('[kb-e2e]'))
const sayArgs = () => { try { return execSync(`ps -axo args | grep -E "^say .* -r [0-9]+" | grep -v grep || true`, { encoding: 'utf8' }).trim() } catch { return '' } }
const main = await mainWindow()
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1200)
await goto(main, 'settings', { page: 'interview-prep' }); await sleep(1500)
let t = await text(main)
record('3.1', 'Settings > Interview prep page renders research, search, sources and voice groups', /Interview prep/i.test(t) && /Search provider/.test(t) && /Speakers or headphones/.test(t), t.slice(t.indexOf('Interview prep'), t.indexOf('Interview prep') + 120))
await shotBoth(main, '40-settings-interview-prep')
// UI change: headphones
console.log('headphones', await press(main, 'Headphones')); await sleep(800)
let cfg = await main.evaluate(`window.careerloom.interviewConfig().then(c => JSON.stringify(c.voice))`)
record('3.2', 'Choosing Headphones in Settings is saved to interview.json', /"echo":"headphones"/.test(cfg), cfg)
await main.evaluate(`window.careerloom.interviewSetConfig({ voice: { speed: 1.3 }, research: { budgetUsd: 0.06 } })`)
cfg = await main.evaluate(`window.careerloom.interviewConfig().then(c => JSON.stringify({ speed: c.voice.speed, budget: c.research.budgetUsd }))`)
record('3.3', 'Speed and budget are saved (validated, clamped)', /"speed":1.3/.test(cfg) && /"budget":0.06/.test(cfg), cfg)
const est = await main.evaluate(`window.careerloom.kbEstimate(${JSON.stringify(JOB)}, { depth: 'deep', budgetUsd: 5, minutes: 30, allowAgent: false })`)
record('3.4a', 'A request above the hard ceiling is clamped (estimate high end <= $2)', est.usdHigh <= 2.0001, JSON.stringify(est))
// the budget from Settings drives a real run started from the KB tab: $0.02 stops it early -> partial
await main.evaluate(`window.careerloom.interviewSetConfig({ research: { budgetUsd: 0.1, consentVersion: '2026-10-v1' } })`)
await main.evaluate(`window.careerloom.interviewSetConfig({ research: { budgetUsd: 0.06 } })`)
await openJobTab(main, 'kb'); await sleep(800)
console.log('refresh', await clickText(main, 'Refresh')); await sleep(500)
let sum
for (let i = 0; i < 80; i++) { sum = await main.evaluate(`window.careerloom.kbSummary(${JSON.stringify(JOB)})`); if (['complete', 'partial', 'failed'].includes(sum.status) && !sum.runId) break; await sleep(500) }
const man = await main.evaluate(`window.careerloom.kbSummary(${JSON.stringify(JOB)}).then(s => JSON.stringify({ status: s.status, cost: s.costUsd }))`)
record('3.4', 'Research budget from Settings applies to a run started in the KB tab (cost stays within $0.06)', sum.costUsd <= 0.0605 && sum.costUsd > 0, man)
// Practice form starts from the Settings defaults
await openJobTab(main, 'kb'); await sleep(600)
await clickText(main, 'Practise this job'); await sleep(2000)
t = await text(main)
record('3.5', 'Practice form starts from Settings: speed 1.30x and Headphones selected', /1\.30×/.test(t) && /interrupt the interviewer by speaking/.test(t), (/Speed[^|]*\|[^|]*/.exec(t) ?? [])[0])
await shotBoth(main, '41-practice-from-settings')
const before = logLines().length
console.log('start', await clickText(main, 'Start practice'))
const ov = await attach(await waitTarget(t => t.url.includes('overlay.html'), 20000))
let say = '', badge = false
for (let i = 0; i < 40 && !say; i++) { say ||= sayArgs(); if (/Mic paused while I speak/.test(await text(ov))) badge = true; await sleep(250) }
const m = /-r (\d+)/.exec(say)
record('3.6', 'Speed reaches the voice (say -r 228 = 175 wpm x 1.3)', !!m && Number(m[1]) >= 226 && Number(m[1]) <= 229, say.slice(0, 90))
await sleep(5000)
const mine = logLines().slice(before)
record('3.7', 'Headphones: mic is not paused while the interviewer speaks (no dropped frames, no badge)', !mine.some(l => /dropped/.test(l)) && !badge && mine.some(l => /ttsPlayback started/.test(l)), `${mine.length} log lines, dropped=${mine.filter(l => /dropped/.test(l)).length}, badge=${badge}`)
await ov.shot(`${OUT}/42-overlay-headphones.png`)
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1500)

// provider change asks for consent again
await main.evaluate(`window.careerloom.interviewSetConfig({ research: { search: { backend: 'exa' } } })`)
const consent = await main.evaluate(`window.careerloom.interviewConfig().then(c => c.research.consentVersion)`)
record('3.8', 'Switching the search provider clears consent (asks again)', consent === null, String(consent))
await openJobTab(main, 'kb'); await sleep(1000)
t = await text(main)
record('3.9', 'KB tab asks again ("Review and agree") after the provider switch', /Review and agree/.test(t), '')
await shotBoth(main, '43-kb-reconsent')
// restore defaults used by later runs
await main.evaluate(`window.careerloom.interviewSetConfig({ voice: { speed: 1, echo: 'speakers' }, research: { budgetUsd: 0.3, search: { backend: 'brave' } } })`)
process.exit(0)
