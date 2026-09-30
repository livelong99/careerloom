// Overlay renderer. One function draws every state so the gallery, the demo and the config preview stay in sync.
// Copy below is original sample text for the prototype.
const SAMPLE = {
  q: { type: 'Behavioural', text: 'Tell me about a time you pushed back on a deadline without losing trust.' },
  tr: [
    { w: 'Interviewer', c: 'them', s: 'So the platform team owns the release pipeline end to end.' },
    { w: 'You', c: 'you', s: 'Right, about forty services by the end of last year.' },
    { w: 'Interviewer', c: 'them', s: 'Tell me about a time you pushed back on a deadline without losing trust.' },
  ],
  say: 'I reset the scope, not the date, and I brought the data to do it.',
  bullets: [
    'Name what you were protecting: on-call load after a rough quarter.',
    'Show the evidence you brought: incident count and rollout risk.',
    'Close on what held: core path shipped on time, trust intact.',
  ],
  star: [['S', 'Q3 release, six weeks out, pipeline migration at risk'], ['T', 'Own the migration plan and the date'], ['A', 'Proposed a phased cutover; shared a risk table with the PM'], ['R', 'Core path shipped on time; no Sev-1s in the first month']],
  proof: [{ quote: 'Cut release lead time from 4 days to 6 hours across 40 services', src: 'cv.md · Northwind Labs, 2023' }],
};
const bars = (n, on, cls = '') => `<span class="meter ${cls}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? (i > n - 3 && cls !== 'sys' ? 'on hot' : 'on') : ''}"></i>`).join('')}</span>`;
const kbd = k => `<span class="kbd">${k}</span>`;
const btn = (ic, label, k, pri) => `<button class="ab ${pri ? 'pri' : ''}">${icon(ic, 14)}${label}${k ? kbd(k) : ''}</button>`;
const chip = (state, o) => {
  if (o.indicator === 'off' && state !== 'idle' && state !== 'stopped') return '';
  if (o.indicator === 'dot' && state !== 'idle' && state !== 'stopped') return `<span class="chipL dotonly ${o.sys ? '' : 'mic'}" role="status" aria-label="Listening"><span class="d"></span><span class="t">${o.time}</span></span>`;
  const src = o.sys ? 'Mic + system' : 'Mic only';
  if (state === 'idle') return `<span class="chipL idle"><span class="d"></span>Not listening</span>`;
  if (state === 'stopped') return `<span class="chipL stopped"><span class="d"></span>Stopped</span>`;
  if (o.practice) return `<span class="chipL practice"><span class="d"></span>Practice<span class="t">${o.time}</span></span>`;
  return `<span class="chipL ${o.sys ? '' : 'mic'}" role="status" aria-label="Listening, ${src}"><span class="d"></span>Listening${o.sys ? '' : ' · mic only'}<span class="t">${o.time}</span></span>`;
};
const head = (state, o, strip) => { const off = ['idle', 'stopped'].includes(state); return `<div class="ov-h">${chip(state, o)}${strip && ['question', 'answering', 'answered'].includes(state) ? '' : bars(10, ['idle', 'stopped'].includes(state) ? 0 : 6)}${strip ? '' : '<span class="sp"></span>'}${strip ? stripMid(state, o) : (off ? '' : `<span class="lat" title="First token · cost this session">${o.lat || '— s'} · ${o.cost || '$0.00'}</span>`)}${strip ? '' : `<button class="ib" aria-label="Collapse to strip" title="Collapse">${icon('expand', 15)}</button>`}${off ? '' : `<button class="ib stop" aria-label="Stop and hide (panic)" title="Stop now ⌃⌥⇧X">${icon('stop', 14)}</button>`}</div>`; };
function stripMid(state, o) {
  if (state === 'idle') return `<div class="stripq"><span class="q mute">Start from Careerloom, or press ${kbd('⌃⌥L')}</span></div>${btn('play', 'Start', '⌃⌥L', true)}`;
  if (state === 'stopped') return `<div class="stripq"><span class="q mute">Capture is off. Transcript saved on this device.</span></div>${btn('x', 'Delete now')}`;
  if (state === 'question' || state === 'answering' || state === 'answered') return `<div class="stripq"><span class="tb">${SAMPLE.q.type}</span><span class="q">${SAMPLE.q.text}</span></div>${state === 'answering' ? `<button class="ab" disabled style="opacity:.7">${icon('spark', 14)}Answering…</button>` : btn('spark', state === 'answered' ? 'Re-answer' : 'Answer', '⌃⌥A', state === 'question')}<button class="ib" aria-label="Expand panel" title="Expand ⌃⌥E">${icon('expand', 15)}</button>`;
  if (state === 'error') return `<div class="stripq"><span class="tb" style="background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)">Offline</span><span class="q">Speech-to-text lost connection. Reconnecting…</span></div>${btn('refresh', 'Retry')}`;
  if (state === 'permission') return `<div class="stripq"><span class="tb">System audio silent</span><span class="q">Hearing you only. Fix the permission to hear the interviewer.</span></div>${btn('cog', 'Fix…')}`;
  return `<div class="stripq"><span class="q mute">Waiting for a question…</span><span class="q mute" style="flex:none;max-width:200px">…owns the release pipeline end to end.</span></div><button class="ib" aria-label="Expand panel" title="Expand ⌃⌥E">${icon('expand', 15)}</button>`;
}
const tr = (lines, partial) => `<div class="tr" aria-live="off">${lines.map((l, i) => `<div class="ln ${l.c} ${partial && i === lines.length - 1 && l.c === 'them' && 0 ? 'partial' : ''}"><span class="w">${l.w}</span><span class="s">${l.s}</span></div>`).join('')}</div>`;
const actions = () => `<div class="acts">${btn('spark', 'Answer', '⌃⌥A', true)}${btn('chat', 'Follow-up', '⌃⌥F')}${btn('help', 'Clarify', '⌃⌥C')}${btn('camera', 'Screenshot', '⌃⌥S')}${btn('list', 'Summarise', '⌃⌥M')}</div>`;
const foot = o => `<div class="ov-f"><span class="m">${icon('mic', 12)}${bars(8, 5)}</span>${o.sys ? `<span class="m">${icon('speaker', 12)}${bars(8, 4, 'sys')}</span>` : `<span class="m" style="color:var(--warn)">${icon('speaker', 12)}off</span>`}<span class="sp"></span><span>${o.engine || 'Whisper · on this Mac'} · ${o.model || 'Fast'}</span></div>`;
function sugFull(o = {}) {
  const s = SAMPLE;
  return `<div class="sug"><div class="lbl">${icon('spark', 12)}Say first</div><p class="say">${s.say}</p><div class="lbl">Then cover</div><ul>${s.bullets.map(b => `<li>${b}</li>`).join('')}</ul><details class="stard"${o.star ? ' open' : ''}><summary>${icon('right', 12)}STAR skeleton<span>Situation · Task · Action · Result</span></summary><div class="star">${s.star.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div></details><div class="lbl">Proof from your résumé</div><div class="proof">${s.proof.map(p => `<div class="pf"><q>${p.quote}</q><small>${icon('file', 11)}${p.src}</small></div>`).join('')}</div><div class="fc">${icon('shield', 13)}Numbers checked against your résumé</div></div>`;
}
function sugStream() {
  const s = SAMPLE;
  return `<div class="sug"><div class="lbl">${icon('spark', 12)}Say first</div><p class="say">${s.say}</p><div class="lbl">Then cover</div><ul><li>${s.bullets[0]}</li><li>Show the evidence you brought: incident c<span class="caret"></span></li><li class="pend">.</li></ul><div class="lbl">STAR skeleton</div><div class="star"><b>S</b><span>…</span><b>T</b><span>…</span></div></div>`;
}
const problem = state => state === 'error'
  ? `<div class="prob bad"><div class="h">${icon('warn', 16)}Speech-to-text disconnected</div><p>Retrying (attempt 2 of 5). Your transcript so far is kept. Your microphone is still being captured, and nothing is lost.</p><div class="bt">${btn('refresh', 'Retry now')}${btn('cog', 'Switch to on-device')}</div></div>`
  : `<div class="prob warn"><div class="h">${icon('warn', 16)}System audio is silent</div><p>The interviewer can't be heard, so questions won't be detected. The microphone still works.</p><ol><li>Open System Settings → Privacy &amp; Security.</li><li>Turn on Careerloom under “System Audio Recording”.</li><li>Quit and reopen Careerloom.</li></ol><div class="bt">${btn('ext', 'Open System Settings', '', true)}${btn('mic', 'Continue with mic only')}</div></div>`;
// state -> panel body
function panelBody(state, o) {
  const s = SAMPLE;
  const qb = t => `<div class="qb ${t}"><span class="tb">${s.q.type}</span><span class="tx">${s.q.text}</span></div>`;
  const wait = `<div class="qb wait"><span class="tx">Waiting for a question… I'll flag one when the interviewer finishes speaking.</span></div>`;
  switch (state) {
    case 'idle': return `<div class="prob"><div class="h">${icon('mic', 16)}Ready when you are</div><p>Nothing is recorded until you start. Start from Careerloom, or press ${kbd('⌃⌥L')}.</p><div class="bt">${btn('play', 'Start', '⌃⌥L', true)}</div></div>`;
    case 'listening': return wait + `<div class="sug" style="padding-bottom:14px"><div class="lbl">${icon('spark', 12)}Suggestions appear here</div><p style="margin:0;color:var(--mut)">Press ${kbd('⌃⌥A')} any time to answer the last thing said.</p></div>` + actions() + tr(s.tr.slice(0, 2));
    case 'question': return qb('') + `<div class="sug" style="padding-bottom:12px"><p style="margin:0;color:var(--mut)">Looks like a question. Answer now, or keep listening for a follow-up.</p></div>` + actions() + tr(s.tr);
    case 'answering': return qb('') + sugStream() + actions() + tr(s.tr.slice(1));
    case 'answered': return qb('') + sugFull(o) + actions() + tr(s.tr.slice(1));
    case 'error': return problem('error') + tr(s.tr);
    case 'permission': return problem('permission') + tr(s.tr.slice(1));
    case 'stopped': return `<div class="prob"><div class="h">${icon('check', 16)}Capture stopped</div><p>Microphone and system audio are off. 14 minutes of transcript are saved on this device.</p><div class="bt">${btn('x', 'Delete transcript now')}${btn('history', 'Open debrief')}</div></div>`;
  }
}
window.renderOverlay = function (el, state = 'listening', o = {}) {
  const opt = { time: '04:12', sys: true, lat: '1.1 s', cost: '$0.02', ...o };
  if (state === 'permission') opt.sys = false;
  if (state === 'listening' || state === 'question') opt.lat = '— s';
  const strip = o.mode === 'strip';
  el.className = 'ov' + (o.passive ? ' passive' : '');
  el.dataset.state = state; el.dataset.mode = strip ? 'strip' : 'panel';
  if (o.fs) el.style.setProperty('--ov-fs', o.fs + 'px'); if (o.w) el.style.setProperty('--ovw', o.w + 'px');
  if (o.op != null) el.style.opacity = o.op;
  el.innerHTML = `<div class="thread"></div>${head(state, opt, strip)}${strip ? '' : panelBody(state, opt)}${strip || ['idle', 'stopped', 'error', 'permission'].includes(state) ? '' : foot(opt)}`;
};
document.querySelectorAll('[data-overlay]').forEach(el => renderOverlay(el, el.dataset.overlay, { mode: el.dataset.mode, indicator: el.dataset.indicator, star: 'star' in el.dataset, practice: 'practice' in el.dataset, passive: 'passive' in el.dataset }));
