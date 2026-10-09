// Agent chat threads (userData/threads): finished multi-turn conversations in the format the app stores,
// i.e. the formatted run log of each reply ("▸ Tool hint" steps, prose, "✓ done" footer).

export function seedChats({ write, file, uuid, now, evaluated, run }) {
  const by = (company, re = /./) => evaluated.find(j => j.company === company && re.test(j.title))
  const tide = by('Tidewater Pay', /Ledger/), helios = by('Helios Labs', /Data Platform/), north = by('Northwind', /Payments/)
  const quill = by('Quillstack'), cobalt = by('Cobalt Harbor', /Detection/), paper = by('Paperplane Commerce', /Catalog/), saffron = by('Saffron Analytics', /Metrics/), bright = by('Brightforge', /Device/)
  const mkRun = (label, startedAt, cost) => run({ runner: 'claude', mode: 'chat', label: 'Agent chat', input: label, startedAt, ms: 38_000, usage: { costUsd: cost, inputTokens: 52_000, outputTokens: 1_900, turns: 4, durationMs: 38_000 } })
  const msgs = []
  let t = now - 6 * 3600_000
  const turn = (user, agent, cost) => {
    const r = mkRun(user, t, cost)
    msgs.push({ id: uuid(), role: 'user', text: user, at: t }, { id: uuid(), role: 'agent', text: agent + `\n\n✓ done · $${cost.toFixed(3)}`, at: t + 1000, runId: r.id, status: 'done' })
    t += 11 * 60_000
  }
  turn('Which of my applications need a follow-up this week?',
`▸ Read data/applications.md
▸ Bash node followup-cadence.mjs
Here is where each active application stands, oldest first:

- **${north.company} — ${north.title}** (applied, report ${String(north.n).padStart(3, '0')}, ${north.score}/5): no reply after 7+ days. Send a short nudge.
- **${quill.company} — Senior Platform Engineer** (applied): same, 7+ days with no response.
- **${cobalt.company} — ${cobalt.title}** (applied): inside the normal window, wait until Monday.
- **${paper.company} — ${paper.title}** (applied): inside the normal window.

Interviews in progress: **${helios.company}** (round 2), **${bright.company}** (round 2) and **${saffron.company}** (scheduled). Nothing to chase there.

The **${tide.company}** offer needs a reply within the next week, so that is the one with a real clock on it.`, 0.062)
  turn('Draft a short follow-up for Northwind. Three sentences, no fluff.',
`▸ Read ${north.report}
Subject: Following up on the Senior Backend Engineer, Payments Routing role

Hi, I applied last week and wanted to confirm my application reached the team. The routing latency work in the posting lines up closely with what I did on authorisation services at Ironbridge (p95 down 38%), and I would be glad to walk through it. Happy to share more detail if useful.

I kept your hiring manager's name out of it since the posting does not list one; add it if you have it.`, 0.041)
  turn('How does the Tidewater Pay offer compare with waiting for the Helios Labs process?',
`▸ Read ${tide.report}
▸ Read ${helios.report}
Short version: Tidewater is the safer, better-fit choice today; Helios has the higher ceiling but is one round further back.

| | Tidewater Pay (Ledger) | Helios Labs (Data Platform) |
|---|---|---|
| Score | ${tide.score}/5 | ${helios.score}/5 |
| Stage | Verbal offer | Round 2 of 4 |
| Comp | INR 66-75 LPA (offered) | INR 55-72 LPA (advertised) |
| Fit | Directly continues your ledger work | Stretch on stream processing |
| Risk | Offer reply due in 7 days | Timeline unknown |

Two things I would do: ask Tidewater for a three-day extension (a polite, common request), and move the Helios round-3 date up if they can.`, 0.088)
  const mainId = uuid()
  write(file('threads', `${mainId}.json`), JSON.stringify({ id: mainId, title: 'Which of my applications need a follow-up this week?', createdAt: now - 6 * 3600_000, updatedAt: t, runner: 'claude', sessionId: 'demo-session-1', messages: msgs }, null, 2))

  const small = (title, ago, user, agent, cost) => {
    const at = now - ago
    const r = mkRun(user, at, cost)
    const id = uuid()
    write(file('threads', `${id}.json`), JSON.stringify({ id, title, createdAt: at, updatedAt: at + 60_000, runner: 'claude', sessionId: null, messages: [{ id: uuid(), role: 'user', text: user, at }, { id: uuid(), role: 'agent', text: `${agent}\n\n✓ done · $${cost.toFixed(3)}`, at: at + 1000, runId: r.id, status: 'done' }] }, null, 2))
  }
  small('What skills keep showing up as gaps?', 2 * 86_400_000, 'What skills keep showing up as gaps across my evaluations?', `▸ Read data/applications.md\n▸ Bash node analyze-patterns.mjs\nAcross the ${evaluated.length} evaluated roles the same three gaps recur:\n\n1. **Stream processing at scale** (Flink or Spark Streaming), in 7 reports\n2. **Service mesh in production**, in 5 reports\n3. **Formal on-call leadership**, in 4 reports\n\nYour strongest repeat matches are Go, PostgreSQL and Kafka. A short side project with Flink would close the first gap fastest.`, 0.052)
  small('Rejection patterns', 5 * 86_400_000, 'Any patterns in the roles that rejected me?', `▸ Bash node analyze-patterns.mjs\nThree rejections so far (Fernwood Systems, Lumenpath, Meridian Cloud). All three scored 3.3-3.6 and sat outside the core backend titles (storage, data engineering, control plane). The roles that progressed all had "Backend" in the title and a score of 4.1 or higher. Focus on those.`, 0.034)
}
