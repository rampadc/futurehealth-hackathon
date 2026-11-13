/* Worker app · Health Reporting · P1–P8 (spec §5) and Shelter kiosk K1 (spec §6).
   Every worker-facing string goes through t() (i18n.js); the frame carries lang and dir. */

/* A globe icon, not a two-letter code or a flag: it reads the same in every script. */
function langBtn() { const L = LANG[curLang()]; return `<button class="iconbtn" style="width:56px;height:56px;font-size:22px" data-act="lang" aria-label="Language: ${L.n} (${L.e})">🌐</button>`; }
function setLang(c) { App.f.lang = c; refresh(); }
const LANG_ACT = {
  lang: el => menu(el, LANGS.map(([c, n, e, d, st]) => ({ label: `<span lang="${c}" dir="${d}">${n}</span> <span class="age">· ${e}${st !== 'ready' ? ' · coming soon' : ''}</span>`, checked: curLang() === c, fn: () => setLang(c) })), '🌐'),
};

/* ───────── P1 · Welcome: language first, then consent ───────── */
const CONSENT = [['checkins', 'c.checkins', 'c.checkins.s', 'c.checkins.d'], ['hr', 'c.hr', 'c.wear', 'c.wear.d'], ['skin', 'c.skin', 'c.wear', 'c.wear.d']];
screen('p1', {
  device: 'worker', name: 'Welcome: language, then consent', short: 'Welcome', clock: '07:30',
  persona: 'Leila (C09), first day on the app.', context: 'Own phone, in the site induction room or shelter.',
  job: 'Choose a language and decide what to share, without pressure.',
  defaultLabel: 'Language step', alt: { consent: 'Consent step' },
  error: () => ({ text: "Couldn't save. Your choices are kept on this phone.", nostale: true }),
  render({ v }) {
    if (v !== 'consent') {
      const cur = curLang();
      const btns = LANGS.map(([c, n, e, d, st]) => `<div class="langrow"><button class="langbtn ${cur === c ? 'on' : ''}" data-act="pick" data-id="${c}" ${st !== 'ready' ? 'disabled' : ''} aria-pressed="${cur === c}">
          <span><b lang="${c}" dir="${d}">${n}</b><small>${e}${st !== 'ready' ? ' · ' + t('lang.soon') : ''}</small></span></button>
          ${st === 'ready' ? `<button class="iconbtn" style="width:64px;height:auto" data-act="toast" data-msg="▶ ${n}" aria-label="Hear ${e}">▶</button>` : '<span></span>'}</div>`).join('');
      return {
        noTabs: true,
        nav: { title: t('p1.title'), clock: '07:30', leftHtml: `<span></span>` },
        heroReplace: `<div style="padding:16px;border-bottom:1px solid var(--ink)"><div style="font-size:24px;font-weight:700">${t('lang.choose')}</div><p class="p" style="margin-top:4px">${t('lang.hint')}</p></div>`,
        body: [`<div class="langgrid" role="group" aria-label="Languages">${btns}</div>`, `<div class="computed" lang="en" dir="ltr">Each language is written in its own script so people can find it without reading English. Detected from the phone’s setting; never guessed from name or nationality.</div>`],
        cta: { label: t('next') + ' →', go: 'p1', v: 'consent' },
      };
    }
    const c = App.f.consent || (App.f.consent = {});
    const cards = CONSENT.map(([k, tk, sk]) => `<div class="ccard"><div class="top"><b>${t(tk)}</b><button class="toggle ${c[k] ? 'on' : ''}" role="switch" aria-checked="${!!c[k]}" aria-label="${tt(tk)}" data-act="tog" data-id="${k}"></button></div><span>${t(sk)}</span></div>`).join('');
    return {
      noTabs: true,
      nav: { title: t('p1.title'), clock: '07:30', back: 'p1' },
      navRight: langBtn(),
      heroReplace: `<div class="mhero" role="group" aria-label="${tt('p1.choices')}">${cards}</div>`,
      body: [
        `<div style="border:1px solid var(--ink);padding:16px;font-size:18px">${t('p1.sees')}<div style="margin-top:8px"><button class="audio" data-act="toast" data-msg="▶">▶ ${t('readaloud')}</button></div></div>`,
        section(t('p1.choices'), list(CONSENT.map(([k, tk, , dk]) => row({ t: t(tk), d: t(dk), b: c[k] ? B.plain(t('on')) : B.muted(t('off')), act: 'tog', id: k })))),
        `<div class="note">${t('p1.alerts')}</div>`,
        `<div class="computed">${t('p1.later')}</div>`,
      ],
      cta: { label: t('p1.save'), act: 'save' },
    };
  },
  actions: {
    ...LANG_ACT,
    pick: el => setLang(el.dataset.id),
    tog: el => { const c = App.f.consent; c[el.dataset.id] = !c[el.dataset.id]; refresh(); },
    save: () => { go('p2'); setTimeout(() => toast('✓'), 50); },
  },
});

/* ───────── P2 · Now ───────── */
screen('p2', {
  device: 'worker', tab: 'now', name: 'Now (home)', short: 'Now', clock: '08:04',
  persona: 'Rana (C05).', context: 'Phone glanced at in the trench or the shelter, one-handed.',
  job: 'Know in 3 seconds whether to keep working, rest or act.',
  empty: () => ({ text: t('p2.empty') }),
  errorLabel: 'Offline (P7)',
  error: () => ({ text: t('p2.offline'), info: true, nostale: true, noretry: true }),
  render() {
    const off = App.variant === 'error';
    const age = off ? ' <span class="age">· 12 min</span>' : '';
    const L = curLang();
    const huda = `<div class="msg-orig"><div class="between"><b>${t('p2.huda')}</b><span class="age">08:06</span></div>
        <p class="p" lang="ar" dir="rtl" style="font-size:17px;margin-top:4px">الماء البارد متوفر في الملجأ A. لا تستعجلوا.</p>
        ${L !== 'ar' ? `<div class="msg-mt"><div class="ai-h"><span>◇ AI · ${t('p2.mt')}</span></div><p class="p" style="margin-top:4px">${t('p2.hudaT')}</p></div>` : ''}</div>`;
    return {
      offline: off,
      nav: { title: t('p2.title') + ' · 08:04', clock: '08:04' },
      navRight: `<span class="age" style="font-weight:700">${off ? t('nonet') : '● ' + t('online')}</span>`,
      hero: [metric(t('p2.status'), t('p2.inrec'), t('shelterA') + age, true), metric(t('p2.heat'), '145 W/m²', t('p2.heatq') + age), metric(t('p2.next'), t('p2.nextv'), t('workshop'))],
      body: [
        off ? `<div class="statusline">${t('p2.waiting')}</div>` : '',
        section(t('p2.msgs'), list([
          row({ t: '💧 ' + t('p2.water'), d: t('p2.water.d'), b: B.plain(t('reminder')) }),
          row({ t: t('stopwork') + ' · 08:01', d: t('p2.stop.d'), b: B.stop(t('stopwork')), go: 'p3' }),
          row({ t: t('p2.ci'), d: t('p2.ci.d'), b: B.done(''), go: 'p6' }),
          row({ t: t('p2.plan'), d: t('p2.plan.d'), b: B.plan(t('work')), go: 'p5' }),
        ])),
        huda,
        `<div class="computed">⚙ ${t('p2.computed')}</div>`,
      ],
      cta: { label: t('unwell'), go: 'p4' },
    };
  },
});

/* ───────── P3 · Alert ───────── */
screen('p3', {
  device: 'worker', name: 'Alert (full screen)', short: 'Alert', clock: '08:01',
  persona: 'Any affected worker.', context: 'Phone buzzing in a pocket, in heat.', job: 'Understand the instruction instantly and act.',
  alt: { emergency: 'Emergency' },
  errorLabel: 'Offline',
  error: () => ({ text: t('alert.local'), info: true, nostale: true, noretry: true }),
  render({ v }) {
    const em = v === 'emergency';
    const en = App.f.alertEn;
    const txt = en ? inLang(em ? 'alert.em' : 'alert.stop', 'en') : t(em ? 'alert.em' : 'alert.stop');
    const pic = (ic, k) => `<span>${ic}<small>${t(k)}</small></span>`;
    return {
      noTabs: true,
      nav: { title: (em ? '✚ ' : '■ ') + t('stopwork') + ' · ' + (em ? '08:18' : '08:01'), clock: em ? '08:18' : '08:01', leftHtml: `<button class="iconbtn" style="width:56px;height:56px" data-go="p2" aria-label="Dismiss">✕</button>` },
      overflow: [{ label: en ? `<span lang="${curLang()}">${LANG[curLang()].n}</span>` : 'English', fn: () => { App.f.alertEn = !App.f.alertEn; refresh(); } }],
      heroReplace: `<div class="statement ${em ? 'black' : 'red'}" style="min-height:360px"><div class="big" style="font-size:28px">${em ? '✚ ' : ''}${txt}</div>
        <div class="pictos" aria-hidden="true">${em ? pic('✚', 'pic.help') + pic('👥', 'pic.stay') + pic('✆', 'pic.help').replace(t('pic.help'), '998') : pic('■', 'pic.stop') + pic('⌂', 'pic.shelter') + pic('💧', 'pic.water')}</div></div>`,
      body: [
        `<div class="note">${App.variant === 'error' ? t('alert.local') : t('alert.fixed')}</div>`,
        `<div class="p" lang="en" dir="ltr">${em ? 'Source: red-flag answer · ⚙ Escalation rule' : 'Source: Sandline heat plan · TWL 145 at 08:00'}</div>`,
        `<button class="audio" data-act="toast" data-msg="▶">▶ ${t('play')}</button>`,
      ],
      cta: em ? { label: t('alert.with'), act: 'ackem' } : { label: t('alert.go'), act: 'ack' },
    };
  },
  actions: { ack: () => { go('p2'); setTimeout(() => toast('✓ 08:01'), 50); }, ackem: () => toast('✓') },
});

/* ───────── P4 · Check in ───────── */
screen('p4', {
  device: 'worker', tab: 'check', name: 'Check in (voice and tap)', short: 'Check in', clock: '08:18',
  persona: 'Bilal (C08), feeling unwell at 08:18.', context: 'Phone, standing in the workshop, possibly dizzy.',
  job: 'Report how he feels in his own language in under 15 seconds.',
  alt: { typed: 'Typed fallback' },
  empty: () => ({ text: t('c.checkins.d'), cta: t('p4.title'), go: 'p4' }),
  error: () => ({ text: t('p4.offline'), nostale: true }),
  render({ v }) {
    const st = App.f.p4 || 0;
    const typed = v === 'typed';
    const turns = [];
    if (st >= 1) {
      turns.push(App.f.p4tap ? `<div class="turn me"><small>${t('p4.you')} · 08:18</small>${t('unwell')}</div>` : `<div class="turn me"><small>${t('p4.you')} · 🎙 0:09</small>“${t('unwell')}”<div class="age">${t('p4.vn')}</div></div>`);
      turns.push(`<div class="turn sys"><small>⚙</small>${t('p4.sys')}</div>`);
      turns.push(`<div class="turn sys"><small>${t('p4.fixedq')}</small><b>${t('p4.q')}</b></div>`);
    }
    if (st >= 2) turns.push(`<div class="turn me"><small>${t('p4.you')}</small>${t('no')}</div>`);
    let hero = '';
    if (st === 0) hero = `<div style="padding:24px 16px;border-bottom:1px solid var(--ink);display:flex;flex-direction:column;gap:16px">
        ${typed ? `<form class="composer" onsubmit="event.preventDefault();runAct('typed')"><input dir="auto" aria-label="${tt('p4.typeph')}" placeholder="${tt('p4.typeph')}" autocomplete="off"><button class="btn solid" style="min-height:56px">${t('send')}</button></form>`
        : `<button class="ptt" id="ptt" style="width:112px;height:112px"><span class="ic" aria-hidden="true">🎙</span><span id="pttl">${t('p4.hold')}</span></button>`}
        <div class="taps"><button class="btn" data-act="tap">🤒 ${t('unwell')}</button><button class="btn" data-act="water">💧 ${t('p4.water')}</button><button class="btn" data-act="ok">✓ ${t('p4.ok')}</button></div>
        ${typed ? '' : `<button class="link" data-variant="typed" style="align-self:center">⌨ ${t('p4.type')}</button>`}</div>`;
    const body = [section(t('p4.conv'), `<div style="display:flex;flex-direction:column;gap:8px">${turns.join('') || `<p class="p muted">${t('p4.hint')}</p>`}</div>`)];
    if (st === 1) body.push(`<div class="taps"><button class="btn" data-act="no" style="justify-content:center">${t('no')}</button><button class="btn" data-act="yes" style="justify-content:center">${t('p4.yes')}</button></div>`);
    if (st >= 2) body.push(aiBlock({ key: 'p4', i18n: true, agent: t('ai.agent'), title: t('p4.understood'), conf: 'Medium', text: `<b>${t('p4.unwell')}</b><br>${t('p4.noflags')}`, tools: ['transcribe_and_translate', 'extract_symptoms'], inputs: [`Transcript (${LANG[curLang()].e}): “${tt('unwell')}”`, 'Fields: symptom = feeling unwell; time = 08:18; red flags = none', 'Medium: voice in a noisy workshop'], acts: [{ l: t('p4.fix'), act: 'fix' }, { l: t('p4.retry'), act: 'restart' }] }), `<div class="computed">${t('p4.rule')}</div>`);
    return {
      nav: { title: t('p4.title'), back: 'p2', clock: '08:18' }, navRight: langBtn(),
      heroReplace: hero, body,
      cta: st >= 2 ? (App.f.p4sent ? { label: '✓ ' + t('p4.sent'), disabled: true } : { label: t('p4.send'), act: 'send' }) : null,
      mount() {
        const b = $('#ptt'); if (!b) return;
        b.addEventListener('pointerdown', () => { b.classList.add('rec'); $('#pttl').innerHTML = t('p4.listen'); });
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
    water: () => toast('💧 ✓'),
    ok: () => toast('✓'),
    no: () => { App.f.p4 = 2; refresh(); },
    yes: () => { App.f.p4 = 0; go('p3', 'emergency'); },
    send: () => { App.f.p4sent = true; refresh(); toast('✓ ' + tt('p4.sent')); },
    fix: () => sheet(tt('p4.fix'), `<form class="form"><div class="fl"><label for="sy">${t('p4.understood')}</label><input id="sy" dir="auto" value="${tt('unwell')}"></div><div class="fl"><label for="tm">08:18</label><input id="tm" value="08:18" dir="ltr"></div><button type="button" class="cta" onclick="closeOverlay();toast('✓')">✓</button></form>`),
    restart: () => { App.f.p4 = 0; App.f.p4sent = false; refresh(); },
  },
});

/* ───────── P5 · My plan ───────── */
screen('p5', {
  device: 'worker', tab: 'plan', name: 'My plan', short: 'My plan', clock: '08:12',
  persona: 'Rana.', context: 'Phone.', job: 'Know when she works and when she rests.',
  alt: { updated: 'Updated after replan' },
  empty: () => ({ text: 'No plan yet. Your supervisor sends it when the shift is planned.' }),
  error: () => ({ text: t('p2.offline') }),
  render({ v }) {
    const iv = [['p5.prep', '08:11–08:26 · 15', 'w'], ['p5.rec', '08:26–08:41 · ' + t('shelterA'), 'r'], ['p5.prep', '08:41–08:56 · 15', 'w'], ['p5.rec', '08:56–09:11 · ' + t('shelterA'), 'r']];
    return {
      nav: { title: t('p5.title'), back: 'p2', clock: '08:12' },
      filters: ['Today', 'Tomorrow'],
      hero: [metric(t('p5.now'), t('workshop'), t('p5.until'), true), metric(t('p5.nextrest'), '08:26–08:41', t('shelterA')), metric(t('p5.worktoday'), t('p5.30'))],
      body: [
        v === 'updated' ? `<div class="statusline">${t('p5.upd')}</div>` : '',
        section(t('p5.hour'), list(iv.map(([k, d, w]) => row({ t: t(k), d, b: w === 'w' ? B.plan(t('work')) : B.plain(t('rest')), static: true })))),
        section(t('p5.later'), `<div class="hatch" style="border:1px solid var(--ink);padding:16px"><span style="font-weight:700;font-size:16px">🔒 ${t('p5.midday')}</span></div>`),
        `<div class="computed">${t('p5.own')}</div>`,
      ],
      cta: App.f.p5rest ? { label: '✓ ' + t('p5.resting'), disabled: true } : { label: t('p5.start'), act: 'rest', note: t('p5.startnote') },
    };
  },
  actions: { rest: () => { App.f.p5rest = true; refresh(); toast('✓ ' + tt('p6.done')); } },
});

/* ───────── P6 · Shelter check-in ───────── */
screen('p6', {
  device: 'worker', tab: 'now', name: 'Shelter check-in', short: 'Shelter check-in', clock: '08:04',
  persona: 'Any worker arriving at Shelter A.', context: 'Phone near the kiosk’s NFC tag or QR code.', job: 'Check in with one tap.',
  empty: () => ({ text: t('p6.hold') }),
  error: () => ({ text: t('p2.offline'), nostale: true }),
  render() {
    const done = App.f.p6;
    return {
      nav: { title: t('p6.title'), back: 'p2', clock: '08:04' },
      heroReplace: `<div style="padding:24px 16px;border-bottom:1px solid var(--ink)"><div class="nfc ${done ? 'ok' : ''}" style="height:280px;font-size:20px"><div class="ring" style="width:120px;height:120px;font-size:48px">${done ? '✓' : '⌁'}</div>${done ? t('p6.done') : `${t('p6.hold')}<small>${t('p6.qr')}</small>`}</div></div>`,
      body: [section(t('p6.last'), list([
        ...(done ? [row({ t: t('shelterA') + ' · 08:04', d: t('p2.ci.d'), b: B.done(''), static: true })] : []),
        row({ t: t('shelterA') + ' · ' + fmtDate(new Date(2025, 7, 3, 10, 40)), d: '20 min', b: B.done(''), static: true }),
      ]))],
      cta: done ? { label: t('p6.back'), go: 'p2' } : { label: t('p6.cta'), act: 'ci' },
    };
  },
  actions: { ci: () => { App.f.p6 = true; refresh(); toast('✓ ' + tt('p6.done')); } },
});

/* ───────── P7 · Offline state (alias to P2 offline) ───────── */
screen('p7', { device: 'worker', name: 'Offline state (across P2–P6)', alias: 'p2', aliasV: 'error' });

/* ───────── P8 · Me: privacy and my data ───────── */
screen('p8', {
  device: 'worker', tab: 'me', name: 'Me: privacy and my data', short: 'My data', clock: '17:10',
  persona: 'Leila.', context: 'Phone, at rest.', job: 'See and control what is shared.',
  empty: () => ({ text: t('p8.none') }),
  render() {
    const c = App.f.consent || (App.f.consent = { checkins: true });
    const withdrawn = App.f.p8withdrawn;
    const agreed = fmtDate(new Date(2025, 7, 4, 7, 30));
    return {
      nav: { title: t('p8.title'), back: 'p2', clock: '17:10' }, navRight: langBtn(),
      overflow: [{ label: tt('p8.delete'), danger: true, fn: () => holdConfirm({ title: t('p8.delete') + '?', body: t('p8.deletebody'), btn: t('p8.delete'), onOk: () => { App.f.p8withdrawn = true; App.f.consent = {}; refresh(); toast('✓'); } }) }],
      hero: [metric(t('p8.shared'), t('p8.actions'), '', true), metric(t('p8.stored'), withdrawn ? '0' : '3', t('p8.kept')), metric(t('p8.wear'), c.hr ? t('on') : t('off'), t('p8.notpaired'))],
      body: [
        section(t('p8.consent'), list(CONSENT.map(([k, tk]) => `<div class="row static nolead"><span><span class="t" style="display:block">${t(tk)}</span><span class="d">${c[k] ? t('p8.agreed', { date: agreed }) : t('off')}</span></span><span class="rt"><button class="toggle ${c[k] ? 'on' : ''}" role="switch" aria-checked="${!!c[k]}" aria-label="${tt(tk)}" data-act="tog" data-id="${k}"></button></span></div>`))),
        section(t('p8.stored'), withdrawn ? `<p class="p muted">${t('p8.none')}</p>` : list([
          row({ t: fmtDate(new Date(2025, 7, 4, 8, 18)), d: t('p4.unwell') + ' · ' + t('p4.noflags'), b: B.ai('AI'), static: true }),
          row({ t: fmtDate(new Date(2025, 7, 3, 10, 40)), d: t('p4.ok'), b: B.plain('✓'), static: true }),
          row({ t: fmtDate(new Date(2025, 7, 2, 9, 5)), d: t('p4.water'), b: B.plain('💧'), static: true }),
        ])),
        section(t('p8.who'), list([row({ t: t('p8.nurse'), d: fmtDate(new Date(2025, 7, 4, 8, 25)), b: B.plain('👁'), static: true })])),
        section(t('p8.wear'), list([row({ t: t('p8.notpaired'), d: t('p8.pair'), b: B.muted(t('off')), act: 'toast' })])),
        `<button class="holdbtn" data-act="del" style="margin-top:8px"><span>${t('p8.delete')}</span></button>`,
      ],
      cta: { label: t('p8.download'), act: 'toast', msg: '✓ heat-safe-data.zip' },
    };
  },
  actions: {
    ...LANG_ACT,
    tog: el => { const c = App.f.consent; c[el.dataset.id] = !c[el.dataset.id]; refresh(); },
    del: () => holdConfirm({ title: t('p8.delete') + '?', body: t('p8.deletebody'), btn: t('p8.delete'), onOk: () => { App.f.p8withdrawn = true; App.f.consent = {}; refresh(); toast('✓'); } }),
  },
});

/* ───────── K1 · Shelter A kiosk ─────────
   A shared device: no single language fits, so idle copy is stacked in every ready language
   and pictograms carry the meaning. After a badge tap it greets the worker in their own language. */
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
    const who = App.f.k1who || 'leila';
    const pl = PREF_LANG[who], plOk = LANG[pl] && LANG[pl].st === 'ready' ? pl : 'en';
    const arrived = empty ? [] : AFFECTED;
    const ready = LANGS.filter(l => l[4] === 'ready');
    const hero = `<div class="hero">${metric('In shelter · <span lang="ar">في الملجأ</span>', String(arrived.length), 'Shelter A', true)}${metric('Water · <span lang="ar">ماء</span>', '💧 Cooler full', 'checked 07:55')}${metric('Next work · <span lang="ar">العمل التالي</span>', '08:11', 'workshop (4)')}</div>`;
    const arr = arrived.length ? arrived.map((k, i) => `<div class="arr">${av(k)}<span><b><bdi>${PEOPLE[k].n}</bdi></b>08:0${i < 4 ? 3 : 4}</span></div>`).join('') : `<div class="arr" style="grid-column:1/-1;justify-content:center;padding:24px;font-size:16px">⌁</div>`;
    const nfc = ok
      ? `<div class="nfc ok" role="status" aria-live="assertive">${av(who)}<div class="ring">✓</div><bdi>${PEOPLE[who].n}</bdi><small lang="${plOk}" dir="${LANG[plOk].d}" style="font-size:24px">${t('kiosk.checked', null, plOk)} · 08:04</small></div>`
      : `<button class="nfc" data-act="tap" aria-label="Tap your badge"><div class="ring">⌁</div><div class="kiosk-langs">${ready.map(([c, , , d]) => `<span lang="${c}" dir="${d}">${t('kiosk.tap', null, c)}</span>`).join('')}</div></button>`;
    const full = `<div class="kh"><span>Shelter A · <span lang="ar">الملجأ A</span> · 08:04</span><span style="display:flex;gap:16px;align-items:center"><small>Dune Civil Works · kiosk locked</small><button class="iconbtn" data-act="admin" aria-label="Supervisor menu">⋯</button></span></div>
      ${err ? bannerHtml({ text: 'Network down · check-ins saved on this kiosk (3 waiting)', retry: 'Retry sync (supervisor PIN)' }) : ''}
      <div class="khero">${hero}</div>
      <div class="kbody">${nfc}<div style="display:flex;flex-direction:column;gap:8px;min-height:0"><div class="h3">Arrivals</div><div class="arrivals">${arr}</div></div></div>
      <div class="kfoot"><button class="cta" data-act="nobadge">👤 Check in without badge · <span lang="ar" style="margin-inline-start:8px">بدون بطاقة</span></button></div>`;
    return { full, mount() { if (v === 'nobadge') setTimeout(() => runAct('nobadge'), 0); } };
  },
  actions: {
    tap: () => { App.f.k1ok = true; App.f.k1who = 'leila'; refresh(); toast('✓ Sound + haptic'); setTimeout(() => { App.f.k1ok = false; if (App.route === 'k1') refresh(); }, 2500); },
    retry: () => {
      const o = dialog('Supervisor PIN', `<form class="form" id="pin"><div class="fl"><label for="pn">PIN</label><input id="pn" type="password" inputmode="numeric" autocomplete="off"></div><button class="cta">Retry sync</button></form>`);
      $('#pin', o).onsubmit = e => { e.preventDefault(); closeOverlay(); go('k1'); setTimeout(() => toast('Synced 3 check-ins'), 50); };
    },
    nobadge: () => {
      /* Names shown with their photo frame so workers can find themselves without reading Latin script. */
      const o = dialog('Check in without badge', `<div class="picker">${AFFECTED.map(k => `<button data-k="${k}" style="display:flex;gap:8px;align-items:center;justify-content:flex-start;padding:0 12px">${av(k)}<bdi>${PEOPLE[k].n}</bdi></button>`).join('')}</div>`);
      o.querySelector('.modal').style.width = '860px';
      $$('[data-k]', o).forEach(b => b.onclick = () => { closeOverlay(); App.f.k1ok = true; App.f.k1who = b.dataset.k; refresh(); setTimeout(() => { App.f.k1ok = false; if (App.route === 'k1') refresh(); }, 2500); });
    },
    admin: el => menu(el, [{ label: 'Clear kiosk buffer…', danger: true, fn: () => confirmModal({ title: 'Clear the kiosk buffer?', body: 'Supervisor PIN accepted. 3 unsynced check-ins will be deleted from this kiosk and will not reach the headcount.', btn: 'Clear', verb: 'to clear', onOk: () => toast('Buffer cleared') }) }], 'Supervisor'),
  },
});
