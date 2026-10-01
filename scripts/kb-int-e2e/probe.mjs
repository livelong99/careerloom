import { attach, waitTarget } from '../copilot-int-e2e/cdp.mjs'
process.env.CDP_PORT ||= '9341'
const main = await attach(await waitTarget(t => t.url.includes('index.html')))
const jobs = JSON.parse(await main.evaluate(`window.careerloom.listJobs().then(j => JSON.stringify(j.filter(x => x.reportNum != null).slice(0, 6).map(x => ({ id: x.id, t: x.title, c: x.company, r: x.reportNum, s: x.status }))))`))
console.log(jobs)
console.log(await main.evaluate(`window.careerloom.interviewConfig().then(c => JSON.stringify(c.research.consentVersion))`))
process.exit(0)
