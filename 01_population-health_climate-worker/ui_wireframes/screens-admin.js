/* Organisation admin · W9 company branding (design system §25, brand.js).
   The admin edits a draft. Previews render the draft under data-brand-surface="*-draft";
   the live chrome keeps the published brand until Noura publishes. */

function w9Draft() { if (!App.brandDraft) App.brandDraft = HSBrand.normalise(App.brand); return App.brandDraft; }
function w9Dirty() { return JSON.stringify(HSBrand.normalise(w9Draft())) !== JSON.stringify(App.brand); }
const W9_STAMP = { pass: ['b-green', '✓ Pass'], adjusted: ['', '↕ Adjusted'], restricted: ['', '◧ Mark only'], off: ['b-wait', '– Off'], enforced: ['b-rec', '■ Enforced'] };

function w9Bar(res, product, strip) {
  const name = res.cfg.org || res.cfg.wordmark || 'Company name';
  return `<div class="brandbar ${strip ? 'brandbar--strip' : ''}">${HSBrand.markHtml(res)}<span class="brandbar__text"><span class="brandbar__name">${esc(name)}</span><span class="brandbar__product">${esc(product)}</span></span></div>`;
}
function w9Previews(res) {
  const head = res.cfg.mobile.header;
  const web = t => `<figure><figcaption>Platform · ${t === 'night' ? 'Night shift' : 'Day'}</figcaption>
    <div class="pv pv-web" data-theme="${t}" data-brand-surface="platform-draft" inert>
      <div class="pv-rail">${w9Bar(res, 'Heat-Safe Crew')}<div class="pv-nav on"><span class="marker">◫</span>Squad Monitoring</div><div class="pv-nav"><span class="marker">1</span>Heat controls</div><div class="pv-nav"><span class="marker">2</span>Protective response</div></div>
      <div class="pv-main"><div class="pv-title">Squad Monitoring<small>08:18 · rules v2026.11.07-1</small></div>
        <div class="pv-body"><div class="flex">${band('low')}${B.hold('Hold')}</div><button class="cta" style="min-height:32px;font-size:12px">Mark action done</button></div></div>
    </div></figure>`;
  const phone = (t, safety) => `<figure><figcaption>Mobile web · ${safety ? 'Stop-work alert' : t === 'night' ? 'Night shift' : 'Glare (field default)'}</figcaption>
    <div class="pv pv-phone" data-theme="${t}" data-brand-surface="mobile-draft" inert>
      <div class="statusbar themebar ${safety ? 'is-safety' : ''}"><span>08:0${safety ? 1 : 4}</span><span>${esc(res.cfg.mobile.shortName || 'Heat-Safe')}</span><span>4G</span></div>
      ${!safety && head === 'strip' ? w9Bar(res, 'Heat-Safe · Health Reporting', true) : ''}
      ${safety ? `<div class="statement red"><div class="big">■ Stop heavy work. Go to Shelter A now.</div><div class="src">Sandline heat plan · TWL 145</div></div>`
        : `<div class="pv-title" style="text-align:center">Now<small>08:04 · Online</small></div><div class="pv-body"><div class="flex">${band('low')}${B.hold('Stopped')}</div></div>`}
      <div class="pv-body" style="margin-top:auto"><button class="cta">${safety ? 'Going to Shelter A' : 'I feel unwell'}</button></div>
    </div></figure>`;
  const m = res.surfaces.mobile.themes;
  const sw = (h, l) => `<span class="swatchrow"><span class="sw" style="background:${h}"></span>${l} <code>${h}</code></span>`;
  const install = `<figure><figcaption>Mobile web · install and launch</figcaption>
    <div class="pv pv-install" data-theme="day" data-brand-surface="mobile-draft" inert>${HSBrand.markHtml(res)}<b style="font-size:14px">${esc(res.cfg.mobile.appName || 'Heat-Safe')}</b>
      <span class="age">Home-screen name: ${esc(res.cfg.mobile.shortName || 'Heat-Safe')}</span>
      <div style="display:grid;gap:4px;justify-items:start;margin-top:8px">${sw(m.day.theme, 'theme-color')}${sw(m.glare.theme, 'glare')}${sw(m.night.theme, 'dark')}</div></div></figure>`;
  return web('day') + web('night') + install + phone('glare') + phone('night') + phone('glare', true);
}
function w9Checks(res) {
  return list(res.checks.map(c => {
    const [cls, w] = W9_STAMP[c.status];
    const lead = `<span class="marker" title="${c.surface === 'platform' ? 'Platform' : c.surface === 'mobile' ? 'Mobile web' : 'Both surfaces'}">${c.surface === 'platform' ? 'P' : c.surface === 'mobile' ? 'M' : '·'}</span>`;
    return row({ lead, t: c.label, d: c.detail, b: badge(w, cls), static: true, cls: c.status === 'restricted' ? 'sel' : '' });
  }));
}
function w9Summary(res) {
  const n = s => res.checks.filter(c => c.status === s).length;
  return `${n('pass')} pass · ${n('adjusted')} adjusted · ${n('restricted')} mark only`;
}
function w9BarLabel(res, sk) {
  const s = res.surfaces[sk];
  if (!s.source) return { v: 'Paper', q: s.why || 'Logo mark only' };
  return { v: `${s.source === 'primary' ? 'Primary' : 'Secondary'}`, q: `${res.cfg[s.source]} · ${s.why || 'clear of the signals'}` };
}
function w9Seg(name, cur, opts) {
  return `<div class="seg" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-act="w9set" data-id="${name}" data-v2="${v}">${l}</button>`).join('')}</div>`;
}
function w9RiskHint(res, k) {
  if (!res.cfg[k]) return 'Optional';
  return res.risk[k].ok ? '✓ Clear of the signal colours' : `■ ${res.risk[k].reason} · logo mark only`;
}
function w9Hero(res) {
  const d = res.cfg, dirty = w9Dirty();
  const pv = w9BarLabel(res, 'platform'), mv = w9BarLabel(res, 'mobile');
  return [
    metric('Draft', dirty ? 'Not published' : 'Matches live', dirty ? `${w9Summary(res)} · previews below show the draft` : 'Supervisor screens, phones and the kiosk show this brand', dirty ? true : ''),
    metric('Platform bar', pv.v, pv.q),
    metric('Mobile web bar', d.mobile.header === 'off' ? 'Off' : mv.v, d.mobile.header === 'off' ? 'Header style is off' : mv.q),
  ];
}
function w9State() {
  const meta = App.brandMeta;
  return w9Dirty() ? badge('◇ Draft · not published', 'b-wait') : meta ? B.rec(`Published · ${meta.by} ${meta.at}`) : B.plain('Published');
}
function w9Cta() {
  const label = 'Publish to platform and mobile web';
  if (!w9Dirty()) return { label, disabled: true, note: 'Nothing to publish. Change the draft first.' };
  if (App.role !== 'admin') return { label, disabled: true, note: 'Only an organisation admin can publish. Switch role to Noura in the left panel.' };
  return { label, act: 'w9publish' };
}
/* Live update while typing or dragging a picker: no full re-render, so focus and clicks survive. */
function w9Live() {
  const res = HSBrand.resolve(w9Draft());
  HSBrand.apply(res, 'hs-brand-draft', '-draft');
  const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  set('#w9prev', w9Previews(res));
  set('#w9checks', w9Checks(res));
  set('#w9sum', w9Summary(res));
  set('#w9state', w9State());
  set('#frame .hero', w9Hero(res).join(''));
  set('#frame .dfoot', ctaHtml(w9Cta()));
  set('#w9ini', esc(res.initials));
  set('#w9mark', HSBrand.markHtml(res, 'brandmark--lg'));
  set('#w9p-h', w9RiskHint(res, 'primary'));
  set('#w9s-h', w9RiskHint(res, 'secondary'));
  return res;
}

screen('w9', {
  device: 'web', name: 'Organisation branding', short: 'Branding', clock: '16:40',
  persona: 'Noura, Sandline HSE systems admin. Supervisors see the result; only an organisation admin can publish.',
  context: 'Desktop, at onboarding and whenever the company refreshes its brand.',
  job: 'Put the company’s colours on the platform and the mobile web apps without weakening any safety signal.',
  alt: { mobile: 'Mobile web settings' },
  empty: { text: 'No company palette yet. Every surface uses Heat-Safe paper and ink until you add one.', cta: 'Start with an example palette', act: 'w9example' },
  error: { text: "■ Couldn't save the draft to Heat-Safe in 20 seconds. Your changes are kept on this device.", nostale: true },
  render({ v }) {
    const d = w9Draft();
    const res = HSBrand.resolve(d);
    const surf = v === 'mobile' ? 'mobile' : 'platform';
    const dirty = w9Dirty();
    const colour = (id, label, val, hint) => `<div class="bfield"><label for="${id}">${label}</label><div class="colour"><input type="color" id="${id}c" value="${val || '#14120F'}" aria-label="Pick ${label.toLowerCase()}"><input type="text" id="${id}" value="${val}" placeholder="#RRGGBB" spellcheck="false" autocomplete="off" aria-describedby="${id}-h"></div><span class="hint" id="${id}-h" aria-live="polite">${hint}</span></div>`;
    const riskHint = k => w9RiskHint(res, k);
    const presets = Object.entries(HSBrand.PRESETS).map(([k, p]) => `<button class="chip" data-act="w9preset" data-id="${k}">${p.label}</button>`).join('');
    const palette = `<div class="bform">
      <div class="bfield"><label for="w9org">Company name</label><input type="text" id="w9org" value="${esc(d.org)}" autocomplete="organization"><span class="hint">Shown on the brand bar above “Heat-Safe Crew”</span></div>
      <div class="bfield"><label for="w9word">Short name</label><input type="text" id="w9word" value="${esc(d.wordmark)}" maxlength="16"><span class="hint">Mark initials: <b id="w9ini">${esc(res.initials)}</b></span></div>
      ${colour('w9p', 'Primary colour', d.primary, riskHint('primary'))}
      ${colour('w9s', 'Secondary colour', d.secondary, riskHint('secondary'))}
      <div class="bfield full"><span class="lbl">Logo</span><div class="logodrop"><span id="w9mark" data-brand-surface="platform-draft" style="display:contents">${HSBrand.markHtml(res, 'brandmark--lg')}</span><label class="btn" for="w9logo">${d.logo ? 'Replace logo' : 'Upload logo'}</label><input type="file" id="w9logo" accept="image/svg+xml,image/png" style="position:absolute;left:-9999px">${d.logo ? '<button class="btn" data-act="w9nologo">Remove</button>' : ''}<span class="hint">SVG or PNG on a transparent background, at least 512 px. Without a logo the mark shows the initials on the primary colour.</span></div></div>
      <div class="bfield full"><span class="lbl">Load an example (fictional)</span><div class="variants">${presets}</div></div>
    </div>`;
    const surfTabs = `<div class="seg" role="tablist" aria-label="Surface"><button role="tab" aria-selected="${surf === 'platform'}" class="${surf === 'platform' ? 'on' : ''}" data-variant="default">Platform · supervisor web</button><button role="tab" aria-selected="${surf === 'mobile'}" class="${surf === 'mobile' ? 'on' : ''}" data-variant="mobile">Mobile web · site, worker, kiosk</button></div>`;
    const barOpts = [['auto', 'Auto'], ['primary', 'Primary'], ['secondary', 'Secondary'], ['none', 'Off']];
    const settings = surf === 'platform'
      ? list([
        row({ t: 'Brand bar colour', d: 'Fills the rail head on every supervisor screen. Auto uses the primary colour, or the secondary when the primary reads as a safety signal.', b: w9Seg('platform.bar', d.platform.bar, barOpts), static: true }),
        row({ t: 'Tint the rail', d: 'A faint wash of the brand hue on the rail and sheet surfaces. Turned off automatically when it would look like the cool tracing paper used for AI drafts. Glare stays white.', b: `<button class="toggle ${d.platform.tint ? 'on' : ''}" role="switch" aria-checked="${!!d.platform.tint}" aria-label="Tint the rail" data-act="w9tint"></button>`, static: true }),
        row({ t: 'PDF exports', d: 'Shift log and audit report headers carry the logo mark and company name. Content pages stay ink on paper.', b: B.plain('Follows platform'), static: true }),
      ])
      : list([
        row({ t: 'Brand bar colour', d: 'Feeds the identity strip and the browser theme colour. Same fallback rules as the platform.', b: w9Seg('mobile.bar', d.mobile.bar, barOpts), static: true }),
        row({ t: 'Header style', d: 'Strip: a 32px line with the logo mark and company name above the title block. Browser colour only: no strip, more room for the sheet. Off: no brand colour at all.', b: w9Seg('mobile.header', d.mobile.header, [['strip', 'Strip'], ['browser', 'Browser'], ['off', 'Off']]), static: true }),
      ]) + `<div class="bform" style="margin:16px 0"><div class="bfield"><label for="w9app">Installed app name</label><input type="text" id="w9app" value="${esc(d.mobile.appName)}"><span class="hint">Install prompt and app switcher</span></div><div class="bfield"><label for="w9short">Home-screen name</label><input type="text" id="w9short" value="${esc(d.mobile.shortName)}" maxlength="12"><span class="hint">12 characters or fewer, so it isn’t cut off under the icon</span></div></div>` + list([
        row({ t: 'Stop-work and emergency screens', d: 'The strip disappears and the browser colour turns ink while a statement is on screen. Workers must never wonder whether red is the logo.', b: B.rec('Enforced'), static: true }),
        row({ t: 'Shelter kiosk', d: 'Follows mobile web. Kiosk mode has no browser bar, so only the strip applies.', b: B.plain('Follows mobile web'), static: true }),
      ]);
    const where = `<table class="t"><thead><tr><th>Slot</th><th>Platform</th><th>Mobile web</th></tr></thead><tbody>
      <tr><td><b>Brand bar</b></td><td>Rail head, company name over “Heat-Safe Crew”</td><td>32px strip above the title block</td></tr>
      <tr><td><b>Logo mark</b></td><td>Rail head and PDF export headers</td><td>Strip, install icon, launch screen</td></tr>
      <tr><td><b>Browser colour</b></td><td>Not used: desktop browsers ignore it</td><td><code>theme-color</code> for the status bar and toolbar</td></tr>
      <tr><td><b>Chrome tint</b></td><td>Optional, on the rail and sheet surfaces</td><td>Not offered: glare is the field default and turns tints white</td></tr>
      <tr><td><b>Never branded</b></td><td colspan="2">Stamps, bands, holds, statements, buttons, links, focus rings, charts, timelines and AI drafts. Those colours belong to the safety signals.</td></tr>
      </tbody></table>`;
    return {
      nav: { title: 'Organisation branding · ' + (d.org || 'Heat-Safe default'), back: 'w1', clock: '16:40' },
      overflow: [
        { label: 'Export brand tokens (CSS)', fn: () => dialog('Brand tokens · CSS', `<pre class="code">${esc(HSBrand.css(HSBrand.resolve(w9Draft())))}</pre>`) },
        { label: 'Export web app manifest (JSON)', fn: () => dialog('Web app manifest · mobile web', `<pre class="code">${esc(JSON.stringify(HSBrand.manifest(HSBrand.resolve(w9Draft())), null, 2))}</pre>`) },
        ...(dirty ? [{ label: 'Discard draft changes', fn: () => { const prev = App.brandDraft; App.brandDraft = null; refresh(); toast('Draft discarded', () => { App.brandDraft = prev; refresh(); }); } }] : []),
        { label: 'Reset to Heat-Safe default…', danger: true, fn: () => confirmModal({ title: 'Reset the draft to Heat-Safe paper and ink?', body: 'Clears the palette, logo and names from the draft. Nothing changes for users until you publish.', word: 'RESET', verb: 'to clear the draft', btn: 'Reset draft', onOk: () => { App.brandDraft = HSBrand.normalise({}); refresh(); toast('Draft reset · publish to apply'); } }) },
      ],
      hero: w9Hero(res),
      body: [
        section('1 · Company palette', palette),
        section('2 · Surfaces', `<div style="margin-bottom:16px">${surfTabs}</div>${settings}`, 'Set separately: the desk and the phone have different constraints'),
        section('3 · Preview · draft', `<div class="previews" id="w9prev">${w9Previews(res)}</div>`, 'Each light setting, with contrast fitted by brand.js'),
        section('Where the brand appears', where),
      ],
      detail: `<div class="between"><h2 class="h2">Checks</h2><span id="w9state">${w9State()}</span></div>
        <p class="p muted" id="w9sum">${w9Summary(res)}</p>
        <div id="w9checks" class="checks">${w9Checks(res)}</div>
        <div class="note">Colours that read as Stop, Caution or Safe, or that are almost identical to a signal, are kept to the logo mark. Lightness is adjusted for contrast; hue is never changed.</div>`,
      cta: w9Cta(),
      mount() {
        HSBrand.apply(res, 'hs-brand-draft', '-draft');
        const text = (id, set) => { const el = $('#' + id); if (!el) return; el.addEventListener('input', () => { set(el.value); w9Live(); }); };
        text('w9org', v => { d.org = v; });
        text('w9word', v => { d.wordmark = v; });
        text('w9app', v => { d.mobile.appName = v; });
        text('w9short', v => { d.mobile.shortName = v; });
        ['p', 's'].forEach(k => {
          const key = k === 'p' ? 'primary' : 'secondary', t = $('#w9' + k), c = $('#w9' + k + 'c');
          t.addEventListener('input', () => { const rgb = HSBrand.parse(t.value); d[key] = rgb ? HSBrand.toHex(rgb) : ''; if (rgb) c.value = d[key]; w9Live(); });
          c.addEventListener('input', () => { d[key] = c.value.toUpperCase(); t.value = d[key]; w9Live(); });
        });
        const logo = $('#w9logo');
        logo.addEventListener('change', () => {
          const f = logo.files[0]; if (!f) return;
          if (f.size > 300 * 1024) { toast('Logo is over 300 KB · use an SVG or a smaller PNG'); return; }
          const rd = new FileReader(); rd.onload = () => { d.logo = rd.result; refresh(); toast('Logo added to the draft'); }; rd.readAsDataURL(f);
        });
      },
    };
  },
  actions: {
    w9set: el => { const [surf, key] = el.dataset.id.split('.'); w9Draft()[surf][key] = el.dataset.v2; refresh(); },
    w9tint: () => { const d = w9Draft(); d.platform.tint = !d.platform.tint; refresh(); },
    w9nologo: () => { w9Draft().logo = ''; refresh(); },
    w9preset: el => { const p = HSBrand.PRESETS[el.dataset.id]; const logo = w9Draft().logo; App.brandDraft = HSBrand.normalise({ ...p.cfg, logo: el.dataset.id === 'default' ? '' : logo }); refresh(); if (p.note) toast(p.note); },
    w9example: () => { App.brandDraft = HSBrand.normalise(HSBrand.PRESETS.sandline.cfg); go('w9'); },
    w9publish: () => confirmModal({
      title: `Publish branding for ${w9Draft().org || 'Heat-Safe default'}?`,
      body: 'Every supervisor screen, site phone, worker phone and the shelter kiosk picks it up on next load. Safety statements stay unbranded.',
      word: 'PUBLISH', verb: 'to publish', btn: 'Publish', danger: false,
      onOk: () => {
        const prev = App.brand, prevMeta = App.brandMeta;
        publishBrand(w9Draft(), { by: 'Noura', at: '16:41' });
        App.brandDraft = null; refresh();
        toast('Published · 16:41 · live on web, phones and kiosk', () => { publishBrand(prev); App.brandMeta = prevMeta; App.brandDraft = null; refresh(); });
      },
    }),
  },
});

/* ───────── Account: your crew photo (W10 web · M9 site · P9 worker) ─────────
   Everyone can add or replace their own photo; only they can. The photo is cropped to a
   square and shrunk to 256px on the device. In these wireframes it is kept in this browser
   (ui_design_system/people.js); the app stores it on the server (PUT /api/people/me/photo). */
function accountBody(key, worker) {
  const p = PEOPLE[key];
  const id = photoId(key);
  const uploaded = HSPeople.isUploaded(id);
  const issued = HSPeople.hasBundled(id);
  const L = k => worker ? t(k) : (STR.en[k] || k);
  const status = App.f.photoMsg || (uploaded ? L('acct.yours') : issued ? L('acct.issued') : L('acct.none'));
  const upload = `<div class="photo-upload" id="photoBox">
      ${HSPeople.avatar(id, { size: 'xl' })}
      <div style="display:grid;gap:8px;min-width:0">
        <div><div class="h2" style="margin:0">${HSPeople.name(id)}</div><div class="p muted">${p.role} · ${id}</div></div>
        <div class="acts">
          <label class="btn solid" for="photoFile">${L(uploaded || issued ? 'acct.replace' : 'acct.upload')}</label>
          <input id="photoFile" type="file" accept="image/jpeg,image/png,image/webp">
          ${uploaded ? `<button class="btn" data-act="photoRemove">${L(issued ? 'acct.useissued' : 'acct.remove')}</button>` : ''}
        </div>
        <div class="p" role="status" aria-live="polite" id="photoStatus">${status}</div>
      </div>
      <p class="pnote">${L('acct.note')}</p>
    </div>`;
  const preview = section(L('acct.where'), list([
    row({ lead: av(key), t: `${p.n} · ${p.role}`, d: L('acct.where.row'), b: B.done('Recorded'), static: true }),
  ]));
  return [upload, preview, `<p class="p muted">${L('acct.private')}</p>`];
}
function accountMount(key) {
  const box = $('#photoBox'), file = $('#photoFile'); if (!box || !file) return;
  const id = photoId(key);
  const take = async picked => {
    App.f.photoMsg = '…';
    try { HSPeople.setPhoto(id, await HSPeople.resize(picked)); App.f.photoMsg = '✓ ' + (SCREENS[App.route].device === 'worker' ? t('acct.saved') : STR.en['acct.saved']); }
    catch (e) { App.f.photoMsg = '■ ' + e.message; }
    refresh();
  };
  file.addEventListener('change', () => { if (file.files[0]) take(file.files[0]); });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('is-dragover'); });
  box.addEventListener('dragleave', () => box.classList.remove('is-dragover'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('is-dragover'); if (e.dataTransfer.files[0]) take(e.dataTransfer.files[0]); });
}
const ACCOUNT_ACTIONS = key => ({
  photoRemove: () => { HSPeople.clearPhoto(photoId(key())); App.f.photoMsg = ''; refresh(); toast('Photo removed', null); },
});
const ACCOUNT_DEF = {
  persona: 'Everyone with a Heat-Safe sign-in: workers, foremen, safety officers, first aiders, supervisors.',
  context: 'Any time. Most people add a photo on their first day, or when their crew can’t put a face to the name.',
  job: 'Add or replace my own crew photo so people recognise me next to my name in every list.',
  noError: true,
};
screen('w10', { ...ACCOUNT_DEF, device: 'web', name: 'My account · crew photo', short: 'My account', clock: '16:45',
  render() { const k = ROLES[App.role].who; return { nav: { title: 'My account' }, body: accountBody(k, false) }; },
  mount() { accountMount(ROLES[App.role].who); },
  actions: ACCOUNT_ACTIONS(() => ROLES[App.role].who),
});
screen('m9', { ...ACCOUNT_DEF, device: 'site', tab: 'me', name: 'Me · my account and photo', short: 'My account', clock: '16:45',
  render() { const k = ROLES[App.role].who; return { nav: { title: 'My account', leftHtml: ' ' }, overflow: [{ label: 'Switch role on this phone', fn: () => ACT['me-sheet']() }], body: accountBody(k, false) }; },
  mount() { accountMount(ROLES[App.role].who); },
  actions: ACCOUNT_ACTIONS(() => ROLES[App.role].who),
});
screen('p9', { ...ACCOUNT_DEF, device: 'worker', tab: 'me', name: 'Me: my photo', short: 'My photo', clock: '17:12',
  render() { return { nav: { title: t('acct.title'), back: 'p8' }, navRight: langBtn(), body: accountBody('rana', true) }; },
  mount() { accountMount('rana'); },
  actions: { ...LANG_ACT, ...ACCOUNT_ACTIONS(() => 'rana') },
});

/* ───────── W11 · Site setup ─────────
   Which sensors sit with which squads and locations on the site. A plan of the site,
   then the same facts as tables. Each squad's zone is outlined in its section tone. */
const ZONES = [
  { id: 'trench', l: 'Civil trench', squad: 'civil', kind: 'Exposed', x: 20, y: 150, w: 210, h: 90 },
  { id: 'deck', l: 'Podium deck', squad: 'form', kind: 'Exposed · partial shade', x: 250, y: 40, w: 200, h: 110 },
  { id: 'yard', l: 'Laydown yard', squad: 'steel', kind: 'Exposed', x: 470, y: 150, w: 210, h: 120 },
  { id: 'l2', l: 'Level 2 interior', squad: 'mep', kind: 'Covered', x: 250, y: 170, w: 200, h: 100 },
  { id: 'wshop', l: 'Workshop', squad: '', kind: 'Covered · 6 places', x: 20, y: 40, w: 120, h: 80 },
  { id: 'sa', l: 'Shelter A', squad: 'civil', kind: 'Cooled recovery · 14 places', x: 150, y: 40, w: 80, h: 80, shelter: true },
  { id: 'sb', l: 'Shelter B', squad: 'form,steel,mep', kind: 'Cooled recovery · 20 places', x: 470, y: 40, w: 120, h: 90, shelter: true },
];
const PINS = { t1: [120, 200], t2: [350, 90], t3: [600, 215], m1: [350, 225], bs1: [660, 70], bs2: [660, 255], k1: [190, 95], k2: [530, 95] };
const TONE_OF = { civil: 1, form: 2, steel: 3, mep: 4 };
function sitePlan(sel) {
  const zone = z => { const t = TONE_OF[z.squad] ? `var(--tone-${TONE_OF[z.squad]}-rule)` : 'var(--ink)';
    return `<g><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${z.shelter ? 'var(--sheet)' : 'var(--paper)'}" stroke="${t}" stroke-width="${z.squad && !z.squad.includes(',') ? 3 : 1.5}" ${z.kind.startsWith('Covered') ? '' : ''}/><text x="${z.x + 8}" y="${z.y + 18}" font-size="12" font-weight="700" fill="var(--ink)">${z.l}</text><text x="${z.x + 8}" y="${z.y + 33}" font-size="10" fill="var(--muted)">${z.kind}</text></g>`; };
  const pin = sn => { const [x, y] = PINS[sn.id]; const on = sel === sn.id;
    return `<g class="pin" data-act="sensor" data-id="${sn.id}" role="button" tabindex="0" aria-label="${sn.id.toUpperCase()} · ${sn.type} · ${sn.loc}"><circle cx="${x}" cy="${y}" r="${on ? 13 : 11}" fill="${sn.off ? 'var(--band-red)' : 'var(--ink)'}" stroke="var(--paper)" stroke-width="2"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--paper)">${sn.id.toUpperCase()}</text>${on ? `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="var(--ink)" stroke-width="2"/>` : ''}</g>`; };
  return `<svg class="siteplan" viewBox="0 0 700 290" role="group" aria-label="Site plan, Sandline–Dune, Mussafah">
    <rect x="1" y="1" width="698" height="288" fill="none" stroke="var(--ink)" stroke-width="2"/>
    <text x="690" y="284" text-anchor="end" font-size="10" fill="var(--muted)">Site cabin · gate ↘</text>
    ${ZONES.map(zone).join('')}${SENSORS.map(pin).join('')}</svg>
    <div class="flex" style="font-size:12px;gap:16px;margin-top:8px">${SQUADS.map(q => `<span class="flex" style="gap:6px"><i class="tone-key" style="border-color:var(--tone-${TONE_OF[q.id]}-rule)"></i>${q.name}</span>`).join('')}<span class="flex" style="gap:6px"><i class="pin-key"></i>Sensor or base station · red = offline</span></div>`;
}
screen('w11', {
  device: 'web', name: 'Site setup', short: 'Site setup', clock: '07:30',
  persona: 'Noura (HSE systems admin) and Maya, with each foreman.', context: 'Desktop, before the shift and whenever a sensor or squad moves.',
  job: 'See which sensors cover which squads and locations, and fix gaps before work starts.',
  render() {
    const sel = App.sel.w11 || 't1';
    const sn = SENSORS.find(x => x.id === sel);
    const sqName = ids => ids ? ids.split(',').map(i => squad(i).name).join(', ') : '—';
    const squadsTbl = `<table class="t"><thead><tr><th>Squad</th><th>Foreman</th><th>Location</th><th>Recovery</th><th>Sensors</th><th>Workers</th></tr></thead><tbody>
      ${SQUADS.map(q => `<tr><td><b>${q.name}</b></td><td>${av(q.foreman, { size: 'xs' })} ${who(q.foreman)}</td><td>${q.loc}</td><td>${q.shelter}</td><td>${SENSORS.filter(x => x.squad.split(',').includes(q.id)).map(x => x.id.toUpperCase()).join(', ')}</td><td>${q.size}</td></tr>`).join('')}</tbody></table>`;
    const sensorsTbl = `<table class="t"><thead><tr><th>Sensor</th><th>Type</th><th>Location</th><th>Squad</th><th>Relay</th><th>Status</th></tr></thead><tbody>
      ${SENSORS.map(x => `<tr class="${x.id === sel ? 'on' : ''}" data-act="sensor" data-id="${x.id}" tabindex="0"><td><b>${x.id.toUpperCase()}</b></td><td>${x.type}</td><td>${x.loc}</td><td>${sqName(x.squad)}</td><td>${x.relay}</td><td>${x.off ? '■ ' : '✓ '}${x.status}</td></tr>`).join('')}</tbody></table>`;
    const locs = list(ZONES.map(z => row({ t: z.l, d: `${z.kind} · ${z.squad ? sqName(z.squad) : 'Shared · workshop preparation'}`, b: B.plain(SENSORS.filter(x => x.loc === z.l).map(x => x.id.toUpperCase()).join(', ') || 'No sensor'), static: true })));
    return {
      nav: { title: 'Site setup · Sandline–Dune, Mussafah', back: 'w1', clock: '07:30' },
      overflow: [{ label: 'Import crew roster (CSV)' }, { label: 'Export site setup' }],
      body: [
        section('Site plan', sitePlan(sel), 'Select a sensor'),
        section('Squads and locations', squadsTbl),
        section('Sensors', sensorsTbl, `${SENSORS.filter(x => x.off).length} offline`),
        section('Locations', locs),
      ],
      detail: `<h2 class="h2">${sn.id.toUpperCase()} · ${sn.type}</h2><div>${sn.off ? B.red('Offline') : B.done('Live')}</div>
        <dl class="kv"><dt>Location</dt><dd>${sn.loc}</dd><dt>Squads</dt><dd>${sqName(sn.squad)}</dd><dt>Relay</dt><dd>${sn.relay}</dd><dt>Status</dt><dd>${sn.status}</dd></dl>
        ${sn.off ? `<div class="statusline signal">■ No heartbeat since 07:52. Squads it covers fall back to the forecast and their band rises one level.</div>` : ''}
        <div class="flex"><button class="btn" data-act="toast" data-msg="Move ${sn.id.toUpperCase()} · not in this prototype">Move to another location</button><button class="btn" data-act="toast" data-msg="Reassign ${sn.id.toUpperCase()} · not in this prototype">Change squads</button></div>`,
      cta: { label: 'Add a sensor', act: 'toast', msg: 'Add sensor · pair a device by its QR code (not in this prototype)' },
    };
  },
  actions: { sensor: el => { App.sel.w11 = el.dataset.id; refresh(); } },
});
