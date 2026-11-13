/* Worker app · Health Reporting · P1–P8 (spec §5) and Shelter kiosk K1 (spec §6) */

const LANGS = [['en', 'English', 'ltr'], ['ar', 'العربية', 'rtl'], ['ml', 'മലയാളം', 'ltr'], ['bn', 'বাংলা', 'ltr'], ['hi', 'हिन्दी', 'ltr'], ['ur', 'اردو', 'rtl'], ['tl', 'Tagalog', 'ltr']];
function langBtn() { const l = LANGS.find(x => x[0] === (App.f.lang || 'en')); return `<button class="iconbtn" style="width:auto;padding:0 8px;font-size:12px" data-act="lang" aria-label="Language: ${l[1]}">${l[0].toUpperCase()} ▾</button>`; }
const LANG_ACT = {
  lang: el => menu(el, LANGS.map(([c, n, d]) => ({ label: n, checked: (App.f.lang || 'en') === c, fn: () => { App.f.lang = c; refresh(); toast(`${n}${d === 'rtl' ? ' · right to left' : ''} · fixed templates use reviewed translations`); } })), 'Language'),
};

/* ───────── P1 · Welcome and consent ───────── */
const CONSENT = [
  ['checkins', 'Check-ins', 'Tell us how you feel', 'Your answers go to you and occupational health only.'],
  ['hr', 'Heart rate', 'From the wearable', 'Used on this phone to warn you early. Not sent to your supervisor.'],
  ['skin', 'Skin temperature', 'From the wearable', 'Used on this phone to warn you early. Not sent to your supervisor.'],
];
screen('p1', {
  device: 'worker', name: 'Welcome and consent', short: 'Welcome', clock: '07:30',
  persona: 'Leila (C09), first day on the app.', context: 'Own phone, in the site induction room or shelter.',
  job: 'Choose a language and decide what to share, without pressure.',
  error: { text: "Couldn't save. Your choices are kept on this phone.", nostale: true },
  render() {
    const c = App.f.consent || (App.f.consent = {});
    const cards = CONSENT.map(([k, t, s]) => `<div class="ccard"><div class="top"><b>${t}</b><button class="toggle ${c[k] ? 'on' : ''}" role="switch" aria-checked="${!!c[k]}" aria-label="${t}" data-act="tog" data-id="${k}"></button></div><span>${s}</span></div>`).join('');
    return {
      noTabs: true,
      nav: { title: 'Welcome', clock: '07:30', leftHtml: `<button class="iconbtn" disabled aria-label="Back">←</button>`, },
      navRight: langBtn(),
      heroReplace: `<div class="mhero" role="group" aria-label="Choose what to share">${cards}</div>`,
      body: [
        `<div style="border:1px solid var(--ink);padding:16px;font-size:18px;line-height:1.4"><b>What your supervisor sees:</b> only “needs rest now”. Never your answers or body data.<div style="margin-top:8px"><button class="audio" data-act="toast" data-msg="▶ Reading aloud in your language">▶ Read aloud</button></div></div>`,
        section('Your choices', list(CONSENT.map(([k, t, , d]) => row({ t, d, b: c[k] ? B.plain('On') : B.muted('Off'), act: 'tog', id: k })))),
        `<div class="note">Alerts and the stop-work notice work even if everything is off.</div>`,
        `<div class="computed">You can change these any time in Me → My data.</div>`,
      ],
      cta: { label: 'Save my choices', act: 'save' },
    };
  },
  actions: { ...LANG_ACT, tog: el => { const c = App.f.consent; c[el.dataset.id] = !c[el.dataset.id]; refresh(); }, save: () => { go('p2'); setTimeout(() => toast('Choices saved'), 50); } },
});

/* ───────── P2 · Now ───────── */
screen('p2', {
  device: 'worker', tab: 'now', name: 'Now (home)', short: 'Now', clock: '08:04',
  persona: 'Rana (C05).', context: 'Phone glanced at in the trench or the shelter, one-handed.',
  job: 'Know in 3 seconds whether to keep working, rest or act.',
  empty: { text: 'You’re not on a shift today. When your supervisor adds you to a crew, your plan appears here.' },
  errorLabel: 'Offline (P7)',
  error: { text: 'No network · warnings come from the rules on this phone. Check-ins will send later.', info: true, nostale: true, noretry: true },
  render() {
    const off = App.variant === 'error';
    const age = off ? ' <span class="age">· 12 min old</span>' : '';
    return {
      offline: off,
      nav: { title: 'Now · 08:04', clock: '08:04' },
      navRight: `<span class="age" style="font-weight:700">${off ? 'No network' : '● Online'}</span>`,
      hero: [metric('Your status', 'In recovery', 'Shelter A' + age, true), metric('Heat now', '145 W/m²', 'Low zone · heavy work stopped' + age), metric('Next', 'Work 08:11', 'workshop')],
      body: [
        off ? `<div class="statusline">2 check-ins waiting to send <span class="age" style="margin-left:auto">SMS fallback offered after 10 min</span></div>` : '',
        section('Messages', list([
          row({ t: '💧 Drink water', d: 'One cup now. Next reminder 08:19.', b: B.plain('Reminder') }),
          row({ t: 'Stop-work · 08:01', d: 'Heavy work has stopped. Go to Shelter A.', b: B.stop(), go: 'p3' }),
          row({ t: 'Shelter A check-in', d: 'Checked in 08:04 · recovery clock started.', b: B.done(), go: 'p6' }),
          row({ t: 'Your plan for this hour', d: 'Workshop 08:11–08:26, then rest.', b: B.plan('Plan'), go: 'p5' }),
        ])),
        `<div class="computed">⚙ Computed · status and heat come from the site rules</div>`,
      ],
      cta: { label: 'I feel unwell', go: 'p4', red: false },
    };
  },
});

/* ───────── P3 · Alert ───────── */
const ALERT_TXT = {
  en: ['Heavy work has stopped. Go to Shelter A now. Drink water. Tell your supervisor if you feel unwell.', 'ltr'],
  ar: ['توقف العمل الثقيل. اذهب إلى الملجأ A الآن. اشرب الماء. أخبر مشرفك إذا شعرت بتوعك.', 'rtl'],
  ur: ['بھاری کام بند ہو گیا ہے۔ ابھی شیلٹر A جائیں۔ پانی پئیں۔ طبیعت خراب ہو تو اپنے سپروائزر کو بتائیں۔', 'rtl'],
};
screen('p3', {
  device: 'worker', name: 'Alert (full screen)', short: 'Alert', clock: '08:01',
  persona: 'Any affected worker.', context: 'Phone buzzing in a pocket, in heat.', job: 'Understand the instruction instantly and act.',
  alt: { emergency: 'Emergency', arabic: 'Arabic (RTL)' },
  errorLabel: 'Offline',
  error: { text: 'From the rules on this phone · no network', info: true, nostale: true, noretry: true },
  render({ v }) {
    const em = v === 'emergency';
    const lang = v === 'arabic' ? 'ar' : (App.f.alertEn ? 'en' : (ALERT_TXT[App.f.lang] ? App.f.lang : 'en'));
    const [txt, dir] = ALERT_TXT[lang];
    return {
      noTabs: true,
      nav: { title: em ? 'Emergency · 08:18' : 'Stop-work · 08:01', clock: em ? '08:18' : '08:01', leftHtml: `<button class="iconbtn" style="width:56px;height:56px" data-go="p2" aria-label="Dismiss">✕</button>` },
      overflow: [{ label: App.f.alertEn ? 'Show in my language' : 'Show in English', fn: () => { App.f.alertEn = !App.f.alertEn; refresh(); } }],
      heroReplace: em
        ? `<div class="statement black" style="min-height:360px"><div class="big" style="font-size:28px">✚ Help is coming. Stay with someone and do not walk alone. Your supervisor has been told to call 998.</div><div class="pictos"><span>✚<small>Help</small></span><span>👥<small>Stay</small></span><span>✆<small>998</small></span></div></div>`
        : `<div class="statement red" style="min-height:360px"><div class="big" lang="${lang}" dir="${dir}" style="font-size:28px;${dir === 'rtl' ? "font-family:'Noto Sans Arabic','DM Sans',sans-serif;line-height:1.6" : ''}">${txt}</div><div class="pictos" aria-hidden="true"><span>■<small>Stop</small></span><span>⌂<small>Shelter</small></span><span>💧<small>Water</small></span></div></div>`,
      body: [
        `<div class="note">${App.variant === 'error' ? 'From the rules on this phone' : 'Fixed safety instruction · reviewed translation'}</div>`,
        `<div class="p">${em ? 'Source: red-flag answer · ⚙ Escalation rule' : 'Source: Sandline heat plan · TWL 145 at 08:00'}</div>`,
        `<button class="audio" data-act="toast" data-msg="▶ Playing spoken alert">▶ Play aloud</button>`,
      ],
      cta: em ? { label: 'I’m with someone', act: 'ackem' } : { label: 'I’m going to Shelter A', act: 'ack' },
    };
  },
  actions: { ack: () => { go('p2'); setTimeout(() => toast('Acknowledged · 08:01'), 50); }, ackem: () => toast('Your supervisor has been told you are with someone') },
});

/* ───────── P4 · Check in ───────── */
screen('p4', {
  device: 'worker', tab: 'check', name: 'Check in (voice and tap)', short: 'Check in', clock: '08:18',
  persona: 'Bilal (C08), feeling unwell at 08:18.', context: 'Phone, standing in the workshop, possibly dizzy.',
  job: 'Report how he feels in his own language in under 15 seconds.',
  alt: { typed: 'Typed fallback' },
  empty: { text: 'Tell us how you feel any time. Only you and occupational health can read your answers.', cta: 'Start check-in', go: 'p4' },
  error: { text: 'No network. Your check-in is saved and will send when the network returns. If you feel very unwell, tell your supervisor now.', nostale: true },
  render({ v }) {
    const st = App.f.p4 || 0;
    const typed = v === 'typed';
    const turns = [];
    if (st >= 1) {
      turns.push(App.f.p4tap ? `<div class="turn me"><small>You · 08:18 · tap</small>I feel unwell</div>` : `<div class="turn me"><small>You · voice note</small>🎙 0:09 · “I’m feeling unwell.”<div class="age">transcribed and translated · audio not kept</div></div>`);
      turns.push(`<div class="turn sys"><small>Heat-Safe · ⚙ Rule</small>Your supervisor has been asked to help you rest now. They see the action, not your words.</div>`);
      turns.push(`<div class="turn sys"><small>Fixed question · reviewed translation</small><b>Are you confused, have you vomited, or have you stopped sweating?</b></div>`);
    }
    if (st >= 2) turns.push(`<div class="turn me"><small>You</small>No</div>`);
    let hero;
    if (st === 0) hero = `<div style="padding:24px 16px;border-bottom:1px solid var(--ink);display:flex;flex-direction:column;gap:16px">
        ${typed ? `<form class="composer" onsubmit="event.preventDefault();runAct('typed')"><input aria-label="How do you feel?" placeholder="How do you feel?" autocomplete="off"><button class="btn solid" style="min-height:56px">Send</button></form>`
        : `<button class="ptt" id="ptt" aria-label="Hold and speak"><span class="ic" aria-hidden="true">🎙</span>Hold and speak</button>`}
        <div class="taps"><button class="btn" data-act="tap">🤒 I feel unwell</button><button class="btn" data-act="water">💧 I need water</button><button class="btn" data-act="ok">✓ I’m OK</button></div>
        ${typed ? '' : `<button class="link" data-variant="typed" style="align-self:center">Type instead</button>`}</div>`;
    const body = [section('Conversation', `<div style="display:flex;flex-direction:column;gap:8px">${turns.join('') || '<p class="p muted">Hold the button and say how you feel, or tap an answer.</p>'}</div>`)];
    if (st === 1) body.push(`<div class="taps"><button class="btn" data-act="no" style="justify-content:center">No</button><button class="btn" data-act="yes" style="justify-content:center">Yes, one of these</button></div>`);
    if (st >= 2) body.push(aiBlock({ key: 'p4', agent: 'Worker Aid Agent', title: 'What we understood', conf: 'Medium', text: '<b>Feeling unwell · 08:18</b><br>No red flags.', tools: ['transcribe_and_translate', 'extract_symptoms'], inputs: ['Transcript: “I’m feeling unwell.” (Malayalam → English)', 'Fields: symptom = feeling unwell; time = 08:18; red flags = none', 'Medium: voice in a noisy workshop'], acts: [{ l: 'Fix this', act: 'fix' }, { l: 'Discard and try again', act: 'restart' }] }), `<div class="computed">⚙ Rule · the escalation itself is not AI</div>`);
    return {
      nav: { title: 'Check in · 08:18', back: 'p2', clock: '08:18' }, navRight: langBtn(),
      heroReplace: hero || '', body,
      cta: st >= 2 ? (App.f.p4sent ? { label: '✓ Sent 08:18', disabled: true, note: 'Huda sees “needs rest now” only.' } : { label: 'Send to my supervisor', act: 'send' }) : null,
      mount() {
        const b = $('#ptt'); if (!b) return;
        b.addEventListener('pointerdown', () => { b.classList.add('rec'); b.lastChild.textContent = 'Listening… release to send'; });
        const up = () => { if (!b.classList.contains('rec')) return; App.f.p4 = 1; App.f.p4tap = false; refresh(); };
        b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
        b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.f.p4 = 1; refresh(); } });
      },
    };
  },
  actions: {
    ...LANG_ACT,
    tap: () => { App.f.p4 = 1; App.f.p4tap = true; refresh(); },
    typed: () => { App.f.p4 = 1; App.f.p4tap = true; go('p4'); },
    water: () => toast('Water request sent · Huda will bring water'),
    ok: () => toast('Thanks · next check-in reminder 09:00'),
    no: () => { App.f.p4 = 2; refresh(); },
    yes: () => { App.f.p4 = 0; go('p3', 'emergency'); },
    send: () => { App.f.p4sent = true; refresh(); toast('Sent · Huda sees “needs rest now” only'); },
    fix: () => sheet('Fix what we understood', `<form class="form"><div class="fl"><label for="sy">How you feel</label><select id="sy"><option>Feeling unwell</option><option>Dizzy</option><option>Headache</option><option>Cramps</option></select></div><div class="fl"><label for="tm">Time</label><input id="tm" value="08:18"></div><button type="button" class="cta" onclick="closeOverlay();toast('Updated')">Save</button></form>`),
    restart: () => { App.f.p4 = 0; App.f.p4sent = false; refresh(); toast('Discarded · try again'); },
  },
});

/* ───────── P5 · My plan ───────── */
screen('p5', {
  device: 'worker', tab: 'plan', name: 'My plan', short: 'My plan', clock: '08:12',
  persona: 'Rana.', context: 'Phone.', job: 'Know when she works and when she rests.',
  alt: { updated: 'Updated after replan' },
  empty: { text: 'No plan yet. Your supervisor sends it when the shift is planned.' },
  error: { text: 'No network · showing your plan from 08:11 (7 min old).' },
  render({ v }) {
    const iv = [['Workshop preparation', '08:11–08:26 · 15 min.', 'w'], ['Cooled recovery', '08:26–08:41 · Shelter A.', 'r'], ['Workshop preparation', '08:41–08:56 · 15 min.', 'w'], ['Cooled recovery', '08:56–09:11 · Shelter A.', 'r']];
    return {
      nav: { title: 'My plan · today', back: 'p2', clock: '08:12' },
      filters: ['Today', 'Tomorrow'],
      hero: [metric('Now', 'Workshop', 'until 08:26', true), metric('Next rest', '08:26–08:41', 'Shelter A'), metric('Work today', '30 min', 'planned this hour')],
      body: [
        v === 'updated' ? `<div class="statusline">Updated 08:18 by Huda</div>` : '',
        section('This hour', list(iv.map(([t, d, k]) => row({ t, d, b: k === 'w' ? B.plan('Work') : B.plain('Rest'), static: true })))),
        section('Later today', `<div class="hatch" style="border:1px solid var(--ink);padding:16px"><span style="font-weight:700;font-size:16px">🔒 12:30–15:00 · no outdoor work (MoHRE)</span></div>`),
        `<div class="computed">Only your own times are shown.</div>`,
      ],
      cta: App.f.p5rest ? { label: '✓ Resting since 08:26', disabled: true } : { label: 'Start my rest', act: 'rest', note: 'Appears 2 minutes before each rest and checks you in.' },
    };
  },
  actions: { rest: () => { App.f.p5rest = true; refresh(); toast('Checked in at Shelter A · rest started 08:26'); } },
});

/* ───────── P6 · Shelter check-in ───────── */
screen('p6', {
  device: 'worker', tab: 'now', name: 'Shelter check-in', short: 'Shelter check-in', clock: '08:04',
  persona: 'Any worker arriving at Shelter A.', context: 'Phone near the kiosk’s NFC tag or QR code.', job: 'Check in with one tap.',
  empty: { text: 'Hold your phone near the Shelter A sign.' },
  error: { text: 'Saved on this phone · will send', nostale: true },
  render() {
    const done = App.f.p6;
    return {
      nav: { title: 'Check in · Shelter A', back: 'p2', clock: '08:04' },
      heroReplace: `<div style="padding:24px 16px;border-bottom:1px solid var(--ink)"><div class="nfc ${done ? 'ok' : ''}" style="height:280px;font-size:20px"><div class="ring" style="width:120px;height:120px;font-size:48px">${done ? '✓' : '⌁'}</div>${done ? 'Checked in · 08:04' : 'Hold near the Shelter A sign<small>or scan the QR code</small>'}</div></div>`,
      body: [section('Your last check-ins', list([
        ...(done ? [row({ t: 'Shelter A · 08:04', d: 'Recovery clock started. Counts toward the headcount.', b: B.done(), static: true })] : []),
        row({ t: 'Shelter A · 3 Aug 10:40', d: 'Recovery 20 min.', b: B.done(), static: true }),
      ]))],
      cta: done ? { label: 'Back to Now', go: 'p2' } : { label: 'Check in at Shelter A', act: 'ci' },
    };
  },
  actions: { ci: () => { App.f.p6 = true; refresh(); toast('Checked in · 08:04'); } },
});

/* ───────── P7 · Offline state (alias to P2 offline) ───────── */
screen('p7', { device: 'worker', name: 'Offline state (across P2–P6)', alias: 'p2', aliasV: 'error' });

/* ───────── P8 · Me: privacy and my data ───────── */
screen('p8', {
  device: 'worker', tab: 'me', name: 'Me: privacy and my data', short: 'My data', clock: '17:10',
  persona: 'Leila.', context: 'Phone, at rest.', job: 'See and control what is shared.',
  empty: { text: 'You haven’t shared anything yet.' },
  render() {
    const c = App.f.consent || (App.f.consent = { checkins: true });
    const withdrawn = App.f.p8withdrawn;
    return {
      nav: { title: 'My data', back: 'p2', clock: '17:10' },
      filters: ['All', 'Check-ins', 'Wearable', 'Audit'],
      overflow: [{ label: 'Withdraw consent and delete my check-ins…', danger: true, fn: () => confirmModal({ title: 'Withdraw consent and delete my check-ins?', body: 'Your supervisor will still get heat alerts for your crew.', btn: 'Withdraw and delete', verb: 'to delete', onOk: () => { App.f.p8withdrawn = true; App.f.consent = {}; refresh(); toast('Consent withdrawn · 3 check-ins deleted'); } }) }],
      hero: [metric('Shared with supervisor', 'Actions only', 'never answers or body data', true), metric('Check-ins stored', withdrawn ? '0' : '3', 'kept 30 days'), metric('Wearable', c.hr ? 'On' : 'Off', 'not paired')],
      body: [
        section('Consent', list(CONSENT.map(([k, t]) => `<div class="row static nolead"><span><span class="t" style="display:block">${t}</span><span class="d">${c[k] ? 'You agreed 4 Aug 07:30. Withdraw any time.' : 'Off.'}</span></span><span class="rt"><button class="toggle ${c[k] ? 'on' : ''}" role="switch" aria-checked="${!!c[k]}" aria-label="${t}" data-act="tog" data-id="${k}"></button></span></div>`))),
        section('Stored check-ins', withdrawn ? '<p class="p muted">None.</p>' : list([
          row({ t: '4 Aug · 08:18', d: 'Feeling unwell · no red flags.', b: B.ai('AI summary'), static: true }),
          row({ t: '3 Aug · 10:40', d: 'I’m OK.', b: B.plain('Tap'), static: true }),
          row({ t: '2 Aug · 09:05', d: 'I need water.', b: B.plain('Tap'), static: true }),
        ])),
        section('Who opened my records', list([row({ t: 'Occupational health nurse', d: '4 Aug · 08:25', b: B.plain('Viewed'), static: true })])),
        section('Wearable', list([row({ t: 'Not paired', d: 'Pair a wearable to get early warnings on this phone.', b: B.muted('Off'), act: 'toast' })])),
      ],
      cta: { label: 'Download my data', act: 'toast', msg: 'Your data is ready · heat-safe-leila.zip' },
    };
  },
  actions: { tog: el => { const c = App.f.consent; c[el.dataset.id] = !c[el.dataset.id]; refresh(); toast(c[el.dataset.id] ? 'Turned on' : 'Withdrawn · takes effect now'); } },
});

/* ───────── K1 · Shelter A kiosk ───────── */
screen('k1', {
  device: 'kiosk', name: 'Shelter A check-in', short: 'Kiosk', clock: '08:04',
  persona: 'Every affected worker, arriving hot.', context: 'Landscape tablet at chest height with an NFC reader, in shade. Used standing, often gloved.',
  job: 'Check in within 3 seconds, without reading.',
  selfVariants: true,
  alt: { success: 'Tap success', nobadge: 'Check in without badge' },
  empty: { text: '' },
  render({ v }) {
    const empty = v === 'empty', err = v === 'error';
    const ok = v === 'success' || App.f.k1ok;
    const arrived = empty ? [] : AFFECTED;
    const hero = `<div class="hero">${metric('In shelter', String(arrived.length), 'Shelter A', true)}${metric('Water', 'Cooler full', 'checked 07:55')}${metric('Next work', '08:11', 'workshop (4)')}</div>`;
    const arr = arrived.length ? arrived.map((k, i) => `<div class="arr">${av(k)}<span><b>${PEOPLE[k].n}</b>08:0${i < 4 ? 3 : 4}</span></div>`).join('') : `<div class="arr" style="grid-column:1/-1;justify-content:center;padding:24px;font-size:16px">No one checked in yet. Tap your badge here.</div>`;
    const nfc = ok
      ? `<div class="nfc ok" role="status" aria-live="assertive">${av(App.f.k1who || 'leila')}<div class="ring">✓</div>${PEOPLE[App.f.k1who || 'leila'].n}<small>Checked in · 08:04</small></div>`
      : `<button class="nfc" data-act="tap" aria-label="Tap your badge"><div class="ring">⌁</div>Tap your badge<small>Hold your badge on the reader</small></button>`;
    const full = `<div class="kh"><span>Shelter A · 08:04</span><span style="display:flex;gap:16px;align-items:center"><small>Dune Civil Works · kiosk locked</small><button class="iconbtn" data-act="admin" aria-label="Supervisor menu">⋯</button></span></div>
      ${err ? bannerHtml({ text: 'Network down · check-ins saved on this kiosk (3 waiting)', retry: 'Retry sync (supervisor PIN)' }) : ''}
      <div class="khero">${hero}</div>
      <div class="kbody">${nfc}<div style="display:flex;flex-direction:column;gap:8px;min-height:0"><div class="h3">Arrivals</div><div class="arrivals">${arr}</div></div></div>
      <div class="kfoot"><button class="cta" data-act="nobadge">Check in without badge</button></div>`;
    return {
      full,
      mount() { if (v === 'nobadge') setTimeout(() => runAct('nobadge'), 0); },
    };
  },
  actions: {
    tap: () => { App.f.k1ok = true; App.f.k1who = 'leila'; refresh(); toast('✓ Sound + haptic'); setTimeout(() => { App.f.k1ok = false; if (App.route === 'k1') refresh(); }, 2000); },
    retry: () => {
      const o = dialog('Supervisor PIN', `<form class="form" id="pin"><div class="fl"><label for="pn">PIN</label><input id="pn" type="password" inputmode="numeric" autocomplete="off"></div><button class="cta">Retry sync</button></form>`);
      $('#pin', o).onsubmit = e => { e.preventDefault(); closeOverlay(); go('k1'); setTimeout(() => toast('Synced 3 check-ins'), 50); };
    },
    nobadge: () => {
      const o = dialog('Check in without badge', `<p class="p" style="margin-bottom:16px">Tap your name.</p><div class="picker">${AFFECTED.map(k => `<button data-k="${k}">${PEOPLE[k].n}</button>`).join('')}</div>`);
      o.querySelector('.modal').style.width = '820px';
      $$('[data-k]', o).forEach(b => b.onclick = () => { closeOverlay(); App.f.k1ok = true; App.f.k1who = b.dataset.k; refresh(); setTimeout(() => { App.f.k1ok = false; if (App.route === 'k1') refresh(); }, 2000); });
    },
    admin: el => menu(el, [{ label: 'Clear kiosk buffer…', danger: true, fn: () => confirmModal({ title: 'Clear the kiosk buffer?', body: 'Supervisor PIN accepted. 3 unsynced check-ins will be deleted from this kiosk and will not reach the headcount.', btn: 'Clear', verb: 'to clear', onOk: () => toast('Buffer cleared') }) }], 'Supervisor'),
  },
});
