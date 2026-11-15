import { useState } from 'react';
import { atDubai, payloads, toIso } from '../../commands';
import { EvidenceAction } from '../../EvidenceAction';
import { reasonLabel } from '../../copy';
import { navigate } from '../../router';
import { assignedIds, crew, intervalsOf, kindLabel, time, who, type CrewMember } from '../data';
import { ActionButton, Choice, Computed, CtaBar, Draft, Empty, Head, Hero, List, Metric, NoCase, Note, Row, Section, Statement, taskBadge, Avatar, Person } from '../kit';
import type { ScreenProps } from '../registry';

const BASES = [
  ['Spoke with the worker face to face', 'Spoke with worker face to face'],
  ['Observed recovery and hydration', 'Observed recovery and hydration'],
  ['Occupational health advice', 'Occupational health advice'],
] as const;
type Basis = typeof BASES[number][0];

const readinessBadge = (p: CrewMember) => p.excluded ? <span className="hs-badge" data-tone="over">■ Excluded</span>
  : p.readiness === 'ready' ? <span className="hs-badge" data-tone="done">✓ Ready</span>
    : p.readiness === 'not_ready' ? <span className="hs-badge" data-tone="muted">Not ready</span>
      : <span className="hs-badge" data-tone="wait">Unconfirmed</span>;

/** Readiness confirmation: one worker, one task, face to face. */
export function ReadinessScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [selected, setSelected] = useState<string | null>(null);
  const [basis, setBasis] = useState<Basis>(BASES[0][0]);
  const [hours, setHours] = useState('2');
  if (!caseView || !person) return <NoCase session={session} />;
  const all = crew(caseView);
  const list = [...all].sort((a, b) => Number(b.qualifications.includes('civil_worker')) - Number(a.qualifications.includes('civil_worker')));
  const confirmed = list.filter(p => p.readiness === 'ready').length;
  const readinessTask = caseView.tasks.find(t => t.action === 'readiness');
  const canConfirm = readinessTask?.status === 'ready' && readinessTask.actor_id === person.id;
  const workshop = caseView.capture?.request.locations.find(l => l.id === caseView.capture?.request.task_locations.workshop_prep);
  const fixed = caseView.capture?.request.snapshot.zone_windows.find(w => w.zone_id === workshop?.id)?.fixed_occupant_ids ?? [];
  if (selected) {
    const p = all.find(x => x.id === selected)!;
    const validUntil = toIso(atDubai(new Date(Date.parse(caseView.clock) + Number(hours) * 3_600_000).toISOString()));
    return <div className="hs-screen">
      <Head kicker="Confirm readiness · Workshop preparation" title={<Person id={p.id} size="lg">{who(p.id)}</Person>} sub={p.qualifications.length ? `Qualified: ${p.qualifications.map(reasonLabel).join(', ')}` : 'Qualification not on record'} />
      <Note>Time in shelter is not readiness. Confirm only after speaking with the worker.</Note>
      <form className="hs-form" onSubmit={e => { e.preventDefault(); void session.act('readiness', payloads.readiness([p.id], 'ready', basis, validUntil)).then(() => setSelected(null)); }}>
        <Choice legend="Assessment basis" value={basis} options={BASES.map(([id, label]) => [id, label])} onChange={setBasis} />
        <label className="hs-field">Valid for<select value={hours} onChange={e => setHours(e.target.value)}><option value="1">1 hour</option><option value="2">2 hours</option><option value="4">4 hours</option></select></label>
        <p className="hs-computed">Confirmer recorded automatically: {who(person.id)} · valid until {time(validUntil)}</p>
        <CtaBar>
          <button type="submit" className="hs-button is-primary" disabled={!canConfirm || session.busy}>Confirm {p.name.split(' ')[0]} ready for workshop preparation</button>
          <button type="button" className="hs-button" onClick={() => setSelected(null)}>Back to the list</button>
        </CtaBar>
      </form>
    </div>;
  }
  const next = list.find(p => p.readiness !== 'ready' && !p.excluded);
  return <div className="hs-screen">
    <Head kicker={`Readiness · ${time(caseView.clock)} GST`} title="Confirm readiness" sub="Workshop preparation" />
    <Hero>
      <Metric label="Confirmed" value={String(confirmed)} sub="ready for workshop preparation" tone={confirmed ? 'ok' : undefined} />
      <Metric label="Unconfirmed" value={String(list.length - confirmed)} />
      <Metric label="Workshop places" value={workshop ? `${workshop.capacity - fixed.length} of ${workshop.capacity}` : '—'} sub={fixed.length ? `${fixed.length} fixed occupants` : undefined} />
    </Hero>
    <Section title="Affected workers" hint={canConfirm ? 'Tap a worker to confirm' : undefined}>
      <List>{list.map(p => <Row key={p.id} lead={<Avatar id={p.id} size="md" excluded={p.excluded} />} title={who(p.id)} detail={`${p.qualifications.map(reasonLabel).join(', ') || 'No qualification on record'} · ${p.readiness === 'ready' ? `ready${p.readinessUntil ? ` until ${time(p.readinessUntil)}` : ''}` : p.reason ?? 'no readiness confirmation yet'}`} badge={readinessBadge(p)} onClick={canConfirm && !p.excluded && p.readiness !== 'ready' ? () => setSelected(p.id) : undefined} />)}</List>
    </Section>
    <Section title="Other confirmations">
      <ActionButton session={session} action="leila" label="Confirm Leila’s workshop readiness" />
      <ActionButton session={session} action="crew_readiness" label="Confirm crew readiness check for restart" />
    </Section>
    {caseView.tasks.some(t => t.action === 'activity' && t.actor_id === person.id && t.status === 'ready') && <Section title="Observed activity" hint="Record only what you saw">
      <div className="hs-mui"><EvidenceAction action="activity" caseView={caseView} person={person} onAction={session.act} busy={session.busy} /></div>
    </Section>}
    {canConfirm && next && <CtaBar><button type="button" className="hs-button is-primary" onClick={() => setSelected(next.id)}>Confirm next: {next.name.split(' ')[0]}</button></CtaBar>}
    {!canConfirm && <CtaBar><button type="button" className="hs-button" onClick={() => navigate('/site/proposal')}>Review proposal</button></CtaBar>}
  </div>;
}

/** Proposal review: the solver's crew proposal, recorded by the foreman. */
export function ProposalScreen({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const capture = caseView.capture;
  const plan = capture?.response.crew_rest;
  const ids = assignedIds(capture);
  const people = crew(caseView);
  if (!plan) return <div className="hs-screen"><Head title="Proposal" /><Empty>No proposal yet. Planning unlocks when the headcount and confirmations are complete.</Empty></div>;
  const planned = plan.planning_status === 'planned';
  return <div className="hs-screen">
    <Head kicker={`Proposal · ${time(caseView.clock)} GST`} title="Proposal review" />
    <Hero>
      <Metric label="Proposed" value={String(ids.length)} sub={ids.map(id => id).join(', ') || 'nobody yet'} tone={ids.length ? 'ok' : undefined} />
      <Metric label="Stay in recovery" value={String(Math.max(0, people.length - ids.length))} sub="Shelter A" />
      <Metric label="Trench" value={caseView.story.stopped ? 'Stopped' : 'Held'} sub="heavy work stays stopped" tone="red" />
    </Hero>
    <Draft>
      <p><b>{planned ? `${ids.length} workers meet every requirement for workshop preparation.` : `Planning is ${plan.planning_status.replaceAll('_', ' ')}.`}</b></p>
      {plan.blockers.length > 0 && <p>Waiting for: {plan.blockers.map(reasonLabel).join(', ')}.</p>}
      <p className="hs-small">Solver {plan.solver_status ?? '—'}{plan.optimal ? ' · optimal' : ''} · policy {plan.policy_id ?? 'none'} · {plan.useful_worker_minutes ?? 0} useful worker-minutes</p>
    </Draft>
    <Section title="Proposed workers">
      {ids.length ? <List>{ids.map(id => { const iv = intervalsOf(capture, id); return <Row key={id} lead={<Avatar id={id} size="md" />} title={who(id)} detail={iv.slice(0, 3).map(i => `${kindLabel(i.kind)} ${time(i.starts_at)}–${time(i.ends_at)}`).join(', ')} badge={caseView.story.assigned ? <span className="hs-badge" data-tone="done">✓ Assigned</span> : <span className="hs-badge" data-tone="plan">Proposed</span>} />; })}</List>
        : <Empty>No productive assignment is available yet.</Empty>}
    </Section>
    <Computed>Solver proposal · applied: false until you record it</Computed>
    <CtaBar note="Recording the assignment does not send anything to phones in this demo.">
      <ActionButton session={session} action="assign" label="Record assignment" primary />
      {taskBadge(session, 'assign')}
    </CtaBar>
  </div>;
}

/** Worker action card: the steps for one worker who needs help, in order. */
export function ActionCardScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const story = caseView.story;
  if (!story.reported) return <div className="hs-screen"><Head title="Worker action card" /><Empty>No worker has asked for help in this case.</Empty></div>;
  const steps: Array<[string, string, string]> = [
    ['incident_record', 'Record the site incident', 'Huda'],
    ['remove', 'Remove Bilal from the heat and confirm where he is', 'Huda'],
    ['firstaid', 'Record first-aid contact', 'Salim'],
    ['recovery_check', 'Confirm the recovery check', 'Huda'],
  ];
  const salim = person.id === 'P06';
  return <div className="hs-screen">
    <Head kicker={`Bilal (C08) · reported ${time(caseView.clock)}`} title="Worker action card" />
    <Statement tone="red" source="⚙ Escalation rule · not AI">Bilal needs rest now. Keep him off work and with someone.</Statement>
    <Note tone="amber">If he is confused, has vomited or stopped sweating: treat it as an emergency, start cooling, keep someone with him and call 998.</Note>
    <Section title="Steps">
      <List>{steps.map(([action, label, owner], i) => <Row key={action} title={`${i + 1}. ${label}`} detail={`Owner: ${owner}`} badge={taskBadge(session, action)} />)}</List>
    </Section>
    <Note>No health detail here. Details stay in Bilal’s own health record.</Note>
    <CtaBar>
      {salim ? <ActionButton session={session} action="firstaid" label="Record first-aid contact" primary />
        : !story.removed ? <><ActionButton session={session} action="incident_record" label="Record the site incident" /><ActionButton session={session} action="remove" label="Confirm Bilal removed from heat" danger confirm={{ word: 'REMOVED', title: 'Confirm Bilal is out of the heat', body: 'This records your confirmation for the protective response. Bilal goes to welfare and first aid.' }} /></>
          : <ActionButton session={session} action="recovery_check" label="Confirm the recovery check" primary />}
    </CtaBar>
  </div>;
}
