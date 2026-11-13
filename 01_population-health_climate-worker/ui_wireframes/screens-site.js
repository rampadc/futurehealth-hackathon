/* Site app for supervisors and responders · M1–M8 (spec §4) */

/* ───────── M1 · Today ───────── */
screen('m1', {
  device: 'site', tab: 'today', name: 'Today (alert inbox)', short: 'Today', clock: '08:00',
  persona: 'Huda or Maya (switch role under Me).', context: 'Phone pulled from a vest pocket in full sun, often one-handed or gloved.',
  job: 'See the single most urgent action and start it in under 5 seconds.',
  empty: { text: 'No actions for you right now. TWL 152 W/m² at 07:45 · next check 08:00.', secondary: { l: 'View crew', go: 'm3' } },
  error: { text: "■ Couldn't reach Heat-Safe. 3 actions saved on this phone." },
  render() {
    const safety = App.role === 'safety';
    const step = App.f.m2 || 0;
    const items = safety
      ? [
        { id: 'issue', t: 'Issue the stop-work instruction to Huda (C01)', d: 'Required by the Sandline heat plan: TWL 145 ≤ 150.', b: step >= 1 ? B.done() : B.over('Due now'), go: 'm2' },
        { id: 'read', t: 'Fresh reading for restart review', d: 'Requested by Rashid. Sensor t1, civil trench.', b: B.wait('Later'), go: 'm7' },
      ]
      : [
        { id: 'ack', t: 'Acknowledge the stop-work instruction', d: 'From Maya 08:01. Stop heavy exposed civil work. Move the crew to Shelter A.', b: step >= 2 ? B.done() : B.over('Due now'), go: 'm2' },
        { id: 'count', t: 'Account for 11 affected workers', d: 'Confirm a safe recovery location for each. Shelter A kiosk is live.', b: App.f.m3done ? B.done() : B.wait(), go: 'm3' },
        { id: 'ready', t: 'Confirm readiness for workshop preparation', d: 'One worker, one task. Time in shelter is not readiness.', b: B.wait(), go: 'm4' },
      ];
    const done = id => App.f['m1.' + id];
    const rows = items.map(i => `<div data-swipe="${i.id}" style="touch-action:pan-y;transition:transform .1s">${row({ t: i.t, d: i.d, b: done(i.id) ? B.done() : i.b, go: i.go, cls: 'swipe' })}</div>`);
    return {
      nav: { title: 'Today · 08:00', clock: '08:00' },
      filters: ['Mine', 'All'],
      hero: [metric('■ Stop-work', 'Heavy work', 'Heavy exposed civil work · since 08:00', 'red'), metric('Accounted', App.f.m3done ? '11 / 11' : '0 / 11', 'Shelter A'), metric('TWL', '145 W/m²', `${band('low')} · sensor t1 · 08:00`)],
      body: [section('Actions', `<div class="list">${rows.join('')}</div>`, 'Swipe right to complete'), computed()],
      cta: safety ? (step >= 1 ? null : { label: 'Issue stop-work instruction', go: 'm2' }) : (step >= 2 ? { label: 'Go to headcount', go: 'm3' } : { label: 'Acknowledge instruction', go: 'm2' }),
      mount() { enableSwipe(id => { App.f['m1.' + id] = true; refresh(); toast('Marked done', () => { delete App.f['m1.' + id]; refresh(); }); }); },
    };
  },
});

/* Template preview per crew language, with SMS size: Arabic and Indic scripts switch SMS to
   Unicode, which fits 70 characters per message instead of 160. */
function m2Preview() {
  const counts = {};
  AFFECTED.forEach(k => { const l = PREF_LANG[k]; counts[l] = (counts[l] || 0) + 1; });
  const langs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const sel = App.sel.m2l && counts[App.sel.m2l] ? App.sel.m2l : langs[0];
  const L = LANG[sel], use = L.st === 'ready' ? sel : 'en';
  const sms = `${tt('stopwork', use)} 08:01: ${tt('alert.stop', use)}`;
  const si = smsInfo(sms);
  const fallback = langs.filter(l => LANG[l].st !== 'ready');
  const tabs = langs.map(l => `<button role="tab" aria-selected="${l === sel}" class="${l === sel ? 'on' : ''}" data-act="m2l" data-id="${l}" style="min-height:48px;text-transform:none"><span lang="${l}" dir="${LANG[l].d}">${LANG[l].n}</span> · ${counts[l]}</button>`).join('');
  return `<div class="seg" role="tablist" aria-label="Crew languages" style="flex-wrap:wrap">${tabs}</div>
    <div class="sms" style="margin-top:8px"><div class="smsbody" lang="${use}" dir="${LANG[use].d}">${sms}</div>
    <div class="smsmeta"><span>SMS · ${si.enc}</span><span><b>${si.n}</b> / ${si.one} chars · <b>${si.parts}</b> part${si.parts > 1 ? 's' : ''}</span></div></div>
    ${L.st !== 'ready' ? `<div class="note" style="margin-top:8px">▲ ${L.e} is not translated yet. ${counts[sel]} worker${counts[sel] > 1 ? 's get' : ' gets'} English plus a voice call; Huda confirms in person.</div>` : ''}
    <div class="computed" style="margin-top:8px">11 workers · ${langs.length} languages${fallback.length ? ` · ${fallback.map(l => LANG[l].e).join(', ')} fall back to English` : ''}</div>`;
}

/* ───────── M2 · Stop-work instruction ───────── */
screen('m2', {
  device: 'site', tab: 'today', name: 'Stop-work instruction', short: 'Stop-work', clock: '08:01',
  persona: 'Maya issues; Huda acknowledges (switch role under Me).', context: 'Phone, outdoors, while radioing.',
  job: 'Record the instruction (Maya) or its receipt (Huda) in one tap after the radio call.',
  error: { text: "Couldn't send. Your acknowledgement is saved and will send automatically.", retry: 'Retry now', nostale: true },
  render() {
    const safety = App.role === 'safety';
    const step = App.f.m2 || 0;
    const ch = App.f.m2ch || 'radio';
    const hb = step >= 2 ? B.done(step >= 3 ? 'Stopped' : 'Acknowledged') : step >= 1 ? B.wait() : B.muted('Not sent');
    let cta;
    if (safety) cta = step >= 1 ? { label: 'Issued 08:01 · waiting for Huda', disabled: true } : { label: 'Record instruction issued', act: 'issue' };
    else cta = step >= 3 ? { label: '✓ Stop confirmed 08:03', go: 'm3' } : step >= 2 ? { label: 'Confirm heavy work stopped', act: 'stopped' } : { label: 'Acknowledge', act: 'ack' };
    return {
      nav: { title: 'Stop-work · 08:01', back: 'm1', clock: '08:01' },
      overflow: safety ? [{ label: 'Withdraw instruction…', danger: true, fn: () => confirmModal({ title: 'Withdraw the 08:01 stop-work instruction?', body: 'Huda and the crew phones will be told the instruction was withdrawn. The record stays in the audit log.', btn: 'Withdraw', verb: 'to withdraw', onOk: () => { App.f.m2 = 0; refresh(); toast('Instruction withdrawn'); } }) }] : [{ label: 'View in audit log' }],
      heroReplace: `<div class="statement red"><div class="big">Stop heavy exposed civil work. Move the crew to Shelter A.</div><div class="src">Sandline heat plan · TWL 145 ≤ 150 at 08:00 · ${COMPUTED}</div></div>
        ${step < 2 ? `<div class="banner amber"><span>▲ Escalates to Rashid at 08:03 if not acknowledged</span><b id="cd">1:12</b></div>` : ''}`,
      body: [
        section('Recipients', list([
          row({ lead: av('huda'), t: 'Huda (C01) · Dune foreman', d: 'Instruction to stop and account for 11 affected workers.', b: hb, static: true }),
          row({ t: 'C13, C14', d: 'Not affected · separate light task.', b: B.muted('Not affected'), static: true }),
        ])),
        section('Channel', `<div class="seg" role="radiogroup" aria-label="Channel">${['radio', 'in person', 'app'].map(c => `<button role="radio" aria-checked="${ch === c}" class="${ch === c ? 'on' : ''}" data-act="ch" data-id="${c}" style="min-height:48px">${c}</button>`).join('')}</div><div class="computed" style="margin-top:8px">Recorded with each step for the audit.</div>`),
        section('What worker phones receive', m2Preview(), 'Fixed template · reviewed translation'),
      ],
      cta,
      mount() {
        const el = $('#cd'); if (!el) return; let s = 72;
        App.timer = setInterval(() => { s = Math.max(0, s - 1); el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
      },
    };
  },
  actions: {
    ch: el => { App.f.m2ch = el.dataset.id; refresh(); },
    m2l: el => { App.sel.m2l = el.dataset.id; refresh(); },
    issue: () => { App.f.m2 = 1; App.f.stopIssued = true; refresh(); toast('Instruction issued · 08:01 · ' + (App.f.m2ch || 'radio')); },
    ack: () => { App.f.m2 = 2; refresh(); toast('Acknowledged · 08:02'); },
    stopped: () => { App.f.m2 = 3; refresh(); toast('Heavy work stop confirmed · 08:03'); },
  },
});

/* ───────── M3 · Headcount ───────── */
screen('m3', {
  device: 'site', tab: 'crew', name: 'Headcount', short: 'Headcount', clock: '08:04',
  persona: 'Huda.', context: 'Phone, standing at Shelter A.',
  job: 'Confirm every affected worker is in a safe recovery location.',
  alt: { partial: '2 missing' },
  empty: { text: 'No one has checked in yet. Ask the crew to tap their badge at the Shelter A kiosk.', cta: 'Add worker manually', act: 'manual' },
  error: { text: "■ Couldn't reach Heat-Safe. Manual entries are queued on this phone." },
  render({ v }) {
    const partial = v === 'partial';
    const missing = partial ? ['zaid', 'samir'].filter(k => !App.f['seen.' + k]) : [];
    const arrived = AFFECTED.filter(k => !missing.includes(k));
    const rows = [
      ...missing.map(k => `<div class="row static"><span class="lead">${av(k)}</span><span><span class="t" style="display:block">${who(k)}</span><span class="d">Not checked in. Last seen at the trench 07:58.</span></span><span class="rt" style="flex-direction:row;gap:8px">${B.over('Missing')}<a class="iconbtn" href="tel:+971500000000" aria-label="Call ${PEOPLE[k].n}">✆</a><button class="iconbtn" data-act="manual" data-id="${k}" aria-label="Seen in person">✓</button></span></div>`),
      ...arrived.map((k, i) => row({ lead: av(k), t: who(k), d: App.f['seen.' + k] ? 'Seen in person · ' + App.f['seen.' + k] : `Checked in at kiosk 08:0${i < 4 ? 3 : 4}.`, b: B.done('Arrived'), static: true })),
    ];
    const n = arrived.length;
    return {
      nav: { title: 'Headcount · Shelter A', back: 'm1', clock: '08:04' },
      filters: ['Missing', 'Arrived'],
      overflow: [{ label: 'Remove a manual entry…', danger: true, fn: () => confirmModal({ title: 'Remove the manual entry for Zaid (C10)?', body: 'The headcount will drop to 10 of 11 until he checks in.', btn: 'Remove', verb: 'to remove', onOk: () => toast('Manual entry removed') }) }],
      hero: [metric('Accounted', `${n} / 11`, missing.length ? 'not complete' : 'all affected workers', missing.length ? 'red' : true), metric('Missing', String(missing.length), missing.map(k => PEOPLE[k].n).join(', ') || 'none'), metric('Last arrival', '08:04', 'kiosk')],
      body: [section('Affected workers', list(rows) + `<div style="margin-top:8px">${row({ t: 'C13, C14', d: 'Separate supervised light task.', b: B.muted('Not affected'), static: true })}</div>`, 'Kiosk and phone check-ins appear live'),
        `<button class="btn" data-act="manual" style="min-height:56px">+ Seen in person</button>`],
      cta: missing.length ? { label: `Confirm all 11 accounted for`, disabled: true, note: `${missing.length} missing. Find them or record “Seen in person” with a location.` }
        : App.f.m3done ? { label: '✓ Confirmed 08:04 · planning unlocked', go: 'm4' } : { label: 'Confirm all 11 accounted for', act: 'confirm' },
    };
  },
  actions: {
    confirm: () => { App.f.m3done = true; refresh(); toast('11 of 11 accounted for · 08:04'); },
    manual: el => {
      const k = el.dataset.id;
      const o = sheet('Seen in person', `<form class="form" id="mf">
        <div class="fl"><label for="mw">Worker</label><select id="mw">${AFFECTED.map(a => `<option value="${a}" ${a === k ? 'selected' : ''}>${who(a)}</option>`).join('')}</select></div>
        <div class="fl"><label for="ml">Location (required)</label><select id="ml"><option value="">Choose a location</option><option>Shelter A</option><option>Workshop (covered)</option><option>Site cabin</option><option>First-aid room</option></select><span class="age" id="mle" aria-live="polite"></span></div>
        <button class="cta" type="submit">Record seen in person</button></form>`);
      $('#mf', o).onsubmit = e => { e.preventDefault(); const l = $('#ml', o).value; if (!l) { $('#mle', o).textContent = 'Choose where you saw them.'; return; } App.f['seen.' + $('#mw', o).value] = '08:05 · ' + l; closeOverlay(); refresh(); toast('Recorded · ' + l); };
    },
  },
});

/* ───────── M4 · Readiness confirmation ───────── */
screen('m4', {
  device: 'site', tab: 'crew', name: 'Readiness confirmation', short: 'Readiness', clock: '08:10',
  persona: 'Huda.', context: 'Phone, face to face with each worker in the shelter.',
  job: 'Confirm one worker’s readiness for one task in under 15 seconds.',
  empty: { text: 'No covered task needs staff right now.' },
  error: { text: "■ Couldn't reach Heat-Safe. Confirmation saved on this phone and will send." },
  render() {
    const sel = App.sel.m4;
    const list4 = W4_CREW.filter(c => c.q).map(c => App.f['ready.' + c.k] ? { ...c, s: 'ready', r: 'Ready, confirmed by Huda ' + App.f['ready.' + c.k] + ', valid until end of shift.' } : c);
    const conf = list4.filter(c => c.s === 'ready').length;
    const unconf = list4.length - conf;
    const hero = [metric('Confirmed', String(conf), 'for workshop preparation', true), metric('Qualified, unconfirmed', String(unconf)), metric('Places free', '4 of 6', 'Lina, Omar fixed')];
    const overflow = [{ label: 'Withdraw Rana’s confirmation…', danger: true, fn: () => confirmModal({ title: 'Withdraw Rana’s readiness confirmation?', body: 'She will be removed from any proposal that uses it.', btn: 'Withdraw', verb: 'to withdraw', onOk: () => toast('Confirmation withdrawn · proposal updated') }) }];
    if (sel) {
      const p = PEOPLE[sel];
      return {
        nav: { title: 'Confirm readiness', sub: 'Workshop preparation', back: 'm4', clock: '08:18' }, overflow,
        heroReplace: `<div class="statement"><div class="flex">${av(sel)}<div><b style="font-size:20px">${who(sel)}</b><div class="muted">Qualified for workshop preparation</div></div></div></div>`,
        body: [`<div class="note">Time in shelter is not readiness.</div>`, `<form class="form" id="rf" onsubmit="event.preventDefault();runAct('confirm')">
          <fieldset><legend>Assessment basis</legend>
            <label class="opt"><input type="radio" name="basis" checked> Spoke with worker face to face</label>
            <label class="opt"><input type="radio" name="basis"> Observed recovery and hydration</label>
            <label class="opt"><input type="radio" name="basis"> Occupational health advice</label></fieldset>
          <div class="fl"><label for="ev">Evidence reference</label><input id="ev" value="Shelter A · 08:18 · in person"></div>
          <div class="fl"><label for="vu">Valid until</label><select id="vu"><option>End of shift (17:00)</option><option>2 hours (10:18)</option><option>1 hour (09:18)</option></select></div>
          <div class="computed">Confirmer recorded automatically: Huda (C01)</div></form>`],
        cta: { label: `Confirm ${p.n} ready for workshop preparation`, act: 'confirm' },
      };
    }
    const bdg = s => s === 'ready' ? B.done('Ready') : s === 'expired' ? B.over('Expired') : B.wait('Unconfirmed');
    return {
      nav: { title: 'Confirm readiness', sub: 'Workshop preparation', back: 'm1', clock: '08:10' },
      filters: ['Unconfirmed only', 'All qualified'], overflow, hero,
      body: [section('Qualified workers', list(list4.map(c => row({ lead: av(c.k), t: who(c.k), d: c.s === 'ready' ? c.r : c.s === 'expired' ? 'Confirmed 3 Aug · expired end of shift. Reconfirm.' : 'Qualified for workshop preparation. No confirmation yet.', b: bdg(c.s), act: c.s === 'ready' ? null : 'open', id: c.k, static: c.s === 'ready' }))), 'Tap a worker to confirm')],
      cta: unconf ? { label: 'Confirm next: ' + PEOPLE[list4.find(c => c.s !== 'ready').k].n, act: 'open', html: null } : { label: 'Review proposal', go: 'm5' },
    };
  },
  actions: {
    open: el => { App.sel.m4 = (el && el.dataset.id) || W4_CREW.find(c => c.q && c.s !== 'ready' && !App.f['ready.' + c.k]).k; refresh(); },
    confirm: () => { const k = App.sel.m4; App.f['ready.' + k] = '08:18'; delete App.sel.m4; refresh(); toast(PEOPLE[k].n + ' confirmed ready · 08:18'); },
  },
});

/* ───────── M5 · Proposal review ───────── */
screen('m5', {
  device: 'site', tab: 'plan', name: 'Proposal review', short: 'Proposal', clock: '08:11',
  persona: 'Huda.', context: 'Phone.', job: 'Review the planner’s proposal and record the assignment.',
  empty: { text: 'No proposal yet. Planning unlocks when the headcount and confirmations are complete.' },
  render() {
    const assigned = App.f.assigned, sent = App.f.w5sent;
    const rows = ['rana', 'yusuf', 'dana', 'bilal'].map(k => row({ lead: av(k), t: who(k), d: 'Workshop 08:11–08:26, then recovery to 08:41.', b: assigned ? B.done('Assigned') : B.plan('Proposed'), static: true }));
    return {
      nav: { title: 'Proposal · 08:11', back: 'm1', clock: '08:11' },
      overflow: [{ label: 'Send plan to crew phones', fn: () => { App.f.w5sent = true; refresh(); toast('Sent to 4 phones'); } }, { label: 'Open full plan (web)', go: 'w5' }],
      hero: [metric('Proposed', '4', 'Rana, Yusuf, Dana, Bilal', true), metric('Stay in recovery', '7', 'Shelter A'), metric('Trench', 'Stopped', 'since 08:01')],
      body: [
        `<div class="between"><b>Proposal · not applied</b>${computed()}</div>`,
        aiBlock({ key: 'm5', title: 'Why these four?', conf: 'High', text: 'Four workers meet every requirement: Rana, Yusuf, Dana and Bilal. Leila is qualified but has no readiness confirmation yet.', tools: ['optimise_schedule'], inputs: ['Readiness records (4 valid)', 'Catalogue capacity 6', 'Fixed occupants 2', 'Demand 4'], editGo: 'm4' }),
        section('Proposed workers', list(rows)),
        assigned ? `<div class="statusline">✓ 08:11 · Assignment recorded by Huda</div>` : '',
      ],
      cta: !assigned ? { label: 'Record assignment', act: 'assign' } : sent ? { label: '✓ Plan sent · 4 of 4 delivered', disabled: true } : { label: 'Send plan to crew phones', act: 'send' },
    };
  },
  actions: {
    assign: () => { App.f.assigned = true; refresh(); toast('Assignment recorded · 08:11'); },
    send: () => { App.f.w5sent = true; refresh(); toast('Sent · each worker gets only their own intervals'); },
  },
});

/* ───────── M6 · Worker action card ───────── */
screen('m6', {
  device: 'site', tab: 'today', name: 'Worker action card', short: 'Action card', clock: '08:18',
  persona: 'Huda (action owner) and Salim (first aider; switch role under Me).', context: 'Phone, outdoors or in the workshop, urgent.',
  job: 'Take the required action for one worker immediately.',
  alt: { emergency: 'Emergency' },
  error: { text: "Couldn't reach Heat-Safe. The 998 call button works without the app's network.", nostale: true },
  render({ v }) {
    const em = v === 'emergency';
    const salim = App.role === 'firstaid';
    const s = App.f.m6 || 0;
    const steps = [
      ['Remove Bilal from the heat', s >= 1 ? 'Recorded 08:21 · Shelter A.' : 'Confirm where he is now.'],
      ['Record first-aid contact', s >= 2 ? 'Salim arrived 08:22.' : 'Salim (P06) notified 08:18.'],
      ['Check on Bilal', s >= 3 ? 'Checked 08:27 by Huda.' : 'Due by 08:28.'],
    ];
    const hero = em ? null : [metric('■ Needs rest now', 'Remove from heat', 'check within 10 min', 'red'), metric('Timer', '<span id="tmr">9 min 42 s</span>', 'left to check on him'), metric('Location', 'Workshop', 'reported 08:18')];
    let cta;
    if (em) cta = { html: `<a class="cta red" href="tel:998" style="text-decoration:none">✆ Call 998</a>` };
    else if (salim) cta = App.f.m6salim ? { label: '✓ Arrived 08:22', disabled: true } : App.f.m6resp ? { label: 'Arrived', act: 'arrived' } : { label: 'Respond', act: 'respond' };
    else cta = s === 0 ? { label: 'Confirm Bilal removed from heat', act: 'removed', red: true } : s === 1 ? { label: 'Record first-aid contact', act: 'next' } : s === 2 ? { label: 'Record check on Bilal', act: 'next' } : { label: '✓ All steps recorded', disabled: true };
    return {
      nav: { title: 'Bilal (C08) · 08:18', back: 'm1', clock: '08:18' },
      hero, heroReplace: em ? `<div class="statement black"><div class="big">✚ EMERGENCY · Call 998 · start cooling · keep someone with him</div><div class="src">⚙ Escalation rule · not AI · Workshop</div></div>` : '',
      body: [
        salim ? `<div class="statusline">${av('salim')} You are responding · Workshop, north bay</div>` : '',
        section('Steps', list(steps.map((st, i) => row({ t: `${i + 1}. ${st[0]}`, d: st[1], b: s > i ? B.done() : B.wait(), static: true })))),
        `<div class="note">No health detail here. Details stay in Bilal’s own health record.</div>`,
        `<div class="computed">⚙ Escalation rule · not AI</div>`,
      ],
      cta,
      mount() {
        const el = $('#tmr'); if (!el) return; let t = 582;
        App.timer = setInterval(() => { t = Math.max(0, t - 1); el.textContent = `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, '0')} s`; }, 1000);
      },
    };
  },
  actions: {
    removed: () => confirmModal({ title: 'Confirm Bilal is out of the heat', body: 'Records your confirmation for the protective response.', word: 'REMOVED', verb: 'to confirm Bilal is out of the heat', btn: 'Confirm', danger: false, focusInput: true, onOk: () => { App.f.m6 = 1; App.f.w3removed = '08:21'; refresh(); toast('Removal recorded · 08:21'); } }),
    next: () => { App.f.m6 = (App.f.m6 || 0) + 1; if (App.f.m6 === 2) App.f.w3firstaid = '08:22'; refresh(); toast('Recorded'); },
    respond: () => { App.f.m6resp = true; refresh(); toast('Huda notified: Salim is on the way'); },
    arrived: () => { App.f.m6salim = true; refresh(); toast('Arrival recorded · 08:22'); },
  },
});

/* ───────── M7 · Fresh reading ───────── */
screen('m7', {
  device: 'site', tab: 'today', name: 'Fresh reading', short: 'Fresh reading', clock: '15:06',
  persona: 'Maya.', context: 'Phone, standing at the trench beside sensor t1.',
  job: 'Capture a fresh local reading for the restart review.',
  empty: { text: 'No sensor in this zone.', cta: 'Enter a meter reading', act: 'meter' },
  error: { text: "■ Sensor t1 didn't respond in 20 seconds.", nostale: true },
  render() {
    const fresh = App.f.freshReading;
    return {
      nav: { title: 'Fresh reading', sub: 'Civil trench', back: 'm1', clock: '15:06' },
      filters: ['Sensor t1', 'All sensors'],
      hero: [fresh ? metric('Latest', fresh + ' W/m²', '15:06 · <b>fresh</b>', true) : metric('Latest', '145 W/m²', '08:00 · <b>stale</b>', 'red'), metric('Freshness limit', '5 min'), metric('Sensor', 't1', 'serviceable')],
      body: [
        section('Sensors', list([
          row({ t: 'Sensor t1 · civil trench', d: 'Via base station · last heartbeat 30 s ago.', b: B.plain('● Online'), static: true }),
          row({ t: 'Sensor t2 · laydown yard', d: 'Other zone · cannot be used.', b: B.muted('Other zone'), static: true }),
          row({ t: 'Forecast · Mussafah', d: 'Estimated from forecast · cannot be used for a restart.', b: B.muted('Forecast'), static: true }),
        ])),
        `<button class="btn" data-act="meter" style="min-height:56px">Enter a meter reading instead</button>`,
      ],
      cta: fresh ? { label: 'Send to restart review →', go: 'w6' } : { label: 'Request reading from sensor t1', act: 'req' },
    };
  },
  actions: {
    req: () => { toast('Requesting via base station…'); setTimeout(() => { App.f.freshReading = '175'; refresh(); toast('175 W/m² · 15:06 · sent to Restart review'); }, 900); },
    meter: () => {
      const o = sheet('Manual meter reading', `<form class="form" id="mm"><div class="fl"><label for="mid">Meter ID (required)</label><input id="mid" placeholder=""></div><div class="fl"><label for="mv">TWL reading, W/m²</label><input id="mv" inputmode="numeric"></div><button type="button" class="btn" style="min-height:56px">📷 Add photo of the meter (required)</button><span class="age" id="mme" aria-live="polite"></span><button class="cta" type="submit">Save reading</button></form>`);
      $('#mm', o).onsubmit = e => { e.preventDefault(); $('#mme', o).textContent = 'Meter ID and photo are required.'; };
    },
  },
});

/* ───────── M8 · Ask ───────── */
screen('m8', {
  device: 'site', tab: 'ask', name: 'Ask (Planning Agent)', short: 'Ask', clock: '08:20',
  persona: 'Huda.', context: 'Phone; voice input is offered.', job: 'Get a quick cited answer without going back to the cabin.',
  alt: { refusal: 'Refusal', grounding: 'Grounding warning' },
  empty: { text: 'Ask about today’s heat, the plan or the rules. Answers cite their sources and use computed numbers only.', cta: 'Ask: “Plan tomorrow for the civil crew at Mussafah”', act: 'asktomorrow' },
  error: { text: "■ The Planning Agent didn't respond within 20 seconds. Your question is saved." },
  render({ v }) {
    const { hero, cards, sugg } = askRender(v, true);
    return {
      nav: { title: 'Ask', sub: 'Planning Agent', clock: '08:20' }, overflow: ASK_OVERFLOW,
      hero, body: [section('Conversation', `<div style="display:flex;flex-direction:column;gap:16px">${cards}</div>`), section('Suggested', sugg)],
      cta: { html: `<form class="composer" onsubmit="event.preventDefault();runAct('send')"><input aria-label="Your question" placeholder="Ask a question" autocomplete="off"><button type="button" class="iconbtn" style="width:56px;height:56px" data-act="ptt" aria-label="Hold to talk">🎙</button></form>` },
    };
  },
  actions: {
    ...ASK_ACTIONS,
    asktomorrow: () => { go('m8'); setTimeout(() => askSubmit(QA.tomorrow.q), 30); },
    ptt: () => {
      const o = sheet('Voice question', `<p class="p">Transcript, edit before sending:</p><div class="fl form" style="margin:16px 0"><label for="vt" style="font-weight:700">Transcript</label><input id="vt" value="Can we restart the trench at 13:00?" style="height:56px;border:1px solid var(--ink);padding:0 12px;font-size:16px"></div><button class="cta" id="vs">Send</button>`);
      $('#vs', o).onclick = () => { const t = $('#vt', o).value; closeOverlay(); askSubmit(t); };
    },
  },
});
