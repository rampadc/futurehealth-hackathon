import { reasonLabel } from '../../copy';
import { EvidenceAction } from '../../EvidenceAction';
import { nameOf } from '../../replay';
import { Schedule } from '../../shared/plan';
import { assessmentCapture, assignedIds, crew, intervalsOf, kindLabel, time, who } from '../data';
import { ActionButton, Computed, Draft, Empty, Head, Hero, List, Metric, NoCase, Note, Row, Section, Person } from '../kit';
import type { ScreenProps } from '../registry';
import { StatusIcon } from '../../shared/icons';
import { CrewRiskPanel } from '../risk';
import { bandOf, OtherSquadScreen, SquadItems, SquadPicker, squadsFor, useSquad } from '../squads';
import { Conversation } from '../ask';
import { Icon } from '../../shared/icons';
import { Avatar, Badge } from '../kit';

const status = (s: string) => s.replaceAll('_', ' ');

/** Crew & workshop: who can move to covered work, why, and the assignment record. */
export function CrewWorkshopScreen({ session }: ScreenProps) {
  const [squadId] = useSquad();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const capture = assessmentCapture(caseView);
  const people = crew(caseView);
  const qualified = people.filter(p => p.qualifications.includes('civil_worker'));
  const ready = qualified.filter(p => p.readiness === 'ready' && !p.excluded);
  const proposed = assignedIds(capture);
  const workshopId = capture?.request.task_locations.workshop_prep;
  const workshop = capture?.request.locations.find(l => l.id === workshopId);
  const fixed = capture?.request.snapshot.zone_windows.find(w => w.zone_id === workshopId)?.fixed_occupant_ids ?? [];
  const demand = capture?.request.snapshot.workshop.staffing_demand;
  const ws = capture?.request.snapshot.workshop;
  const plan = capture?.response.crew_rest;
  const huda = person.id === 'C01';
  const squads = squadsFor(caseView);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const lines = (q: typeof sq) => q.live ? [`${ready.length} eligible · ${workshop ? `${workshop.capacity - fixed.length} of ${workshop.capacity}` : '—'} workshop places free`] : [`${q.loc} · ${q.size} workers`];
  if (!sq.live) return <OtherSquadScreen title="Crew & workshop" squad={sq} squads={squads} lines={lines}>
    <Section title={`Crew · ${sq.name}`}><div className="hs-crew-grid">{sq.members.map(id => <div key={id} className="hs-crew-card"><Avatar id={id} size="lg" /><b>{id}</b><Badge tone={sq.hold ? 'muted' : 'done'}>{sq.hold ? 'Recovery' : 'Working'}</Badge><span className="hs-small hs-muted">{sq.loc}</span></div>)}</div></Section>
    <CrewRiskPanel session={session} squad={sq.id} />
  </OtherSquadScreen>;
  return <div className="hs-screen">
    <Head kicker={`Crew & workshop · Civil crew · ${time(caseView.clock)} GST`} title="Crew & workshop" sub="Decide who can move to covered work. A proposal is not an assignment until Huda records it." />
    <SquadPicker squads={squads} lines={lines} />
    <p className="hs-computed">Workshop places {workshop ? `${workshop.capacity - fixed.length} free of ${workshop.capacity}` : '—'}{fixed.length ? ` · ${fixed.map(nameOf).join(', ')} fixed` : ''} · useful demand {demand ? `${demand.minimum}–${demand.maximum} people` : '—'}</p>
    <Section title="Eligibility">
      <div className="hs-funnel" role="group" aria-label="Eligibility funnel">
        <div><span className="hs-label">Affected</span><strong className="hs-readout">{people.length}</strong><span className="hs-small">heavy work stopped</span></div>
        <div><span className="hs-label">Qualified</span><strong className="hs-readout">{qualified.length}</strong><span className="hs-small">civil workers</span></div>
        <div><span className="hs-label">Confirmed ready</span><strong className="hs-readout">{ready.length}</strong><span className="hs-small">individual, in person</span></div>
        <div><span className="hs-label">Proposed</span><strong className="hs-readout">{proposed.length}</strong><span className="hs-small">within capacity</span></div>
      </div>
    </Section>
    <div className="hs-grid">
      <Section title="Proposal">
        {plan ? <Draft>
          <p><b>{proposed.length ? `${proposed.map(id => nameOf(id).split(' ')[0]).join(', ')} for workshop preparation.` : 'No productive assignment yet.'}</b></p>
          {plan.blockers.length > 0 && <p>Waiting for: {plan.blockers.map(reasonLabel).join(', ')}.</p>}
          <p className="hs-small">Assessed {time(caseView.plan_assessment?.assessed_at)} · review by {time(caseView.plan_assessment?.approval_deadline)} · {caseView.plan_assessment?.status ?? 'historical'}</p><p className="hs-small">Status {status(plan.planning_status)} · {plan.useful_worker_minutes ?? 0} useful / {plan.unmet_worker_minutes ?? 0} unmet worker-minutes in this proposal</p>
        </Draft> : <Empty>{caseView.plan_assessment?.status === 'awaiting_observations' ? 'Current observed activity is needed for every active worker before a proposal can be assessed.' : caseView.plan_assessment?.status === 'blocked' ? 'Current planning is blocked. Review the live reading, readiness and observed activity.' : 'The planner has not run for this case yet.'}</Empty>}
        {huda && <ActionButton session={session} action="assign" label="Approve this assessed proposal" primary disabled={caseView.plan_assessment?.status !== 'proposed'} />}
      </Section>
      <Section title="Requirement checks">
        <List>
          <Row title="Permit" detail={ws ? status(ws.permit_status) : '—'} badge={ws?.permit_status === 'valid' ? <span className="hs-badge" data-tone="done" aria-hidden="true" /> : <span className="hs-badge" data-tone="wait">Check</span>} />
          <Row title="Resources" detail={ws ? status(ws.resource_status) : '—'} badge={ws?.resource_status === 'available' ? <span className="hs-badge" data-tone="done" aria-hidden="true" /> : <span className="hs-badge" data-tone="wait">Check</span>} />
          <Row title="Supervision" detail={ws ? status(ws.supervision_status) : '—'} badge={ws?.supervision_status === 'confirmed' || ws?.supervision_status === 'available' ? <span className="hs-badge" data-tone="done" aria-hidden="true" /> : <span className="hs-badge" data-tone="wait">Check</span>} />
        </List>
      </Section>
    </div>
    <Section title="Crew · all affected">
      {/* The crew as a grid of people, not a list. */}
      <div className="hs-crew-grid">{people.map(p => <div key={p.id} className="hs-crew-card">
        <Avatar id={p.id} size="lg" excluded={p.excluded} /><b>{who(p.id)}</b>
        {p.excluded ? <Badge tone="over">Excluded</Badge> : p.readiness === 'ready' ? <Badge tone="done">Ready</Badge> : p.readiness === 'not_ready' ? <Badge tone="over">Not ready</Badge> : <Badge tone="wait">Unconfirmed</Badge>}
        <span className="hs-small hs-muted">{p.qualifications.includes('civil_worker') ? 'Qualified' : 'Not qualified'}{p.readiness === 'ready' && p.readinessUntil ? ` · until ${time(p.readinessUntil)}` : ''} · seen {time(p.lastObserved)}</span>
        <span className="hs-small">{proposed.includes(p.id) ? caseView.plan_assessment?.status === 'expired' ? 'Previous assignment' : caseView.plan_assessment?.status === 'approved' || !caseView.plan_assessment && caseView.story.assigned ? 'Assigned' : 'Proposed' : p.excluded ? 'Excluded' : 'Recovery'}</span>
      </div>)}</div>
    </Section>
    <CrewRiskPanel session={session} />
    {huda && <Section title="Record observations">
      <div className="hs-mui">
        {['readiness', 'activity', 'leila'].map(action => <EvidenceAction key={action} action={action} caseView={caseView} person={person} onAction={session.act} busy={session.busy} />)}
      </div>
    </Section>}
  </div>;
}

/** Work/rest plan: the next hour's work and recovery, checked by the solver. */
export function WorkRestPlanScreen({ session }: ScreenProps) {
  const [squadId] = useSquad();
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const squads = squadsFor(caseView);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const lines = (q: typeof sq) => [q.live ? (caseView.capture?.response.crew_rest.planning_status ? `Plan ${caseView.capture.response.crew_rest.planning_status.replaceAll('_', ' ')}` : 'No plan yet') : q.hold ? 'Plan needed' : 'No plan needed · no heat hold'];
  if (!sq.live) return <OtherSquadScreen title="Work/rest plan" squad={sq} squads={squads} lines={lines}><p className="hs-ok">No work/rest plan needed: the {sq.name.toLowerCase()} has no heat hold. {sq.status}.</p></OtherSquadScreen>;
  const capture = assessmentCapture(caseView);
  const plan = capture?.response.crew_rest;
  const story = caseView.story;
  if (!capture || !plan) return <div className="hs-screen"><Head title="Work/rest plan" /><Empty>{caseView.plan_assessment?.status === 'awaiting_observations' ? 'Current observed activity is needed for every active worker before a new plan can be assessed.' : caseView.plan_assessment?.status === 'blocked' ? 'Current planning is blocked. Review the live reading, readiness and observed activity.' : 'No plan yet. The planner needs observed work and rest history from Shelter A.'}</Empty></div>;
  const pending = story.reported && (!story.removed || !story.firstaid);
  const timing = plan.timing_policy;
  const ids = assignedIds(capture);
  return <div className="hs-with-side"><div className="hs-screen">
    <Head kicker={`Work/rest plan · ${capture.request.planning ? `${time(capture.request.planning.starts_at)}–${time(plan.horizon_end)}` : time(caseView.clock)}`} title="Work/rest plan" sub="Each worker sees only their own intervals." />
    <SquadPicker squads={squads} lines={lines} />
    <p className="hs-computed">{plan.useful_worker_minutes ?? 0} worker-min proposed · {ids.length} workers · {plan.unmet_worker_minutes ?? 0} unmet · {status(plan.planning_status)}{plan.planning_status === 'infeasible' ? ' (rule result, not an error)' : plan.optimal ? ' · optimal' : ''} · assessed {time(caseView.plan_assessment?.assessed_at)}</p>
    {pending && <Note tone="amber">Updated times are waiting for {[!story.removed && 'Huda’s removal confirmation', !story.firstaid && 'Salim’s first-aid contact'].filter(Boolean).join(' and ')}.</Note>}
    {timing && <Note>Work and recovery rule: {timing.initial_recovery_minutes} min initial recovery · ≤ {timing.max_work_minutes} min continuous work · {timing.between_work_recovery_minutes} min between.</Note>}
    <Section title="Timeline">
      <div className="hs-mui"><Schedule capture={capture} /></div>
    </Section>
    <Section title="Intervals">
      <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Worker</th><th>Activity</th><th>Where</th><th>From</th><th>To</th></tr></thead>
        <tbody>{[...new Set(plan.intervals.map(i => i.person_id))].flatMap(id => intervalsOf(capture, id)).map(i => <tr key={i.person_id + i.starts_at}>
          <td><Person id={i.person_id} size="sm">{who(i.person_id)}</Person></td><td>{kindLabel(i.kind)}{i.requires_revalidation ? ' · revalidate' : ''}</td><td>{nameOf(i.zone_id)}</td><td>{time(i.starts_at)}</td><td>{time(i.ends_at)}</td>
        </tr>)}</tbody>
      </table></div>
    </Section>
    {plan.assumptions.length > 0 && <Section title="Assumptions"><ul className="hs-plain">{plan.assumptions.map(a => <li key={a}>{reasonLabel(a)}</li>)}</ul></Section>}
    <Computed>Proposal {caseView.plan_assessment?.status ?? 'historical'} · review deadline {time(caseView.plan_assessment?.approval_deadline)} · actual work starts only after Huda’s confirmation</Computed>
  </div>
    {/* The AI Planning Agent sits in a right-hand sidebar beside the plan it explains. */}
    <aside className="hs-side" aria-label="AI Planning Agent"><h2><Icon name="ai" /> AI Planning Agent</h2><Conversation session={session} compact /></aside>
  </div>;
}
