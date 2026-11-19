import { useEffect, useState } from 'react';
import { atDubai, payloads, toIso } from '../../commands';
import { EvidenceAction } from '../../EvidenceAction';
import { ApprovalCountdown } from '../../LiveClock';
import { reasonLabel } from '../../copy';
import { navigate } from '../../router';
import { assessmentCapture, assignedIds, crew, firstNameOf, incidentPerson, intervalsOf, kindLabel, reportedIds, time, who, type CrewMember } from '../data';
import { ActionButton, Choice, Computed, CtaBar, Draft, Empty, Head, Hero, List, Metric, NoCase, Note, Row, Section, Statement, taskBadge, Avatar, Person } from '../kit';
import type { ScreenProps } from '../registry';

const BASES = [
  ['Spoke with the worker face to face', 'Spoke with worker face to face'],
  ['Observed recovery and hydration', 'Observed recovery and hydration'],
  ['Occupational health advice', 'Occupational health advice'],
] as const;
type Basis = typeof BASES[number][0];

const readinessBadge = (p: CrewMember) => p.excluded ? <span className="hs-badge" data-tone="over">Excluded</span>
  : p.readiness === 'ready' ? <span className="hs-badge" data-tone="done">Ready</span>
    : p.readiness === 'not_ready' ? <span className="hs-badge" data-tone="muted">Not ready</span>
      : <span className="hs-badge" data-tone="wait">Unconfirmed</span>;

/** Readiness confirmation: face to face, for one worker or for several selected workers with the same basis. */
export function ReadinessScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [selected, setSelected] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [basis, setBasis] = useState<Basis>(BASES[0][0]);
  const [hours, setHours] = useState('2');
  useEffect(() => { setSelected(null); setPicked([]); setExpanded(null); setBasis(BASES[0][0]); setHours('2'); }, [caseView?.case_id]);
  if (!caseView || !person) return <NoCase session={session} />;
  const all = crew(caseView);
  const list = [...all].sort((a, b) => Number(b.qualifications.includes('civil_worker')) - Number(a.qualifications.includes('civil_worker')));
  const confirmed = list.filter(p => !p.excluded && p.readiness === 'ready').length;
  const unconfirmed = list.filter(p => !p.excluded && p.readiness !== 'ready').length;
  const excluded = list.length - confirmed - unconfirmed;
  const readinessTask = caseView.tasks.find(t => t.action === 'readiness');
  const canConfirm = readinessTask?.status === 'ready' && readinessTask.actor_id === person.id;
  const workshop = caseView.capture?.request.locations.find(l => l.id === caseView.capture?.request.task_locations.workshop_prep);
  const fixed = caseView.capture?.request.snapshot.zone_windows.find(w => w.zone_id === workshop?.id)?.fixed_occupant_ids ?? [];
  const confirmableIds = new Set(canConfirm ? list.filter(p => !p.excluded && p.readiness !== 'ready').map(p => p.id) : []);
  const chosen = picked.filter(id => confirmableIds.has(id));
  const toggle = (id: string) => setPicked(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const people = (selected ?? []).map(id => all.find(x => x.id === id)).filter((p): p is CrewMember => !!p);
  if (selected && people.length) {
    const p = people[0];
    const many = people.length > 1;
    const validUntil = toIso(atDubai(new Date(Date.parse(caseView.clock) + Number(hours) * 3_600_000).toISOString()));
    const submit = () => session.act('readiness', payloads.readiness(people.map(x => x.id), 'ready', basis, validUntil)).then(() => { setSelected(null); setPicked([]); });
    return <div className="hs-screen">
      <Head kicker="Confirm readiness · Workshop preparation" title={many ? `${people.length} selected workers` : <Person id={p.id} size="lg">{who(p.id)}</Person>} sub={many ? undefined : p.qualifications.length ? `Qualified: ${p.qualifications.map(reasonLabel).join(', ')}` : 'Qualification not on record'} />
      {many && <List>{people.map(x => <Row key={x.id} lead={<Avatar id={x.id} size="sm" />} title={who(x.id)} detail={x.qualifications.map(reasonLabel).join(', ') || 'Qualification not on record'} />)}</List>}
      <Note>{many ? 'Time in shelter is not readiness. Confirm only after speaking with each selected worker. The same basis and validity apply to all of them.' : 'Time in shelter is not readiness. Confirm only after speaking with the worker.'}</Note>
      <form className="hs-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <Choice legend="Assessment basis" value={basis} options={BASES.map(([id, label]) => [id, label])} onChange={setBasis} />
        <label className="hs-field">Valid for<select value={hours} onChange={e => setHours(e.target.value)}><option value="1">1 hour</option><option value="2">2 hours</option><option value="4">4 hours</option></select></label>
        <p className="hs-computed">Confirmer recorded automatically: {who(person.id)} · valid until {time(validUntil)}</p>
        <CtaBar>
          <button type="submit" className="hs-button is-primary" disabled={!canConfirm || session.busy}>{many ? `Confirm ${people.length} selected workers ready for workshop preparation` : `Confirm ${p.name.split(' ')[0]} ready for workshop preparation`}</button>
          <button type="button" className="hs-button" onClick={() => setSelected(null)}>Back to the list</button>
        </CtaBar>
      </form>
    </div>;
  }
  const next = list.find(p => p.readiness !== 'ready' && !p.excluded);
  const activityDue = caseView.tasks.some(t => t.action === 'activity' && t.actor_id === person.id && t.status === 'ready');
  return <div className="hs-screen">
    <Head kicker={`Readiness · ${time(caseView.clock)} GST`} title="Confirm readiness" sub="Workshop preparation" />
    <Hero>
      <Metric label="Confirmed" value={String(confirmed)} sub="ready for workshop preparation" tone={confirmed ? 'ok' : undefined} />
      <Metric label="Unconfirmed" value={String(unconfirmed)} sub={excluded ? `${excluded} excluded from workshop readiness` : undefined} />
      <Metric label="Workshop places" value={workshop ? `${workshop.capacity - fixed.length} of ${workshop.capacity}` : '—'} sub={fixed.length ? `${fixed.length} fixed occupants` : undefined} />
    </Hero>
    <Section title="Affected workers">
      {confirmableIds.size > 0 && <p className="hs-small"><button type="button" className="hs-link" onClick={() => setPicked(chosen.length === confirmableIds.size ? [] : [...confirmableIds])}>{chosen.length === confirmableIds.size ? 'Clear selection' : `Select all unconfirmed (${confirmableIds.size})`}</button></p>}
      <List>{list.map(p => {
        const isOpen = expanded === p.id;
        const confirmable = confirmableIds.has(p.id);
        const select = confirmableIds.size > 0 ? <input type="checkbox" aria-label={`Select ${who(p.id)}`} checked={chosen.includes(p.id)} disabled={!confirmable} onChange={() => toggle(p.id)} /> : undefined;
        return <Row key={p.id} select={select} lead={<Avatar id={p.id} size="sm" excluded={p.excluded} />} title={who(p.id)} detail={readinessBadge(p)} expanded={isOpen} onClick={() => setExpanded(isOpen ? null : p.id)}>
          {isOpen && <>
            <span className="hs-small hs-muted">{`${p.qualifications.map(reasonLabel).join(', ') || 'No qualification on record'} · ${p.readiness === 'ready' ? `ready${p.readinessUntil ? ` until ${time(p.readinessUntil)}` : ''}` : p.reason ?? 'no readiness confirmation yet'}`}</span>
            {confirmable && <button type="button" className="hs-button" onClick={() => setSelected([p.id])}>Confirm {p.name.split(' ')[0]}’s readiness</button>}
          </>}
        </Row>;
      })}</List>
    </Section>
    <Section title="Other confirmations">
      <div className="hs-mui"><EvidenceAction action="leila" caseView={caseView} person={person} onAction={session.act} busy={session.busy} /></div>
      <ActionButton session={session} action="crew_readiness" label="Confirm crew readiness check for restart" />
    </Section>
    {activityDue && <Section title="Observed activity">
      <div className="hs-mui"><EvidenceAction action="activity" caseView={caseView} person={person} onAction={session.act} busy={session.busy} /></div>
    </Section>}
    {canConfirm && chosen.length > 0 && <CtaBar><button type="button" className="hs-button is-primary" onClick={() => setSelected(chosen)}>Confirm selected ({chosen.length})</button></CtaBar>}
    {canConfirm && !chosen.length && next && <CtaBar><button type="button" className="hs-button is-primary" onClick={() => setSelected([next.id])}>Confirm next: {next.name.split(' ')[0]}</button></CtaBar>}
    {!canConfirm && !activityDue && <CtaBar><button type="button" className="hs-button" onClick={() => navigate('/site/proposal')}>Review proposal</button></CtaBar>}
  </div>;
}

/** Proposal review: the solver's crew proposal, recorded by the foreman. */
export function ProposalScreen({ session }: ScreenProps) {
  const { caseView } = session;
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [prerequisitesConfirmed, setPrerequisitesConfirmed] = useState(false);
  const [returnIds, setReturnIds] = useState<string[]>([]);
  const workingKey = (caseView?.request?.snapshot.workers ?? caseView?.capture?.request.snapshot.workers ?? []).filter(w => w.location_id === 'workshop').map(w => w.person_id).join(',');
  useEffect(() => { setRecoveryConfirmed(false); setPrerequisitesConfirmed(false); }, [caseView?.case_id, caseView?.plan_assessment?.id]);
  useEffect(() => { setReturnIds([]); }, [caseView?.case_id, workingKey]);
  if (!caseView) return <NoCase session={session} />;
  const capture = assessmentCapture(caseView);
  const plan = capture?.response.crew_rest;
  const ids = assignedIds(capture);
  const people = crew(caseView);
  const assessment = caseView.plan_assessment;
  const working = (caseView.request?.snapshot.workers ?? caseView.capture?.request.snapshot.workers ?? []).filter(w => w.location_id === 'workshop' && !reportedIds(caseView).has(w.person_id)).map(w => w.person_id);
  const canReturn = caseView.tasks.some(t => t.action === 'start_recovery' && t.status === 'ready');
  const returnControl = canReturn && <Section title="Stop workshop work and return to recovery">
    <p>Choose workers you saw stop work and return to cooled shelter. This records actual work through now.</p>
    {working.map(id => <label className="hs-field" key={id}><input type="checkbox" checked={returnIds.includes(id)} onChange={e => setReturnIds(old => e.target.checked ? [...old, id] : old.filter(x => x !== id))} /> {who(id)}</label>)}
    <button type="button" className="hs-button is-primary" disabled={!returnIds.length || session.busy} onClick={() => void session.act('start_recovery', { person_ids: returnIds, zone_id: 'shelter_a', observed_work: true }).then(() => setReturnIds([]))}>Confirm work stopped and return to recovery</button>
  </Section>;
  if (!plan) return <div className="hs-screen"><Head title="Proposal review" /><Empty>{assessment?.status === 'awaiting_observations' ? 'Current observed activity is needed for every active worker before a new proposal can be assessed.' : assessment?.status === 'blocked' ? 'Current planning is blocked. Review the live reading, readiness and observed activity.' : 'No proposal yet. Planning unlocks when the headcount and confirmations are complete.'}</Empty>{returnControl}</div>;
  const planned = plan.planning_status === 'planned';
  const expired = assessment?.status === 'expired';
  const approved = assessment?.status === 'approved' || (!assessment && caseView.story.assigned);
  const reviewStatus = assessment?.status === 'proposed' ? 'Ready for Huda review' : assessment?.status === 'approved' ? 'Approved proposal' : assessment?.status === 'expired' ? 'Review window expired' : 'No current proposal';
  const now = Date.parse(caseView.clock);
  const workNow = [...new Set(plan.intervals.filter(i => i.kind === 'work' && Date.parse(i.starts_at) <= now && now < Date.parse(i.ends_at)).map(i => i.person_id))];
  const canStart = assessment?.status === 'approved' && workNow.length > 0 && caseView.tasks.some(t => t.action === 'start_work' && t.status === 'ready');
  return <div className="hs-screen">
    <Head kicker={`Proposal · ${time(caseView.clock)} GST`} title="Proposal review" />
    <Hero>
      <Metric label={expired ? 'Previous proposal' : 'Proposed'} value={String(ids.length)} sub={ids.map(id => id).join(', ') || 'nobody yet'} tone={ids.length && !expired ? 'ok' : undefined} />
      <Metric label={expired ? 'Others at assessment' : 'Not proposed'} value={String(Math.max(0, people.length - ids.length))} sub="See current crew locations" />
      <Metric label="Trench" value={caseView.story.stopped ? 'Stopped' : 'Held'} sub="heavy work stays stopped" tone="red" />
    </Hero>
    <Draft>
      <p><b>{expired ? 'This previous proposal is no longer current. Record fresh observations and recalculate.' : planned ? `${ids.length} workers meet every requirement for workshop preparation.` : `Planning is ${plan.planning_status.replaceAll('_', ' ')}.`}</b></p>
      {plan.blockers.length > 0 && <p>Waiting for: {plan.blockers.map(reasonLabel).join(', ')}.</p>}
      <p className="hs-small">Assessed {time(assessment?.assessed_at)} · review by {time(assessment?.approval_deadline)} · {reviewStatus}{assessment?.status === 'proposed' && assessment.approval_deadline && <> · <ApprovalCountdown view={caseView} deadline={assessment.approval_deadline} /></>}</p><p className="hs-small">Solver {plan.solver_status ?? '—'}{plan.optimal ? ' · optimal' : ''} · policy {plan.policy_id ?? 'none'} · {plan.useful_worker_minutes ?? 0} proposed worker-minutes</p>
    </Draft>
    <Section title={expired ? 'Workers in previous proposal' : 'Proposed workers'}>
      {ids.length ? <List>{ids.map(id => { const iv = intervalsOf(capture, id); return <Row key={id} lead={<Avatar id={id} size="md" />} title={who(id)} detail={iv.slice(0, 3).map(i => `${kindLabel(i.kind)} ${time(i.starts_at)}–${time(i.ends_at)}`).join(', ')} badge={expired ? <span className="hs-badge" data-tone="muted">Previous assignment</span> : approved ? <span className="hs-badge" data-tone="done">Assigned</span> : <span className="hs-badge" data-tone="plan">Proposed</span>} />; })}</List>
        : <Empty>No productive assignment is available yet.</Empty>}
    </Section>
    <Computed>Proposed work is not observed activity or permission to start work.</Computed>
    <CtaBar note="Approval binds this exact assessed proposal. Work starts only after a separate confirmation.">
      <ActionButton session={session} action="assign" label="Approve assessed proposal" primary disabled={assessment?.status !== 'proposed'} />
      {taskBadge(session, 'assign')}
    </CtaBar>
    {assessment?.status === 'approved' && <Section title="Start approved workshop work">
      <p>Current approved work interval: {workNow.length ? workNow.map(who).join(', ') : 'none now'}.</p>
      <label className="hs-field"><input type="checkbox" checked={recoveryConfirmed} onChange={e => setRecoveryConfirmed(e.target.checked)} /> I observed the required recovery through now.</label>
      <label className="hs-field"><input type="checkbox" checked={prerequisitesConfirmed} onChange={e => setPrerequisitesConfirmed(e.target.checked)} /> I confirmed workshop permit, resources, supervision and readiness.</label>
      <button type="button" className="hs-button is-primary" disabled={!canStart || !recoveryConfirmed || !prerequisitesConfirmed || session.busy} onClick={() => void session.act('start_work', { assessment_id: assessment.id, person_ids: workNow, observed_recovery: true, prerequisites_confirmed: true })}>Confirm start of work for {workNow.length} workers</button>
    </Section>}
    {returnControl}
  </div>;
}

/** Worker action card: the steps for one worker who needs help, in order. */
export function ActionCardScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const story = caseView.story;
  const id = incidentPerson(caseView);
  if (!id) return <div className="hs-screen"><Head title="Worker action card" /><Empty>No worker is reported unwell in this case.</Empty></div>;
  const name = firstNameOf(id);
  const steps: Array<[string, string, string]> = [
    ['incident_record', 'Record the site incident', 'Huda'],
    ['remove', `Remove ${name} from the heat and confirm where they are`, 'Huda'],
    ['firstaid', 'Record first-aid contact', 'Salim'],
    ['recovery_check', 'Confirm the recovery check', 'Huda'],
  ];
  const salim = person.id === 'P06';
  const report = story.reports?.find(r => r.person_id === id);
  const reportedAt = report?.occurred_at ?? story.events.find(event => event.id === 'report')?.occurred_at;
  return <div className="hs-screen">
    <Head kicker={reportedAt ? `${who(id)} · reported ${time(reportedAt)}${report?.via === 'foreman' ? ' by Huda' : report?.via === 'kiosk' ? ' at the kiosk' : ''}` : `${who(id)} · report recorded`} title="Worker action card" />
    <Statement tone="red" source="⚙ Escalation rule">{name} needs rest now. Keep {name} off work and with someone.</Statement>
    <Note tone="amber">If {name} is confused, has vomited or stopped sweating: treat it as an emergency, start cooling, keep someone with them and call 998.</Note>
    <Section title="Steps">
      <List>{steps.map(([action, label, owner], i) => <Row key={action} title={`${i + 1}. ${label}`} detail={`Owner: ${owner}`} badge={taskBadge(session, action)} />)}</List>
    </Section>
    <Note>No health detail here. Details stay in {name}’s own health record.</Note>
    <CtaBar>
      {salim ? <ActionButton session={session} action="firstaid" label="Record first-aid contact" primary />
        : !story.removed ? <><ActionButton session={session} action="incident_record" label="Record the site incident" /><ActionButton session={session} action="remove" label={`Confirm ${name} removed from heat`} danger confirm={{ title: `Confirm ${name} is out of the heat`, body: `This records your confirmation for the protective response. ${name} goes to welfare and first aid.` }} /></>
          : <ActionButton session={session} action="recovery_check" label="Confirm the recovery check" primary />}
    </CtaBar>
  </div>;
}
