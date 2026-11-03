import { baseline, connectedSequence, fixtures, people, scenarioIds, tasks, zones, type FixtureEvent, type ScenarioId } from './fixtures';
import type { CommercialConcern } from './commercial';

export type ReplayState = {
  clock: string;
  case_id: string | null;
  task_status: Record<string, string>;
  assignments: Record<string, string[]>;
  occupancy: Record<string, string[]>;
  readings: Record<string, { twl: number; at: string; sensor_id: string }>;
  sensor_status: Record<string, string>;
  alerts: Record<string, { task_id: string; status: string; acknowledged: boolean; at?: string }>;
  delivery: { id: string; slot: string; status: string };
  evidence: Array<Record<string, string>>;
  open_items: string[];
};
export type EventOutcome = { event: FixtureEvent; status: 'applied' | 'rejected'; reason?: string; at: string };
export type StepResult = { status: 'applied' | 'rejected' | 'awaiting_actor' | 'complete' | 'denied'; event?: FixtureEvent; reason?: string };
export type Session = {
  scenarioId: ScenarioId;
  state: ReplayState;
  cursor: number;
  history: EventOutcome[];
  observed: string[];
  rejections: string[];
  pendingEvent: FixtureEvent | null;
  pendingDeliverySlot: string | null;
  review: { taskId: string; at: string } | null;
  notifiedSymptoms: string[];
  commercialChecks?: Array<{id:string;actorId:string;at:string;snapshot:unknown}>;
  commercialConcern?: CommercialConcern;
  crewBriefing?: { actorId: string; at: string; text: string };
};

const byId = <T extends { id: string }>(items: T[], id: string): T => {
  const item = items.find(value => value.id === id);
  if (!item) throw new Error(`Unknown id: ${id}`);
  return item;
};
const minutes = (later: string, earlier: string) => (Date.parse(later) - Date.parse(earlier)) / 60_000;
const addMinutes = (at: string, count: number) => {
  const offset = at.match(/([+-])(\d{2}):(\d{2})$/);
  if (!offset) throw new Error('clock_requires_offset');
  const delta = (Number(offset[2]) * 60 + Number(offset[3])) * 60_000 * (offset[1] === '+' ? 1 : -1);
  return new Date(Date.parse(at) + count * 60_000 + delta).toISOString().slice(0, 19) + at.slice(-6);
};
const merge = (target: any, source: any): any => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) merge(target[key], value);
    else target[key] = structuredClone(value);
  }
  return target;
};
const observe = (session: Session, ...values: string[]) => {
  for (const value of values) if (!session.observed.includes(value)) session.observed.push(value);
};
const requireGate = (condition: unknown, reason: string) => { if (!condition) throw new Error(reason); };
const localReading = (s: Session, zoneId: string) => {
  const zone = byId(zones, zoneId);
  const reading = s.state.readings[zoneId as keyof typeof s.state.readings];
  requireGate(reading && reading.sensor_id === zone.sensor_id, 'wrong_zone');
  return reading;
};
const freshLocal = (s: Session, zoneId: string, at: string) => {
  const reading = localReading(s, zoneId);
  requireGate(s.state.sensor_status[reading.sensor_id as keyof typeof s.state.sensor_status] === 'serviceable' && minutes(at, reading.at) <= 5 && minutes(at, reading.at) >= 0, 'failed_or_stale');
  return reading;
};
const checkState = (s: Session) => {
  const occupied = Object.values(s.state.occupancy).flat();
  requireGate(new Set(occupied).size === occupied.length, 'duplicate_occupancy');
  for (const [zoneId, ids] of Object.entries(s.state.occupancy)) {
    const zone = byId(zones, zoneId);
    requireGate(!('capacity' in zone) || ids.length <= (zone as { capacity: number }).capacity, 'capacity');
  }
  const active = Object.entries(s.state.assignments).flatMap(([taskId, ids]) => s.state.task_status[taskId as keyof typeof s.state.task_status] === 'active' ? ids : []);
  requireGate(new Set(active).size === active.length, 'double_booking');
  const exposed = Object.entries(s.state.assignments).flatMap(([taskId, ids]) => s.state.task_status[taskId as keyof typeof s.state.task_status] === 'active' && byId(zones, byId(tasks, taskId).zone_id).type === 'exposed' ? ids : []);
  requireGate(!exposed.some(id => occupied.includes(id)), 'exposed_worker_in_recovery');
  requireGate(!s.state.assignments.civil_heavy.some(id => id === 'C13' || id === 'C14'), 'acclimatisation');
};

/** Start a standalone fixture, or pass the preceding session's state for the 02→03→04→10 chain. */
export function createSession(scenarioId: ScenarioId, inheritedState?: ReplayState): Session {
  const fixture = fixtures[scenarioId];
  const state: ReplayState = inheritedState ? structuredClone(inheritedState) : merge(structuredClone(baseline), fixture.meta.initial_overrides);
  const session: Session = { scenarioId, state, cursor: 0, history: [], observed: [], rejections: [], pendingEvent: null, pendingDeliverySlot: null, review: null, notifiedSymptoms: [] };
  checkState(session);
  return session;
}
export function resetSession(_session: Session, scenarioId: ScenarioId, inheritedState?: ReplayState): Session { return createSession(scenarioId, inheritedState); }
export function getConnectedNext(session: Session): ScenarioId | null {
  if (session.cursor < fixtures[session.scenarioId].events.length) return null;
  const index = connectedSequence.indexOf(session.scenarioId);
  return index < 0 || index === connectedSequence.length - 1 ? null : connectedSequence[index + 1];
}
export function advanceClock(session: Session, count: number): Session {
  requireGate(Number.isFinite(count) && count >= 0, 'invalid_clock_advance');
  session.state.clock = addMinutes(session.state.clock, count);
  return session;
}

const humanAuthority: Record<string, string> = {
  recommendation: 'P03', hold: 'P03', ack: 'C01', stop: 'C01', recover: 'C01',
  assign_attempt: 'C01', assign: 'C01', check: 'C01', delivery_draft: 'P05',
  delivery_approve: 'P05', delivery_send: 'P05', sensor_fail: 'P03', clearance_attempt: 'P03',
  escalate: 'P02', symptom: 'C01', first_aid: 'P06', restart_attempt: 'C01',
  review: 'P02', restart: 'P02', handover: 'P02',
};

const payloadKeys: Record<string, string[]> = {
  forecast: ['max_air_c', 'source'], recommendation: ['kind', 'tasks', 'clearance'],
  twl: ['zone_id', 'sensor_id', 'twl', 'unit', 'quality', 'measured_at'],
  hold: ['task_id', 'alert_id', 'case_id'], ack: ['alert_id', 'actor_id'],
  stop: ['task_id', 'actor_id'], recover: ['person_ids', 'zone_id'],
  assign_attempt: ['task_id', 'person_ids', 'zone_id', 'expect_reject'],
  assign: ['task_id', 'person_ids', 'zone_id'], check: ['person_ids', 'task_id'],
  delivery_draft: ['delivery_id', 'new_slot', 'reason'], delivery_approve: ['actor_id'],
  delivery_send: ['actor_id', 'recipient', 'synthetic_external_message'],
  delivery_accept: ['actor'], sensor_fail: ['sensor_id'],
  clearance_attempt: ['zone_id', 'using_sensor_id', 'expect_reject'],
  clock: ['minutes'], escalate: ['alert_id', 'actor_id'],
  symptom: ['person_id', 'observation', 'case_id'],
  first_aid: ['person_id', 'actor_id', 'action'],
  restart_attempt: ['task_id', 'actor_id', 'expect_reject'],
  review: ['task_id', 'actor_id', 'checks'], restart: ['task_id', 'actor_id'],
  handover: ['case_id', 'references', 'actor_id', 'unresolved'],
};
const listKeys = new Set(['tasks', 'person_ids', 'affected_zones', 'checks', 'references', 'unresolved']);
const boolKeys = new Set(['clearance', 'synthetic_external_message']);
const numberKeys = new Set(['max_air_c', 'twl', 'minutes']);
function validatePayload(event: FixtureEvent) {
  requireGate(event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload), 'invalid_payload');
  const required = payloadKeys[event.type];
  requireGate(required, 'unknown_event_type');
  for (const key of required) {
    const value = event.payload[key];
    const valid = listKeys.has(key) ? Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
      : boolKeys.has(key) ? typeof value === 'boolean'
      : numberKeys.has(key) ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === 'string';
    requireGate(valid, `invalid_payload_${key}`);
  }
  requireGate(!('diagnosis' in event.payload), 'diagnosis_not_allowed');
}

function apply(session: Session, event: FixtureEvent): StepResult {
  const s = session.state, p = event.payload, at = event.occurred_at, kind = event.type;
  const snapshot = structuredClone(session);
  let rejection: string | undefined;
  try {
    validatePayload(event);
    requireGate(event.scenario_id === session.scenarioId && event.source === 'synthetic_fixture' && event.synthetic === true, 'invalid_event_envelope');
    requireGate(event.actor_id === undefined || (people.some(person => person.id === event.actor_id) && (p.actor_id === undefined || p.actor_id === event.actor_id)), 'actor_mismatch');
    requireGate(!session.history.some(item => item.event.event_id === event.event_id), 'duplicate_event');
    requireGate(Date.parse(event.received_at) >= Date.parse(at) && Date.parse(at) >= Date.parse(s.clock), 'event_time_order');
    requireGate(!session.history.length || Date.parse(at) >= Date.parse(session.history[session.history.length - 1].event.received_at), 'decision_before_receipt');
    s.clock = at;
    switch (kind) {
      case 'forecast':
        requireGate(p.max_air_c > 35 && String(p.source).includes('background'), 'invalid_forecast');
        observe(session, 'forecast_used_for_planning'); break;
      case 'recommendation':
        requireGate(p.clearance === false && p.decision_owner === 'P02', 'forecast_is_not_clearance');
        observe(session, 'no_safety_clearance'); break;
      case 'twl': {
        requireGate(byId(zones, p.zone_id).sensor_id === p.sensor_id && s.sensor_status[p.sensor_id as keyof typeof s.sensor_status] === 'serviceable' && p.quality === 'valid' && p.unit === 'W/m²' && p.measured_at === at, 'invalid_local_reading');
        (s.readings as Record<string, any>)[p.zone_id] = { twl: p.twl, at, sensor_id: p.sensor_id };
        if (p.zone_id === 'civil_exposed' && p.twl <= 150) s.task_status.civil_heavy = 'held';
        break;
      }
      case 'hold': {
        const task = byId(tasks, p.task_id), reading = freshLocal(session, task.zone_id, at);
        requireGate(task.kind === 'heavy_exposed' && s.task_status[p.task_id as keyof typeof s.task_status] === 'held' && reading.twl <= 150, 'hold_trigger_missing');
        s.case_id = p.case_id;
        s.alerts[p.alert_id] = { task_id: p.task_id, status: 'open', acknowledged: false, at };
        s.evidence.push({ kind: 'hold', id: p.alert_id, at });
        observe(session, 'local_heavy_hold', 'hold_open'); break;
      }
      case 'ack': {
        const alert = s.alerts[p.alert_id]; requireGate(alert?.status === 'open', 'alert_not_open');
        alert.acknowledged = true; alert.status = 'acknowledged'; observe(session, 'foreman_acknowledged'); break;
      }
      case 'stop': {
        const alert = Object.values(s.alerts).find(a => a.task_id === p.task_id);
        requireGate(s.task_status[p.task_id as keyof typeof s.task_status] === 'held' && alert?.acknowledged, 'stop_requires_acknowledgment');
        alert.status = 'stopped'; observe(session, 'work_stopped'); break;
      }
      case 'recover': {
        const zone = byId(zones, p.zone_id);
        requireGate(zone.type === 'cooled' && p.person_ids.every((id: string) => s.assignments.civil_heavy.includes(id)), 'invalid_recovery');
        (s.occupancy as Record<string, string[]>)[p.zone_id].push(...p.person_ids);
        observe(session, 'recovery_recorded'); break;
      }
      case 'assign_attempt': case 'assign': {
        const task = byId(tasks, p.task_id), zone = byId(zones, p.zone_id), ids: string[] = p.person_ids;
        requireGate(task.zone_id === p.zone_id && new Set(ids).size === ids.length, 'invalid_assignment');
        const free = 'capacity' in zone ? (zone as { capacity: number }).capacity - ((s.occupancy as Record<string, string[]>)[p.zone_id]?.length ?? 0) : 999;
        const qualified = ids.every(id => task.required_qualifications.every(q => byId(people, id).qualifications.includes(q)));
        const acclim = ids.every(id => byId(people, id).acclimatisation === 'complete' || task.kind === 'light_supervised');
        if (kind === 'assign_attempt') {
          rejection = ids.length > free ? 'capacity_and_qualification' : !acclim ? 'acclimatisation' : !qualified ? 'qualification' : undefined;
          requireGate(rejection && rejection === p.expect_reject, 'unexpected_assignment_result');
          observe(session, rejection === 'capacity_and_qualification' ? 'whole_crew_rejected' : 'restricted_heavy_assignment_rejected');
        } else {
          requireGate(ids.length <= free && qualified && acclim, ids.length > free ? 'capacity' : !acclim ? 'acclimatisation' : 'qualification');
          for (const [otherTask, assigned] of Object.entries(s.assignments)) if (otherTask !== p.task_id) (s.assignments as Record<string, string[]>)[otherTask] = assigned.filter(id => !ids.includes(id));
          for (const [otherZone, occupants] of Object.entries(s.occupancy)) if (otherZone !== p.zone_id) (s.occupancy as Record<string, string[]>)[otherZone] = occupants.filter(id => !ids.includes(id));
          (s.assignments as Record<string, string[]>)[p.task_id] = ids;
          (s.occupancy as Record<string, string[]>)[p.zone_id].push(...ids);
          (s.task_status as Record<string, string>)[p.task_id] = 'active';
          observe(session, 'qualified_subset_reserved', 'no_double_booking');
        }
        break;
      }
      case 'check':
        requireGate(p.person_ids.every((id: string) => (s.assignments as Record<string, string[]>)[p.task_id].includes(id)) && byId(tasks, p.task_id).kind === 'light_supervised', 'supervised_light_assignment_missing');
        observe(session, 'supervised_light_assignment_preserved'); break;
      case 'delivery_draft':
        requireGate(s.delivery.status === 'confirmed' && p.delivery_id === s.delivery.id, 'delivery_not_confirmed');
        session.pendingDeliverySlot = p.new_slot; s.delivery.status = 'draft'; break;
      case 'delivery_approve':
        requireGate(session.pendingDeliverySlot && s.delivery.status === 'draft', 'draft_required');
        s.delivery.status = 'approved'; observe(session, 'draft_approved'); break;
      case 'delivery_send':
        requireGate(s.delivery.status === 'approved' && p.synthetic_external_message === true, 'approval_required');
        s.delivery.status = 'sent'; observe(session, 'request_sent'); break;
      case 'delivery_accept':
        requireGate(s.delivery.status === 'sent' && p.actor === 'visitor_supplier_dispatch' && session.pendingDeliverySlot, 'supplier_acceptance_required');
        s.delivery.slot = session.pendingDeliverySlot; s.delivery.status = 'confirmed'; observe(session, 'supplier_accepted', 'slot_confirmed_after_acceptance'); break;
      case 'sensor_fail':
        requireGate(p.sensor_id in s.sensor_status, 'unknown_sensor');
        (s.sensor_status as Record<string, string>)[p.sensor_id] = 'failed';
        for (const task of tasks) if (byId(zones, task.zone_id).sensor_id === p.sensor_id) (s.task_status as Record<string, string>)[task.id] = 'held';
        observe(session, 'civil_measurement_unavailable'); break;
      case 'clearance_attempt': {
        const local = byId(zones, p.zone_id).sensor_id;
        rejection = p.using_sensor_id !== local ? 'wrong_zone' : 'failed_or_stale';
        requireGate(rejection === p.expect_reject && (rejection === 'wrong_zone' || s.sensor_status[local as keyof typeof s.sensor_status] === 'failed' || minutes(at, localReading(session, p.zone_id).at) > 5), 'unexpected_clearance_result');
        observe(session, 'clearance_blocked'); if (rejection === 'wrong_zone') observe(session, 'other_zone_not_substituted'); break;
      }
      case 'clock':
        requireGate(p.minutes >= 2, 'invalid_clock_advance');
        s.clock = addMinutes(at, p.minutes); break;
      case 'escalate': {
        const alert = s.alerts[p.alert_id]; requireGate(alert && !alert.acknowledged && alert.at && minutes(at, alert.at) >= 2, 'escalation_not_due');
        alert.status = 'escalated'; observe(session, 'no_acknowledgment', 'superintendent_escalated'); break;
      }
      case 'symptom':
        requireGate(p.person_id in Object.fromEntries(people.map(person => [person.id, true])) && !('diagnosis' in p), 'invalid_symptom');
        s.case_id = p.case_id; s.assignments.civil_heavy = s.assignments.civil_heavy.filter(id => id !== p.person_id);
        s.open_items.push(`first aid follow-up for ${p.person_id}`);
        session.notifiedSymptoms.push(p.person_id); observe(session, 'first_aider_alerted', 'worker_removed_from_task', 'no_diagnosis'); break;
      case 'first_aid':
        requireGate(session.notifiedSymptoms.includes(p.person_id) && String(p.action).includes('referral') && !('diagnosis' in p), 'first_aid_follow_up_required');
        s.evidence.push({ kind: 'first_aid', person_id: p.person_id, at }); observe(session, 'incident_recorded'); break;
      case 'restart_attempt': {
        const reading = localReading(session, byId(tasks, p.task_id).zone_id);
        rejection = minutes(at, reading.at) > 5 ? 'stale_reading' : 'human_review_required';
        requireGate(rejection === p.expect_reject, 'unexpected_restart_result');
        if (rejection === 'stale_reading') (s.task_status as Record<string, string>)[p.task_id] = 'held';
        observe(session, rejection === 'stale_reading' ? 'stale_branch_blocked' : 'improvement_not_auto_restart'); break;
      }
      case 'review': {
        const checks = ['fresh_local_twl', 'person_accountability', 'water_rest', 'permit', 'midday'];
        requireGate(s.task_status[p.task_id as keyof typeof s.task_status] === 'held' && checks.every(c => p.checks.includes(c)), 'review_checks_missing');
        requireGate(freshLocal(session, byId(tasks, p.task_id).zone_id, at).twl > 150, 'hold_threshold');
        session.review = { taskId: p.task_id, at }; observe(session, 'human_review_recorded'); break;
      }
      case 'restart': {
        requireGate(session.review?.taskId === p.task_id && Date.parse(session.review.at) <= Date.parse(at), 'human_review_required');
        requireGate(freshLocal(session, byId(tasks, p.task_id).zone_id, at).twl > 150, 'hold_threshold');
        const localDate = at.slice(0, 10), localTime = at.slice(11, 16);
        requireGate(!(localDate >= '2025-06-15' && localDate <= '2025-09-15' && localTime >= '12:30' && localTime < '15:00'), 'midday_prohibition');
        (s.task_status as Record<string, string>)[p.task_id] = 'active'; break;
      }
      case 'handover':
        requireGate(p.case_id === s.case_id && s.case_id === 'sandline_case_01' && p.references.includes('heat_case_01') && s.evidence.some(e => e.id === 'heat_case_01') && s.delivery.status === 'confirmed' && s.delivery.slot === '2025-08-04T15:30:00+04:00' && s.task_status.civil_heavy === 'held' && p.unresolved.length, 'handover_lineage_missing');
        s.open_items.push(...p.unresolved); observe(session, 'prior_case_cited', 'delivery_state_cited', 'unresolved_items_visible'); break;
      default: throw new Error(`Unknown event type: ${kind}`);
    }
    checkState(session);
    if (rejection) session.rejections.push(rejection);
    session.history.push({ event, status: rejection ? 'rejected' : 'applied', reason: rejection, at: s.clock });
    session.cursor++;
    session.pendingEvent = null;
    return { status: rejection ? 'rejected' : 'applied', event, reason: rejection };
  } catch (error) {
    Object.assign(session, snapshot);
    return { status: 'denied', event, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Advance one fixture signal. Human actions pause until act(session, actorId) is called. */
export function stepSession(session: Session): StepResult {
  const event = fixtures[session.scenarioId].events[session.cursor];
  if (!event) return { status: 'complete' };
  const pending = prepareNextHumanAction(session);
  if (pending) return { status: 'awaiting_actor', event: pending };
  return apply(session, event);
}
/** Stage only the next named decision; never advance a signal or change site time. */
export function prepareNextHumanAction(session: Session): FixtureEvent | null {
  const event = fixtures[session.scenarioId].events[session.cursor];
  if (!event || !humanAuthority[event.type]) return null;
  session.pendingEvent = event;
  return event;
}
/** Apply the pending human event if the actor matches its authority; invalid attempts do not advance. */
export function act(session: Session, actorId: string): StepResult {
  const event = session.pendingEvent ?? fixtures[session.scenarioId].events[session.cursor];
  if (!event) return { status: 'complete' };
  if (!humanAuthority[event.type]) return { status: 'denied', event, reason: 'external_event' };
  if (actorId !== humanAuthority[event.type] || actorId !== event.actor_id) return { status: 'denied', event, reason: 'unauthorized_actor' };
  return apply(session, event);
}
export function scenarioComplete(session: Session): boolean {
  const expected = fixtures[session.scenarioId].expected;
  return session.cursor === fixtures[session.scenarioId].events.length && expected.semantic_assertions.every(value => session.observed.includes(value)) && expected.expected_rejections.join('|') === session.rejections.join('|');
}
export { fixtures, scenarioIds, connectedSequence };
