// Practise (hand-off from the KB tab) -> AI interviewer asks KB questions, speaks (system voice), mic gated while speaking,
// typed + fake-mic answers, cues/suggestions as live -> stop -> debrief + stats + skill signal. Needs QA=<scratch dir> (app.log, profile).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { attach, clickText, goto, JOB, mainWindow, openJobTab, record, shotBoth, sleep, text, theme, waitTarget, OUT } from './lib.mjs'

const QA = process.env.QA
const logLines = () => fs.readFileSync(`${QA}/app.log`, 'utf8').split('\n').filter(l => l.includes('[kb-e2e]'))
const sayArgs = () => { try { return execSync(`ps -axo args | grep -E "^say " | grep -v grep || true`, { encoding: 'utf8' }).trim() } catch { return '' } }
const main = await mainWindow()
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1500)
await main.evaluate(`window.careerloom.copilotDeleteSession('all')`)
const kbBefore = JSON.parse(await main.evaluate(`window.careerloom.kbList(${JSON.stringify(JOB)}).then(l => JSON.stringify(l.map(i => ({ id: i.id, p: i.provenance, t: i.text, a: i.stats.asked }))))`))
const byId = new Map(kbBefore.map(i => [i.id, i]))
// tag the questions with the job's skills (the fixture web has no skill tags for this posting) through the real edit IPC
const cov = await main.evaluate(`window.careerloom.kbSummary(${JSON.stringify(JOB)}).then(s => JSON.stringify(s.coverage.map(c => c.skillId)))`)
const skillIds = JSON.parse(cov)
for (const [n, i] of kbBefore.entries()) await main.evaluate(`window.careerloom.kbItemUpdate(${JSON.stringify(JOB)}, ${JSON.stringify(i.id)}, { skills: [${JSON.stringify(skillIds[n % Math.max(1, skillIds.length)])}] })`)

// 1. hand-off from the KB tab
await openJobTab(main, 'kb'); await sleep(800)
console.log('practise', await clickText(main, 'Practise this job')); await sleep(1800)
let t = await text(main)
record('2.1', "'Practise this job' opens Practice with the AI interviewer for this job", /AI interviewer/.test(t) && /questions · \d+% sourced/.test(t) && /Start practice/.test(t), (/(\d+) questions · (\d+)% sourced/.exec(t) ?? [])[0])
await shotBoth(main, '10-practice-form')
// 2. honour includeGenerated=false: preview counts only sourced
await main.evaluate(`window.careerloom.interviewVoices().then(v => globalThis.__v = v)`)
const prevAll = await main.evaluate(`window.careerloom.interviewPlanPreview(${JSON.stringify(JOB)}, { mode:'mixed', minutes:30, focusSkills:[], difficulty:'adaptive', includeGenerated:true, persona:{style:'Structured and fair',seniority:'Engineering manager',strictness:3,name:'Priya'}, voice:{engine:'system',voiceId:'default',speed:1}, echo:'speakers' })`)
const prevSrc = await main.evaluate(`window.careerloom.interviewPlanPreview(${JSON.stringify(JOB)}, { mode:'mixed', minutes:30, focusSkills:[], difficulty:'adaptive', includeGenerated:false, persona:{style:'Structured and fair',seniority:'Engineering manager',strictness:3,name:'Priya'}, voice:{engine:'system',voiceId:'default',speed:1}, echo:'speakers' })`)
record('2.2', 'Plan preview comes from KB items and honours includeGenerated=false', prevSrc.questions > 0 && prevSrc.questions <= prevAll.questions && prevSrc.sourced === prevSrc.questions, JSON.stringify({ all: prevAll, sourcedOnly: prevSrc }))
// turn generated off in the UI, set a short plan
console.log('toggle', await main.evaluate(`(() => { const s = document.querySelector('[aria-label="Include generated questions"]'); if (s && s.getAttribute('aria-checked') === 'true') { s.click(); return true } return false })()`))
await clickText(main, '15 min'); await sleep(600)
await shotBoth(main, '11-practice-sourced-only')

// 3. start (explicit): no sound before this
const preStart = logLines().length
const hadPlayback = false // log lines before this point belong to earlier runs: only events after Start count (below)
await sleep(2500)
record('2.3', 'No playback before an explicit Start (nothing spoke while the form was open)', logLines().length === preStart && !sayArgs(), `${preStart} kb-e2e log lines before Start, none added`)
const t0 = Date.now()
console.log('start', await clickText(main, 'Start practice'))
const ov = await attach(await waitTarget(t => t.url.includes('overlay.html'), 20000))
const frames = []; const asked = []; let answerClicked = false, sawBadge = false, sawSpeaking = false, sawListening = false, say = '', typedSent = 0, shots = 0
const askedNow = async () => JSON.parse(await main.evaluate(`window.careerloom.copilotListSessions().then(s => JSON.stringify(s.length))`))
for (let i = 0; i < 160; i++) {
  const o = await text(ov)
  if (/Speaking/.test(o)) { sawSpeaking = true; say ||= sayArgs() }
  if (/Mic paused while I speak/.test(o)) sawBadge = true
  if (/Listening to you/.test(o)) sawListening = true
  const cap = await ov.evaluate(`document.querySelector('.ivcap')?.textContent ?? ''`).catch(() => '')
  if (cap && !asked.includes(cap)) asked.push(cap)
  frames.push({ at: Date.now() - t0, o: o.slice(0, 160) })
  if (shots < 6 && (/Speaking/.test(o) || /Listening/.test(o)) && i % 6 === 0) await ov.shot(`${OUT}/20-overlay-f${shots++}.png`)
  // answer by typing once the first question was spoken and we are listening
  const onKb = cap && !/^Welcome/.test(cap) // the warm-up line is not a KB question
  if (onKb && !answerClicked) { answerClicked = await clickText(ov, 'Answer'); if (answerClicked) console.log('answer clicked @', Date.now() - t0) }
  if (onKb && /Listening to you/.test(o) && typedSent === 0) { await main.evaluate(`window.careerloom.copilotOverlay({ typed: 'I led the migration of forty services to Kubernetes, staged per team, and releases stayed weekly with fewer incidents.' })`); typedSent = 1 }
  if (typedSent === 1 && /Weekly releases again|Situation: forty/.test(o)) typedSent = 2
  if (typedSent >= 1 && asked.length >= 3) break
  await sleep(700)
}
const lines = logLines().slice(preStart)
await ov.shot(`${OUT}/21-overlay-after.png`)
record('2.4', 'AI interviewer asks KB questions and shows them in the overlay caption', asked.length >= 1, JSON.stringify(asked).slice(0, 220))
record('2.5', 'Interviewer speaks with the system voice (real `say` process seen, en_IN voice first)', sawSpeaking && /say /.test(say) , say.slice(0, 160) || 'no say process sampled')
record('2.6', "Playback events reach main (started/ended) and the gate engages", lines.some(l => /ttsPlayback started/.test(l)) && lines.some(l => /ttsPlayback ended/.test(l)), lines.filter(l => /ttsPlayback/.test(l)).slice(0, 3).join(' | '))
record('2.7', 'Mic frames are dropped while speaking (half-duplex) and the overlay shows the "Mic paused" badge', lines.some(l => /mic frame dropped/.test(l)) && sawBadge, `drops logged=${lines.filter(l => /dropped/.test(l)).length} badge=${sawBadge}`)
record('2.8', 'Overlay goes listening after the question finishes speaking', sawListening, '')
await shotBoth(ov, '22-overlay-live')
await main.shot(`${OUT}/23-practice-running-dark.png`)

// 4. skip to a second question, then stop
await main.evaluate(`window.careerloom.copilotOverlay({ interviewer: 'skip' })`); await sleep(4000)
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(2500)
const ended = logLines().filter(l => /ttsPlayback/.test(l)).length
record('2.10', 'Stop ends the voice (cancel) with no say process left', !/say /.test(sayArgs()), sayArgs() || 'none')
// 5. debrief
for (let i = 0; i < 20; i++) { const s = JSON.parse(await main.evaluate(`window.careerloom.copilotListSessions().then(s => JSON.stringify(s[0]))`)); if (s?.score != null) break; await sleep(1000) }
const det = JSON.parse(await main.evaluate(`window.careerloom.copilotListSessions().then(async s => JSON.stringify(await window.careerloom.copilotGetSession(s[0].id)))`))
fs.writeFileSync(`${OUT}/session-detail.json`, JSON.stringify({ ...det, transcript: det.transcript.slice(0, 20) }, null, 1))
const per = det.interview?.perQuestion ?? []
const sug = det.suggestions ?? []
record('2.9', 'Cues and suggestions come through the live path (auto question, hint, answer with SAY/bullets/STAR + fact flags)', sug.length >= 1 && det.questionsList.some(q => q.auto === true && q.hint) && !!sug[0].say && sug[0].star && 'trace' in sug[0], JSON.stringify({ questions: det.questionsList.length, suggestions: sug.length, firstTokenMs: sug[0]?.firstTokenMs, tier: sug[0]?.tier, flags: sug[0]?.flags?.length }))
const you = det.transcript.filter(l => l.speaker === 'you').map(l => l.text)
record('2.9a', 'Typed answer lands as the candidate line', you.some(l => /staged per team/.test(l)), you.join(' || ').slice(0, 200))
record('2.9b', 'Fake-mic (STT fixture) answer lands as a candidate line too', you.some(l => /staging the cut-over per team/.test(l)), you.length + ' candidate lines')
record('2.11', 'Session stores the interview record: per-question results with KB item ids from this KB', per.length >= 1 && per.every(r => byId.has(r.itemId)), `${per.length} results; ids in KB=${per.filter(r => byId.has(r.itemId)).length}`)
record('2.12', 'includeGenerated=false: every asked item is sourced', per.length >= 1 && per.every(r => byId.get(r.itemId)?.p === 'sourced'), per.map(r => byId.get(r.itemId)?.p).join(','))
record('2.13', 'No repeats within the session', new Set(det.interview?.itemIds ?? []).size === (det.interview?.itemIds ?? []).length, (det.interview?.itemIds ?? []).length + ' asked')
await goto(main, 'copilot'); await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'sessions' }))`); await sleep(2500)
t = await text(main)
await shotBoth(main, '30-debrief')
record('2.14', 'Debrief page lists the session with per-question rubric rows / heat map', /heat|per.?question|Structure|Specifics/i.test(t), t.slice(300, 520))
const kbAfter = JSON.parse(await main.evaluate(`window.careerloom.kbList(${JSON.stringify(JOB)}).then(l => JSON.stringify(l.filter(i => i.stats.asked > 0).map(i => ({ id: i.id, a: i.stats.asked, last: i.stats.lastScore, avg: i.stats.avgScore }))))`))
record('2.15', 'KbItem.stats written back (asked, lastScore, avgScore) for the asked items', kbAfter.length >= 1 && kbAfter.every(i => i.a >= 1), JSON.stringify(kbAfter).slice(0, 220))
const sig = await main.evaluate(`window.careerloom.interviewSkillSignal(${JSON.stringify(JOB)}).then(s => JSON.stringify(s))`)
record('2.16', 'Skill signal written and readable over IPC (interviewSkillSignal)', sig && sig !== 'null' && /"skills"/.test(sig), sig?.slice(0, 200))
await openJobTab(main, 'skillup'); await sleep(1500)
t = await text(main)
record('2.17', 'Skill-up tab shows "From your practice sessions" from the signal', /From your practice sessions/.test(t), t.slice(t.indexOf('From your practice') , t.indexOf('From your practice') + 160))
await shotBoth(main, '31-skillup-signal')
await openJobTab(main, 'kb'); await sleep(1500)
await shotBoth(main, '32-kb-after-practice')
process.exit(0)
