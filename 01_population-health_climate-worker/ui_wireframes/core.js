/* Heat-Safe Crew wireframes — router, shells and shared components.
   Plain scripts (no build step) so index.html works straight from disk. */

const SCREENS = {};
const ORDER = [];
function screen(id, def) { def.id = id; SCREENS[id] = def; ORDER.push(id); }

const DEVICES = {
  web:    { name: 'Supervisor web app', sub: 'Desktop · 1280px+ · Huda, Maya, Rashid' },
  site:   { name: 'Site app', sub: 'iOS / Android · supervisors and responders' },
  worker: { name: 'Worker app · Health Reporting', sub: 'iOS / Android / web app' },
  kiosk:  { name: 'Shelter check-in kiosk', sub: 'Wall-mounted tablet with NFC' },
};

const ROLES = {
  foreman:  { who: 'huda',   label: 'Foreman · Huda' },
  safety:   { who: 'maya',   label: 'Safety officer · Maya' },
  super:    { who: 'rashid', label: 'Superintendent · Rashid' },
  firstaid: { who: 'salim',  label: 'First aider · Salim' },
  admin:    { who: 'noura',  label: 'Organisation admin · Noura' },
};

const PEOPLE = {
  huda:   { n: 'Huda',   id: 'C01', e: '🦺', role: 'Dune foreman' },
  maya:   { n: 'Maya',   id: 'P03', e: '🌡️', role: 'Sandline safety officer' },
  rashid: { n: 'Rashid', id: 'P02', e: '📋', role: 'Sandline superintendent' },
  salim:  { n: 'Salim',  id: 'P06', e: '⛑️', role: 'First aider' },
  rana:   { n: 'Rana',   id: 'C05', e: '🔧', role: 'Civil worker' },
  yusuf:  { n: 'Yusuf',  id: 'C06', e: '🧰', role: 'Civil worker' },
  dana:   { n: 'Dana',   id: 'C07', e: '📏', role: 'Civil worker' },
  bilal:  { n: 'Bilal',  id: 'C08', e: '🤒', role: 'Civil worker' },
  leila:  { n: 'Leila',  id: 'C09', e: '🧤', role: 'Civil worker' },
  zaid:   { n: 'Zaid',   id: 'C10', e: '🪣', role: 'Civil worker' },
  mariam: { n: 'Mariam', id: 'C11', e: '🧱', role: 'Civil worker' },
  samir:  { n: 'Samir',  id: 'C12', e: '🪛', role: 'Civil worker' },
  c02:    { n: 'C02',    id: 'C02', e: '👷', role: 'Civil worker' },
  c03:    { n: 'C03',    id: 'C03', e: '👷', role: 'Civil worker' },
  c04:    { n: 'C04',    id: 'C04', e: '👷', role: 'Civil worker' },
  lina:   { n: 'Lina',   id: 'P07', e: '🏷️', role: 'Workshop occupant' },
  omar:   { n: 'Omar',   id: 'P08', e: '🛠️', role: 'Workshop occupant' },
  amal:   { n: 'Amal',   id: '',    e: '💼', role: 'Cost review' },
  noura:  { n: 'Noura',  id: 'P09', e: '🖥️', role: 'Sandline HSE systems admin' },
  planner:{ n: 'Planning Agent', id: '', e: '🗓️', role: 'AI agent', machine: true },
  aid:    { n: 'Worker Aid Agent', id: '', e: '💬', role: 'AI agent', machine: true },
  monitor:{ n: 'Risk Monitor', id: '', e: '⏱️', role: 'Deterministic job, every 15 minutes', machine: true },
  kiosk:  { n: 'Kiosk', id: '', e: '📟', role: 'Shelter A kiosk', machine: true },
  karim:  { n: 'Karim',  id: 'C21', e: '🦺', role: 'Formwork foreman' },
  faisal: { n: 'Faisal', id: 'C31', e: '🦺', role: 'Steel fixing foreman' },
  jose:   { n: 'José',   id: 'C41', e: '🦺', role: 'MEP foreman' },
};
const AFFECTED = ['c02', 'c03', 'c04', 'rana', 'yusuf', 'dana', 'bilal', 'leila', 'zaid', 'mariam', 'samir'];
/* ───────── squads ─────────
   The site runs four squads. The 4 August scenario follows the civil crew in full;
   the others carry enough state to compare squads side by side. All fictional. */
const SQUADS = [
  { id: 'civil', name: 'Civil crew', foreman: 'huda', loc: 'Civil trench', shelter: 'Shelter A', size: 14,
    twl: 145, band: 'low', hold: true, status: 'Heavy work stopped', sensor: 't1', reading: { v: 175, at: '15:06', fresh: true },
    alerts: 1, warnings: 2, actions: { open: 4, done: 4 }, responses: { done: 4, total: 4 }, headcount: '11 / 11',
    brk: { start: '12:30', end: '15:00' }, checks: { done: 8, total: 8 } },
  { id: 'form', name: 'Formwork crew', foreman: 'karim', loc: 'Podium deck', shelter: 'Shelter B', size: 9,
    twl: 156, band: 'low', hold: false, status: 'Working · shade rotation', sensor: 't2', reading: { v: 158, at: '15:05', fresh: true },
    alerts: 0, warnings: 1, actions: { open: 1, done: 2 }, responses: { done: 2, total: 2 }, headcount: '9 / 9',
    brk: { start: '12:30', end: '15:00' }, checks: { done: 3, total: 3 }, members: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'],
    items: [['Refill the deck water cooler', 'Below 10 L at 08:12 · owner Karim · due 08:30', 'warn']] },
  { id: 'steel', name: 'Steel fixing crew', foreman: 'faisal', loc: 'Laydown yard', shelter: 'Shelter B', size: 12,
    twl: 138, band: 'caution', hold: false, est: true, status: 'Caution controls · sensor offline', sensor: 't3', reading: { v: 138, at: 'forecast', fresh: false },
    alerts: 1, warnings: 1, actions: { open: 2, done: 1 }, responses: { done: 1, total: 2 }, headcount: '12 / 12',
    brk: { start: '12:30', end: '15:00' }, checks: { done: 5, total: 8 }, members: ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'],
    items: [['Base station 2 offline · band raised one level', 'No heartbeat since 07:52 · Noura notified · forecast in use', 'error'], ['Extra water and rest every 45 min', 'Caution band control · owner Faisal', 'warn']] },
  { id: 'mep', name: 'MEP crew', foreman: 'jose', loc: 'Level 2 interior', shelter: 'Shelter B', size: 6,
    twl: 168, band: 'low', hold: false, status: 'Working · covered', sensor: 'm1', reading: { v: 168, at: '15:00', fresh: true },
    alerts: 0, warnings: 0, actions: { open: 0, done: 1 }, responses: { done: 1, total: 1 }, headcount: '6 / 6',
    brk: { start: '—', end: '—' }, checks: { done: 0, total: 0 }, members: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'], items: [] },
];
SQUADS[0].members = AFFECTED.concat(['C13', 'C14', 'huda']).filter(k => k !== 'huda');
SQUADS.forEach(q => (q.members || []).forEach(k => { if (!PEOPLE[k]) PEOPLE[k] = { n: k, id: k, e: '👷', role: q.name + ' worker' }; }));
const SENSORS = [
  { id: 't1', type: 'Wet-bulb globe sensor', loc: 'Civil trench', squad: 'civil', relay: 'Base station 1', status: 'Live · 30 s ago' },
  { id: 't2', type: 'Wet-bulb globe sensor', loc: 'Podium deck', squad: 'form', relay: 'Base station 1', status: 'Live · 45 s ago' },
  { id: 't3', type: 'Wet-bulb globe sensor', loc: 'Laydown yard', squad: 'steel', relay: 'Base station 2', status: 'Offline since 07:52', off: true },
  { id: 'm1', type: 'Handheld heat meter', loc: 'Level 2 interior', squad: 'mep', relay: 'Manual · Jose', status: 'Read 15:00' },
  { id: 'bs1', type: 'Base station', loc: 'Site cabin roof', squad: '', relay: 'LTE', status: 'Live' },
  { id: 'bs2', type: 'Base station', loc: 'Laydown yard gate', squad: '', relay: 'LTE', status: 'Offline since 07:52', off: true },
  { id: 'k1', type: 'NFC check-in kiosk', loc: 'Shelter A', squad: 'civil', relay: 'Site Wi-Fi', status: 'Live' },
  { id: 'k2', type: 'NFC check-in kiosk', loc: 'Shelter B', squad: 'form,steel,mep', relay: 'Site Wi-Fi', status: 'Live' },
];
function squad(id) { return SQUADS.find(q => q.id === (id || App.sel.squad || 'civil')) || SQUADS[0]; }
/* Squad selector: one card per squad with its foreman, alerts and warnings (status
   icons), plus any per-screen facts. Picking a squad carries across screens. */
function squadPicker(extra) {
  const cur = squad().id;
  return `<div class="squads" role="radiogroup" aria-label="Squad">${SQUADS.map(q => {
    const lines = extra ? extra(q) : [`${q.loc} · ${q.size} workers`];
    return `<button class="sq ${q.id === cur ? 'on' : ''}" role="radio" aria-checked="${q.id === cur}" data-act="squad" data-id="${q.id}">
      <span class="sq-h">${av(q.foreman, { size: 'sm' })}<span><b>${q.name}</b><small>${who(q.foreman)}</small></span></span>
      <span class="sq-n"><span class="${q.alerts ? '' : 'zero'}">${q.alerts ? '<span class="si" data-status="error" aria-hidden="true"></span>' : ''}<b>${q.alerts}</b> alert${q.alerts === 1 ? '' : 's'}</span><span class="${q.warnings ? '' : 'zero'}">${q.warnings ? '<span class="si" data-status="warn" aria-hidden="true"></span>' : ''}<b>${q.warnings}</b> warning${q.warnings === 1 ? '' : 's'}</span></span>
      ${lines.map(l => `<span class="sq-l">${l}</span>`).join('')}
    </button>`; }).join('')}</div>`;
}
/* For squads other than the scenario's civil crew: their open items as rows. */
function squadItems(q) {
  if (!q.items || !q.items.length) return `<div class="statusline"><span class="si" data-status="ok" aria-hidden="true"></span> Nothing needs action for the ${q.name.toLowerCase()}.</div>`;
  return list(q.items.map(([t, d, st]) => row({ t, d, b: st === 'error' ? B.red('Alert') : B.amber('Warning'), static: true })));
}


/* ───────── state ───────── */
const App = { route: 'map', variant: 'default', role: 'foreman', sel: {}, f: {}, scale: 1, lastR: null, mirror: false, pseudo: false, qa: false, theme: 'auto' };

/* ───────── light setting and company brand ─────────
   Auto follows the design system: the desk apps open in day, the site and worker apps in
   glare (their outdoor default), the kiosk in day (it hangs in a cooled shelter). */
function frameTheme(device) {
  if (App.theme !== 'auto') return App.theme;
  return device === 'site' || device === 'worker' ? 'glare' : 'day';
}
const BRAND_SURFACE = { web: 'platform', site: 'mobile', worker: 'mobile', kiosk: 'mobile' };
function loadBrand() { try { return JSON.parse(localStorage.getItem('hs-brand') || 'null'); } catch (e) { return null; } }
function publishBrand(cfg, meta) {
  App.brand = HSBrand.normalise(cfg);
  App.brandRes = HSBrand.resolve(App.brand);
  App.brandMeta = meta || null;
  try { localStorage.setItem('hs-brand', JSON.stringify(App.brand)); } catch (e) { /* private mode: keep in memory */ }
  HSBrand.apply(App.brandRes, 'hs-brand');
}
publishBrand(loadBrand() || {});
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/* Brand bar: company name over the Heat-Safe product line, so people always know which system issued the sheet. */
function brandBar(res, product, strip) {
  const branded = HSBrand.isBranded(res);
  const name = branded ? res.cfg.org || res.cfg.wordmark : 'Heat-Safe Crew';
  const line = branded ? product : 'Dune Civil Works · Abu Dhabi';
  return `<div class="brandbar ${strip ? 'brandbar--strip' : ''}">${branded ? HSBrand.markHtml(res) : ''}<span class="brandbar__text"><span class="brandbar__name">${esc(name)}</span><span class="brandbar__product">${esc(line)}</span></span></div>`;
}

function go(id, v) { const h = '#/' + id + (v && v !== 'default' ? '/' + v : ''); if (location.hash === h) render(); else location.hash = h; }
function parse() {
  const m = location.hash.match(/^#\/([^/]+)(?:\/(.+))?/);
  App.route = m ? m[1] : 'map';
  App.variant = m && m[2] ? m[2] : 'default';
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const attr = (k, v) => (v === undefined || v === null || v === false || v === '' ? '' : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`);

/* ───────── components ───────── */
/* Person key → the ID whose photo they wear. Amal has no ID in this story; this Noura is
   drawn with the Noura photo the rest of the product uses, so a name always has one face. */
const PHOTO_ID = { amal: 'P01', noura: 'P05', karim: 'L02', faisal: 'L04' };
function photoId(key) { const p = PEOPLE[key]; return p && !p.machine ? PHOTO_ID[key] || p.id || null : null; }
/* Crew photo for people (round, ui_design_system/people.js); a square ⚙ tile for software. */
function av(key, { sm, size, cls } = {}) {
  const p = PEOPLE[key]; if (!p) return '';
  const label = `${p.n}${p.id ? ' (' + p.id + ')' : ''}, ${p.role}`;
  if (p.machine) return `<span class="avatar machine ${sm ? 'sm' : ''}" role="img" aria-label="${label}">⚙</span>`;
  const id = photoId(key);
  return HSPeople.avatar(id, { size: size || (sm ? 'sm' : 'md'), cls }).replace(' aria-hidden="true"', ` role="img" aria-label="${label}"`);
}
/* Photo + name, for sentences and table cells. */
function pv(key, size = 'xs') { return `<span class="person">${av(key, { size })}<span>${who(key)}</span></span>`; }
function who(key) { const p = PEOPLE[key]; return p ? `${p.n}${p.id && p.n !== p.id ? ' (' + p.id + ')' : ''}` : key; }
const SI_OK = '<span class="si" data-status="ok" aria-hidden="true"></span>', SI_WARN = '<span class="si" data-status="warn" aria-hidden="true"></span>', SI_ERROR = '<span class="si" data-status="error" aria-hidden="true"></span>';
const B = {
  /* Good, warning and error stamps lead with the status icon: green tick, yellow
     triangle with "!", filled red circle with white X. */
  stop:   (l = 'Stop-work', a) => badge(SI_ERROR + l, 'b-red', a),
  red:    (l = 'Red', a) => badge(SI_ERROR + l, 'b-red', a),
  amber:  (l = 'Amber', a) => badge(SI_WARN + l, 'b-amber', a),
  green:  (l = 'Green', a) => badge(SI_OK + l, 'b-green', a),
  emerg:  (l = 'Emergency', a) => badge('✚ ' + l, 'b-emerg', a),
  done:   (l = 'Done', a) => badge(SI_OK + l, '', a),
  rec:    (l = 'Recorded', a) => badge('✓ ' + l, 'b-rec', a),
  wait:   (l = 'Waiting', a) => badge('… ' + l, 'b-wait', a),
  over:   (l = 'Overdue', a) => badge(SI_ERROR + l, 'b-over', a),
  hold:   (l = 'Heavy-work hold', a) => badge(SI_ERROR + l, 'b-red', a),
  ai:     (l = 'AI', a) => badge('◇ ' + l, 'b-ai', a),
  plain:  (l, a) => badge(l, '', a),
  muted:  (l, a) => badge(l, 'b-muted', a),
  plan:   (l, a) => badge(l, 'b-plan', a),
};
function badge(text, cls = '', aria) { return `<span class="badge ${cls}"${aria ? ` role="img" aria-label="${aria}"` : ''}>${text}</span>`; }
/* Environmental band: a condition (swatch + word). Task holds are separate stamps. */
const BAND_WORD = { low: 'Low band', caution: 'Caution band', high: 'High band', unknown: 'Unknown band' };
function band(level, extra = '') { return `<span class="band band--${level}"><span class="band__swatch" aria-hidden="true"></span>${BAND_WORD[level]}${extra ? ' · ' + extra : ''}</span>`; }
/* Squad TWL: large reading, band word, then a bar filled to the reading in its band colour
   (scale 90–170) with the site heavy-work hold at 150 as a line. Matches supervisor-ui twl.tsx. */
const TWL_MIN = 90, TWL_MAX = 170, TWL_HOLD = 150;
function twlBar(twl, level, est) {
  const pct = v => (Math.min(TWL_MAX, Math.max(TWL_MIN, v)) - TWL_MIN) / (TWL_MAX - TWL_MIN) * 100;
  const word = BAND_WORD[level].replace(' band', '');
  return `<span class="twlr"><span class="twlr__v">TWL <b>${twl}</b> W/m²</span><span class="twlr__w">${word}${est ? ' · est.' : ''}</span>`
    + `<span class="twlbar band--${level}" role="img" aria-label="TWL ${twl} W/m², ${BAND_WORD[level]}; heavy-work limit TWL ≤${TWL_HOLD} W/m²"><span class="twlbar__fill" style="width:${pct(twl)}%"></span><span class="twlbar__hold" style="left:${pct(TWL_HOLD)}%"></span></span>`
    + `<span class="twlbar__scale" aria-hidden="true"><span>${TWL_MIN}</span><span>${TWL_MAX}</span></span></span>`;
}
function marker(n) { return `<span class="marker m${n}" aria-hidden="true">${n}</span>`; }
const COMP = { 1: 'Heat controls', 2: 'Protective response', 3: 'Work/rest plan', 4: 'Restart readiness' };
function compname(n) { return `<span class="compname">${marker(n)}${n} ${COMP[n]}</span>`; }

function metric(lbl, val, q = '', crit) {
  const c = crit === 'red' ? 'crit-red' : crit ? 'critical' : '';
  return `<div class="metric ${c}"><div class="lbl">${lbl}</div><div class="val"><bdi>${val}</bdi></div><div class="q">${q}</div></div>`;
}

function row(o) {
  const st = o.static;
  const tag = st ? 'div' : 'button';
  const cls = ['row', o.lead ? '' : 'nolead', o.sel ? 'sel' : '', st ? 'static' : '', o.cls || ''].join(' ');
  return `<${tag} class="${cls}"${attr('data-go', o.go)}${attr('data-v', o.v)}${attr('data-act', o.act)}${attr('data-id', o.id)}${o.aria ? attr('aria-label', o.aria) : ''}>` +
    (o.lead ? `<span class="lead">${o.lead}</span>` : '') +
    `<span style="min-width:0"><span class="t" style="display:block">${o.t}</span>${o.d ? `<span class="d">${o.d}</span>` : ''}</span>` +
    `<span class="rt">${o.b || ''}${o.extra || ''}</span></${tag}>`;
}

/* Every section heading leads with an icon for what it is about (icons.js). First
   match wins, so the more specific topics come first; pass ic to choose one. */
const SECTION_TOPICS = [
  [/proposal|solver|\bai\b|agent|draft|suggest/i, 'ai'],
  [/photo/i, 'camera'],
  [/brand|preview|logo|palette|colour|surface/i, 'globe'],
  [/\bstop\b/i, 'stop'],
  [/\bstart\b|restart/i, 'play'],
  [/telemetry|forecast|band|heat|reading|sensor|condition|risk|weather|twl/i, 'sensor'],
  [/schedule|plan\b|interval|shift|handover|timeline|chronolog|hour|today|later/i, 'calendar'],
  [/evidence|record|observ|log|event|source|review|run\b|runs|cost|commercial|history|trust|saw/i, 'calc'],
  [/need|action|task|alert/i, 'alert'],
  [/privacy|consent|your data|access|audit/i, 'lock'],
  [/deliver|receive|channel|send|recipient/i, 'send'],
  [/location|shelter|where|zone|seat|workshop|headcount/i, 'pin'],
  [/crew|worker|people|affected|who\b|persona|employer|roster|team/i, 'people'],
  [/conversation|message|question|ask|chat/i, 'message'],
  [/wearable|device|phone/i, 'phone'],
  [/water|drink/i, 'water'],
  [/step|check|requirement|eligib|confirm|guardrail|assumption|policy|rule|operation/i, 'list'],
  [/system|setting|admin|setup|map/i, 'settings'],
  [/language/i, 'globe'],
  [/account|\bme\b|profile|your/i, 'person'],
];
function sectionIcon(title) { const plain = String(title).replace(/<[^>]+>/g, ''); const hit = SECTION_TOPICS.find(([re]) => re.test(plain)); return hit ? icon(hit[1]) : ''; }
function section(title, body, aside = '', ic) {
  return `<section class="sec"><div class="list-h"><strong class="list-t">${ic ? icon(ic) : sectionIcon(title)}${title}</strong>${aside ? `<span>${aside}</span>` : ''}</div>${body}</section>`;
}
function list(rows) { return `<div class="list">${rows.join('')}</div>`; }
const COMPUTED = '⚙ Computed · rules v2026.11.07-1';
function computed(extra = '') { return `<div class="computed">${COMPUTED}${extra ? ' · ' + extra : ''}</div>`; }

/* AI block §1.5 */
const WHY = {};
const CONF_MEANING = {
  High: 'Every figure matched a tool output and every policy claim has a retrieved citation.',
  Medium: 'Grounded, but relies on an assumption the agent stated.',
  Low: 'The grounding check flagged a value, or required input was missing.',
};
function whyHtml(w) {
  return `<h4>Confidence: ${w.conf}</h4><p class="p">${CONF_MEANING[w.conf] || ''}</p>` +
    `<h4>Tools called</h4><ul>${w.tools.map(t => `<li><code>${t}</code></li>`).join('')}</ul>` +
    `<h4>Input facts used</h4><ul>${w.inputs.map(t => `<li>${t}</li>`).join('')}</ul>` +
    (w.cites && w.cites.length ? `<h4>Citations (exact)</h4>${w.cites.map(c => `<div class="cite">${c}</div>`).join('')}` : '');
}
function aiBlock(o) {
  const key = o.key;
  WHY[key] = { conf: o.conf, tools: o.tools || [], inputs: o.inputs || [], cites: o.cites || [] };
  if (App.f['discard.' + key]) {
    return `<div class="ai discarded" data-ai="${key}"><span>◇ AI suggestion discarded · kept in history</span><button class="btn" data-act="undiscard" data-key="${key}">Undo</button></div>`;
  }
  const acts = (o.acts || [{ l: 'Edit', go: o.editGo }, { l: 'Discard', act: 'discard' }])
    .map(a => `<button class="btn"${attr('data-go', a.go)}${attr('data-v', a.v)}${attr('data-act', a.act)} data-key="${key}">${a.l}</button>`).join('');
  const confL = o.i18n ? `${t('ai.conf')}: ${t('ai.' + o.conf)}` : 'Confidence: ' + o.conf;
  const whyL = o.i18n ? t('ai.why') : 'Why this?';
  return `<div class="ai" data-ai="${key}">
    <div class="ai-h"><span>◇ AI · ${o.agent || 'Planning Agent'}</span>${o.title ? `<span style="color:var(--ink)">· ${o.title}</span>` : ''}${o.badge || badge(confL, '', 'Confidence ' + o.conf)}</div>
    ${o.warn ? `<div class="warn">▲ ${o.warn}</div>` : ''}
    <p>${o.text}</p>
    ${o.after || ''}
    <div class="ai-actions"><span class="why"><button class="btn" data-act="why" data-key="${key}" aria-label="Why this? Show tools, inputs and citations">ⓘ ${whyL}</button><span class="tip" role="tooltip" lang="en" dir="ltr">${whyHtml(WHY[key])}</span></span>${acts}</div>
  </div>`;
}

function emptyArt() {
  return `<svg width="120" height="72" viewBox="0 0 120 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
    <rect x="12" y="8" width="40" height="40"/><circle cx="32" cy="24" r="7"/><path d="M20 46c2-8 22-8 24 0"/>
    <rect x="68" y="8" width="40" height="40"/><circle cx="88" cy="24" r="7"/><path d="M76 46c2-8 22-8 24 0"/>
    <path d="M0 64h120" /></svg>`;
}
function emptyHtml(e) {
  const cta = e.cta ? `<button class="cta"${attr('data-go', e.go)}${attr('data-v', e.v)}${attr('data-act', e.act || (e.go ? '' : 'toast'))}${attr('data-msg', e.msg || e.cta + ' · not in this prototype')}>${e.cta}</button>` : '';
  const sec = e.secondary ? `<button class="btn"${attr('data-go', e.secondary.go)}>${e.secondary.l}</button>` : '';
  return `<div class="empty">${emptyArt()}<p>${e.text}</p>${cta}${sec}</div>`;
}
function ctaHtml(c) {
  if (!c) return '';
  if (c.html) return c.html;
  const btn = `<button class="cta ${c.red ? 'red' : ''}"${c.disabled ? ' disabled' : ''}${attr('data-go', c.go)}${attr('data-v', c.v)}${attr('data-act', c.act)}${attr('data-msg', c.msg)}>${c.label}</button>`;
  return btn + (c.note ? `<div class="cta-note">${c.note}</div>` : '');
}
function bannerHtml(err) {
  if (!err) return '';
  const retry = err.noretry ? '' : `<button class="btn" data-act="retry">${err.retry || 'Retry'}</button>`;
  return `<div class="banner ${err.info ? 'info' : ''}" role="status" aria-live="polite"><span class="banner-t">${err.text}</span>${retry}</div>`;
}

/* ───────── shells ───────── */
const WEB_NAV = [
  { id: 'w1', l: 'Squad Monitoring', ph: '▦' },
  { id: 'w2', l: 'Heat controls', m: 1 },
  { id: 'w3', l: 'Protective response', m: 2 },
  { id: 'w4', l: 'Crew & workshop', m: 3 },
  { id: 'w5', l: 'Work/rest plan', m: 3 },
  { id: 'w6', l: 'Restart review', m: 4 },
  { id: 'w7', l: 'Ask the Planning Agent', ph: '◇' },
  { id: 'w8', l: 'System & trust', ph: '⚙' },
  { id: 'w11', l: 'Site setup', ph: '⌖' },
];

function topRight(r, mobile) {
  const f = r.filters ? (mobile
    ? `<button class="iconbtn" data-act="filter" aria-label="Filter">⏷</button>`
    : `<button class="filter" data-act="filter" aria-haspopup="menu">Filter ⏷</button>`) : '';
  const o = r.overflow ? `<button class="iconbtn" data-act="overflow" aria-label="More actions" aria-haspopup="menu">⋯</button>` : '';
  return (r.navRight || '') + f + o;
}

function webShell(s, r) {
  const user = PEOPLE[ROLES[App.role].who];
  const nav = WEB_NAV.map(n => `<button class="navi ${s.id === n.id || s.navAs === n.id ? 'on' : ''}" data-go="${n.id}">${n.m ? marker(n.m) : `<span class="ph" aria-hidden="true">${n.ph}</span>`}<span>${n.l}</span></button>`).join('');
  const nv = r.nav || {};
  const back = `<button class="backlink" ${nv.back ? `data-go="${nv.back}"` : 'disabled'}>← ${nv.back ? (SCREENS[nv.back] ? SCREENS[nv.back].short || 'Back' : 'Back') : 'Back'}</button>`;
  let main;
  if (r.empty) {
    main = `<div class="main nodetail"><div class="colwrap"><div class="col">${emptyHtml(r.empty)}</div></div></div>`;
  } else {
    const st = r.error && !r.error.nostale ? 'stale' : '';
    const hero = r.hero ? `<div class="hero ${st}">${r.hero.join('')}</div>` : (r.heroReplace || '');
    const body = `<div class="${st}" style="display:flex;flex-direction:column;gap:48px">${(r.body || []).join('')}</div>`;
    const col = `<div class="colwrap"><div class="col" data-keep="col">${hero}${body}</div>${r.cta && !r.detail ? `<div class="col-cta">${ctaHtml(r.cta)}</div>` : ''}${r.footer ? `<div class="col-cta">${r.footer}</div>` : ''}</div>`;
    const det = r.detail ? `<aside class="detail" aria-label="Detail"><div class="dbody" data-keep="dbody">${r.detail}</div>${r.cta ? `<div class="dfoot">${ctaHtml(r.cta)}</div>` : ''}</aside>` : '';
    main = `<div class="main ${r.detail ? '' : 'nodetail'}">${col}${det}</div>`;
  }
  return `<div class="shell">
    <div class="side">
      ${brandBar(App.brandRes, 'Heat-Safe Crew · Mussafah')}
      <nav aria-label="Main">${nav}<div class="sep"></div><button class="navi ${s.id === 'w9' ? 'on' : ''}" data-go="w9"><span class="ph" aria-hidden="true">◐</span><span>Organisation branding</span></button></nav>
      <button class="me" data-go="w10" aria-label="Your account: ${user.n}">${av(ROLES[App.role].who)}<span><b>${user.n}</b>${user.role}</span></button>
    </div>
    <div class="content">
      <header class="topnav"><div class="l">${back}</div><div class="ttl">${nv.title || s.name}<small>Dune Civil Works · 4 Aug 2025 · ${nv.clock || s.clock || '08:18'}${nv.updated ? ' · updated ' + nv.updated : ''}</small></div><div class="r">${topRight(r, false)}</div></header>
      ${bannerHtml(r.error)}
      ${main}
    </div>
  </div>`;
}

const SITE_TABS = [
  { k: 'today', l: 'Today', ic: '◉', go: 'm1' },
  { k: 'crew', l: 'Crew', ic: '☰', go: 'm3' },
  { k: 'plan', l: 'Plan', ic: '▤', go: 'm5' },
  { k: 'ask', l: 'Ask ◇', ic: '◇', go: 'm8' },
  { k: 'me', l: 'Me', ic: '□', go: 'm9' },
];
const WORKER_TABS = [
  { k: 'now', key: 'tab.now', ic: '●', go: 'p2' },
  { k: 'plan', key: 'tab.plan', ic: '▤', go: 'p5' },
  { k: 'check', key: 'tab.check', ic: '🎙', go: 'p4', big: true },
  { k: 'me', key: 'tab.me', ic: '□', go: 'p8' },
];

function mobileShell(s, r) {
  const worker = s.device === 'worker';
  const tabs = worker ? WORKER_TABS : SITE_TABS;
  const nv = r.nav || {};
  const me = worker ? 'rana' : ROLES[App.role].who;
  const left = nv.leftHtml || (nv.back ? `<button class="iconbtn" data-go="${nv.back}"${attr('data-v', nv.backV)} aria-label="Back" style="${worker ? 'width:56px;height:56px' : ''}">←</button>` : `<button class="iconbtn mephoto" data-go="${worker ? 'p9' : 'm9'}" aria-label="Your account">${av(me, { size: 'md' })}</button>`);
  const top = r.noTop ? '' : `<header class="topnav"><div class="l">${left}</div><div class="ttl">${nv.title || s.name}${nv.sub ? `<small>${nv.sub}</small>` : ''}</div><div class="r">${topRight(r, true)}</div></header>`;
  let inner;
  if (r.empty) inner = `<div class="scroll">${emptyHtml(r.empty)}</div>`;
  else {
    const st = r.error && !r.error.nostale ? 'stale' : '';
    const hero = r.hero ? `<div class="mhero ${st}" role="region" aria-label="Key figures">${r.hero.join('')}</div>` : (r.heroReplace || '');
    inner = `<div class="scroll" data-keep="scroll">${hero}<div class="mpad ${st}">${(r.body || []).join('')}</div></div>${r.cta ? `<div class="mcta">${ctaHtml(r.cta)}</div>` : ''}`;
  }
  const tabbar = r.noTabs ? '' : `<nav class="tabbar" style="grid-template-columns:${tabs.map(t => t.big ? '1.6fr' : '1fr').join(' ')}" aria-label="Tabs">${tabs.map(t => `<button class="${s.tab === t.k ? 'on' : ''} ${t.big ? 'big' : ''}"${attr('data-go', t.go)}${attr('data-act', t.act)}${s.tab === t.k ? ' aria-current="page"' : ''}><span class="ic" aria-hidden="true">${t.ic}</span>${t.key ? tr(t.key) : t.l}</button>`).join('')}</nav>`;
  const net = r.offline ? (worker ? tr('nonet') : 'No network') : '4G ▮▮▮';
  const app = worker ? tr('app') : 'Heat-Safe Site';
  /* The status bar shows what the browser's theme-color paints. Stop-work and emergency
     statements drop the brand entirely: no strip, ink browser colour. */
  const safety = isSafetyScreen(r);
  const strip = !safety && App.brandRes.cfg.mobile.header === 'strip' && HSBrand.isBranded(App.brandRes) ? brandBar(App.brandRes, worker ? 'Heat-Safe · ' + app : app, true) : '';
  return `<div class="statusbar themebar ${safety ? 'is-safety' : ''}"><span>${nv.clock || s.clock || '08:18'}</span><span>${app}</span><span>${net}</span></div>${strip}${top}${bannerHtml(r.error)}${inner}${tabbar}`;
}
function isSafetyScreen(r) { return /class="statement (red|black)/.test(r.heroReplace || '') || /class="statement (red|black)/.test(r.full || ''); }

function kioskShell(s, r) {
  const strip = App.brandRes.cfg.mobile.header === 'strip' && HSBrand.isBranded(App.brandRes) && !isSafetyScreen(r) ? brandBar(App.brandRes, 'Heat-Safe · Shelter A check-in', true) : '';
  return strip + r.full;
}

const SHELLS = { web: webShell, site: mobileShell, worker: mobileShell, kiosk: kioskShell };

/* ───────── rendering ───────── */
function variantsOf(s) {
  if (s.alias) return {};
  const v = { default: s.defaultLabel || 'Default', ...(s.alt || {}) };
  if (s.empty) v.empty = 'Empty';
  if (!s.noError) v.error = s.errorLabel || 'Error';
  return v;
}

function buildR(s) {
  const v = App.variant;
  if (s.selfVariants) return s.render({ v });
  const val = x => typeof x === 'function' ? x() : x;
  if (v === 'empty' && s.empty) { const r = s.render({ v: 'default' }); return { nav: r.nav, navRight: r.navRight, empty: val(s.empty), noTabs: r.noTabs }; }
  const r = s.render({ v: v === 'error' ? 'default' : v });
  if (v === 'error') r.error = Object.assign({ text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last update from 08:04. Your entries are saved on this device." }, val(s.error) || {});
  return r;
}

function render() {
  parse();
  clearInterval(App.timer);
  const stage = $('#stage');
  const s = SCREENS[App.route];
  if (s && s.alias) { go(s.alias, s.aliasV); return; }
  if (!s) {
    stage.className = 'stage map';
    stage.innerHTML = mapHtml();
    renderPanel(null);
    return;
  }
  if (s.role && !App.roleLocked) { /* screens may suggest a role */ }
  const keep = {};
  $$('[data-keep]', stage).forEach(el => keep[el.dataset.keep] = el.scrollTop);
  const sameScreen = stage.dataset.cur === App.route + '/' + App.variant;
  const r = buildR(s);
  App.lastR = r;
  stage.className = 'stage';
  stage.dataset.cur = App.route + '/' + App.variant;
  const loc = frameLocale(s);
  stage.classList.toggle('qa-fallback', App.qa);
  const theme = frameTheme(s.device);
  const themeNote = { day: 'Day', glare: 'Glare', night: 'Night shift' }[theme];
  stage.innerHTML = `<div class="stage-cap">${s.id.toUpperCase()} · ${s.name} · ${DEVICES[s.device].name} · ${themeNote}${loc.note}</div><div class="stage-inner" id="inner"><div class="frame ${s.device}" id="frame" lang="${loc.lang}" dir="${loc.dir}" data-theme="${theme}" data-brand-surface="${BRAND_SURFACE[s.device]}">${SHELLS[s.device](s, r)}</div></div>`;
  postProcess($('#frame'));
  if (sameScreen) $$('[data-keep]', stage).forEach(el => { if (keep[el.dataset.keep]) el.scrollTop = keep[el.dataset.keep]; });
  fit();
  renderPanel(s);
  if (r.mount) r.mount();
  if (s.mount) s.mount();
}
function refresh() { render(); }

/* ───────── languages and direction ───────── */
function tr(key) { return typeof t === 'function' ? t(key) : key; }
function frameLocale(s) {
  if (s.device === 'worker') {
    const L = LANG[curLang()] || LANG.en;
    const lang = L.st === 'ready' ? L.c : 'en';
    return { lang, dir: LANG[lang].d, note: ` · ${L.e}${L.st !== 'ready' ? ' (not ready, English shown)' : ''}` };
  }
  if (App.mirror) return { lang: 'en', dir: 'rtl', note: ' · RTL mirror test' };
  return { lang: 'en', dir: 'ltr', note: '' };
}
/* After render: mirror directional arrows in right-to-left frames (media ▶ is left alone),
   and optionally pseudo-localize text to test expansion. */
/* Status glyphs written into screen text become the status icons: "✓ " good (green
   tick), "▲ " warning (yellow triangle with "!"), "■ " error or stop (filled red circle
   with white X). Ink stamps (recorded, emergency) keep their glyphs. */
const STATUS_GLYPH = { '✓': 'ok', '▲': 'warn', '■': 'error' };
function statusIcons(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const ns = [];
  while (w.nextNode()) if (/[✓▲■] /.test(w.currentNode.nodeValue)) ns.push(w.currentNode);
  ns.forEach(n => {
    const el = n.parentElement; if (!el || el.closest('.b-rec, .b-emerg, [data-noloc], .gantt, .strip, script, style')) return;
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/([✓▲■] )/).forEach(part => {
      const st = STATUS_GLYPH[part[0]];
      if (st && part.length === 2) { const i = document.createElement('span'); i.className = 'si'; i.dataset.status = st; i.setAttribute('aria-hidden', 'true'); frag.append(i, document.createTextNode(' ')); }
      else if (part) frag.append(document.createTextNode(part));
    });
    n.replaceWith(frag);
  });
}
function postProcess(frame) {
  if (!frame) return;
  statusIcons(frame);
  const walk = fn => { const w = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT); const ns = []; while (w.nextNode()) ns.push(w.currentNode); ns.forEach(fn); };
  walk(n => {
    const el = n.parentElement; if (!el || el.closest('[data-noloc]')) return;
    const rtl = el.closest('[dir]').getAttribute('dir') === 'rtl';
    if (rtl && /[←→]/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/[←→]/g, c => c === '←' ? '→' : '←');
  });
  if (App.pseudo) {
    const map = { a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', A: 'Å', E: 'É', I: 'Î', O: 'Ø', U: 'Ü', S: 'Š', C: 'Ç' };
    walk(n => {
      const el = n.parentElement; if (!el || el.closest('[data-noloc]') || !/[A-Za-z]{2,}/.test(n.nodeValue)) return;
      const v = n.nodeValue.trim(); if (!v) return;
      const pad = '~'.repeat(Math.ceil(v.length * 0.4));
      n.nodeValue = n.nodeValue.replace(v, '[' + v.replace(/[A-Za-z]/g, c => map[c] || c) + pad + ']');
    });
  }
}
function frameDir() { const f = frameEl(); return f ? f.getAttribute('dir') : 'ltr'; }

/* Hold-to-confirm: a destructive step for the worker app and kiosk that needs no typing,
   no Latin keyboard and no reading of a confirmation word. Hold 1.5 s (finger, Space or Enter). */
function holdConfirm({ title, body, btn, onOk }) {
  const o = overlay(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="hct"><h3 id="hct">${title}</h3><p>${body}</p>
    <button class="holdbtn" data-x="hold" aria-describedby="hh"><span class="fill"></span><span>${btn}</span></button>
    <div id="hh" class="age" style="margin-top:8px;text-align:center">${tr('hold')}</div>
    <div class="acts"><button class="btn" data-x="cancel">${tr('cancel')}</button></div></div>`);
  const b = $('[data-x=hold]', o), fill = $('.fill', b);
  let t0 = 0, raf = 0;
  const step = ts => { if (!t0) t0 = ts; const p = Math.min(1, (ts - t0) / 1500); fill.style.width = (p * 100) + '%'; b.classList.toggle('full', p > .5); if (p >= 1) { raf = 0; closeOverlay(); onOk && onOk(); return; } raf = requestAnimationFrame(step); };
  const start = e => { e.preventDefault(); if (raf) return; t0 = 0; raf = requestAnimationFrame(step); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; fill.style.width = '0'; b.classList.remove('full'); };
  b.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
  b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
  b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  $('[data-x=cancel]', o).onclick = closeOverlay;
  $('[data-x=cancel]', o).focus();
}

function fit() {
  const stage = $('#stage'), inner = $('#inner'), frame = $('#frame');
  if (!inner || !frame) return;
  const pad = 56;
  const sc = Math.min(1, (stage.clientWidth - pad) / frame.offsetWidth, (stage.clientHeight - pad) / frame.offsetHeight);
  App.scale = sc;
  inner.style.transform = `translate(-50%, -50%) scale(${sc})`;
}
window.addEventListener('resize', fit);

/* ───────── overlays ───────── */
function frameEl() { return $('#frame'); }
function isMobile() { const s = SCREENS[App.route]; return s && (s.device === 'site' || s.device === 'worker'); }
function overlay(html, bottom) {
  closeMenus();
  const o = document.createElement('div');
  o.className = 'overlay' + (bottom ? ' bottom' : '');
  o.innerHTML = html;
  statusIcons(o);
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(); });
  frameEl().appendChild(o);
  return o;
}
function closeOverlay() { $$('#frame .overlay').forEach(o => o.remove()); }
function closeMenus() { $$('#frame .menu').forEach(m => m.remove()); }

function confirmModal({ title, body, word = 'CONFIRM', verb = 'to delete', btn = 'Delete', danger = true, focusInput = false, onOk }) {
  const id = 'cf' + Date.now();
  const o = overlay(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}h">
    <h3 id="${id}h">${title}</h3><p>${body}</p>
    <label for="${id}">Type ${word} ${verb}</label>
    <input id="${id}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="${id}e">
    <div id="${id}e" class="age" aria-live="polite" style="margin-top:4px"></div>
    <div class="acts"><button class="btn" data-x="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'solid'}" data-x="ok" disabled>${btn}</button></div>
  </div>`, false);
  const inp = $('input', o), ok = $('[data-x=ok]', o), cancel = $('[data-x=cancel]', o), hint = $('#' + id + 'e', o);
  inp.addEventListener('input', () => {
    ok.disabled = inp.value !== word;
    hint.textContent = inp.value && inp.value !== word && word.startsWith(inp.value.toUpperCase()) ? '' : (inp.value && inp.value !== word ? `Type exactly ${word}` : '');
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
  cancel.onclick = closeOverlay;
  ok.onclick = () => { closeOverlay(); onOk && onOk(); };
  (focusInput ? inp : cancel).focus();
}

function sheet(title, html) {
  const o = overlay(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><div class="grab"><b>${title}</b><button class="iconbtn" data-x="close" aria-label="Close">✕</button></div>${html}</div>`, true);
  $('[data-x=close]', o).onclick = closeOverlay;
  $('[data-x=close]', o).focus();
  return o;
}
function dialog(title, html) {
  if (isMobile()) return sheet(title, html);
  const o = overlay(`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="between" style="margin-bottom:16px"><h3 style="margin:0">${title}</h3><button class="iconbtn" data-x="close" aria-label="Close">✕</button></div>${html}</div>`);
  $('[data-x=close]', o).onclick = closeOverlay;
  $('[data-x=close]', o).focus();
  return o;
}

function menu(anchor, items, heading) {
  closeMenus();
  const fr = frameEl(); if (!fr) return;
  const a = anchor.getBoundingClientRect(), f = fr.getBoundingClientRect(), sc = App.scale, bw = fr.clientLeft;
  const m = document.createElement('div');
  m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = (heading ? `<div class="mh">${heading}</div>` : '') + items.map((it, i) => `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-i="${i}">${it.checked ? '✓ ' : ''}${it.label}</button>`).join('');
  m.style.top = ((a.bottom - f.top) / sc - bw + 4) + 'px';
  const right = (f.right - a.right) / sc - bw;
  if ((a.left - f.left) / sc > 300) m.style.right = right + 'px'; else m.style.left = ((a.left - f.left) / sc - bw) + 'px';
  fr.appendChild(m);
  $$('button', m).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const it = items[+b.dataset.i]; closeMenus();
    if (it.go) go(it.go, it.v);
    else if (it.v) go(App.route, it.v);
    else if (it.fn) it.fn();
    else toast(it.msg || it.label + ' · not in this prototype');
  });
  $('button', m).focus();
}

let toastT;
function toast(msg, undo) {
  const fr = frameEl(); if (!fr) return;
  $$('.toast', fr).forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  t.innerHTML = `<span>${msg}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) $('button', t).onclick = () => { t.remove(); undo(); };
  fr.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), undo ? 8000 : 3000);
}

/* ───────── actions ───────── */
const ACT = {
  squad: el => { App.sel.squad = el.dataset.id; refresh(); },
  toast: el => toast(el.dataset.msg || 'Not in this prototype'),
  filter: el => menu(el, (App.lastR.filters || []).map(f => typeof f === 'string' ? { label: f, fn: () => toast('Filter: ' + f) } : f), 'Filter'),
  overflow: el => menu(el, App.lastR.overflow || [], 'More'),
  why: el => {
    const w = WHY[el.dataset.key]; if (!w) return;
    if (!isMobile()) return; // desktop: tooltip on hover / focus
    sheet('Why this?', whyHtml(w));
  },
  discard: el => { const k = el.dataset.key; App.f['discard.' + k] = true; refresh(); toast('AI suggestion discarded · kept in history', () => { delete App.f['discard.' + k]; refresh(); }); },
  undiscard: el => { delete App.f['discard.' + el.dataset.key]; refresh(); },
  retry: () => { go(App.route, 'default'); setTimeout(() => toast('Updated just now'), 50); },
  'me-sheet': () => {
    const o = sheet('Me · role on this phone', `<p class="p" style="margin-bottom:16px">Your role sets which actions appear. In production this comes from your sign-in.</p>
      <div class="form">${Object.entries(ROLES).map(([k, r]) => `<label class="opt"><input type="radio" name="role" value="${k}" ${App.role === k ? 'checked' : ''}> ${r.label}</label>`).join('')}</div>`);
    $$('input', o).forEach(i => i.onchange = () => { App.role = i.value; closeOverlay(); refresh(); toast('Role: ' + ROLES[i.value].label); });
  },
  shortcuts: () => showShortcuts(),
};
function runAct(name, el, e) {
  const s = SCREENS[App.route];
  const fn = (s && s.actions && s.actions[name]) || ACT[name];
  if (fn) fn(el, e);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.menu') && !e.target.closest('[data-act=filter],[data-act=overflow],[data-act=rowmenu]')) closeMenus();
  const t = e.target.closest('[data-go],[data-act],[data-variant],[data-role]');
  if (!t || t.disabled) return;
  if (t.dataset.variant) { go(App.route, t.dataset.variant); return; }
  if (t.dataset.role) { App.role = t.dataset.role; refresh(); return; }
  if (t.dataset.act) { runAct(t.dataset.act, t, e); if (!t.dataset.go) return; }
  if (t.dataset.go) { if (t.dataset.prefill) App.f.prefill = t.dataset.prefill; go(t.dataset.go, t.dataset.v); }
});

/* keyboard (§1.7): J/K rows, Enter open, / search, ? help, G then M */
let gPending = 0;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#frame .overlay')) closeOverlay(); else closeMenus(); return; }
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
  const s = SCREENS[App.route];
  if (!s || s.device !== 'web' || $('#frame .overlay')) return;
  const k = e.key.toLowerCase();
  if (k === 'j' || k === 'k') {
    const rows = $$('#frame .col button.row, #frame .col .row button.iconbtn').filter(r => r.classList.contains('row'));
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement);
    const n = k === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    rows[n].focus(); e.preventDefault();
  } else if (e.key === '?') { showShortcuts(); }
  else if (e.key === '/') { const inp = $('#frame .composer input') || $('#frame [data-act=filter]'); if (inp) { inp.focus(); if (inp.tagName === 'BUTTON') inp.click(); e.preventDefault(); } }
  else if (k === 'g') { gPending = Date.now(); }
  else if (gPending && Date.now() - gPending < 1200) {
    const map = { m: 'w1', h: 'w2', p: 'w3', c: 'w4', w: 'w5', r: 'w6', a: 'w7', s: 'w8', b: 'w9' };
    gPending = 0; if (map[k]) go(map[k]);
  } else if (s.keys && s.keys[k]) { s.keys[k](e); }
});
function showShortcuts() {
  dialog('Keyboard shortcuts', `<table class="t"><tbody>
    <tr><td><b>J</b> / <b>K</b></td><td>Next / previous row</td></tr>
    <tr><td><b>Enter</b></td><td>Open the focused row</td></tr>
    <tr><td><b>/</b></td><td>Search or filter</td></tr>
    <tr><td><b>G</b> then <b>M</b></td><td>Go to Squad Monitoring</td></tr>
    <tr><td><b>G</b> then <b>H / P / C / W / R / A / S / B</b></td><td>Heat · Protective · Crew · Work/rest · Restart · Ask · System · Branding</td></tr>
    <tr><td><b>A</b></td><td>Crew & workshop: add focused worker to a seat</td></tr>
    <tr><td><b>← →</b></td><td>Work/rest plan: move the time cursor one minute</td></tr>
    <tr><td><b>?</b></td><td>This list</td></tr>
    <tr><td><b>Esc</b></td><td>Close dialog or menu</td></tr></tbody></table>`);
}

/* swipe-to-complete for site rows (M1) — the button inside the row is the non-swipe path */
function enableSwipe(onDone) {
  $$('#frame [data-swipe]').forEach(el => {
    let x0 = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (x0 === null) return; const sgn = frameDir() === 'rtl' ? -1 : 1; const dx = Math.max(0, sgn * (e.clientX - x0) / App.scale); el.style.transform = `translateX(${sgn * Math.min(dx, 160)}px)`; });
    const end = e => { if (x0 === null) return; const dx = (frameDir() === 'rtl' ? -1 : 1) * (e.clientX - x0) / App.scale; x0 = null; el.style.transform = ''; if (dx > 110) onDone(el.dataset.swipe); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; });
  });
}

/* Time-axis direction in RTL layouts. Default: time follows the layout (right to left),
   as Datawrapper, Wikimedia and PatternFly do for Arabic, Persian and Hebrew. Practice is
   split (much Arabic news media keeps left to right), so the panel can force LTR for testing. */
function timeDir() { return App.timeLtr ? ' dir="ltr"' : ''; }
