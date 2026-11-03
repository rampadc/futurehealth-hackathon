import { act, createSession, getConnectedNext, scenarioComplete, stepSession, type Session, type StepResult } from './engine';
import type { FixtureEvent } from './fixtures';
import { people, zones } from './fixtures';

export type StreamActivity = {
  kind: 'signal' | 'preparation' | 'decision' | 'blocked' | 'transition' | 'error';
  title: string;
  detail: string;
  provenance: 'synthetic_feed' | 'scripted_assistant' | 'policy_engine' | 'human_action';
  eventId?: string;
  actorId?: string;
  at: string;
};

export type StreamUpdate = {
  session: Session;
  activities: StreamActivity[];
  status: 'advanced' | 'awaiting_actor' | 'transitioned' | 'complete' | 'denied';
  pendingEvent: FixtureEvent | null;
  result?: StepResult;
};

const names: Record<string, string> = {
  forecast: 'Forecast shows hotter hours ahead',
  twl: 'Heat reading received',
  delivery_accept: 'Supplier accepted the new delivery time',
  clock: 'Site clock advanced',
  recommendation: 'Morning trench plan ready for review',
  hold: 'Send trench hold to Huda',
  ack: 'Huda: acknowledge hold',
  stop: 'Huda: confirm crew stopped',
  recover: 'Huda: confirm cooled recovery',
  assign_attempt: 'Check crew assignment',
  assign: 'Huda: assign workshop crew',
  check: 'Huda: check light work',
  delivery_draft: '15:30 delivery request drafted',
  delivery_approve: 'Noura: approve delivery request',
  delivery_send: 'Noura: send supplier request',
  sensor_fail: 'Trench heat sensor failed',
  clearance_attempt: 'Trench restart request checked',
  escalate: 'Rashid: check unanswered hold',
  symptom: 'Bilal’s dizziness reported',
  first_aid: 'Salim: record first aid',
  restart_attempt: 'Trench restart request checked',
  review: 'Rashid: review trench restart',
  restart: 'Rashid: authorize restart',
  handover: 'Rashid: hand over trench hold',
};

const details: Record<string, string> = {
  forecast: 'Forecast: 43°C from 11:00–16:00. Maya needs a current trench reading before setting the work plan.',
  twl: 'Maya checks that this reading is from the right area, the sensor works and the reading is recent.',
  delivery_accept: 'The supplier accepted 15:30 for aggregate delivery. The new time is now booked.',
  clock: 'Maya checks reading age and any unanswered hold.',
  recommendation: 'Maya checks local conditions; Rashid decides the site plan.',
  hold: 'The trench reading has already put heavy work on hold. Maya must send the instruction to Huda.',
  ack: 'Huda must acknowledge the hold; this alone does not confirm the crew stopped.',
  stop: 'Huda must confirm heavy trench work stopped and account for the crew.',
  recover: 'Huda must confirm the crew reached cooled recovery.',
  assign_attempt: 'Huda must check that the proposed workers meet the task and location requirements.',
  assign: 'Huda can assign the four eligible workers to pipe-marker preparation in the cooled workshop.',
  check: 'Huda must confirm Noor and Adil are doing only supervised marking and materials checks.',
  delivery_draft: 'A 15:30 delivery request is prepared. The supplier booking is still 11:30.',
  delivery_approve: 'Noura must approve the 15:30 request before it can be sent.',
  delivery_send: 'Noura records the approved request. No supplier message is sent from this page.',
  sensor_fail: 'The trench sensor has failed. Heavy trench work stays on hold until Maya gets a valid local reading and site review.',
  clearance_attempt: 'Maya checks whether the reading comes from the trench and is no more than five minutes old.',
  escalate: 'Huda has not acknowledged within two minutes. Rashid must contact her and verify the crew response.',
  symptom: 'Bilal reported dizziness. Huda must remove him from the task and contact Salim, the first aider.',
  first_aid: 'Salim must record his assessment and referral decision. Medical details stay in the first-aid record.',
  restart_attempt: 'A better heat reading does not restart the trench crew. Rashid must review current conditions and authorize it.',
  review: 'Rashid must check the trench reading, crew, water, rest, permit and the 12:30–15:00 outdoor-work ban.',
  restart: 'Rashid checks a fresh trench reading and authorizes the restart.',
  handover: 'Rashid must pass on the trench hold, crew response, delivery time and open reading and permit checks.',
};

const completed: Record<string, string> = {
  recommendation: 'Maya recorded the morning trench plan', hold: 'Maya sent the trench hold to Huda', ack: 'Huda acknowledged the trench hold',
  stop: 'Huda confirmed heavy trench work stopped', recover: 'Huda recorded crew recovery', assign: 'Four workers assigned to workshop preparation',
  check: 'Huda checked Noor and Adil’s light work', delivery_draft: '15:30 delivery request drafted',
  delivery_approve: 'Noura approved the delivery request', delivery_send: 'Simulated supplier request sent',
  sensor_fail: 'Trench sensor failure recorded', escalate: 'Rashid was alerted to the unanswered hold',
  symptom: 'Bilal’s dizziness reported', first_aid: 'Salim recorded first-aid follow-up',
  review: 'Rashid recorded restart checks', restart: 'Rashid authorized trench restart', handover: 'Open trench hold handed over',
};

const nextSituation: Record<string, string> = {
  '03_constrained_reassignment': 'Check the four-person workshop move',
  '04_delivery_coordination': 'Resolve the 11:30 aggregate delivery',
  '10_handover_and_evidence': 'Hand over the open trench hold',
};

function activity(event: FixtureEvent, kind: StreamActivity['kind'], provenance: StreamActivity['provenance'], detail = details[event.type]): StreamActivity {
  const title = kind === 'blocked' ? event.type === 'assign_attempt' ? 'Crew move blocked' : event.type === 'clearance_attempt' ? 'Trench clearance blocked' : event.type === 'restart_attempt' ? 'Trench restart blocked' : 'Site request blocked' : names[event.type] ?? 'Site update';
  return { kind, title, detail, provenance, eventId: event.event_id, actorId: event.actor_id, at: event.occurred_at };
}

const personName = (id: string) => people.find(person => person.id === id)?.name ?? 'crew member';
const zoneName = (id: string) => zones.find(zone => zone.id === id)?.name ?? 'work zone';
const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
const friendlyReason: Record<string, string> = {
  capacity_and_qualification: 'Fourteen people cannot fit in the six-place workshop; two places are already occupied, and some workers lack the pipe-marker qualification.',
  acclimatisation: 'The proposed workers are still acclimatising and cannot join heavy exposed work.',
  qualification: 'One or more proposed workers lack the qualification for this task.',
  wrong_zone: 'The electrical area reading cannot be used for the trench.',
  failed_or_stale: 'The trench sensor failed, and its old reading cannot lift the hold.',
  stale_reading: 'The trench reading is more than five minutes old. Rashid needs a fresh reading before another restart decision.',
  human_review_required: 'Rashid has not completed the restart checks and approved the crew to resume.',
  unauthorized_actor: 'The person responsible for this decision must record it.',
  midday_prohibition: 'Outdoor work cannot restart between 12:30 and 15:00.',
};
const explainReason = (reason?: string) => friendlyReason[reason ?? ''] ?? 'A required site check has not been completed.';

function pendingDetail(session: Session, event: FixtureEvent): string {
  const p = event.payload;
  switch (event.type) {
    case 'clock':
      return `Site time advances by ${p.minutes} minutes. ${session.scenarioId === '07_unacknowledged_alert' ? 'If Huda has not acknowledged the hold, Rashid must follow up; this still does not prove the crew stopped.' : 'The trench reading may now be too old for a restart decision.'}`;
    case 'hold': {
      const reading = session.state.readings.civil_exposed;
      const assigned = session.state.assignments.civil_heavy;
      const crew = assigned.filter(id => id !== 'C01');
      return `Send the trench hold to Huda. The trench reading is ${reading?.twl ?? 'unknown'} W/m², at or below the 150 W/m² hold limit. Huda must confirm ${count(crew.length, 'worker')}${assigned.includes('C01') ? ' and she herself' : ''} have stopped.`;
    }
    case 'recover': {
      const zone = zones.find(item => item.id === p.zone_id);
      const occupied = session.state.occupancy[p.zone_id]?.length ?? 0;
      const capacity = zone && 'capacity' in zone ? zone.capacity : 0;
      return `${count(p.person_ids.length, 'worker')} need cooled recovery in ${zoneName(p.zone_id)}. ${count(Math.max(0, capacity - occupied), 'place')} are free. Huda must confirm they arrived.`;
    }
    case 'assign_attempt':
      return p.task_id === 'civil_heavy' ? 'Huda must check Noor and Adil before assigning them to heavy trench work. Both are still on acclimatisation day 2 and must stay on supervised light work.' : `Huda’s proposed move of ${count(p.person_ids.length, 'worker')} to ${zoneName(p.zone_id)} needs a space, qualification and acclimatisation check.`;
    case 'assign':
      return `Assign ${p.person_ids.map(personName).join(', ')} to pipe-marker preparation in ${zoneName(p.zone_id)}. Huda must record the move.`;
    case 'delivery_draft':
      return `A request for ${new Date(p.new_slot).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })} is ready. Aggregate delivery remains booked for 11:30 until the supplier accepts a new time.`;
    case 'delivery_approve':
      return `The 15:30 request is still a draft. ${personName(event.actor_id!)} must approve it before the simulated supplier message can be sent.`;
    case 'delivery_send':
      return `The 15:30 request was approved. ${personName(event.actor_id!)} records it here; no supplier message is sent from this page.`;
    case 'review':
      return `A restart checklist is ready. ${personName(event.actor_id!)} must verify the trench reading, crew, water, rest, permit and midday restriction.`;
    case 'restart':
      return `Rashid’s review is recorded. ${personName(event.actor_id!)} must authorize restart after a fresh trench reading and time check.`;
    default:
      return `${details[event.type] ?? 'This step needs a site decision.'} ${personName(event.actor_id!)} must record the action.`;
  }
}

function finish(session: Session, activities: StreamActivity[], status: StreamUpdate['status'], result?: StepResult): StreamUpdate {
  return { session, activities, status, pendingEvent: session.pendingEvent, result };
}

/** One stream tick. It applies external fixture signals and stages human actions, never executes them. */
export function driveStream(source: Session): StreamUpdate {
  const session = structuredClone(source);
  // Repeated timer ticks at a decision boundary must not add duplicate cards or grant authority.
  if (session.pendingEvent) return finish(session, [], 'awaiting_actor');

  const result = stepSession(session);
  if (result.status === 'complete') {
    if (!scenarioComplete(session)) {
      return finish(session, [{ kind: 'error', title: 'Site record is incomplete', detail: 'A required step in this training case has not been recorded.', provenance: 'policy_engine', at: session.state.clock }], 'denied', result);
    }
    const next = getConnectedNext(session);
    if (!next) return finish(session, [], 'complete', result);
    const inherited = createSession(next, session.state);
    // Keep the complete event audit trail while resetting scenario-local assertions and cursor.
    inherited.history = structuredClone(session.history);
    inherited.commercialConcern = session.commercialConcern;
    inherited.crewBriefing = session.crewBriefing;
    inherited.commercialChecks = session.commercialChecks;
    return finish(inherited, [{ kind: 'transition', title: nextSituation[next] ?? 'Continue the site response', detail: 'The recorded crew locations, trench hold and delivery time carry forward.', provenance: 'scripted_assistant', at: inherited.state.clock }], 'transitioned', result);
  }
  if (!result.event) return finish(session, [], 'denied', result);
  if (result.status === 'awaiting_actor') {
    const event = result.event;
    return finish(session, [activity(event, 'preparation', 'scripted_assistant', pendingDetail(session, event))], 'awaiting_actor', result);
  }
  if (result.status === 'denied') {
    return finish(session, [activity(result.event, 'error', 'policy_engine', explainReason(result.reason))], 'denied', result);
  }
  const detail = result.status === 'rejected' ? explainReason(result.reason)
    : result.event.type === 'clock' ? `${result.event.payload.minutes} minutes passed. ${session.scenarioId === '07_unacknowledged_alert' ? 'Huda has not acknowledged the hold; Rashid must follow up and verify the crew stopped.' : 'The earlier trench reading is now too old for another restart decision.'}`
    : result.event.type === 'twl' && result.event.payload.zone_id === 'civil_exposed' && result.event.payload.twl <= 150
      ? `The trench reading is ${result.event.payload.twl} W/m², at or below the site’s 150 W/m² limit. The site rule put heavy trench work on hold; Huda still needs to confirm the crew stopped.`
      : undefined;
  return finish(session, [activity(result.event, result.status === 'rejected' ? 'blocked' : 'signal', result.status === 'rejected' ? 'policy_engine' : 'synthetic_feed', detail)], 'advanced', result);
}

/** Only call from an explicit human action; a timer must use driveStream alone. */
export function applyHumanAction(source: Session, actorId: string): StreamUpdate {
  const session = structuredClone(source);
  const result = act(session, actorId);
  if (!result.event) return finish(session, [], 'complete', result);
  if (result.status === 'denied') {
    return finish(session, [activity(result.event, 'blocked', 'policy_engine', explainReason(result.reason))], 'denied', result);
  }
  if (result.status === 'rejected') {
    return finish(session, [activity(result.event, 'blocked', 'policy_engine', explainReason(result.reason))], 'advanced', result);
  }
  const actor = personName(actorId);
  const decisionDetail: Record<string, string> = {
    hold: 'Maya sent the hold to Huda. The heat reading had already put heavy trench work on hold; Huda still needs to confirm the crew stopped.',
    ack: 'Huda acknowledged the instruction. She still needs to confirm the crew stopped.',
    stop: 'Huda confirmed heavy trench work stopped and accounted for the crew.',
    recover: 'Huda recorded eleven workers arriving in cooled recovery.',
    assign: 'Four qualified workers moved to pipe-marker preparation in the cooled workshop; heavy trench work remains held.',
    delivery_send: 'Noura sent the simulated 15:30 request. No real supplier was contacted; the 11:30 booking remains until acceptance.',
    review: 'Rashid recorded the trench reading, crew, water, rest, permit and midday checks.',
    restart: 'Rashid authorized heavy trench work to resume after the checks.',
    handover: 'Rashid passed on the open trench hold, crew response, supplier time and remaining reading and permit checks.',
  };
  const recorded = activity(result.event, 'decision', 'human_action', decisionDetail[result.event.type] ?? `${actor} recorded the required site action.`);
  recorded.title = completed[result.event.type] ?? names[result.event.type] ?? 'Decision recorded';
  return finish(session, [recorded], 'advanced', result);
}
