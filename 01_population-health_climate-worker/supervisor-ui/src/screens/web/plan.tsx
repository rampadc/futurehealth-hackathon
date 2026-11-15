import { reasonLabel } from '../../copy';
import { EvidenceAction } from '../../EvidenceAction';
import { nameOf } from '../../replay';
import { Schedule } from '../../shared/plan';
import { assignedIds, crew, intervalsOf, kindLabel, time, who } from '../data';
import { ActionButton, Computed, Draft, Empty, Head, Hero, List, Metric, NoCase, Note, Row, Section } from '../kit';
import type { ScreenProps } from '../registry';

const status = (s: string) => s.replaceAll('_', ' ');

/** W4 · Crew & workshop: who can move to covered work, why, and the assignment record. */
export function W4CrewWorkshop({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const capture = caseView.capture;
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
  return <div className="hs-screen">
    <Head kicker={`Crew & workshop · ${time(caseView.clock)} GST`} title="Crew & workshop" sub="Decide who can move to covered work. A proposal is not an assignment until Huda records it." />
    <Hero>
      <Metric label="Eligible now" value={String(ready.length)} sub="qualified and confirmed ready" tone={ready.length ? 'ok' : 'red'} />
      <Metric label="Workshop places" value={workshop ? `${workshop.capacity - fixed.length} free of ${workshop.capacity}` : '—'} sub={fixed.length ? `${fixed.map(nameOf).join(', ')} fixed` : undefined} />
      <Metric label="Useful demand" value={demand ? `${demand.minimum}–${demand.maximum} people` : '—'} sub="workshop preparation" />
    </Hero>
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
          <p className="hs-small">Status {status(plan.planning_status)} · {plan.useful_worker_minutes ?? 0} useful / {plan.unmet_worker_minutes ?? 0} unmet worker-minutes</p>
        </Draft> : <Empty>The planner has not run for this case yet.</Empty>}
        {huda && <ActionButton session={session} action="assign" label="Record assignment" primary />}
      </Section>
      <Section title="Requirement checks">
        <List>
          <Row title="Permit" detail={ws ? status(ws.permit_status) : '—'} badge={ws?.permit_status === 'valid' ? <span className="hs-badge" data-tone="done">✓</span> : <span className="hs-badge" data-tone="wait">Check</span>} />
          <Row title="Resources" detail={ws ? status(ws.resource_status) : '—'} badge={ws?.resource_status === 'available' ? <span className="hs-badge" data-tone="done">✓</span> : <span className="hs-badge" data-tone="wait">Check</span>} />
          <Row title="Supervision" detail={ws ? status(ws.supervision_status) : '—'} badge={ws?.supervision_status === 'confirmed' || ws?.supervision_status === 'available' ? <span className="hs-badge" data-tone="done">✓</span> : <span className="hs-badge" data-tone="wait">Check</span>} />
        </List>
      </Section>
    </div>
    <Section title="Crew · all affected">
      <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Worker</th><th>Qualified</th><th>Readiness</th><th>Last observed</th><th>Proposal</th></tr></thead>
        <tbody>{people.map(p => <tr key={p.id}>
          <td>{who(p.id)}</td>
          <td>{p.qualifications.includes('civil_worker') ? 'Yes' : 'No'}</td>
          <td>{p.excluded ? '■ Excluded' : p.readiness === 'ready' ? `Ready${p.readinessUntil ? ` until ${time(p.readinessUntil)}` : ''}` : p.readiness === 'not_ready' ? 'Not ready' : 'Unconfirmed'}</td>
          <td>{time(p.lastObserved)}</td>
          <td>{proposed.includes(p.id) ? (caseView.story.assigned ? 'Assigned' : 'Proposed') : p.excluded ? 'Excluded' : 'Recovery'}</td>
        </tr>)}</tbody>
      </table></div>
    </Section>
    {huda && <Section title="Record observations" hint="Readiness and activity are human records, never the plan">
      <div className="hs-mui">
        {['readiness', 'activity', 'leila'].map(action => <EvidenceAction key={action} action={action} caseView={caseView} person={person} onAction={session.act} busy={session.busy} />)}
      </div>
    </Section>}
  </div>;
}

/** W5 · Work/rest plan: the next hour's work and recovery, checked by the solver. */
export function W5WorkRestPlan({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const capture = caseView.capture;
  const plan = capture?.response.crew_rest;
  const story = caseView.story;
  if (!capture || !plan) return <div className="hs-screen"><Head title="Work/rest plan" /><Empty>No plan yet. The planner needs observed work and rest history from Shelter A.</Empty></div>;
  const pending = story.reported && (!story.removed || !story.firstaid);
  const timing = plan.timing_policy;
  const ids = assignedIds(capture);
  return <div className="hs-screen">
    <Head kicker={`Work/rest plan · ${capture.request.planning ? `${time(capture.request.planning.starts_at)}–${time(plan.horizon_end)}` : time(caseView.clock)}`} title="Work/rest plan" sub="Each worker sees only their own intervals." />
    <Hero>
      <Metric label="Useful work" value={`${plan.useful_worker_minutes ?? 0} worker-min`} sub={`${ids.length} workers`} tone="ok" />
      <Metric label="Unmet" value={`${plan.unmet_worker_minutes ?? 0} worker-min`} />
      <Metric label="Status" value={status(plan.planning_status)} sub={plan.planning_status === 'infeasible' ? 'rule result, not an error' : plan.optimal ? 'optimal' : plan.solver_status ?? undefined} tone={plan.planning_status === 'planned' ? 'ok' : 'red'} />
    </Hero>
    {pending && <Note tone="amber">Updated times are waiting for {[!story.removed && 'Huda’s removal confirmation', !story.firstaid && 'Salim’s first-aid contact'].filter(Boolean).join(' and ')}.</Note>}
    {timing && <Note>Timing policy {timing.id} (fictional test policy): {timing.initial_recovery_minutes} min initial recovery · ≤ {timing.max_work_minutes} min continuous work · {timing.between_work_recovery_minutes} min between.</Note>}
    <Section title="Timeline">
      <div className="hs-mui"><Schedule capture={capture} /></div>
    </Section>
    <Section title="Intervals" hint={`${plan.intervals.length} intervals`}>
      <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Worker</th><th>Activity</th><th>Where</th><th>From</th><th>To</th></tr></thead>
        <tbody>{[...new Set(plan.intervals.map(i => i.person_id))].flatMap(id => intervalsOf(capture, id)).map(i => <tr key={i.person_id + i.starts_at}>
          <td>{who(i.person_id)}</td><td>{kindLabel(i.kind)}{i.requires_revalidation ? ' · revalidate' : ''}</td><td>{nameOf(i.zone_id)}</td><td>{time(i.starts_at)}</td><td>{time(i.ends_at)}</td>
        </tr>)}</tbody>
      </table></div>
    </Section>
    {plan.assumptions.length > 0 && <Section title="Assumptions"><ul className="hs-plain">{plan.assumptions.map(a => <li key={a}>{reasonLabel(a)}</li>)}</ul></Section>}
    <Computed>Solver proposal · applied: false · sending to phones is not part of this demo</Computed>
  </div>;
}
