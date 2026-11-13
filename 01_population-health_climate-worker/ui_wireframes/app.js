/* Prototype panel, screen map and scenario walkthrough */

const SCENARIO = [
  { t: '07:55', l: 'Site · system map', s: 'w8' },
  { t: '08:00', l: 'Heat reading hits the site rule · Maya’s phone', s: 'm1', role: 'safety' },
  { t: '08:00', l: 'Maya reviews heat controls', s: 'w2', role: 'safety' },
  { t: '08:01', l: 'Maya records the stop-work instruction', s: 'm2', role: 'safety' },
  { t: '08:01', l: 'Workers’ phones get the fixed alert', s: 'p3' },
  { t: '08:01', l: 'Worker home after acknowledging', s: 'p2' },
  { t: '08:02', l: 'Huda acknowledges and confirms the stop', s: 'm2', role: 'foreman' },
  { t: '08:03', l: 'If Huda never acknowledged: escalation', s: 'w3', v: 'overdue', role: 'foreman' },
  { t: '08:04', l: 'Crew taps in at Shelter A', s: 'k1' },
  { t: '08:04', l: 'Huda confirms the headcount', s: 'm3', role: 'foreman' },
  { t: '08:04', l: 'Protective response complete', s: 'w3', role: 'foreman' },
  { t: '08:10', l: 'Workshop eligibility', s: 'w4', role: 'foreman' },
  { t: '08:10', l: 'Readiness, face to face', s: 'm4', role: 'foreman' },
  { t: '08:11', l: 'Proposal review and assignment', s: 'm5', role: 'foreman' },
  { t: '08:11', l: 'Work/rest plan, sent to phones', s: 'w5', role: 'foreman' },
  { t: '08:11', l: 'Rana’s own plan', s: 'p5' },
  { t: '08:18', l: 'Bilal reports feeling unwell', s: 'p4' },
  { t: '08:18', l: 'Huda’s action card', s: 'm6', role: 'foreman' },
  { t: '08:18', l: 'Squad Monitoring shows the action', s: 'w1', role: 'foreman' },
  { t: '08:18', l: 'Confirm before replanning', s: 'w3', v: 'incident', role: 'foreman' },
  { t: '08:18', l: 'Replan without Bilal', s: 'w5', v: 'replan', role: 'foreman' },
  { t: 'Any', l: 'Ask the Planning Agent', s: 'w7' },
  { t: 'Any', l: 'Ask on the phone', s: 'm8' },
  { t: 'Any', l: 'Purpose-limitation refusal', s: 'w7', v: 'refusal' },
  { t: '12:40', l: 'Restart at 13:00? Blocked', s: 'w6', v: 'blocked', role: 'super' },
  { t: '15:06', l: 'Maya captures a fresh reading', s: 'm7', role: 'safety' },
  { t: '15:08', l: 'Rashid records the restart', s: 'w6', role: 'super' },
  { t: 'Recap', l: 'Shift summary', s: 'w1', v: 'summary', role: 'foreman' },
];
function stepIndex() {
  if (App.step !== undefined) { const st = SCENARIO[App.step]; if (st && st.s === App.route && (st.v || 'default') === App.variant) return App.step; }
  const i = SCENARIO.findIndex(st => st.s === App.route && (st.v || 'default') === App.variant);
  return i;
}
function goStep(i) {
  i = Math.max(0, Math.min(SCENARIO.length - 1, i));
  const st = SCENARIO[i];
  App.step = i;
  if (st.role) App.role = st.role;
  go(st.s, st.v);
}

function renderPanel(s) {
  const panel = $('#panel');
  const si = stepIndex();
  const groups = Object.entries(DEVICES).map(([d, info]) => `<div class="grp">${info.name}</div>` +
    ORDER.filter(id => SCREENS[id].device === d).map(id => `<button class="scr-link ${s && (s.id === id) ? 'on' : ''}" data-go="${id}"><b>${id.toUpperCase()}</b>${SCREENS[id].name}</button>`).join('')).join('');
  const vars = s ? variantsOf(s) : {};
  const st = si >= 0 ? SCENARIO[si] : null;
  const roleChips = Object.entries(ROLES).map(([k, r]) => `<button class="chip ${App.role === k ? 'on' : ''}" data-role="${k}">${r.label}</button>`).join('');
  panel.innerHTML = `
    <header><h1>Heat-Safe Crew · wireframes</h1><div class="sub">Navigable prototype of heat-safe-screen-spec.md · Sandline–Dune, Abu Dhabi, 4 Aug 2025 (fictional)</div></header>
    <section><h2>Scenario walkthrough</h2>
      <div class="stepper"><button data-act="prevstep" aria-label="Previous step" ${si <= 0 && si !== -1 ? 'disabled' : ''}>←</button>
      <div class="now">${st ? `<b>${st.t} · ${si + 1}/${SCENARIO.length}</b>${st.l}` : `<b>Not on the walkthrough</b>Press → to start`}</div>
      <button data-act="nextstep" aria-label="Next step">→</button></div></section>
    ${s ? `<section><h2>${s.id.toUpperCase()} · ${s.name}</h2>
      <dl class="notes"><dt>Persona</dt><dd>${s.persona || '—'}</dd><dt>Device context</dt><dd>${s.context || '—'}</dd><dt>Job to be done</dt><dd>${s.job || '—'}</dd></dl>
      ${Object.keys(vars).length > 1 ? `<h2 style="margin-top:16px">States</h2><div class="variants">${Object.entries(vars).map(([k, l]) => `<button class="chip ${App.variant === k ? 'on' : ''}" data-variant="${k}">${l}</button>`).join('')}</div>` : ''}
    </section>` : ''}
    ${s && (s.device === 'worker' || s.device === 'kiosk') ? `<section><h2>Worker language</h2><div class="variants">${LANGS.map(([c, n, e, d, st]) => `<button class="chip ${curLang() === c ? 'on' : ''}" data-act="plang" data-id="${c}" title="${e}${st !== 'ready' ? ' · not translated yet' : ''}"${st !== 'ready' ? ' style="border-style:dashed"' : ''}><span lang="${c}" dir="${d}">${n}</span></button>`).join('')}</div><div class="hint">Sets lang and dir on the worker frame. Dashed = not translated yet (falls back to English).</div></section>` : ''}
    <section><h2>Language and layout tests</h2><div class="variants">
      <button class="chip ${App.mirror ? 'on' : ''}" data-act="tmirror" aria-pressed="${App.mirror}">RTL mirror (web / site)</button>
      <button class="chip ${App.pseudo ? 'on' : ''}" data-act="tpseudo" aria-pressed="${App.pseudo}">Pseudo-locale +40%</button>
      <button class="chip ${App.qa ? 'on' : ''}" data-act="tqa" aria-pressed="${App.qa}">Highlight untranslated</button>
      <button class="chip ${App.timeLtr ? 'on' : ''}" data-act="ttime" aria-pressed="${!!App.timeLtr}">Time axis: keep left → right</button></div>
      <div class="hint">Mirror flips supervisor screens right to left as an Arabic UI would; by default time charts flip with it. “Keep left → right” holds the Gantt, scrubber, hourly strip and hourly table left to right inside the mirrored page, for comparing both with users. Pseudo-locale pads text by 40% to find clipping.</div></section>
    <section><h2>Signed in as</h2><div class="variants">${roleChips}</div><div class="hint">Changes which actions appear (e.g. only Rashid can record a restart; Maya issues, Huda acknowledges; only Noura can publish branding).</div></section>
    <section><h2>Light</h2><div class="variants">${[['auto', 'Auto'], ['day', 'Day'], ['glare', 'Glare'], ['night', 'Night shift']].map(([k, l]) => `<button class="chip ${App.theme === k ? 'on' : ''}" data-act="ptheme" data-id="${k}" aria-pressed="${App.theme === k}">${l}</button>`).join('')}</div>
      <div class="hint">Auto follows the design system: site and worker phones open in glare (outdoor sun), supervisor web and the shelter kiosk in day.</div></section>
    <section><h2>Company brand · published</h2><div class="variants">${Object.entries(HSBrand.PRESETS).map(([k, p]) => `<button class="chip ${JSON.stringify(App.brand) === JSON.stringify(HSBrand.normalise(p.cfg)) ? 'on' : ''}" data-act="pbrand" data-id="${k}">${p.label}</button>`).join('')}</div>
      <div class="hint">${HSBrand.isBranded(App.brandRes) ? `${esc(App.brand.org || App.brand.wordmark)} · platform bar ${App.brandRes.surfaces.platform.source || 'paper'}, mobile ${App.brand.mobile.header} header. ` : 'Heat-Safe paper and ink. '}Publishes straight away for a quick look; <button class="linkbtn" data-go="w9">W9 Organisation branding</button> is where an admin edits, previews and checks a palette.</div></section>
    <section><button class="scr-link ${s ? '' : 'on'}" data-go="map"><b>◫</b>Screen map</button>${groups}</section>
    <section><h2>Reset</h2><button class="chip" data-act="reset">Reset prototype state</button><div class="hint">Web: press ? for keyboard shortcuts. Every frame scales to fit; resize the window for a larger view.</div></section>`;
}
ACT.prevstep = () => { const i = stepIndex(); goStep(i < 0 ? 0 : i - 1); };
ACT.nextstep = () => { const i = stepIndex(); goStep(i < 0 ? 0 : i + 1); };
ACT.reset = () => { App.f = {}; App.sel = {}; App.role = 'foreman'; App.mirror = App.pseudo = App.qa = false; App.theme = 'auto'; App.brandDraft = null; refresh(); };
ACT.ptheme = el => { App.theme = el.dataset.id; refresh(); };
ACT.pbrand = el => { const p = HSBrand.PRESETS[el.dataset.id]; publishBrand(p.cfg); App.brandDraft = null; refresh(); toast(`Published: ${p.label}`); };
ACT.plang = el => { App.f.lang = el.dataset.id; refresh(); };
ACT.tmirror = () => { App.mirror = !App.mirror; refresh(); };
ACT.tpseudo = () => { App.pseudo = !App.pseudo; refresh(); };
ACT.tqa = () => { App.qa = !App.qa; refresh(); };
ACT.ttime = () => { App.timeLtr = !App.timeLtr; refresh(); };

function mapHtml() {
  const dev = Object.entries(DEVICES).map(([d, info]) => `<div class="devcard"><h3>${info.name}<small>${info.sub}</small></h3>${ORDER.filter(id => SCREENS[id].device === d).map(id => `<button data-go="${id}"><b>${id.toUpperCase()}</b>${SCREENS[id].name}</button>`).join('')}</div>`).join('');
  const flow = [
    ['07:55 site · system map', ['w8']], ['08:00 heat reading', ['w2', 'm1']], ['08:01 stop-work on site and on phones', ['m2', 'p3', 'p2']],
    ['08:04 headcount', ['w3', 'm3', 'k1']], ['08:10 workshop eligibility', ['w4', 'm4']], ['08:11 work/rest plan', ['w5', 'm5', 'p5']],
    ['08:18 Bilal’s report', ['p4', 'm6', 'w1']], ['08:18 replan', ['w3/incident', 'w5/replan']], ['Any time · ask the Planning Agent', ['w7', 'm8']],
    ['Later · restart', ['w6/blocked', 'm7', 'w6']], ['Recap', ['w1/summary']], ['Not in the tutorial', ['p1', 'p6', 'p7', 'p8']],
    ['Onboarding · admin sets company branding', ['w9', 'w9/mobile']],
  ];
  const chip = c => { const [id, v] = c.split('/'); return `<button data-go="${id}"${attr('data-v', v)}>${id.toUpperCase()}${v ? ' · ' + v : ''}</button>`; };
  return `<div class="mapwrap">
    <h1>Heat-Safe Crew · screens and devices</h1>
    <p class="lead">Navigable wireframes for every screen in the spec, grouped by device. Click a screen to open it in its device frame, then use the left panel to switch states (default, empty, error and alternates), change the signed-in role, or step through the 4 August scenario.</p>
    <div class="legend">${[1, 2, 3, 4].map(n => compname(n)).join('')}<span class="compname"><span class="badge b-ai">◇ AI</span> AI-generated</span><span class="compname"><span class="computed">⚙ Computed</span> Rule result</span><span class="compname">${band('low')} Environment</span><span class="compname">${B.hold()} Task stamp</span><span class="compname"><span class="badge b-wait">◇ Proposal</span> Not yet recorded</span></div>
    <div class="devgrid">${dev}</div>
    <h2>Tutorial step → screens</h2>
    <table class="t flow"><thead><tr><th style="width:320px">Step</th><th>Screens</th></tr></thead><tbody>${flow.map(([s, c]) => `<tr><td>${s}</td><td>${c.map(chip).join('')}</td></tr>`).join('')}</tbody></table>
    <p class="lead" style="margin-top:32px">Visual rules come from the Heat-Safe design system, Issued Sheet (<a href="../ui_design_system/index.html">style guide</a>, <code>DESIGN_SYSTEM.md</code>): tokens from <code>tokens.css</code>, colour only as an ISO 3864 safety signal, ink stamps for recorded decisions, dashed tracing paper for AI drafts and proposals, glare theme on site and worker phones, and company branding confined to identity slots by <code>brand.js</code>.</p>
  </div>`;
}

window.addEventListener('hashchange', render);
render();
