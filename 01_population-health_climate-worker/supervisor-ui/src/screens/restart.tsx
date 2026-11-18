import { useState } from 'react';
import { payloads } from '../commands';
import { reasonLabel } from '../copy';
import { nameOf } from '../replay';
import { navigate } from '../router';
import { thermalStatus } from '../thermal';
import { heatNow, progress, taskFor, time, who } from './data';
import { ActionButton, Band, Computed, CtaBar, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge, Avatar, Person } from './kit';
import type { ScreenProps } from './registry';
import { Icon, StatusIcon } from '../shared/icons';
import { squadsFor, useSquad, type Squad } from './squads';
import { TwlGauge } from './twl';

/** Fresh reading: a same-zone local reading for the restart review. */
export function FreshReadingScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [twl, setTwl] = useState('175');
  if (!caseView || !person) return <NoCase session={session} />;
  const heat = heatNow(caseView);
  const r = heat.reading;
  const fresh = taskFor(caseView, 'fresh');
  const mine = fresh?.actor_id === person.id && fresh.status === 'ready';
  const value = Number(twl);
  const valid = Number.isFinite(value) && value > 0;
  return <div className="hs-screen">
    <Head kicker={`Fresh reading · Civil trench · ${time(caseView.clock)}`} title="Fresh reading" />
    <Hero>
      <Metric label="Latest" value={r ? `${r.twl} W/m²` : '—'} sub={<>{time(r?.measured_at)} · <b>{heat.freshness === 'current' ? 'fresh' : heat.freshness}</b></>} tone={heat.freshness === 'current' ? 'ok' : 'red'} />
      <Metric label="Freshness limit" value="5 min" sub="same zone" />
      <Metric label="Sensor" value={r?.sensor_id ?? '—'} sub={r ? nameOf(r.zone_id) : undefined} />
    </Hero>
    <Section title="Sources">
      <List>
        <Row title={`Sensor ${r?.sensor_id ?? 't1'} · civil trench`} detail="Same zone as the held task. Can be used for restart." badge={<span className="hs-badge" data-tone="done">Same zone</span>} />
        <Row title="Sensor in another zone" detail="Cannot be used for this restart." badge={<span className="hs-badge" data-tone="muted">Other zone</span>} />
        <Row title="Forecast" detail="Estimated · never used for a restart." badge={<span className="hs-badge" data-tone="muted">Forecast</span>} />
      </List>
    </Section>
    {mine ? <form className="hs-form" onSubmit={e => { e.preventDefault(); if (valid) void session.act('fresh', payloads.fresh(caseView, value)); }}>
      <div className="hs-form-row">
        <label className="hs-field">Local TWL (W/m²)<input type="number" inputMode="numeric" value={twl} onChange={e => setTwl(e.target.value)} /></label>
        <span className="hs-small">Measured now; the server records the time.</span>
      </div>
      <p className="hs-small">Band for this value: <Band band={thermalStatus(value, Number.isFinite(value)).band} label={thermalStatus(value, Number.isFinite(value)).label} />. The heavy-work hold stays until a separate restart review.</p>
      <CtaBar><button type="submit" className="hs-button is-primary" disabled={!valid || session.busy}>Record fresh local reading</button></CtaBar>
    </form> : <Note>{fresh?.status === 'recorded' ? <><StatusIcon status="ok" /> Fresh reading recorded for the restart review.</> : fresh ? `Fresh reading: ${fresh.status === 'ready' ? `ready for ${nameOf(fresh.actor_id)}` : 'waits for the crew response and first-aid handoff.'}` : 'No restart review in this case.'}</Note>}
    <ActionButton session={session} action="water" label="Confirm water check" />
    {fresh?.status === 'recorded' && <button type="button" className="hs-button" onClick={() => navigate('/web/restart-review')}>Open restart review (web)</button>}
  </div>;
}

/** The restart checks: label, case action, restart-evidence key and what the check confirms. */
const CHECKS: Array<[string, string, string | null, string]> = [
  ['Fresh local reading', 'fresh', null, 'Same-zone TWL reading taken within the last 5 minutes.'],
  ['Permit check', 'permit', 'permit', 'Permit for heavy exposed work is valid at the restart time.'],
  ['Worker removal', 'remove', null, 'The affected worker is removed from heat work.'],
  ['First-aid contact', 'firstaid', null, 'A first aider has contacted the affected worker.'],
  ['Water check', 'water', 'water', 'Water and rest provision is in place at the workfront.'],
  ['Personnel check', 'personnel', 'personnel', 'Every crew member is accounted for.'],
  ['Recovery check', 'recovery_check', 'recovery', 'Workers in recovery are checked before they return.'],
  ['Crew readiness check', 'crew_readiness', 'crew_readiness', 'Each worker is confirmed ready for work.'],
];

type SortKey = 'squad' | 'reading' | 'status' | 'start' | 'end' | 'checks';
const COLUMNS: Array<[SortKey, string]> = [['squad', 'Squad'], ['reading', 'Latest reading'], ['status', 'Current status'], ['start', 'Break starts'], ['end', 'Break ends · forecast'], ['checks', 'Readiness checks']];
/* Missing values ('—', no reading, no checks) sort last in both directions. */
const SORT: Record<SortKey, (q: Squad) => string | number | null> = {
  squad: q => q.name, reading: q => q.reading.twl, status: q => q.status,
  start: q => /^\d/.test(q.breakStart) ? q.breakStart : null, end: q => /^\d/.test(q.breakEnd) ? q.breakEnd : null,
  checks: q => q.checks.total ? q.checks.done / q.checks.total : null,
};

/** Status icon: a stop for held work, a warning for caution controls, a tick for normal work. */
function statusIcon(q: Squad) {
  if (q.hold || /stop/i.test(q.status)) return <span className="hs-status-icon" data-tone="red"><Icon name="stop" /></span>;
  if (/caution|offline/i.test(q.status)) return <StatusIcon status="warn" />;
  return <StatusIcon status="ok" />;
}

const minutes = (hhmm: string) => /^\d\d:\d\d$/.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null;
const DAY_FROM = 6 * 60, DAY_TO = 19 * 60;

/** The day for each squad: midday break hatched, latest TWL reading as a thick line in its band colour. */
function DayTimeline({ squads, now, selected, choose }: { squads: Squad[]; now: string; selected: string; choose: (id: string) => void }) {
  const pct = (m: number) => `${(Math.min(DAY_TO, Math.max(DAY_FROM, m)) - DAY_FROM) / (DAY_TO - DAY_FROM) * 100}%`;
  const hours: number[] = []; for (let h = DAY_FROM / 60; h <= DAY_TO / 60; h++) hours.push(h);
  const nowM = minutes(now);
  return <div className="hs-day" role="group" aria-label="Breaks and latest TWL readings by squad">
    <div className="hs-day-inner">
      <div className="hs-day-row hs-day-head" aria-hidden="true"><span className="hs-day-lab" /><span className="hs-day-track">
        {hours.map(h => <span key={h} className="hs-day-hour" style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}:00</span>)}
      </span></div>
      {squads.map(q => {
        const b0 = minutes(q.breakStart), b1 = minutes(q.breakEnd), at = minutes(q.reading.at);
        const tone = q.band === 'red' || q.band === 'amber' || q.band === 'green' ? q.band : 'unknown';
        return <div key={q.id} className="hs-day-row" aria-selected={q.id === selected} onClick={() => choose(q.id)}>
          <span className="hs-day-lab"><Avatar id={q.foremanId} size="sm" /> <button type="button" className="hs-link" aria-pressed={q.id === selected} onClick={() => choose(q.id)}>{q.name}</button></span>
          <span className="hs-day-track">
            {hours.map(h => <span key={h} className="hs-day-grid" style={{ left: pct(h * 60) }} />)}
            {b0 != null && b1 != null && <span className="hs-day-break" style={{ left: pct(b0), width: `calc(${pct(b1)} - ${pct(b0)})` }} title={`Midday break ${q.breakStart}–${q.breakEnd}`}><span>Break {q.breakStart}–{q.breakEnd}</span></span>}
            {at != null && q.reading.twl != null
              ? <span className="hs-day-read" data-tone={tone} style={{ left: pct(at) }} title={`TWL ${q.reading.twl} W/m² at ${q.reading.at}`}><span>{q.reading.twl}</span></span>
              : <span className="hs-day-none">{q.reading.twl != null ? `TWL ${q.reading.twl} · ${q.reading.at}` : 'No reading'}</span>}
            {nowM != null && <span className="hs-day-now" style={{ left: pct(nowM) }} />}
          </span>
        </div>;
      })}
    </div>
    <p className="hs-day-key"><span><i className="hs-day-key-break" />Midday break</span><span><i className="hs-day-key-read" />Latest TWL reading, in its band colour</span>{nowM != null && <span><i className="hs-day-key-now" />Now {now}</span>}</p>
  </div>;
}

/** Restart status per squad, sortable by every column. Clicking a row selects the squad. */
function SquadRestartTable({ squads, selected, choose, freshness }: { squads: Squad[]; selected: string; choose: (id: string) => void; freshness: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const rows = sort ? [...squads].sort((a, b) => {
    const x = SORT[sort.key](a), y = SORT[sort.key](b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  }) : squads;
  return <div className="hs-scroll"><table className="hs-table hs-table-sm hs-restart-table">
    <thead><tr>{COLUMNS.map(([key, label]) => <th key={key} aria-sort={sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="hs-sort" onClick={() => setSort(s => ({ key, dir: s?.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}<span aria-hidden="true">{sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ' ↕'}</span>
      </button></th>)}</tr></thead>
    <tbody>{rows.map(q => <tr key={q.id} aria-selected={q.id === selected} onClick={() => choose(q.id)} className="hs-pick">
      <td><span className="hs-squad-cell"><Avatar id={q.foremanId} size="md" /> <button type="button" className="hs-link" aria-pressed={q.id === selected} onClick={() => choose(q.id)}>{q.name}</button></span></td>
      <td className="hs-reading-cell"><TwlGauge twl={q.reading.twl} band={q.band} valid={q.band !== 'unknown'} size={56} /><small className="hs-muted">{q.reading.at}{q.estimated ? ' · est.' : ''}{q.reading.fresh ? ' · fresh' : q.live ? ` · ${freshness}` : ''}</small></td>
      <td><span className="hs-status-cell">{statusIcon(q)} {q.status}</span></td><td>{q.breakStart}</td><td>{q.breakEnd}</td>
      <td>{q.checks.total ? <><StatusIcon status={q.checks.done === q.checks.total ? 'ok' : 'warn'} /> <b>{q.checks.done} of {q.checks.total}</b></> : '—'}</td></tr>)}</tbody>
  </table></div>;
}

/** Decisions carried across the shift: what each is for, who owns it and whether it is recorded. */
const HANDOVER: Array<{ action: string | null; decision: string; why: string }> = [
  { action: 'fresh', decision: 'Fresh local reading', why: 'Needed before the restart review. Forecasts are not used.' },
  { action: 'permit', decision: 'Permit check', why: 'Needed before the restart review.' },
  { action: 'review', decision: 'Restart review', why: 'Superintendent reviews the restart checks. Does not authorise resuming work.' },
  { action: 'acceptDelivery', decision: 'Supplier acceptance of the later delivery', why: 'Confirms the supplier accepted the later delivery time.' },
  { action: null, decision: 'Decision to resume heavy exposed work', why: 'Made on site by the superintendent after the restart review.' },
];

function ShiftHandover({ session, restartStatus }: { session: ScreenProps['session']; restartStatus: string }) {
  const caseView = session.caseView!;
  const heat = heatNow(caseView);
  const eventAt = (id: string) => caseView.story.events.find(e => e.id === id)?.occurred_at;
  const stoppedAt = eventAt('stop');
  const stopped = caseView.story.stopped || caseView.story.events.some(e => e.id === 'stop');
  const rows = HANDOVER.map(h => {
    const p = h.action ? progress(caseView, h.action) : null;
    return { ...h, owner: p?.owner ?? 'P02', done: p?.status === 'recorded', at: h.action ? eventAt(h.action) : undefined };
  });
  const open = rows.filter(r => !r.done);
  const handover = progress(caseView, 'handover');
  return <Section title="Shift handover">
    <dl className="hs-handover-facts">
      <div><dt>Heavy exposed civil work</dt><dd><Hold>{stopped ? 'Stopped' : heat.heavyHeld ? 'Held · cessation not confirmed' : 'Cessation not confirmed'}</Hold>{stoppedAt ? ` since ${time(stoppedAt)}` : ''}</dd></div>
      <div><dt>Restart review</dt><dd>{restartStatus.charAt(0).toUpperCase() + restartStatus.slice(1)}</dd></div>
      <div><dt>Latest reading</dt><dd>{heat.reading ? `TWL ${heat.reading.twl} W/m² · ${time(heat.reading.measured_at)} · ${heat.freshness === 'current' ? 'fresh' : heat.freshness}` : 'No reading'}</dd></div>
      <div><dt>Handover owner</dt><dd><Person id={handover.owner ?? 'P02'} size="sm">{who(handover.owner ?? 'P02')}</Person> · {handover.status === 'recorded' ? `recorded${eventAt('handover') ? ` at ${time(eventAt('handover')!)}` : ''}` : 'not recorded yet'}</dd></div>
    </dl>
    <h3 className="hs-handover-h">Decisions carried forward · {open.length} open of {rows.length}</h3>
    <div className="hs-scroll"><table className="hs-table hs-table-sm" aria-label="Decisions carried forward">
      <thead><tr><th>Decision</th><th>Owner</th><th>Status</th><th>Why it matters</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.decision}>
        <td><b>{r.decision}</b></td>
        <td><Person id={r.owner} size="sm">{who(r.owner)}</Person></td>
        <td>{r.done ? <><StatusIcon status="ok" /> Recorded{r.at ? ` ${time(r.at)}` : ''}</> : <><StatusIcon status="warn" /> Open</>}</td>
        <td>{r.why}</td>
      </tr>)}</tbody>
    </table></div>
    <ActionButton session={session} action="handover" label="Record shift handover" />
  </Section>;
}

/** Restart review: all eight checks together, then the superintendent's own review. */
export function RestartReviewScreen({ session }: ScreenProps) {
  const [squadId, choose] = useSquad();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const capture = caseView.capture;
  const restart = capture?.response.restart;
  const checks = capture?.request.restart;
  const heat = heatNow(caseView);
  const story = caseView.story;
  const stopped = story.stopped || story.events.some(e => e.id === 'stop');
  if (!restart) return <div className="hs-screen"><Head title="Restart review" /><Empty>No restart has been proposed for this case.</Empty></div>;
  const recorded = (action: string) => progress(caseView, action).status === 'recorded';
  const passing = CHECKS.filter(([, a]) => recorded(a)).length;
  const midday = checks?.proposed_at ? (() => { const h = Number(time(checks.proposed_at).slice(0, 2)), m = Number(time(checks.proposed_at).slice(3)); const mins = h * 60 + m; return mins >= 750 && mins < 900; })() : false;
  const rashid = person.id === 'P02';
  /* Per squad: latest reading, status, the midday break and readiness checks done. */
  const squads = squadsFor(caseView).map(q => q.live ? { ...q, status: story.reviewed ? 'Review recorded' : `Stop-work · ${restart.status.replaceAll('_', ' ')}`, checks: { done: passing, total: CHECKS.length }, reading: { twl: heat.reading?.twl ?? null, at: time(heat.reading?.measured_at), fresh: heat.freshness === 'current' } } : q);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const overview = <>
    <Section title="Today by squad"><DayTimeline squads={squads} now={time(caseView.clock)} selected={sq.id} choose={choose} /></Section>
    <Section title="Restart status by squad">
      <SquadRestartTable squads={squads} selected={sq.id} choose={choose} freshness={heat.freshness} />
      <Computed>MoHRE midday break 12:30–15:00{checks?.proposed_at ? ` · proposed restart ${time(checks.proposed_at)}${midday ? ' is inside the break' : ''}` : ''}</Computed>
    </Section>
  </>;
  if (!sq.live) return <div className="hs-screen">
    <Head kicker={`Restart review · ${sq.name}`} title="Restart review" sub={`${sq.loc} · foreman ${sq.foreman} · ${sq.status}`} />
    {overview}
    <p className="hs-ok">No restart review for the {sq.name.toLowerCase()}: it has no stop-work. {sq.status}.</p>
  </div>;
  /* The squad leader's checks first, then everyone else's, each row naming the person. */
  const evidence = checks as Record<string, { status: string; actor_id: string | null; observed_at: string | null }> | null;
  const rowsFor = CHECKS.map(([label, action, key, about]) => ({ label, action, about, owner: progress(caseView, action).owner, at: (key ? evidence?.[key]?.observed_at : null) ?? caseView.story.events.find(e => e.id === action)?.occurred_at ?? null }));
  const leaderRows = rowsFor.filter(r => r.owner === sq.foremanId);
  /* Other people's checks grouped by person (stable), so each person is shown once for their run of rows. */
  const others = rowsFor.filter(r => r.owner !== sq.foremanId);
  const order = [...new Set(others.map(r => r.owner))];
  const otherRows = [...others].sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner));
  /* The person cell spans their consecutive rows. In the leader group the heading row already shows them. */
  const checkRows = (rows: typeof rowsFor, leader: boolean) => rows.map((r, i) => {
    const first = i === 0 || rows[i - 1].owner !== r.owner;
    let span = 1; while (first && i + span < rows.length && rows[i + span].owner === r.owner) span++;
    return checkRow(r, first ? span : 0, leader);
  });
  const checkRow = (r: typeof rowsFor[number], span: number, leader: boolean) => <tr key={r.action}>
    {span > 0 && <td rowSpan={span} className="hs-check-person">{leader ? <span className="hs-visually-hidden">{who(r.owner!)}</span> : r.owner ? <Person id={r.owner} size="sm">{who(r.owner)}</Person> : '—'}</td>}
    <td><b>{r.label}</b></td>
    <td>{r.about}</td>
    <td>{r.at ? time(r.at) : '—'}</td>
    <td>{taskBadge(session, r.action)}</td>
  </tr>;
  return <div className="hs-screen">
    <Head kicker="Restart review · Heavy exposed civil work" title="Restart review" sub="Recording the review does not authorise resuming work. The site decision stays with the superintendent." />
    {overview}
    <Section title={`Restart checks · ${sq.name} · ${passing} of ${CHECKS.length} recorded`}>
      <p className="hs-muted">Each check is recorded by the person named.</p>
      <div className="hs-scroll"><table className="hs-table hs-table-sm hs-checks-table" aria-label={`Restart checks, ${sq.name}`}>
        <thead><tr><th>Person</th><th>Check</th><th>Explanation</th><th>Observed at</th><th>Status</th></tr></thead>
        <tbody>
          <tr className="hs-checks-group"><th colSpan={5} scope="colgroup"><span className="hs-checks-lead"><Avatar id={sq.foremanId} size="md" /><span><b>{who(sq.foremanId)}</b><small>Squad leader · {sq.name}</small></span></span></th></tr>
          {leaderRows.length ? checkRows(leaderRows, true) : <tr><td colSpan={5} className="hs-muted">No checks for the squad leader.</td></tr>}
        </tbody>
        <tbody>
          <tr className="hs-checks-group"><th colSpan={5} scope="colgroup">Other people</th></tr>
          {checkRows(otherRows, false)}
        </tbody>
      </table></div>
      <Computed />
    </Section>
    {restart.blockers.length > 0 && <Note tone="red">Restart review is blocked: {restart.blockers.map(reasonLabel).join(', ')}.</Note>}
    <Section title="Your checks">
      <ActionButton session={session} action="permit" label="Confirm permit check" />
      {/* The hold stamp sits with the review button: recording the review does not lift it. */}
      <p className="hs-review-hold"><Hold>{stopped ? 'Heavy exposed civil work stays stopped' : heat.heavyHeld ? 'Heavy exposed civil work held' : 'Cessation not confirmed'}</Hold><span>Recording the review does not release the hold. Resuming work requires a separate site decision.</span></p>
      <ActionButton session={session} action="review" label="Record restart review" primary confirm={rashid ? { word: 'RESTART', title: 'Record your restart review', body: `This records your review as superintendent. ${stopped ? 'Heavy work remains stopped.' : 'Cessation is not confirmed.'} Resuming work requires a separate site decision.` } : undefined} />
    </Section>
    <ShiftHandover session={session} restartStatus={story.reviewed ? 'Review recorded' : restart.status.replaceAll('_', ' ')} />
    {!rashid && <Note>Only Rashid (superintendent) records the restart review.</Note>}
  </div>;
}
