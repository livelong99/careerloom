// Shared prototype shell: theme from ?theme=, sidebar markup identical to the Copilot prototype.
const Q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = Q.get('theme') === 'light' ? 'light' : 'dark';
window.Q = Q;
window.sidebar = (active) => `<aside class="side">
 <div class="logo"><i>◠</i><span>Career<b>loom</b></span></div>
 <a class="ni" href="#"><span data-i="grid"></span>Overview</a>
 <div class="grp">Job search</div>
 <a class="ni ${active==='jobs'?'on':''}" href="kb.html"><span data-i="list"></span>Jobs</a>
 <a class="ni" href="#"><span data-i="tag"></span>Resume</a>
 <a class="ni ${active==='copilot'?'on':''}" href="practice.html"><span data-i="mic"></span>Copilot</a>
 <div class="grp">Agents</div>
 <a class="ni" href="#"><span data-i="spark"></span>Agent</a>
 <a class="ni" href="#"><span data-i="history"></span>Runs</a>
 <a class="ni" href="#"><span data-i="dash"></span>Monitoring</a>
 <a class="ni ${active==='settings'?'on':''}" href="settings.html" style="margin-top:8px"><span data-i="cog"></span>Settings</a>
 <div class="foot"><span><span data-i="help"></span> Help</span><span>v0.2.0</span></div></aside>`;
window.icons = () => document.querySelectorAll('[data-i]').forEach(e => { if (!e.querySelector('svg')) e.insertAdjacentHTML('afterbegin', icon(e.dataset.i, +e.dataset.s || 16)); });
