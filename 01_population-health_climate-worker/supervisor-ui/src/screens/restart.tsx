import { useEffect, useState } from 'react';
import { atDubai, payloads, toIso } from '../commands';
import { reasonLabel } from '../copy';
import { nameOf } from '../replay';
import { navigate } from '../router';
import { thermalStatus } from '../thermal';
import { heatNow, progress, taskFor, time } from './data';
import { ActionButton, Band, Computed, CtaBar, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge, Avatar } from './kit';
import type { ScreenProps } from './registry';

/** Fresh reading: a same-zone local reading for the restart review. */
export function FreshReadingScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [twl, setTwl] = useState('175');
  const [measured, setMeasured] = useState(() => caseView ? atDubai(caseView.clock) : '');
  useEffect(() => { if (caseView) setMeasured(atDubai(caseView.clock)); }, [caseView?.clock]);
  if (!caseView || !person) return <NoCase session={session} />;
  const heat = heatNow(caseView);
  const r = heat.reading;
  const fresh = taskFor(caseView, 'fresh');
  const mine = fresh?.actor_id === person.id && fresh.status === 'ready';
  const value = Number(twl);
  const valid = Number.isFinite(value) && value > 0 && !!measured;
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
    {mine ? <form className="hs-form" onSubmit={e => { e.preventDefault(); if (valid) void session.act('fresh', payloads.fresh(caseView, value, toIso(measured))); }}>
      <div className="hs-form-row">
        <label className="hs-field">Local TWL (W/m²)<input type="number" inputMode="numeric" value={twl} onChange={e => setTwl(e.target.value)} /></label>
        <label className="hs-field">Measured at (GST)<input type="datetime-local" value={measured} onChange={e => setMeasured(e.target.value)} /></label>
      </div>
      <p className="hs-small">Band for this value: <Band band={thermalStatus(value, Number.isFinite(value)).band} label={thermalStatus(value, Number.isFinite(value)).label} />. The heavy-work hold stays until a separate restart review.</p>
      <CtaBar><button type="submit" className="hs-button is-primary" disabled={!valid || session.busy}>Record fresh local reading</button></CtaBar>
    </form> : <Note>{fresh?.status === 'recorded' ? '✓ Fresh reading recorded for the restart review.' : fresh ? `Fresh reading: ${fresh.status === 'ready' ? `ready for ${nameOf(fresh.actor_id)}` : 'waits for the crew response and first-aid handoff.'}` : 'No restart review in this case.'}</Note>}
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
  return <div className="hs-screen">
    <Head kicker="Restart review · Heavy exposed civil work" title="Restart review" sub="Recording the review does not authorise resuming work. The site decision stays with the superintendent." />
    <Hero>
      <Metric label="Result" value={story.reviewed ? 'Review recorded' : restart.status.replaceAll('_', ' ')} sub={`${passing} of ${CHECKS.length} checks recorded`} tone={restart.status === 'ready_for_human_review' ? 'ok' : 'red'} />
      <Metric label="Latest reading" value={heat.reading ? `${heat.reading.twl} W/m²` : '—'} sub={<><b>{heat.freshness === 'current' ? 'fresh' : heat.freshness}</b> · {time(heat.reading?.measured_at)} · sensor {heat.reading?.sensor_id ?? '—'}</>} />
      <Metric label="Midday break" value="12:30–15:00" sub={checks?.proposed_at ? (midday ? <b>{time(checks.proposed_at)} is inside the window</b> : `${time(checks.proposed_at)} is outside the window`) : undefined} tone={midday ? 'red' : undefined} />
    </Hero>
    <Section title="Eight checks" hint="Each human check needs a named confirmer">
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
