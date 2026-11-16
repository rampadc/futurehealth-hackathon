/* Supervisor web app · W1–W8 (spec §3) */

/* ───────── W1 · Squad Monitoring ───────── */
const W1_ACTIONS = [
  { id: 'a1', who: 'bilal', t: 'Bilal (C08) · needs rest now', d: 'Remove from heat and check on him within 10 minutes. Unplanned rest recorded 08:18.', b: () => B.red('Red', 'Red: needs rest now'), owner: 'huda', due: '08:28', comp: 2, src: 'Worker report · Health Reporting → escalation rule', open: { go: 'm6', l: 'Open action card (site app)' } },
  { id: 'a2', who: 'salim', t: 'Record first-aid contact for Bilal', d: 'Salim (P06) notified 08:18. Confirm the contact happened.', b: () => B.wait(), owner: 'huda', due: '08:23', comp: 2, src: 'Escalation rule', open: { go: 'w3', v: 'incident', l: 'Open Protective response' } },
  { id: 'a3', t: 'Review replan for 08:18–09:18', d: 'Bilal excluded from work. Leila unconfirmed: choose a branch before sending.', b: () => B.wait(), owner: 'huda', due: '08:25', comp: 3, src: 'Work/rest planner', open: { go: 'w5', v: 'replan', l: 'Open Work/rest plan' } },
  { id: 'a4', who: 'rashid', t: 'Restart decision open · heavy exposed civil work', d: 'Stop-work active since 08:01. Rashid decides once the eight checks pass.', b: () => B.plain('Info'), owner: 'rashid', due: '—', comp: 4, src: 'Restart readiness', open: { go: 'w6', l: 'Open Restart review' } },
];
/* The band row is the environmental condition (legal TWL zone). The rows below are task
   holds from the stricter site rule. At 145 W/m² the band is Low and heavy work still
   stops: the two are drawn differently so neither can be read as the other. */
const TWL_AM = [160, 145, 138, 132, 128], TWL_PM = [130, 140, 152, 165];
function bandStrip() {
  const head = `<div class="lab hd">Hour</div>` + ['07', '08', '09', '10', '11'].map(h => `<div class="hd">${h}:00</div>`).join('') + `<div class="hd mid">12:30–15:00</div>` + ['15', '16', '17', '18'].map(h => `<div class="hd">${h}:00</div>`).join('');
  const lv = v => v >= 140 ? 'low' : 'caution';
  const bandCell = v => `<div class="bandrow" role="img" aria-label="${BAND_WORD[lv(v)]}, TWL ${v}"><span class="band band--${lv(v)}"><span class="band__swatch"></span>${v}</span></div>`;
  const holdCell = v => v <= 150 ? `<div class="c-hold" role="img" aria-label="Heavy-work hold">■ Hold</div>` : `<div class="c-ok" role="img" aria-label="No hold">—</div>`;
  const ctrlCell = v => lv(v) === 'caution' ? `<div class="c-ctrl" role="img" aria-label="Caution controls: extra water and rest">▲</div>` : `<div class="c-ok" role="img" aria-label="No extra controls">—</div>`;
  const okCell = () => `<div class="c-ok" role="img" aria-label="No hold">—</div>`;
  const mid = `<div class="hatch mid"><span>MoHRE midday break · no outdoor work</span></div>`;
  const r = (name, cell, cls = '') => `<div class="lab ${cls}">${name}</div>${TWL_AM.map(cell).join('')}${mid}${TWL_PM.map(cell).join('')}`;
  const legend = `<div class="flex" style="margin-top:8px;font-size:12px;gap:16px">${band('low', 'TWL ≥ 140')}${band('caution', 'below 140')}<span class="flex">${badge('■ Hold', 'b-red')} Sandline rule: heavy exposed work stops at TWL ≤ 150</span><span class="flex">${badge('▲', 'b-amber')} extra water and rest</span></div>`;
  return `<div class="strip" role="group" aria-label="Hourly band and task holds"${timeDir()}>${head}${r('Band · TWL W/m²', bandCell, 'bandrow')}${r('Heavy exposed · civil crew', holdCell)}${r('Light task', ctrlCell)}${r('Workshop · covered', okCell)}</div>${legend}`;
}
screen('w1', {
  device: 'web', name: 'Squad Monitoring', short: 'Squad Monitoring', clock: '08:18',
  persona: 'Huda, Dune foreman, responsible for 14 workers on one civil area.',
  context: 'Desktop in the site cabin, glanced at between radio calls and left open all shift.',
  job: 'Know within 5 seconds whether anyone needs action now.',
  alt: { summary: 'Shift summary', noevents: 'No events yet' },
  empty: { text: 'No crew on this site yet. Import the Dune Civil Works roster and the site’s locations to start monitoring.', cta: 'Import crew roster', msg: 'Opens site setup · not in this prototype' },
  error: { text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last update from 08:04." },
  render({ v }) {
    const q = squad();
    const nav = { title: `Squad Monitoring · ${q.name} · 08:18`, back: null, updated: '08:18' };
    /* No summary readouts: a squad selector with each squad's alerts and warnings. */
    const picker = squadPicker(x => [x.status, band(x.band, 'TWL ' + x.twl + (x.est ? ' · est.' : ''))]);
    if (q.id !== 'civil') {
      return { nav, filters: ['All squads', 'Alerts only', 'Holds only'], overflow: [{ label: 'Export shift log' }],
        body: [picker, section('Needs action', squadItems(q)), section('Crew by location', list([row({ t: `${q.loc} · ${q.headcount} workers`, d: `${q.status}. Recovery: ${q.shelter}.`, b: B.plain(q.hold ? 'Hold' : 'Working'), static: true })]), 'Aggregates only · no health data'), section('Hourly band · today', bandStrip() + computed())],
        detail: `<h2 class="h2">${q.name}</h2><dl class="kv"><dt>Foreman</dt><dd>${av(q.foreman)} ${who(q.foreman)}</dd><dt>Location</dt><dd>${q.loc}</dd><dt>TWL</dt><dd>${band(q.band, q.twl + ' W/m²' + (q.est ? ' · estimated' : ''))}</dd><dt>Sensor</dt><dd>${q.sensor}</dd><dt>Recovery</dt><dd>${q.shelter}</dd></dl>${computed()}` };
    }
    const filters = ['All crews', 'Civil crew', 'Light task', 'Holds only', 'Task: heavy exposed', { label: 'Shift summary view', v: 'summary', checked: v === 'summary' }];
    const overflow = [{ label: 'Export shift log' }, { label: 'Reassign action owner' }, { label: 'View audit history' }];
    if (v === 'noevents') {
      return { nav: { ...nav, title: 'Squad Monitoring · Civil crew · 07:50' }, filters, overflow,
        body: [picker, `<div class="statusline">${band('low', 'TWL 152 W/m²')} · no holds · last reading 07:45</div>${computed()}`, section('Hourly band · today', bandStrip())] };
    }
    if (v === 'summary') {
      const ev = [
        ['08:01', 'Stop-work issued · heavy exposed civil work', 'Maya → Huda · TWL 145 ≤ 150', B.stop()],
        ['08:04', '11 of 11 affected workers accounted for', 'Shelter A kiosk', B.done()],
        ['08:11', 'Assignment recorded: Rana, Yusuf, Dana, Bilal → workshop', 'Recorded by Huda · separate from the planner proposal', B.done()],
        ['08:18', 'Unplanned rest: Bilal (C08)', 'Worker report → needs rest now', B.red()],
        ['Open', 'Restart decision · heavy exposed civil work', 'Owner: Rashid · 8 checks', B.wait('Open')],
      ];
      return { nav: { ...nav, title: 'Shift summary · Civil crew · 4 Aug' }, filters, overflow,
        body: [picker, section('Shift recap', list(ev.map(([t, a, d, b]) => row({ t: `${t} · ${a}`, d, b, static: true }))), 'For the 08:30 handover'), computed()],
        cta: { label: 'Export shift log', act: 'toast', msg: 'Shift log exported (PDF + CSV)' } };
    }
    const sel = App.sel.w1 || 'a1';
    const actions = W1_ACTIONS.map(a => row({ id: a.id, act: 'sel', sel: a.id === sel, t: a.t, d: a.d, b: App.f['w1.' + a.id] ? B.done() : a.b(), lead: a.who ? `<span class="lead-stack">${av(a.who)}${marker(a.comp)}</span>` : marker(a.comp) }));
    const locs = [
      row({ t: 'Workshop · 4 of 6 places in use', d: 'Workshop preparation (covered). 2 fixed occupants, 2 from the civil crew.', b: B.plain('Work'), static: true }),
      row({ t: 'Shelter A · 7 workers', d: 'Cooled recovery. Last check-in 08:04.', b: B.plain('Recovery'), static: true }),
      row({ t: 'Light task · C13, C14', d: 'Separate supervised light task. Not affected by the stop-work.', b: B.plain('— No hold'), static: true }),
    ];
    const a = W1_ACTIONS.find(x => x.id === sel);
    const done = App.f['w1.' + a.id];
    const detail = `
      <div class="flex">${compname(a.comp)}</div>
      <h2 class="h2">${a.t}</h2>
      <div>${done ? B.done() : a.b()}</div>
      <dl class="kv">
        <dt>Action</dt><dd>${a.d}</dd>
        <dt>Owner</dt><dd>${av(a.owner)} ${who(a.owner)}</dd>
        <dt>Due</dt><dd><b>${a.due}</b></dd>
        <dt>Source</dt><dd>${a.src}</dd>
      </dl>
      ${a.id === 'a1' ? `<div class="note">No health detail here. Details stay in Bilal’s own health record.</div>` : ''}
      ${computed()}
      <div class="flex"><button class="btn" data-go="${a.open.go}"${attr('data-v', a.open.v)}>${a.open.l} →</button></div>
      <button class="link" data-go="w7" data-prefill="${a.id === 'a1' ? 'bilal' : a.id === 'a4' ? 'restart13' : 'trench'}">◇ Explain this with the Planning Agent</button>`;
    return {
      nav, filters, overflow,
      body: [
        picker,
        section('Needs action', list(actions), 'Sorted: Emergency → Red → overdue → waiting → info'),
        section('Crew by location', list(locs), 'Aggregates only · no health data'),
        section('Hourly band · today', bandStrip() + computed()),
      ],
      detail,
      cta: done ? { label: '✓ Done · ' + (App.f['w1.' + a.id]), disabled: true } : { label: 'Mark action done', act: 'done' },
    };
  },
  actions: {
    sel: el => { App.sel.w1 = el.dataset.id; refresh(); },
    done: () => { const id = App.sel.w1 || 'a1'; App.f['w1.' + id] = '08:19'; refresh(); toast('Marked done · 08:19', () => { delete App.f['w1.' + id]; refresh(); }); },
  },
});

/* ───────── W2 · Heat controls ───────── */
const HOURS = [['07:00', 160], ['08:00', 145], ['09:00', 138], ['10:00', 132], ['11:00', 128], ['12:00', 125], ['15:00', 130], ['16:00', 140], ['17:00', 152], ['18:00', 165]];
screen('w2', {
  device: 'web', name: 'Heat controls', short: 'Heat controls', clock: '08:00', comp: 1,
  persona: 'Maya, Sandline safety officer.', context: 'Desktop, reviewing the trigger after the alert on M1.',
  job: 'Confirm what must stop, why, and what evidence will clear it.',
  alt: { dropout: 'Sensor drop-out' },
  empty: { text: 'No heat sensor linked to the civil area yet. Heat-Safe is using the forecast only.', cta: 'Link a site sensor' },
  error: { text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last reading from 08:00 (12 min old). Your entries are saved on this device." },
  render({ v }) {
    const shade = App.f.w2shade;
    const drop = v === 'dropout';
    /* TWL per squad in small text; no big readouts. */
    const twl = `<table class="t sq-twl"><thead><tr><th>Squad</th><th>Location</th><th>TWL W/m²</th><th>Band</th><th>Source</th><th>Heavy exposed work</th></tr></thead><tbody>
      ${SQUADS.map(q => { const civ = q.id === 'civil'; const b = civ && drop ? 'caution' : q.band;
        return `<tr><td>${av(q.foreman, { size: 'xs' })} <b>${q.name}</b></td><td>${q.loc}</td><td>${civ ? 145 : q.twl}</td><td>${band(b)}${civ && drop ? ' · raised one level' : ''}</td><td>${civ && drop ? 'Forecast · t1 offline since 07:52' : q.est ? 'Forecast · ' + q.sensor + ' offline' : 'Sensor ' + q.sensor}</td><td>${civ ? '■ Stop-work' : q.hold ? '■ Hold' : '— No hold'}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="6">${COMPUTED} · 08:00</td></tr></tfoot></table>`;
    const tasks = list([
      row({ lead: marker(1), t: 'Heavy exposed civil work', d: 'TWL reached the heavy-work limit.', b: B.stop('Stop-work', 'Stop-work required, heavy exposed civil work'), static: true }),
      row({ lead: marker(1), t: 'Light civil work', d: 'Below heavy-work scope.', b: B.plain('— No hold'), static: true }),
      row({ lead: marker(1), t: 'Workshop preparation', d: 'Covered task.', b: B.plain('— No hold'), static: true }),
    ]);
    const policy = `<div class="policy-row"><span><b>Site rule</b> TWL ≤ 150 · stop heavy work · Sandline heat plan</span><span><b>Legal zone</b> Low (≥ 140) · ADOSH-SF CoP 11.0</span></div>
      <table class="t"><thead><tr><th>Layer</th><th>Rule</th><th>Result at 08:00</th></tr></thead><tbody>
      <tr><td>Legal floor</td><td>ADOSH-SF CoP 11.0 · Low zone at TWL ≥ 140: work with controls</td><td>No stop</td></tr>
      <tr><td class="applied">Site rule</td><td class="applied">Sandline heat plan · TWL ≤ 150: stop heavy exposed work</td><td class="applied">■ Stop-work · Stricter rule applied</td></tr>
      <tr><td>Midday break</td><td>MoHRE · 12:30–15:00, no outdoor work (15 Jun–15 Sep)</td><td>Not active</td></tr>
      </tbody><tfoot><tr><td colspan="3">${COMPUTED}</td></tr></tfoot></table>`;
    const source = drop
      ? `<div class="statusline signal">■ Sensor t1 not reporting since 07:52 · band raised one level · forecast used: 145 W/m² (Estimated from forecast)</div>`
      : `<div class="statusline">Localised sensor t1 → base station · overrides forecast <span class="age" style="margin-left:auto">Forecast at 08:00: 149 W/m² · Estimated from forecast</span></div>`;
    const evidence = list([
      row({ t: 'Fresh local reading above 150 W/m²', d: 'From sensor t1 or a calibrated meter, no older than 5 minutes.', b: B.wait('Needed'), go: 'm7' }),
      row({ t: 'Restart review recorded by Rashid', d: 'Eight checks, then a human decision. Software never lifts the stop-work.', b: B.wait('Needed'), go: 'w6' }),
    ]);
    const tbl = `<div class="between" style="margin-bottom:8px"><div class="seg" role="group" aria-label="Sun or shade"><button class="${shade ? '' : 'on'}" data-act="sun" aria-pressed="${!shade}">Sun</button><button class="${shade ? 'on' : ''}" data-act="shade" aria-pressed="${!!shade}">Shade</button></div><span class="age">Higher TWL = more cooling capacity</span></div>
      <table class="t"${timeDir()}><thead><tr><th>Hour</th>${HOURS.map(h => `<th>${h[0]}</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>TWL W/m²</b></td>${HOURS.map(h => `<td>${h[1] + (shade ? 20 : 0)}</td>`).join('')}</tr>
      <tr><td><b>Heavy work</b></td>${HOURS.map(h => h[0] === '12:00' ? '<td class="hatch"><span>break</span></td>' : (h[1] + (shade ? 20 : 0)) <= 150 ? '<td>■ Stop</td>' : '<td>● Allowed</td>').join('')}</tr>
      </tbody><tfoot><tr><td colspan="11">${COMPUTED} · forecast for Mussafah, sensor-corrected</td></tr></tfoot></table>`;
    return {
      nav: { title: 'Heat controls · Civil trench · 08:00', back: 'w1', clock: '08:00' },
      filters: ['Zone: Civil trench', 'Zone: Laydown yard', 'Task: heavy exposed', 'Task: all'],
      overflow: [{ label: 'Download hourly table (CSV)' }, { label: 'View rule history' }, { label: 'Compare with the forecast' },
        { label: 'Unlink sensor t1…', danger: true, fn: () => confirmModal({ title: 'Unlink sensor t1 from the civil trench?', body: 'Readings will fall back to the forecast and the band will rise one level.', btn: 'Unlink', verb: 'to unlink', onOk: () => toast('Sensor t1 unlinked · forecast in use') }) }],
      body: [
        section('TWL by squad', twl),
        section(compname(1) + ' · Task controls · Civil crew', tasks + `<div style="margin-top:8px">${computed()}</div>`),
        section('Policy stack', policy),
        section('Reading source', source),
        section('Evidence needed before clearance', evidence),
        section('Hourly forecast', tbl, ''),
        `<div><button class="link" data-go="w7" data-prefill="trench">◇ Ask why: “Why did the trench stop at 08:00 if 145 W/m² is in the Low zone?”</button></div>`,
      ],
      cta: App.f.stopIssued ? null : { label: 'Issue stop-work instruction', act: 'issue' },
    };
  },
  actions: {
    sun: () => { App.f.w2shade = false; refresh(); },
    shade: () => { App.f.w2shade = true; refresh(); },
    issue: () => { App.f.stopIssued = true; App.f.m2 = Math.max(App.f.m2 || 0, 1); refresh(); toast('Instruction issued to Huda (C01) · 08:01'); },
  },
});

/* ───────── W3 · Protective response ───────── */
screen('w3', {
  device: 'web', name: 'Protective response', short: 'Protective response', clock: '08:04', comp: 2,
  persona: 'Huda (owner of most actions) and Rashid (escalation owner).', context: 'Desktop; also visible to Rashid when he is escalated.',
  job: 'See which confirmations are outstanding and who owns them.',
  alt: { overdue: 'Escalation · unacknowledged', incident: 'Incident mode · 08:18' },
  empty: { text: 'No active stop-work or incident. Actions appear here when the Risk Monitor or a worker report needs a response.' },
  error: { text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last update from 08:04. Confirmations made here queue as “Saved on this device · will send”." },
  render({ v }) {
    const filters = ['Owner: me', 'Owner: all', 'Status: waiting', 'Status: done'];
    const overflow = [{ label: 'Export confirmation log' }, { label: 'View audit history' },
      { label: 'Withdraw confirmation…', danger: true, fn: () => confirmModal({ title: 'Withdraw “08:03 stop confirmed”?', body: 'Crew planning will lock again until it is re-recorded.', btn: 'Withdraw', verb: 'to withdraw', onOk: () => toast('Confirmation withdrawn · crew planning locked') }) }];
    const headcount = `<table class="t"><thead><tr><th>Worker</th><th>Arrived</th><th>Source</th></tr></thead><tbody>
      ${AFFECTED.map((k, i) => `<tr><td>${who(k)}</td><td>08:0${i < 4 ? 3 : 4}</td><td>Shelter A kiosk</td></tr>`).join('')}
      <tr><td>C13, C14</td><td>—</td><td>Separate supervised light task</td></tr></tbody></table>`;
    /* Overview of every squad's actions, responses and headcount; pick one for its detail. */
    const overview = (civilOpen, civilHead) => squadPicker(q => q.id === 'civil'
      ? [`Actions <b>${civilOpen}</b> open`, `Responses <b>${civilOpen ? 4 - civilOpen : 4} / 4</b>`, `Headcount <b>${civilHead}</b> · ${q.shelter}`]
      : [`Actions <b>${q.actions.open}</b> open · ${q.actions.done} done`, `Responses <b>${q.responses.done} / ${q.responses.total}</b>`, `Headcount <b>${q.headcount}</b> · ${q.shelter}`]);
    const q = squad();
    if (q.id !== 'civil') {
      return { nav: { title: `Protective response · ${q.name}`, back: 'w1', clock: '08:04' }, filters, overflow,
        body: [overview(0, '11 / 11'), section(`${q.name} · Required actions`, squadItems(q)), section('Headcount · ' + q.shelter, `<div class="statusline"><span class="si" data-status="ok" aria-hidden="true"></span> ${q.headcount} accounted for · ${q.loc}</div>`, 'From the kiosk (K2) and phones')] };
    }
    if (v === 'incident') {
      const r1 = App.f.w3removed, r2 = App.f.w3firstaid;
      const n = (r1 ? 0 : 1) + (r2 ? 0 : 1);
      const rowx = (t, d, done, act, l) => `<div class="row static nolead"><span><span class="t" style="display:block">${t}</span><span class="d">${d}</span></span><span class="rt" style="flex-direction:row;align-items:center;gap:8px">${done ? B.done() : B.wait()}${done ? '' : `<button class="btn solid" data-act="${act}">${l}</button>`}</span></div>`;
      return {
        nav: { title: 'Protective response · 08:18', back: 'w1', clock: '08:18' }, filters, overflow,
        body: [
          overview(n, '11 / 11'),
          section(compname(2) + ' · Confirm before replanning', `<div class="list">${rowx('Confirm Bilal (C08) removed from heat and where he is now', r1 ? 'Recorded ' + r1 + ' by Huda · Workshop → Shelter A' : 'Owner: Huda · due 08:28', r1, 'removed', 'Confirm removal')}${rowx('Record first-aid contact with Salim (P06)', r2 ? 'Recorded ' + r2 + ' · Salim arrived' : 'Salim notified 08:18 · owner: Huda', r2, 'firstaid', 'Record contact')}</div>`),
          `<div class="statusline">${n ? '■ Crew planning locked until both actions are confirmed' : '✓ Both confirmed · crew planning unlocked'}<span class="age" style="margin-left:auto">⚙ Escalation rule · not AI</span></div>`,
          n ? '' : `<div><button class="btn solid" data-go="w5" data-v="replan">Open replan →</button></div>`,
        ],
      };
    }
    const overdue = v === 'overdue';
    const ack = App.f.w3ack;
    const rows = [
      row({ lead: av('maya'), t: 'Issue the stop-work instruction to Huda (C01)', d: 'Recorded 08:01 by Maya · radio log.', b: B.done(), static: true }),
      overdue && !ack
        ? row({ lead: av('huda'), t: 'Acknowledge the instruction', d: 'Sent at 08:01. Due 08:03. No acknowledgement recorded.', b: B.over(), id: 'ack', act: 'selw3', sel: true })
        : row({ lead: av('huda'), t: 'Acknowledge the instruction', d: overdue ? 'Recorded ' + ack + ' · site app.' : 'Recorded 08:02 · site app.', b: B.done(), static: true }),
      overdue && !ack ? row({ lead: av('rashid'), t: 'Escalation: instruction unacknowledged after two minutes', d: 'Sent at 08:01. Escalated to Rashid at 08:03.', b: badge('■ Escalated', 'b-red'), static: true }) : '',
      row({ lead: av('huda'), t: 'Stop exposed work and confirm the stop', d: overdue && !ack ? 'Waiting for acknowledgement.' : 'Recorded 08:03 · site app.', b: overdue && !ack ? B.wait() : B.done(), static: true }),
      row({ lead: av('kiosk'), t: 'Confirm a safe recovery location for every affected worker', d: overdue && !ack ? '0 of 11 checked in.' : '11 of 11 checked in at Shelter A, 08:04 · kiosk.', b: overdue && !ack ? B.wait() : B.done(), static: true }),
    ];
    const n = overdue && !ack ? 2 : 0;
    return {
      nav: { title: 'Protective response · ' + (overdue ? '08:03' : '08:04'), back: 'w1', clock: overdue ? '08:03' : '08:04' }, filters, overflow,
      body: [
        overview(n, n ? '0 / 11' : '11 / 11'),
        section(compname(2) + ' · Required actions', list(rows) + `<div style="margin-top:8px">${computed('escalation after 2 min')}</div>`),
        section('Headcount · Shelter A', headcount, 'From the kiosk (K1) and phones'),
      ],
      cta: n ? { label: 'Record acknowledgement', act: 'ack' } : { label: 'Record confirmation', disabled: true, note: 'Nothing waiting. Select a waiting action to record it.' },
    };
  },
  actions: {
    ack: () => { App.f.w3ack = '08:03'; refresh(); toast('Acknowledgement recorded · escalation closed'); },
    selw3: () => {},
    removed: () => confirmModal({ title: 'Confirm Bilal is out of the heat', body: 'Records a human confirmation for the protective response. It cannot be recorded by software.', word: 'REMOVED', verb: 'to confirm Bilal is out of the heat', btn: 'Confirm', danger: false, focusInput: true, onOk: () => { App.f.w3removed = '08:21'; refresh(); toast('Removal recorded · 08:21'); } }),
    firstaid: () => { App.f.w3firstaid = '08:22'; refresh(); toast('First-aid contact recorded · 08:22'); },
  },
});

/* ───────── W4 · Crew & workshop ───────── */
const W4_CREW = [
  { k: 'rana', q: 1, r: 'Ready, confirmed by Huda 08:10:30, valid until end of shift.', s: 'ready' },
  { k: 'yusuf', q: 1, r: 'Ready, confirmed by Huda 08:10:30, valid until end of shift.', s: 'ready' },
  { k: 'dana', q: 1, r: 'Ready, confirmed by Huda 08:10:40, valid until end of shift.', s: 'ready' },
  { k: 'bilal', q: 1, r: 'Ready, confirmed by Huda 08:10:45, valid until end of shift.', s: 'ready' },
  { k: 'leila', q: 1, r: 'No readiness confirmation.', s: 'unconf' },
  { k: 'mariam', q: 1, r: 'No readiness confirmation.', s: 'unconf' },
  { k: 'samir', q: 1, r: 'No readiness confirmation.', s: 'unconf' },
  { k: 'c02', q: 1, r: 'Expired 3 Aug end of shift · reconfirm.', s: 'expired' },
  { k: 'zaid', q: 0, r: 'In recovery, Shelter A. Not qualified for workshop preparation.', s: 'rec' },
  { k: 'c03', q: 0, r: 'In recovery, Shelter A. Not qualified for workshop preparation.', s: 'rec' },
  { k: 'c04', q: 0, r: 'In recovery, Shelter A. Not qualified for workshop preparation.', s: 'rec' },
];
screen('w4', {
  device: 'web', name: 'Crew & workshop', short: 'Crew & workshop', clock: '08:10', comp: 3,
  persona: 'Huda.', context: 'Desktop, at 08:10 with the crew in shelter.',
  job: 'Decide who can move to covered work, and record the assignment.',
  alt: { noone: 'No one eligible' },
  empty: { text: 'No covered task available. Add a task with its location and useful demand to let the planner propose work.', cta: 'Add covered task' },
  render({ v }) {
    const f = App.sel.w4f || 'all';
    const noone = v === 'noone';
    const crew = W4_CREW.map(c => noone && c.s === 'ready' ? { ...c, s: 'unconf', r: 'No readiness confirmation.' } : c)
      .filter(c => f === 'all' || (f === 'q' && c.q) || (f === 'r' && c.s === 'ready'));
    const bdg = s => s === 'ready' ? B.done('Ready') : s === 'unconf' ? B.wait('Unconfirmed') : s === 'expired' ? B.over('Expired') : B.muted('○ Recovery');
    /* The crew as a grid of people, not a list. */
    const card = (k, status, note) => `<div class="crew-card" tabindex="0" data-id="${k}">${av(k, { size: 'lg' })}<b>${who(k)}</b>${status}<span class="d">${note}</span><button class="iconbtn" data-act="rowmenu" data-id="${k}" aria-label="More for ${who(k)}">⋯</button></div>`;
    const rows = crew.map(c => card(c.k, bdg(c.s), (c.q ? 'Qualified. ' : '') + c.r));
    const q = squad();
    const picker = squadPicker(x => x.id === 'civil' ? [`${noone ? 0 : 4} eligible · 4 of 6 workshop places free`] : [`${x.loc} · ${x.size} workers`]);
    if (q.id !== 'civil') {
      return { nav: { title: `Crew & workshop · ${q.name}`, back: 'w1', clock: '08:10' }, filters: ['Readiness: all'], overflow: [{ label: 'View qualification matrix' }],
        body: [picker, section(`Crew · ${q.name}`, `<div class="crew-grid">${q.members.map(k => card(k, q.hold ? B.muted('○ Recovery') : B.done('Working'), `${q.loc}. ${q.status}.`)).join('')}</div>`)] };
    }
    const assigned = App.f.assigned;
    const seats = ['lina', 'omar'].map(k => `<div class="seat fixed">${av(k)}${PEOPLE[k].n} · fixed</div>`).join('') +
      (noone ? '<div class="seat free">Free</div>'.repeat(4) : ['rana', 'yusuf', 'dana', 'bilal'].map(k => `<div class="seat ${assigned ? '' : 'prop'}">${av(k)}${PEOPLE[k].n} · ${assigned ? 'assigned' : 'proposed'}</div>`).join(''));
    const proposal = noone
      ? `<div class="statusline" style="flex-direction:column;align-items:flex-start">Nobody is confirmed ready for workshop preparation. Readiness is a separate confirmation. Time in shelter doesn’t count.<button class="btn solid" data-go="m4" style="margin-top:8px">Confirm readiness →</button></div>`
      : `<div class="proposal">
          <div class="between"><b>Proposal · not applied</b>${badge('◇ Proposal', 'b-wait')}</div>
          <p class="p" style="margin-top:8px">Move <b>Rana, Yusuf, Dana and Bilal</b> to workshop preparation for 08:11–09:11, alternating work and cooled recovery.</p>
          ${computed('work/rest planner')}
        </div>
        ${aiBlock({ key: 'w4', conf: 'High', text: 'Four workers meet every requirement: Rana, Yusuf, Dana and Bilal. Leila is qualified but has no readiness confirmation yet.', tools: ['optimise_schedule'], inputs: ['Readiness records (4 valid)', 'Catalogue capacity 6', 'Fixed occupants 2 (Lina, Omar)', 'Useful demand 4'], editGo: 'm5' })}
        ${assigned ? `<div class="statusline">✓ 08:11 · Assignment recorded by Huda <span class="age" style="margin-left:auto">Separate record · the proposal stays unchanged</span></div>` : ''}`;
    return {
      nav: { title: 'Crew & workshop · 08:10', back: 'w1', clock: '08:10' },
      filters: ['Qualification: workshop preparation', 'Readiness: confirmed', 'Readiness: unconfirmed'],
      overflow: [{ label: 'View qualification matrix' }, { label: 'Export allocation' }],
      body: [
        picker,
        section(compname(3) + ' · Proposal', proposal),
        section('Eligibility', `<div class="funnel" role="group" aria-label="Eligibility funnel">
          <button class="${f === 'all' ? 'on' : ''}" data-act="f" data-id="all"><b>11</b>affected</button>
          <button class="${f === 'q' ? 'on' : ''}" data-act="f" data-id="q"><b>8</b>qualified</button>
          <button class="${f === 'r' ? 'on' : ''}" data-act="f" data-id="r"><b>${noone ? 0 : 4}</b>confirmed ready</button></div>`),
        section('Workshop seats', `<div class="seats">${seats}</div>`, 'Drag a worker to a seat, or focus a row and press A'),
        section('Requirement checks', list([
          row({ t: 'Permit', d: 'Workshop hot-work permit not required · covered task', b: B.done('Pass'), static: true }),
          row({ t: 'Resources', d: 'Pipe racks, gloves, cooled workshop', b: B.done('Pass'), static: true }),
          row({ t: 'Supervision', d: 'Huda, external · uses no place', b: B.done('Pass'), static: true }),
        ])),
        section('Crew · ' + (f === 'all' ? 'all affected' : f === 'q' ? 'qualified' : 'confirmed ready'), `<div class="crew-grid">${rows.join('')}</div>`),
      ],
      cta: noone ? { label: 'Record assignment', disabled: true, note: 'Nobody is eligible yet.' }
        : assigned ? { label: 'Open work/rest plan →', go: 'w5' } : { label: 'Record assignment', act: 'assign' },
    };
  },
  keys: { a: () => { const r = document.activeElement && document.activeElement.closest('.row[data-id], .crew-card[data-id]'); if (!r) return toast('Focus a crew row first'); const c = W4_CREW.find(x => x.k === r.dataset.id); toast(c.s === 'ready' ? `${PEOPLE[c.k].n} is already in the proposal` : `${PEOPLE[c.k].n} can’t be added: no valid readiness confirmation`); } },
  actions: {
    f: el => { App.sel.w4f = el.dataset.id; refresh(); },
    assign: () => { App.f.assigned = true; refresh(); toast('08:11 · Assignment recorded by Huda'); },
    rowmenu: el => {
      const p = PEOPLE[el.dataset.id];
      menu(el, [
        { label: 'Reconfirm readiness', go: 'm4' },
        { label: 'View qualification' },
        { label: 'Remove from allocation…', danger: true, fn: () => confirmModal({ title: `Remove ${who(el.dataset.id)} from the civil crew allocation?`, body: `${p.n} will no longer appear in proposals for this crew today.`, btn: 'Remove', verb: 'to remove', onOk: () => toast(`${p.n} removed from allocation`) }) },
      ], who(el.dataset.id));
    },
  },
});

/* ───────── W5 · Work/rest plan ───────── */
function tmin(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function tstr(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
function w5Plan(v) {
  const four = (start) => [['w', start, start + 15], ['r', start + 15, start + 30], ['w', start + 30, start + 45], ['r', start + 45, start + 60]];
  const s0 = tmin('08:11');
  if (v === 'replan') {
    const T = tmin('08:18');
    const p = {
      Rana: four(s0).map(i => [...i]), Yusuf: four(s0), Dana: four(s0),
      Bilal: [['x', T, T + 75, 'Excluded from work · recovery reserved to 09:33']],
      '7 others': [['r', T, T + 60]],
    };
    if (App.f.w5branch === 'confirmed') p.Leila = [['r', T, tmin('08:26')], ['w', tmin('08:26'), tmin('08:41')], ['r', tmin('08:41'), tmin('08:56')], ['w', tmin('08:56'), tmin('09:11')], ['r', tmin('09:11'), T + 60]];
    return { start: T, horizon: T + 60, end: T + 90, p };
  }
  return { start: s0, horizon: s0 + 60, end: s0 + 90, p: { Rana: four(s0), Yusuf: four(s0), Dana: four(s0), Bilal: four(s0), '7 others': [['r', s0, s0 + 60]] } };
}
function gantt(pl) {
  const span = pl.end - pl.start, pct = t => ((t - pl.start) / span * 100).toFixed(2) + '%';
  const ticks = []; for (let t = pl.start; t <= pl.end; t += 15) ticks.push(`<span style="inset-inline-start:${pct(t)}">${tstr(t)}</span>`);
  const clip = iv => iv.map(([k, a, b, l]) => [k, Math.max(a, pl.start), Math.min(b, pl.end), l]).filter(([, a, b]) => b > a);
  /* Each row leads with the person's crew photo; the grouped row shows a few of the others. */
  const inPlan = Object.keys(pl.p).map(n => n.toLowerCase());
  const others = AFFECTED.filter(k => !inPlan.includes(k));
  const lab = n => PEOPLE[n.toLowerCase()] ? `<span class="person">${av(n.toLowerCase(), { size: 'sm' })}<span>${n}</span></span>`
    : /others/.test(n) ? `<span class="person"><span class="avatars">${others.slice(0, 3).map(k => av(k, { size: 'xs' })).join('')}</span><span>${n}</span></span>` : n;
  const rows = Object.entries(pl.p).map(([n, iv]) => `<div class="g-row"><div class="g-lab">${lab(n)}</div><div class="g-track">${clip(iv).map(([k, a, b, l]) =>
    `<div class="g-bar ${k === 'w' ? 'g-work' : k === 'r' ? 'g-rest' : 'g-excl'}" style="inset-inline-start:${pct(a)};width:calc(${pct(b)} - ${pct(a)})" title="${n} ${tstr(a)}–${tstr(b)}">${k === 'w' ? 'Work' : k === 'x' ? l : ''}</div>`).join('')}</div></div>`).join('');
  const cur = App.sel.w5t !== undefined ? App.sel.w5t : tmin('08:35') - pl.start;
  return `<div class="gantt" id="gantt"${timeDir()}><div class="g-ticks"><div style="border-inline-end:1px solid var(--ink)"></div><div class="tk">${ticks.join('')}</div></div>${rows}
    <div class="g-overlay"><div class="g-horizon" style="inset-inline-start:${pct(pl.horizon)}" title="Planning horizon"></div><div class="g-cursor" id="gcur" style="inset-inline-start:${pct(pl.start + cur)}"></div></div></div>
    <div class="scrub"${timeDir()}><label for="scr"><b>Time cursor</b></label><input id="scr" type="range" min="0" max="${span}" value="${cur}" aria-describedby="scrout"><span id="scrout" aria-live="polite"></span></div>
    <div class="flex" style="margin-top:8px;font-size:12px"><span class="badge b-plan">▶ Work</span><span class="badge g-rest" style="position:static">&nbsp;&nbsp;&nbsp;&nbsp;</span> Cooled recovery <span>┆ Planning horizon</span></div>`;
}
function w5Readout(pl, t) {
  const at = pl.start + t, working = [], resting = [], excl = [];
  Object.entries(pl.p).forEach(([n, iv]) => { const i = iv.find(([, a, b]) => at >= a && at < b); if (!i) return; (i[0] === 'w' ? working : i[0] === 'x' ? excl : resting).push(n); });
  const names = a => a.length ? a.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'nobody';
  return `<b>${tstr(at)}</b> · ${working.length ? names(working) + ' in workshop' : 'Nobody working'}; ${names(resting)} in cooled recovery${excl.length ? '; ' + names(excl) + ' excluded from work' : ''}; ${2 + working.length} of 6 workshop places in use`;
}
screen('w5', {
  device: 'web', name: 'Work/rest plan', short: 'Work/rest plan', clock: '08:11', comp: 3,
  persona: 'Huda.', context: 'Desktop, at 08:11 and again after the 08:18 replan.',
  job: 'Check that the next hour’s work and recovery is valid, and send it to the crew.',
  alt: { replan: 'Replan · 08:18', infeasible: 'Infeasible' },
  empty: { text: 'No plan for this hour yet. The planner needs observed work/rest history from Shelter A check-ins.', cta: 'Request plan' },
  error: { text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last valid plan · 08:11. Your entries are saved on this device." },
  render({ v }) {
    const overflow = [{ label: 'Export intervals (crew_rest.intervals JSON)' }, { label: 'Compare with the previous plan' }, { label: 'Edit policy' },
      { label: 'Delete draft…', danger: true, fn: () => confirmModal({ title: 'Delete draft shift plan “Civil crew · 4 Aug, v2”?', body: 'The draft and its intervals will be removed. The sent plan v1 is not affected.', onOk: () => toast('Draft v2 deleted') }) }];
    const filters = ['Worker: all', 'Worker: Rana', 'Location: Workshop', 'Location: Shelter A'];
    const q = squad();
    const picker = squadPicker(x => x.id === 'civil' ? [v === 'infeasible' ? 'Plan infeasible' : 'Plan feasible · 08:11–09:11'] : [x.hold ? 'Plan needed' : 'No plan needed · no heat hold']);
    if (q.id !== 'civil') {
      return { nav: { title: `Work/rest plan · ${q.name}`, back: 'w1', clock: '08:11' }, overflow, filters,
        body: [picker, `<div class="statusline"><span class="si" data-status="ok" aria-hidden="true"></span> No work/rest plan needed: the ${q.name.toLowerCase()} has no heat hold. ${q.status}.</div>${computed()}`] };
    }
    if (v === 'infeasible') {
      return { nav: { title: 'Work/rest plan · 08:11–09:11', back: 'w1', clock: '08:11' }, overflow, filters,
        body: [picker, `<div class="statusline signal">■ No schedule satisfies the work and recovery limits: recovery shelters are unavailable.</div>${computed('optimise_schedule')}`],
        cta: { label: 'Send plan to crew phones', disabled: true, note: 'Nothing to send. Restore a recovery location to replan.' } };
    }
    const replan = v === 'replan';
    const pl = w5Plan(v);
    const leila = App.f.w5branch === 'confirmed';
    const work = replan ? (leila ? 120 : 90) : 120;
    const ivs = [];
    Object.entries(pl.p).forEach(([n, iv]) => iv.forEach(([k, a, b, l]) => { if (n !== '7 others') ivs.push({ n, k, a, b, l }); }));
    ivs.sort((x, y) => x.a - y.a || x.n.localeCompare(y.n));
    const rows = ivs.slice(0, 10).map(i => row({ t: `${i.n} · ${i.k === 'w' ? 'Workshop preparation' : i.k === 'x' ? 'Excluded from work' : 'Cooled recovery'}`, d: `${tstr(i.a)}–${tstr(i.b)} · ${i.b - i.a} min${i.k === 'r' ? ' · Shelter A' : ''}`, b: i.k === 'w' ? B.plan('▶ Work') : i.k === 'x' ? B.red('Excluded') : B.plain('Rest'), static: true }));
    const sent = App.f['w5sent' + (replan ? 'r' : '')];
    return {
      nav: { title: 'Work/rest plan · ' + (replan ? '08:18–09:18' : '08:11–09:11'), back: 'w1', clock: replan ? '08:18' : '08:11' }, overflow, filters,
      body: [
        picker,
        replan ? `<div class="between"><div class="seg" role="group" aria-label="Branch"><button class="${leila ? '' : 'on'}" data-act="br" data-id="un">Leila unconfirmed</button><button class="${leila ? 'on' : ''}" data-act="br" data-id="confirmed">Leila confirmed 08:18</button></div><span class="age">Replan after Bilal’s report · 08:18</span></div>` : '',
        section(compname(3) + ' · Timeline', gantt(pl) + `<p class="age" style="margin:8px 0 0">${work} worker-min useful work · ${240 - work} unmet of 240 · feasible, not proven optimal · <button class="link" data-act="policy" style="min-height:0;font-weight:500">Fictional test policy</button></p>`),
        section('Intervals', list(rows) + `<div style="margin-top:8px">${computed('optimise_schedule')}</div>`, ivs.length > 10 ? `Showing 10 of ${ivs.length}` : ''),
      ],
      /* The AI Planning Agent sits in the right-hand sidebar, beside the plan it explains. */
      detail: `<div class="agent-side"><h2 class="h2">${icon('ai')} AI Planning Agent</h2>` + aiBlock(replan
          ? { key: 'w5r', conf: 'High', text: 'Bilal is excluded from work and keeps cooled recovery through 09:33. ' + (leila ? 'With Leila confirmed at 08:18, she takes the fourth place from 08:26, so useful work stays at 120 worker-minutes.' : 'Without Leila, three workers cover 90 worker-minutes; 150 stay unmet.'), tools: ['optimise_schedule'], inputs: ['Unplanned rest: Bilal 08:18', 'Readiness records (' + (leila ? 4 : 3) + ' valid)', 'Check-in history 08:04–08:18'], acts: [{ l: 'Edit plan', go: 'w4' }, { l: 'Discard summary', act: 'discard' }] }
          : { key: 'w5', conf: 'High', text: 'Seven recorded recovery minutes already meet the six-minute requirement, so the four can start at once. Each works two 15-minute blocks with 15 minutes of cooled recovery between.', tools: ['optimise_schedule'], inputs: ['Check-in history 08:04–08:11 (Shelter A)', 'Policy: 6 min initial recovery, ≤ 15 min work, 15 min between', 'Workshop places 4 free of 6'], acts: [{ l: 'Edit plan', go: 'w4' }, { l: 'Discard summary', act: 'discard' }] })
        + `<button class="link" data-go="w7">Ask the Planning Agent about this plan →</button></div>`,
      cta: sent ? { label: `✓ Sent ${replan ? '08:19' : '08:11'} · ${replan ? (leila ? 5 : 4) : 4} of ${replan ? (leila ? 5 : 4) : 4} delivered`, disabled: true } : { label: 'Send plan to crew phones', act: 'send' },
      mount() {
        const inp = $('#scr'), out = $('#scrout'), cur = $('#gcur'); if (!inp) return;
        const span = pl.end - pl.start;
        const upd = () => { const t = +inp.value; App.sel.w5t = t; cur.style.insetInlineStart = (t / span * 100) + '%'; out.innerHTML = w5Readout(pl, t); };
        inp.addEventListener('input', upd); upd();
      },
    };
  },
  actions: {
    br: el => { App.f.w5branch = el.dataset.id; refresh(); },
    policy: () => toast('Policy editor lives in the overflow menu'),
    send: () => { const k = 'w5sent' + (App.variant === 'replan' ? 'r' : ''); App.f[k] = true; refresh(); toast('Sent · each worker gets only their own intervals'); },
  },
});

/* ───────── W6 · Restart review ───────── */
screen('w6', {
  device: 'web', name: 'Restart review', short: 'Restart review', clock: '15:08', comp: 4,
  persona: 'Rashid, Sandline superintendent, the only person who can decide on a restart.', context: 'Desktop or tablet in the site office.',
  job: 'See whether the evidence is complete, then record his own decision.',
  alt: { blocked: 'Blocked · 13:00 proposal' },
  empty: { text: 'No restart has been proposed. Propose a time to start the eight checks.', cta: 'Propose restart time' },
  error: { text: "■ Couldn't reach Heat-Safe in 20 seconds. Showing the last update from 15:06. The decision form keeps what you typed." },
  render({ v }) {
    const blocked = v === 'blocked';
    const fresh = App.f.freshReading;
    const done = App.f.restarted;
    const pass = l => B.done(l || 'Pass'), fail = l => B.red(l || 'Fail');
    const checks = [
      ['Proposed restart time', blocked ? '13:00 · proposed by Huda.' : '15:10 · proposed by Huda.', blocked ? fail() : pass()],
      ['Fresh local heat evidence', blocked ? 'Stale · 08:00 reading · ask Maya for a fresh reading.' : `${fresh || '175'} W/m² from sensor t1 via base station, measured 2 min ago.`, blocked ? fail('Stale') : pass()],
      ['Permit', 'Excavation permit PTW-0412 valid to 18:00 · confirmed by Maya, evidence ref PTW-0412.', pass()],
      ['Personnel', 'Huda supervising; Salim on site as first aider · confirmed by Huda.', pass()],
      ['Recovery', 'Shelter A cooled, 14 places · confirmed by Huda, photo ref SA-1502.', pass()],
      ['Water', 'Cooler full, 40 L · confirmed by Huda 15:02.', pass()],
      ['Crew readiness', '9 workers confirmed ready for heavy exposed work · Bilal excluded.', pass()],
      ['Midday restriction', blocked ? '13:00 falls inside 12:30–15:00.' : '15:10 is after the 12:30–15:00 break.', blocked ? fail() : pass()],
    ];
    const f = App.sel.w6f || 'all';
    const shown = checks.map((c, i) => ({ c, i })).filter(({ c }) => f === 'all' || (f === 'fail') === /Fail|Stale/.test(c[2]));
    const rows = shown.map(({ c, i }) => {
      const stale = blocked && i === 1;
      return `<div class="row static" ><span class="lead">${marker(4)}</span><span style="min-width:0"><span class="t" style="display:block">${i + 1}. ${c[0]}</span><span class="d">${c[1]}</span></span><span class="rt" style="flex-direction:row;align-items:center;gap:8px">${c[2]}${stale ? '<button class="btn" data-go="m7">Request fresh reading</button>' : ''}</span></div>`;
    });
    /* Per squad: latest reading, status, the midday break and readiness checks done. */
    const q = squad();
    const civilRow = { v: blocked ? 145 : (fresh || 175), at: blocked ? '08:00 · stale' : '15:06 · fresh', status: done ? 'Restart recorded · 15:08' : blocked ? 'Stop-work · restart blocked' : 'Stop-work · ready for review', checks: blocked ? 6 : 8 };
    const squadTable = `<table class="t sq-twl"><thead><tr><th>Squad</th><th>Latest reading</th><th>Current status</th><th>Break starts</th><th>Break ends · forecast</th><th>Readiness checks</th></tr></thead><tbody>
      ${SQUADS.map(x => { const c = x.id === 'civil'; const rd = c ? civilRow : { v: x.reading.v, at: x.reading.fresh ? x.reading.at + ' · fresh' : 'forecast · sensor offline', status: x.status, checks: x.checks.done };
        const tot = x.checks.total; const st = !tot ? '' : rd.checks === tot ? 'ok' : 'warn';
        return `<tr class="${x.id === q.id ? 'on' : ''}" data-act="squad" data-id="${x.id}" tabindex="0"><td>${av(x.foreman, { size: 'xs' })} <b>${x.name}</b></td><td><b>${rd.v} W/m²</b> · ${rd.at}</td><td>${rd.status}</td><td>${x.brk.start}</td><td>${x.brk.end}${x.brk.end !== '—' ? ' · TWL ' + (x.twl + 14) + ' forecast' : ''}</td><td>${tot ? `${st ? `<span class="si" data-status="${st}" aria-hidden="true"></span> ` : ''}<b>${rd.checks} of ${tot}</b>` : '—'}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="6">${COMPUTED} · MoHRE midday break 12:30–15:00 · select a squad for its checks</td></tr></tfoot></table>`;
    const isRashid = App.role === 'super';
    let cta;
    if (q.id !== 'civil') cta = null;
    else if (done) cta = { label: '✓ Restart recorded · Rashid 15:08', disabled: true };
    else if (blocked) cta = { label: 'Record restart decision', disabled: true, note: 'Resolve the 2 failing checks first.' };
    else if (!isRashid) cta = { label: 'Record restart decision', disabled: true, note: 'Only Rashid (superintendent) can record a restart decision. Switch role in the left panel.' };
    else cta = { label: 'Record restart decision', act: 'restart' };
    return {
      nav: { title: 'Restart review · Heavy exposed civil work', back: 'w1', clock: blocked ? '12:40' : '15:08' },
      filters: [{ label: 'Show all checks', fn: () => { App.sel.w6f = 'all'; refresh(); } }, { label: 'Show passed', fn: () => { App.sel.w6f = 'pass'; refresh(); } }, { label: 'Show failed', fn: () => { App.sel.w6f = 'fail'; refresh(); } }],
      overflow: [{ label: 'Decision history' }, { label: 'Export for Dune–Sandline cost review (Amal)' },
        ...(done ? [{ label: 'Withdraw restart decision…', danger: true, fn: () => confirmModal({ title: 'Withdraw the 15:08 restart decision?', body: 'This immediately re-raises the stop-work on every board.', btn: 'Withdraw', verb: 'to withdraw', onOk: () => { App.f.restarted = false; refresh(); toast('Restart withdrawn · stop-work re-raised'); } }) }] : [])],
      body: [
        section('Restart status by squad', squadTable),
        q.id !== 'civil' ? `<div class="statusline"><span class="si" data-status="ok" aria-hidden="true"></span> No restart review for the ${q.name.toLowerCase()}: it has no stop-work. ${q.status}.</div>` : '',
        q.id !== 'civil' ? '' : section(compname(4) + ' · Eight checks · Civil crew', `<div class="list">${rows.join('')}</div><div style="margin-top:8px">${computed()}</div>`, 'Each human check needs an evidence reference and a named confirmer'),
        q.id === 'civil' && blocked ? aiBlock({ key: 'w6', conf: 'High', text: '13:00 falls inside the MoHRE midday break (12:30–15:00), so outdoor work cannot restart then. The heat reading is also older than five minutes; a fresh reading from sensor t1 is needed.', tools: ['compute_heat_stress (midday-break minutes)', 'search_guidance'], inputs: ['Proposed restart 13:00', 'Latest reading 08:00, sensor t1'], cites: ['MoHRE Ministerial Resolution · midday break 12:30–15:00, 15 June–15 September'], acts: [{ l: 'Discard', act: 'discard' }] }) : '',
        `<div class="note">Software never lifts the stop-work. The button records Rashid’s human decision.</div>`,
      ],
      cta,
    };
  },
  actions: {
    restart: () => confirmModal({ title: 'Record restart decision', body: 'This records your decision as superintendent. It is shared with Huda’s board, the crew phones and the audit trail.', word: 'RESTART', verb: 'to record your decision to restart heavy exposed civil work at 15:10', btn: 'Record decision', danger: false, onOk: () => { App.f.restarted = true; refresh(); toast('Decision recorded · stop-work lifted for 15:10'); } }),
  },
});

/* ───────── W7 · Ask the Planning Agent ───────── */
const QA = {
  trench: { q: 'Why did the trench stop at 08:00 if 145 W/m² is in the Low zone?', conf: 'High', text: 'The legal zone at 145 W/m² is Low (ADOSH-SF CoP 11.0 sets the Low zone at TWL ≥ 140), which allows work with controls. The Sandline heat plan is stricter: it stops heavy exposed work at TWL ≤ 150. Heat-Safe applies the stricter rule, so heavy exposed civil work stopped at 08:00.', tools: ['compute_heat_stress', 'search_guidance'], inputs: ['TWL 145 W/m² · sensor t1 · 08:00', 'Task: heavy exposed civil work', 'Site policy: Sandline heat plan'], cites: ['ADOSH-SF CoP 11.0 · Heat stress · TWL zones', 'Sandline heat plan · Stop-work triggers · TWL ≤ 150 for heavy exposed work'], use: 'w2' },
  restart13: { q: 'Can we restart the trench at 13:00?', conf: 'High', text: 'No. 13:00 falls inside the MoHRE midday break (12:30–15:00), when no outdoor work is allowed. The earliest time outside the break is 15:00, and Rashid still needs fresh local heat evidence and the other restart checks before deciding.', tools: ['compute_heat_stress (midday-break minutes)', 'search_guidance'], inputs: ['Proposed restart 13:00', 'Date 4 Aug 2025'], cites: ['MoHRE Ministerial Resolution · midday break 12:30–15:00, 15 June–15 September'], use: 'w6', useV: 'blocked' },
  complain: { q: 'Which workers complain most? I want to review their contracts.', refused: true, text: 'I can’t rank or compare individual workers, and check-in content is never used for contract decisions. I can show crew-level patterns instead, for example how many unplanned rests the civil crew had this week and at what TWL.', tools: ['purpose_limitation_guard'], inputs: ['Request type: individual ranking for employment decision'], cites: [] },
  bilal: { q: 'Why does Bilal need rest now?', conf: 'High', text: 'Bilal reported at 08:18 that he feels unwell. The escalation rule moves any worker who reports feeling unwell to Red: remove from heat and check within 10 minutes. I can see the action, not his answers.', tools: ['get_actions'], inputs: ['Action a1 · 08:18 · Red', 'Escalation rule v2026.11.07-1'], cites: ['Sandline heat plan · Symptom response · remove from heat, check within 10 minutes'], use: 'w3', useV: 'incident' },
  temp9: { q: 'What was the TWL at 09:00?', conf: 'Low', warn: 'Grounding check: these values did not match any tool output: 147 W/m²', text: 'The forecast TWL at 09:00 was 147 W/m², so heavy exposed work stays stopped.', tools: ['compute_heat_stress'], inputs: ['Forecast hour 09:00'], cites: [], use: 'w2' },
  tomorrow: { q: 'Plan tomorrow for the civil crew at Mussafah', conf: 'Medium', text: 'Tomorrow’s forecast keeps TWL below 150 W/m² from 08:00 to 12:00, so heavy exposed work would stop for most of the morning. A draft plan keeps 4 workers on covered workshop work 08:00–12:00 and resumes trench work at 15:00. Assumption: no shade at the trench.', tools: ['compute_heat_stress', 'optimise_schedule', 'search_guidance'], inputs: ['Forecast 5 Aug 2025, Mussafah', 'Crew roster: civil crew (14)', 'Assumption: no shade assumed'], cites: ['Sandline heat plan · Stop-work triggers'], use: 'w5' },
};
const SUGGESTED = ['trench', 'restart13', 'complain'];
function qaCard(k, i, mobile) {
  const a = QA[k];
  const bdg = a.refused ? badge('Refused') : badge(a.conf);
  const body = a.refused
    ? `<div class="ai"><div class="ai-h"><span>◇ AI · Planning Agent</span>${badge('Refused', '', 'Refused')}</div><p>${a.text}</p><div class="computed">Refusal logged to telemetry</div><div class="ai-actions"><button class="btn" data-act="ask" data-id="weekly">Show crew-level unplanned rests</button></div></div>`
    : aiBlock({ key: 'qa' + k + i, conf: a.conf, warn: a.warn, text: a.text, tools: a.tools, inputs: a.inputs, cites: a.cites, acts: [{ l: 'Use in plan', go: mobile ? 'm5' : a.use, v: mobile ? null : a.useV }, { l: 'Discard', act: 'discard' }] });
  return `<div class="qa"><div class="q"><span>${a.q}</span>${bdg}</div><div class="a">${body}</div></div>`;
}
function askState() {
  if (!App.f.asked) App.f.asked = ['trench'];
  if (App.f.prefill) { const p = App.f.prefill; delete App.f.prefill; if (!App.f.asked.includes(p)) App.f.asked.push(p); }
  return App.f.asked;
}
/* A friendly face for the agent, with a callout saying what it can help with. */
function agentIntro() {
  return `<div class="agent-intro">
    <svg class="agent-face" viewBox="0 0 64 64" role="img" aria-label="Planning Agent">
      <circle cx="32" cy="36" r="22" fill="#FFD27A" stroke="currentColor" stroke-width="2"/>
      <path d="M10 30a22 22 0 0 1 44 0z" fill="#F2A900" stroke="currentColor" stroke-width="2"/><path d="M6 30h52v5H6z" fill="#F2A900" stroke="currentColor" stroke-width="2"/><path d="M28 9h8v10h-8z" fill="#F2A900" stroke="currentColor" stroke-width="2"/>
      <circle cx="24" cy="42" r="2.6" fill="currentColor"/><circle cx="40" cy="42" r="2.6" fill="currentColor"/>
      <path d="M22 49c5 6 15 6 20 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="17" cy="48" r="3" fill="#F4A3A3" opacity=".6"/><circle cx="47" cy="48" r="3" fill="#F4A3A3" opacity=".6"/>
    </svg>
    <div class="callout"><b>Hi, I’m the Planning Agent.</b> Ask me in plain words. I can:
      <ul><li>explain why work stopped, or which rule applies to a squad</li><li>check whether a restart time is allowed</li><li>draft a work/rest plan for a squad</li><li>sum up a squad’s actions, readiness or headcount</li></ul>
      <small>I cite my sources and use computed numbers only. I never change a plan or a record; people do.</small></div>
  </div>`;
}
function askRender(v, mobile) {
  let asked = askState().slice();
  if (v === 'refusal') asked = ['complain'];
  if (v === 'grounding') asked = ['temp9'];
  if (!asked.length && v === 'default') asked = ['trench'];
  const last = QA[asked[asked.length - 1]];
  /* The conversation is the screen. The latest answer's sources sit in one small row
     at its base, above the suggested questions; no summary readouts. */
  const cites = (last.cites || []);
  const sources = `<div class="src-row" aria-label="Sources for the latest answer"><span class="src-k">Sources</span>${cites.length ? cites.map(c => `<span class="src">${c}</span>`).join('') : `<span class="src none">${last.refused ? 'None · request refused' : 'None cited'}</span>`}</div>`;
  const cards = asked.map((k, i) => qaCard(k, i, mobile)).join('') + sources;
  const sugg = `<div class="sugg">${SUGGESTED.map(k => `<button data-act="ask" data-id="${k}">${QA[k].q}</button>`).join('')}</div>`;
  return { cards, sugg };
}
function askSubmit(text) {
  const k = Object.keys(QA).find(k => QA[k].q.toLowerCase() === text.toLowerCase().trim()) ||
    (/restart|13:00/i.test(text) ? 'restart13' : /complain|rank|contract|worst/i.test(text) ? 'complain' : /bilal/i.test(text) ? 'bilal' : /tomorrow/i.test(text) ? 'tomorrow' : /09:00|nine/i.test(text) ? 'temp9' : 'trench');
  toast('◇ Planning Agent · calling tools…');
  setTimeout(() => {
    askState(); App.f.asked.push(k);
    if (App.variant !== 'default') go(App.route); else refresh();
    setTimeout(() => { const c = $('#frame .col') || $('#frame .scroll'); if (c) c.scrollTop = c.scrollHeight; const q = $$('#frame .qa').pop(); if (q) q.scrollIntoView({ block: 'start' }); }, 30);
  }, 700);
}
const ASK_ACTIONS = {
  ask: el => { if (el.dataset.id === 'weekly') return toast('Civil crew · 3 unplanned rests this week · all at TWL ≤ 150'); askSubmit(QA[el.dataset.id].q); },
  send: () => { const i = $('#frame .composer input'); if (!i.value.trim()) { i.focus(); return; } askSubmit(i.value); },
};
const ASK_OVERFLOW = [{ label: 'Copy answer with citations', msg: 'Copied with 2 citations' }, { label: 'Report a wrong answer', msg: 'Reported · added to the eval set' },
  { label: 'Clear conversation…', danger: true, fn: () => confirmModal({ title: 'Clear this conversation?', body: 'Questions and answers will be removed from your view; the audit log keeps them.', btn: 'Clear', verb: 'to clear', onOk: () => { App.f.asked = []; App.f.cleared = true; go(App.route, 'empty'); } }) }];
screen('w7', {
  device: 'web', name: 'Ask the Planning Agent', short: 'Ask', clock: '08:20',
  persona: 'Huda, Maya or Rashid.', context: 'Desktop side panel (420px drawer) on any screen, or full screen from the sidebar.',
  job: 'Get a cited, plain-language answer about the plan, the rules or the crew in under 30 seconds.',
  alt: { refusal: 'Refusal', grounding: 'Grounding warning' },
  empty: { text: 'Ask about today’s heat, the plan or the rules. Answers cite their sources and use computed numbers only.', cta: 'Ask: “Plan tomorrow for the civil crew at Mussafah”', act: 'asktomorrow' },
  error: { text: "■ The Planning Agent didn't respond within 20 seconds. Your question is saved." },
  render({ v }) {
    const { cards, sugg } = askRender(v, false);
    return {
      nav: { title: 'Ask the Planning Agent', back: 'w1' },
      filters: ['Only my questions', 'All supervisors'], overflow: ASK_OVERFLOW,
      body: [section('AI Planning Agent', agentIntro() + `<div class="convo">${cards}</div>`), section('Suggested questions', sugg)],
      footer: `<form class="composer" onsubmit="event.preventDefault();runAct('send')"><label class="sr" for="askin" style="position:absolute;left:-9999px">Your question</label><input id="askin" placeholder="Ask about heat, the plan or the rules" autocomplete="off"><button class="btn solid" type="submit" style="min-width:120px">Send</button></form>`,
    };
  },
  actions: { ...ASK_ACTIONS, asktomorrow: () => { go('w7'); setTimeout(() => askSubmit(QA.tomorrow.q), 30); } },
});

/* ───────── W8 · System & trust ───────── */
const NODES = [
  ['Inputs'],
  ['t1', 'Sensor t1 · civil trench', 'Synthetic', 'Live · 30 s ago', 'Localised heat reading via base station 1.', '08:00 heat reading, restart'],
  ['bs2', 'Base station 2', 'Synthetic', 'Offline since 07:52', 'Relays laydown-yard sensors.', 'Fail-safe band raise', true],
  ['fc', 'Weather forecast', 'Built', 'Updated 07:30', 'Hourly forecast for Mussafah; fallback when no sensor.', 'Hourly table, planning'],
  ['ki', 'Shelter A kiosk', 'Planned', '—', 'NFC check-ins feeding headcount and recovery clocks.', '08:04 headcount'],
  ['Rules (no AI)'],
  ['rm', 'Risk Monitor', 'Built', 'Ran 08:15', 'Deterministic job every 15 minutes. Raises bands and actions.', '08:00 stop-work, escalations'],
  ['chs', 'compute_heat_stress', 'Built', '—', 'TWL zones, policy stack, midday-break minutes.', 'Heat controls, restart'],
  ['os', 'optimise_schedule', 'Built', '—', 'Work/rest planner. Returns feasible intervals.', '08:11 plan, 08:18 replan'],
  ['sg', 'search_guidance', 'Built', '—', 'Retrieves cited guidance passages.', 'Agent answers'],
  ['Agents'],
  ['pa', 'Planning Agent', 'Built', 'Last run 08:41', 'ADK + Gemini. Explains and answers; never writes to a plan.', 'Ask, explanations'],
  ['wa', 'Worker Aid Agent', 'Planned', '—', 'Symptom check-in and extraction in the worker’s language.', '08:18 Bilal’s report'],
  ['tel', 'BigQuery telemetry', 'Built', 'Streaming', 'Tool errors, latency, token cost, refusals.', 'This screen'],
  ['sms', 'SMS and voice line', 'Diagram only', '—', 'Fixed templates for basic phones.', 'Stop-work notices'],
];
screen('w8', {
  device: 'web', name: 'System & trust', short: 'System & trust', clock: '09:00',
  persona: 'Rashid and the project’s safety lead.', context: 'Desktop, weekly review or during an audit.',
  job: 'Check that sensors, agents and guardrails are working and trustworthy.',
  empty: { text: 'Telemetry starts after the first agent run.', cta: 'Run the eval smoke set' },
  render() {
    const sel = App.sel.w8 || 'bs2';
    /* The system map as a list of lists: one list per lane. */
    const lanes = []; NODES.forEach(n => { if (n.length === 1) lanes.push({ name: n[0], items: [] }); else lanes[lanes.length - 1].items.push(n); });
    const map = `<ul class="syslist">${lanes.map(l => `<li><h4>${l.name}</h4><ul>${l.items.map(n =>
      `<li><button class="node ${sel === n[0] ? 'sel' : ''} ${n[6] ? 'off' : ''}" data-act="node" data-id="${n[0]}"><span class="nt">${n[1]}</span><span class="age">${n[3]}</span>${n[6] ? B.red('Offline') : n[2] === 'Planned' || n[2] === 'Diagram only' ? B.muted(n[2]) : B.plain(n[2])}</button></li>`).join('')}</ul></li>`).join('')}</ul>`;
    const n = NODES.find(x => x[0] === sel);
    return {
      nav: { title: 'System & trust', back: 'w1', clock: '09:00' },
      filters: ['Today', 'Last 7 days', 'Last 30 days'], overflow: [{ label: 'Download raw telemetry' }, { label: 'Open eval report' }],
      body: [
        section('System map', map, 'Select a part for details'),
        section('Events', list([
          row({ t: 'Purpose-limitation refusal', d: 'Planning Agent refused “Which workers complain most?” at 08:41.', b: B.plain('Logged'), static: true }),
          row({ t: 'Grounding check flagged a value', d: '147 W/m² did not match any tool output at 09:02. Answer shown with Low confidence.', b: B.plain('Logged'), static: true }),
          row({ t: 'Base station 2 offline', d: 'No heartbeat since 07:52. Laydown-yard band raised one level.', b: B.over('Open'), static: true }),
        ])),
        section('Telemetry · today', `<table class="t"><thead><tr><th>Metric</th><th>Value</th><th>Trend</th></tr></thead><tbody>
          <tr><td>Tool-error rate</td><td>0.4%</td><td>↓ from 0.9%</td></tr><tr><td>Latency per run (p50 / p95)</td><td>3.1 s / 8.4 s</td><td>—</td></tr><tr><td>Token cost per run</td><td>6.2k tokens</td><td>—</td></tr></tbody></table>`),
        section('Access audit', `<table class="t"><thead><tr><th>Role</th><th>Opened worker-level records</th></tr></thead><tbody>
          <tr><td>Occupational health</td><td>2</td></tr><tr><td>Supervisors</td><td>0 · no access by design</td></tr><tr><td>Safety lead</td><td>0</td></tr></tbody><tfoot><tr><td colspan="2">Counts only, never contents.</td></tr></tfoot></table>`),
      ],
      detail: `<h2 class="h2">${n[1]}</h2><div>${n[6] ? B.red('Offline') : B.plain(n[2])}</div><dl class="kv"><dt>Role</dt><dd>${n[4]}</dd><dt>Status</dt><dd>${n[2]}</dd><dt>Heartbeat</dt><dd>${n[3]}</dd><dt>Serves</dt><dd>${n[5]}</dd></dl>`,
      cta: { label: 'Export audit report', act: 'toast', msg: 'Audit report exported (PDF)' },
    };
  },
  actions: { node: el => { App.sel.w8 = el.dataset.id; refresh(); } },
});
