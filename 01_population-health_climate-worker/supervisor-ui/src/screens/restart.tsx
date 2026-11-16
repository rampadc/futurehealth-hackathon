import { useState } from 'react';
import { payloads } from '../commands';
import { reasonLabel } from '../copy';
import { nameOf } from '../replay';
import { navigate } from '../router';
import { thermalStatus } from '../thermal';
import { heatNow, progress, taskFor, time } from './data';
import { ActionButton, Band, Computed, CtaBar, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge, Avatar } from './kit';
import type { ScreenProps } from './registry';
import { StatusIcon } from '../shared/icons';
import { OtherSquadScreen, squadsFor, useSquad, SquadPicker } from './squads';

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

const CHECKS: Array<[string, string, string | null]> = [
  ['Fresh local reading', 'fresh', null],
  ['Permit check', 'permit', 'permit'],
  ['Worker removal', 'remove', null],
  ['First-aid contact', 'firstaid', null],
  ['Water check', 'water', 'water'],
  ['Personnel check', 'personnel', 'personnel'],
  ['Recovery check', 'recovery_check', 'recovery'],
  ['Crew readiness check', 'crew_readiness', 'crew_readiness'],
];

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
  if (!restart) return <div className="hs-screen"><Head title="Restart review" /><Empty>No restart has been proposed for this case.</Empty></div>;
  const recorded = (action: string) => progress(caseView, action).status === 'recorded';
  const passing = CHECKS.filter(([, a]) => recorded(a)).length;
  const midday = checks?.proposed_at ? (() => { const h = Number(time(checks.proposed_at).slice(0, 2)), m = Number(time(checks.proposed_at).slice(3)); const mins = h * 60 + m; return mins >= 750 && mins < 900; })() : false;
  const rashid = person.id === 'P02';
  /* Per squad: latest reading, status, the midday break and readiness checks done. */
  const squads = squadsFor(caseView).map(q => q.live ? { ...q, status: story.reviewed ? 'Review recorded' : `Stop-work · ${restart.status.replaceAll('_', ' ')}`, checks: { done: passing, total: CHECKS.length }, reading: { twl: heat.reading?.twl ?? null, at: time(heat.reading?.measured_at), fresh: heat.freshness === 'current' } } : q);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const table = <Section title="Restart status by squad" hint="Select a squad">
    <div className="hs-scroll"><table className="hs-table hs-table-sm">
      <thead><tr><th>Squad</th><th>Latest reading</th><th>Current status</th><th>Break starts</th><th>Break ends · forecast</th><th>Readiness checks</th></tr></thead>
      <tbody>{squads.map(q => <tr key={q.id} aria-selected={q.id === sq.id} onClick={() => choose(q.id)} className="hs-pick">
        <td><Avatar id={q.foremanId} size="xs" /> <b>{q.name}</b></td>
        <td><b>{q.reading.twl ?? '—'} W/m²</b> · {q.reading.at}{q.reading.fresh ? ' · fresh' : q.live ? ` · ${heat.freshness}` : ''}</td>
        <td>{q.status}</td><td>{q.breakStart}</td><td>{q.breakEnd}</td>
        <td>{q.checks.total ? <><StatusIcon status={q.checks.done === q.checks.total ? 'ok' : 'warn'} /> <b>{q.checks.done} of {q.checks.total}</b></> : '—'}</td></tr>)}</tbody>
    </table></div>
    <Computed>MoHRE midday break 12:30–15:00{checks?.proposed_at ? ` · proposed restart ${time(checks.proposed_at)}${midday ? ' is inside the break' : ''}` : ''}</Computed>
  </Section>;
  if (!sq.live) return <OtherSquadScreen title="Restart review" squad={sq} squads={squads} lines={q => [q.status]}>{table}<p className="hs-ok">No restart review for the {sq.name.toLowerCase()}: it has no stop-work. {sq.status}.</p></OtherSquadScreen>;
  return <div className="hs-screen">
    <Head kicker="Restart review · Heavy exposed civil work" title="Restart review" sub="Recording the review does not authorise resuming work. The site decision stays with the superintendent." />
    {table}
    <Section title="Eight checks · Civil crew" hint="Each human check needs a named confirmer">
      <List>{CHECKS.map(([label, action, key]) => {
        const c = key ? (checks as Record<string, { status: string; actor_id: string | null; observed_at: string | null }> | null)?.[key] : null;
        const owner = progress(caseView, action).owner;
        return <Row key={label} lead={owner ? <Avatar id={owner} size="md" /> : undefined} title={label} detail={`${nameOf(owner)}${c?.observed_at ? ` · ${time(c.observed_at)}` : ''}`} badge={taskBadge(session, action)} />;
      })}</List>
      <Computed />
    </Section>
    {restart.blockers.length > 0 && <Note tone="red">Restart review is blocked: {restart.blockers.map(reasonLabel).join(', ')}.</Note>}
    <p><Hold>Heavy exposed civil work stays stopped</Hold></p>
    <div className="hs-grid">
      <Section title="Your checks">
        <ActionButton session={session} action="permit" label="Confirm permit check" />
        <ActionButton session={session} action="review" label="Record restart review" primary confirm={rashid ? { word: 'RESTART', title: 'Record your restart review', body: 'This records your review as superintendent. Heavy work stays stopped; the restart decision itself is made on site.' } : undefined} />
      </Section>
      <Section title="Shift handover" hint="Can happen with restart still open">
        <Note>Open decisions: {[!story.fresh && 'fresh reading · Maya', !story.permit && 'permit check · Tariq', !story.reviewed && 'restart review · Rashid', !story.deliveryAccepted && 'supplier acceptance · Noura'].filter(Boolean).join('; ') || 'the separate site decision to resume work'}.</Note>
        <ActionButton session={session} action="handover" label="Record shift handover" />
      </Section>
    </div>
    {!rashid && <Note>Only Rashid (superintendent) records the restart review.</Note>}
  </div>;
}
