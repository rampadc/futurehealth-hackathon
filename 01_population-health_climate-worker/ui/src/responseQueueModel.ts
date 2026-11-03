import { connectedSequence, people } from './fixtures';
import { costActions } from './costModel';
import type { Session } from './engine';
import { nextConcernAction } from './commercial';

export type QueueAction = {
  id: string;
  title: string;
  detail: string;
  actorId: string;
  target: 'incident' | 'handover';
  ready: boolean;
  plannedAt?: string;
  dueAt?: string;
  overdue?: boolean;
};

const names: Record<string, string> = {
  recommendation: 'Record proposed work plan',
  hold: 'Issue trench hold', ack: 'Acknowledge trench hold', stop: 'Confirm trench work stopped',
  recover: 'Confirm crew in cooled recovery', assign_attempt: 'Check workshop move',
  assign: 'Assign four workers to workshop', check: 'Confirm supervised light work', delivery_draft: 'Draft later delivery slot',
  delivery_approve: 'Approve supplier request', delivery_send: 'Send supplier request',
  escalate: 'Escalate unanswered hold', review: 'Review restart conditions',
  restart: 'Authorise trench restart', handover: 'Confirm shift handover',
  first_aid: 'Record first-aid response', symptom: 'Record worker symptoms',
  sensor_fail: 'Record civil monitor failure', clearance_attempt: 'Check clearance request', restart_attempt: 'Check restart request',
};

export function queueOwner(id: string) {
  const person = people.find(item => item.id === id);
  const role = ({ C01: 'Foreman', P01: 'Project manager', P02: 'Superintendent', P03: 'HSE', P05: 'Logistics', P06: 'First aider' } as Record<string, string>)[id];
  return person ? `${person.name} · ${role ?? person.role}` : id;
}

export function buildResponseQueue(session: Session): QueueAction[] {
  const state = session.state;
  const pending = session.pendingEvent;
  const actions: QueueAction[] = [];
  const add = (item: QueueAction) => { if (!actions.some(existing => existing.id === item.id)) actions.push(item); };
  const alert = Object.values(state.alerts).find(item => item.task_id === 'civil_heavy');
  const holdIssued = !!alert;
  const held = state.task_status.civil_heavy === 'held';
  const affected = new Set(['C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12']);
  const recovery = ['shelter_a', 'shelter_b', 'welfare'].flatMap(id => state.occupancy[id] ?? []).filter(id => affected.has(id)).length;
  const workshop = (state.assignments.workshop_prep ?? []).filter(id => ['C05', 'C06', 'C07', 'C08'].includes(id)).length;
  const dueAt = alert?.at ? new Date(Date.parse(alert.at) + 120_000).toISOString() : undefined;

  if (pending?.actor_id) add({ id: `event:${pending.event_id}`, title: pending.type === 'assign_attempt' && pending.payload.task_id === 'civil_heavy' ? 'Check restricted heavy-work request' : names[pending.type] ?? pending.type.replace(/_/g, ' '), detail: 'Prepared for the named person to confirm in the incident record.', actorId: pending.actor_id, target: 'incident', ready: true, plannedAt: pending.occurred_at, dueAt: pending.type === 'ack' ? dueAt : undefined, overdue: pending.type === 'ack' && !!dueAt && Date.parse(state.clock) >= Date.parse(dueAt) });
  const pendingType = pending?.type;
  if (holdIssued && !alert?.acknowledged && pendingType !== 'ack' && pendingType !== 'escalate') add(alert?.status === 'escalated' ? { id: 'hold-verify', title: 'Verify trench stop after escalation', detail: 'Rashid needs direct confirmation from Huda or the work front; acknowledgment cannot be recorded from this escalated state.', actorId: 'P02', target: 'incident', ready: false } : { id: 'hold-ack', title: 'Acknowledge trench hold', detail: 'The hold has been issued; Huda’s acknowledgment has no recorded confirmation.', actorId: 'C01', target: 'incident', ready: false, dueAt, overdue: !!dueAt && Date.parse(state.clock) >= Date.parse(dueAt) });
  if (holdIssued && alert?.acknowledged && alert.status !== 'stopped' && pendingType !== 'stop') add({ id: 'crew-stop', title: 'Confirm trench work stopped', detail: 'Acknowledgment alone does not confirm the crew has stopped.', actorId: 'C01', target: 'incident', ready: false });
  if (held && alert?.status === 'stopped' && recovery + workshop < 11 && pendingType !== 'recover') add({ id: 'crew-recovery', title: 'Account for affected crew in recovery', detail: `${recovery + workshop} of 11 workers accounted for in cooled locations.`, actorId: 'C01', target: 'incident', ready: false });

  if (connectedSequence.includes(session.scenarioId) && (state.case_id || holdIssued)) {
    if (held && !session.crewBriefing) add({ id: 'crew-briefing', title: 'Record crew briefing', detail: 'Huda can record the hold and recovery briefing in the incident.', actorId: 'C01', target: 'incident', ready: true });
    if (held) {
      const concern = nextConcernAction(session.commercialConcern);
      if (concern.actorId) add({ id: 'commercial-concern', title: concern.stage === 'raised' ? 'Raise pay and lost-output concern' : concern.stage === 'routed' ? 'Route cost concern to Amal' : 'Record cost concern receipt', detail: concern.stage === 'raised' ? 'Record the crew’s pay concern and work affected by the hold.' : concern.stage === 'routed' ? 'Send the recorded concern to Amal for cost review.' : 'Confirm receipt and keep unverified costs open.', actorId: concern.actorId, target: 'incident', ready: true });
      for (const item of costActions) {
        if ((session.commercialChecks ?? []).some(check => check.id === item.id)) continue;
        const ready = item.id !== 'recovery_roster' || recovery + workshop > 0;
        add({ id: `cost:${item.id}`, title: item.id === 'recovery_roster' ? 'Verify recovery roster' : item.id === 'supplier_quote_request' ? 'Prepare supplier cost enquiry' : 'Record cost exposure review', detail: ready ? item.id === 'recovery_roster' ? 'Confirm who is in recovery and who has moved to the workshop.' : item.id === 'supplier_quote_request' ? 'Prepare an enquiry for actual rescheduling and standby fees.' : 'Review worker-hours, estimated charges and missing evidence.' : 'Available after the crew recovery is recorded.', actorId: item.actorId, target: 'handover', ready });
      }
    }
    if (held && state.delivery.status === 'sent') add({ id: 'supplier-response', title: 'Await supplier acceptance', detail: 'The 15:30 request is sent; the original booking remains confirmed until Oasis accepts.', actorId: 'P05', target: 'incident', ready: false });
    if (held && session.scenarioId === '04_delivery_coordination' && ['draft', 'approved'].includes(state.delivery.status) && !['delivery_approve', 'delivery_send'].includes(pendingType ?? '')) add({ id: 'supplier-request', title: state.delivery.status === 'draft' ? 'Approve supplier request' : 'Send supplier request', detail: 'The later booking still needs the next named logistics step.', actorId: 'P05', target: 'incident', ready: false });
    if (held && session.scenarioId === '03_constrained_reassignment' && recovery > 0 && workshop === 0 && !['assign_attempt', 'assign'].includes(pendingType ?? '')) add({ id: 'workshop-move', title: 'Review cooled workshop move', detail: 'Qualified workers may be reassigned only after the named assignment check.', actorId: 'C01', target: 'incident', ready: false });
    if (held && session.scenarioId === '09_restart_review' && !['review', 'restart', 'restart_attempt'].includes(pendingType ?? '')) {
      const reading = state.readings.civil_exposed;
      const fresh = reading && state.sensor_status[reading.sensor_id] === 'serviceable' && Date.parse(state.clock) - Date.parse(reading.at) <= 300_000;
      if (!fresh) add({ id: 'restart-measurement', title: 'Obtain fresh trench reading', detail: 'The local measurement must be fresh and from a working civil monitor before any restart review.', actorId: 'P03', target: 'incident', ready: false });
      else if (!session.review) add({ id: 'restart-review', title: 'Review restart conditions', detail: 'Rashid must review people, water, rest, permit and midday checks.', actorId: 'P02', target: 'incident', ready: false });
      else add({ id: 'restart-authority', title: 'Authorise trench restart', detail: 'A recorded superintendent review is available; the fixture still requires the named restart step.', actorId: 'P02', target: 'incident', ready: false });
    }
    if (held && session.scenarioId === '10_handover_and_evidence' && !session.observed.includes('unresolved_items_visible') && pendingType !== 'handover') add({ id: 'shift-handover', title: 'Confirm shift handover', detail: 'Carry the hold, crew status and delivery into the next shift record.', actorId: 'P02', target: 'incident', ready: false });
  }
  return actions;
}
