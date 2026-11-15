import { reasonLabel } from '../../copy';
import { nameOf } from '../../replay';
import { crew, heatNow, progress, time } from '../data';
import { ActionButton, Band, Computed, Draft, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge, taskLine, Person } from '../kit';
import type { ScreenProps } from '../registry';
import { ConditionsPanel } from '../conditions';

const FRESH_MS = 5 * 60_000;

/** Heat controls: what must stop, why, and what evidence will clear it. */
export function HeatControlsScreen({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const heat = heatNow(caseView);
  const r = heat.reading;
  const response = caseView.capture?.response;
  const controls = response?.heat.controls ?? [];
  const heavy = controls.find(c => c.task_id === 'civil_heavy');
  const siteLimit = heavy?.reason_codes.includes('twl_heavy_limit');
  return <div className="hs-screen">
    <Head kicker={`Heat controls · Civil trench · ${time(caseView.clock)} GST`} title="Heat controls" sub="The environmental band and the site’s heavy-work hold are separate decisions." />
    <Hero>
      <Metric label="TWL now" value={r ? `${r.twl} W/m²` : '—'} sub={<><Band band={heat.band.band} label={heat.band.label} /> · sensor {r?.sensor_id ?? '—'} · {time(r?.measured_at)} {heat.heavyHeld && <Hold />}</>} tone={heat.heavyHeld ? 'red' : undefined} />
      <Metric label="Site rule" value="≤ 150" sub="Stop heavy work · Sandline heat plan (fictional)" />
      <Metric label="Legal zone" value={heat.band.label} sub="ADOSH display bands" />
    </Hero>
    <div className="hs-grid">
      <Section title="Task controls" hint={response ? `Assessed ${time(response.decision_at)}` : undefined}>
        {controls.length ? <List>{controls.map(c => <Row key={c.task_id} title={nameOf(c.task_id)} detail={c.reason_codes.map(reasonLabel).join(' · ') || 'No restriction'} badge={c.state === 'held' || c.state === 'stopped' ? <Hold>{c.state}</Hold> : <span className="hs-badge" data-tone="muted">{c.state}</span>} />)}</List>
          : <Empty>The solver has not assessed this case yet.</Empty>}
        <Computed />
      </Section>
      <Section title="Reading source">
        <List>
          <Row title={`Sensor ${r?.sensor_id ?? '—'} · ${r ? nameOf(r.zone_id) : 'no zone'}`} detail={r ? `Measured ${time(r.measured_at)} · received ${time(r.received_at)} · quality ${r.quality}` : 'No reading'} badge={<span className="hs-badge" data-tone={heat.freshness === 'current' ? 'done' : 'over'}>{heat.freshness === 'current' ? 'Fresh' : heat.freshness}</span>} />
          <Row title="Freshness limit" detail={`A reading older than ${FRESH_MS / 60_000} minutes cannot clear a hold.`} />
          <Row title="Forecast and replay" detail="Shown below as planning context · never used to clear a hold." badge={<span className="hs-badge" data-tone="muted">Not for clearance</span>} />
        </List>
      </Section>
      <Section title="Policy stack">
        <List>
          <Row title="Legal: ADOSH heat stress bands" detail="Display bands for environmental risk." />
          <Row title="Site: Sandline heat plan" detail={siteLimit ? 'Heavy-work limit reached: TWL ≤ 150 stops heavy exposed work.' : 'Heavy-work limit not reached at this reading.'} badge={siteLimit ? <Hold /> : undefined} />
          {response?.policy_versions.map(v => <Row key={v} title={v} detail="Policy version used by the solver" />)}
        </List>
      </Section>
      <Section title="Evidence needed before clearance">
        {response?.heat.clearance_blockers.length ? <List>{response.heat.clearance_blockers.map(b => <Row key={b} title={reasonLabel(b)} badge={<span className="hs-badge" data-tone="wait">Missing</span>} />)}</List>
          : <Note>A fresh same-zone reading, the permit check and a separate restart review by the superintendent.</Note>}
      </Section>
    </div>
    <ConditionsPanel session={session} />
    <ActionButton session={session} action="issue" label="Issue stop-work instruction" primary />
  </div>;
}

const RESPONSE_ACTIONS = ['acknowledge', 'stop', 'recover', 'escalation_followup', 'incident_record', 'remove', 'firstaid'];
const LABELS: Record<string, string> = {
  acknowledge: 'Acknowledge the stop-work instruction', stop: 'Confirm heavy work has stopped', recover: 'Account for the crew in recovery',
  escalation_followup: 'Follow up the overdue acknowledgement', incident_record: 'Record the site incident', remove: 'Confirm removal from heat and location', firstaid: 'Record first-aid contact',
};

/** Protective response: outstanding confirmations and who owns each. */
export function ProtectiveResponseScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView) return <NoCase session={session} />;
  const story = caseView.story;
  const relevant = RESPONSE_ACTIONS.filter(a => a !== 'escalation_followup' || caseView.tasks.some(t => t.action === a && t.status !== 'waiting'))
    .filter(a => !['incident_record', 'remove', 'firstaid'].includes(a) || story.reported);
  const rows = relevant.map(action => ({ action, ...progress(caseView, action) }));
  const outstanding = rows.filter(r => r.status !== 'recorded');
  const people = crew(caseView);
  const accounted = people.filter(p => p.inRecovery).length;
  const protective = caseView.capture?.response.protective_response;
  const locked = (protective?.planning_blockers.length ?? 0) > 0 || !caseView.story.recovered;
  const mine = caseView.tasks.filter(t => RESPONSE_ACTIONS.includes(t.action) && t.actor_id === person?.id && t.status === 'ready');
  return <div className="hs-screen">
    <Head kicker={`Protective response · ${time(caseView.clock)} GST`} title="Protective response" sub="People act first; these records follow. Crew planning stays locked until they are complete." />
    <Hero>
      <Metric label="Outstanding" value={String(outstanding.length)} sub={outstanding.length ? 'confirmations open' : 'all confirmed'} tone={outstanding.length ? 'red' : 'ok'} />
      <Metric label="Headcount" value={`${accounted} / ${people.length}`} sub="Shelter A" />
      <Metric label="Crew planning" value={locked ? 'Locked' : 'Unlocked'} sub={locked ? (protective?.planning_blockers.map(reasonLabel).join(', ') || 'until the headcount is recorded') : 'proposals can be reviewed'} tone={locked ? 'amber' : 'ok'} />
    </Hero>
    <Section title="Required confirmations" hint="Owner · status · due">
      <List>{rows.map(r => <Row key={r.action} title={LABELS[r.action] ?? r.action} detail={taskLine(session, r.action)} badge={taskBadge(session, r.action)} />)}</List>
    </Section>
    {mine.length > 0 && <Section title="Record yours">
      {mine.map(t => <ActionButton key={t.action} session={session} action={t.action} label={t.label} primary
        confirm={t.action === 'remove' ? { word: 'REMOVED', title: 'Confirm the worker is out of the heat', body: 'This records your human confirmation for the protective response. Software cannot record it for you.' } : undefined} />)}
    </Section>}
    {protective && protective.actions.length > 0 && <Section title="Solver’s protective actions" hint="Proposals · applied: false">
      <Draft><ul className="hs-plain">{protective.actions.map(a => <li key={a.code + a.owner_id}>{reasonLabel(a.code)} · <Person id={a.owner_id}>{nameOf(a.owner_id)}</Person> · {a.status}{a.due_at ? ` · due ${time(a.due_at)}` : ''}{a.message ? ` — ${a.message}` : ''}</li>)}</ul></Draft>
    </Section>}
    <Note>No health detail appears here. A worker’s own health record stays with them and occupational health.</Note>
  </div>;
}
