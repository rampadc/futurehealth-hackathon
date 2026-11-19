import { apiFetch, ApiError, live, type CaseView } from '../live';
import { atDubai, payloads, toIso } from '../commands';
import { readingPayload } from '../scenarioPresets';
import { isoAt, minuteOf } from './model';
import type { Device } from '../screens/registry';

/**
 * Presenter tutorial: the core shift story as a fixed series of steps. Opening a step continues the
 * current case and records, behind the scenes, only the earlier human actions that are still
 * missing, each as its own persona. The case is reset only at the first step, or when the step's
 * own action is already recorded (for example after going back). Nothing here bypasses the case
 * rules: every record goes through `/api/case/commands` with the same checks a person's tap gets.
 */

/** One setup operation. `done` says whether the current case already has it, so it can be skipped. */
export type SetupOp =
  | { as: string; action: string; payload?: (view: CaseView) => Record<string, unknown>; done?: (view: CaseView) => boolean }
  | { advance: number; done?: (view: CaseView) => boolean }
  | { awaitProposal: true }
  | { reading: { twl: number; kind: 'valid' | 'fault' | 'stale' } };

export type TutorialStep = {
  id: string;
  title: string;
  /** Persona whose window the step opens. */
  persona: string;
  device: Device;
  /** Screen path inside the device, e.g. `stop-work`. */
  screen: string;
  /** Earlier records this step needs, in story order. `null` keeps the current case as it is. */
  setup: SetupOp[] | null;
  /** Start from a fresh case, even when the current case could be continued. */
  reset?: true;
  /** Actions the presenter records in this step. If one is already recorded, the case is reset first. */
  does?: string[];
  /** What the presenter clicks in the opened window. */
  click: string;
  /** What this step means for the people on site and the people using the app. */
  onSite: string;
  /** What the backend records and calculates when the step is done. */
  system: string;
};

const CREW = Array.from({ length: 11 }, (_, i) => `C${String(i + 2).padStart(2, '0')}`);
const crewOf = (view: CaseView) => (view.request?.snapshot.workers ?? view.capture?.request.snapshot.workers ?? []).map(w => w.person_id);
const check = () => payloads.check();
const taskOf = (view: CaseView, actor: string, action: string) => view.tasks.find(t => t.actor_id === actor && t.action === action);
/** Recorded at some point in this case. A later event can reopen a task (a report reopens plan approval), so the event history counts too. */
export const recorded = (view: CaseView, actor: string, action: string) => taskOf(view, actor, action)?.status === 'recorded' || (view.story?.events ?? []).some(e => e.id === action && e.actorId === actor);
const unconfirmed = (view: CaseView) => {
  const ready = new Set((view.workers ?? []).filter(w => w.readiness === 'ready').map(w => w.person_id));
  return (crewOf(view).length ? crewOf(view) : CREW).filter(id => !ready.has(id));
};
/** Restart checks must be recent. Once Rashid's review is open (or recorded), the current checks are fresh enough. */
/** Observed activity is repeatable; once a proposal is assessed (or approved), it does not need recording again. */
const planReady = (view: CaseView) => recorded(view, 'C01', 'assign') || ['proposed', 'approved'].includes(view.plan_assessment?.status ?? '');
const restartReady = (view: CaseView) => taskOf(view, 'P02', 'review')?.status !== 'waiting';
const restartCheck = (as: string, action: string, payload?: (view: CaseView) => Record<string, unknown>): SetupOp => ({ as, action, payload, done: view => recorded(view, as, action) && restartReady(view) });

// Each stage is the human record that a step adds, so a later step's setup is the earlier stages in order.
const ISSUE: SetupOp[] = [{ as: 'P03', action: 'issue' }];
const ACK: SetupOp[] = [...ISSUE, { as: 'C01', action: 'acknowledge' }];
const STOP: SetupOp[] = [...ACK, { as: 'C01', action: 'stop' }];
const CHECKIN: SetupOp[] = [...STOP, { as: 'C05', action: 'checkin' }];
const RECOVER: SetupOp[] = [...CHECKIN, { as: 'C01', action: 'recover', payload: view => ({ person_ids: crewOf(view).length ? crewOf(view) : CREW, zone_id: 'shelter_a' }) }];
const PROPOSAL: SetupOp[] = [
  ...RECOVER,
  { as: 'C01', action: 'readiness', done: view => unconfirmed(view).length === 0 || recorded(view, 'C01', 'assign'), payload: view => payloads.readiness(unconfirmed(view), 'ready', 'Foreman checked the worker in person', toIso(atDubai(new Date(Date.parse(view.clock) + 2 * 60 * 60_000).toISOString()))) },
  { advance: 2, done: view => planReady(view) },
  { as: 'C01', action: 'activity', done: view => planReady(view), payload: view => ({ through_now: true, observed: true, groups: [{ kind: 'recovery', zone_id: 'shelter_a', person_ids: crewOf(view).length ? crewOf(view) : CREW }] }) },
  { awaitProposal: true },
];
const ASSIGN: SetupOp[] = [...PROPOSAL, { as: 'C01', action: 'assign', payload: view => payloads.assign(view) }];
const REPORT: SetupOp[] = [...ASSIGN, { as: 'C08', action: 'report' }];
const REMOVE: SetupOp[] = [...REPORT, { as: 'C01', action: 'incident_record' }, { as: 'C01', action: 'remove', payload: () => payloads.remove() }];
const FIRSTAID: SetupOp[] = [...REMOVE, { as: 'P06', action: 'firstaid' }];
const RESTART_EVIDENCE: SetupOp[] = [
  ...FIRSTAID,
  restartCheck('C01', 'fresh', view => payloads.fresh(view, 180)),
  restartCheck('C01', 'water', check),
  restartCheck('P04', 'permit', check),
  restartCheck('C01', 'personnel', check),
  restartCheck('C01', 'recovery_check', check),
  restartCheck('C01', 'crew_readiness', check),
];
const HANDOVER: SetupOp[] = [...FIRSTAID, { as: 'P02', action: 'handover' }];

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: '01-issue', title: 'Maya issues the stop-work instruction', persona: 'P03', device: 'web', screen: 'heat-controls', setup: [], reset: true, does: ['issue'],
    click: 'Select “Issue stop-work to Civil crew”.',
    onSite: 'The T1 monitor in the civil trench reads TWL 145 W/m² at 08:00, below the 150 W/m² heavy-work limit. Maya, the safety officer, reviews the heat controls and instructs the civil crew to stop heavy trench work.',
    system: 'The solver has already placed civil heavy work on hold from the reading. Maya’s instruction is recorded as a separate case event. Huda’s acknowledgement task opens with a two-minute deadline.',
  },
  {
    id: '02-escalation', title: 'Overdue acknowledgement escalates to Rashid', persona: 'P02', device: 'web', screen: 'response', does: ['escalation_followup', 'acknowledge'],
    setup: [...ISSUE, { advance: 3, done: view => (taskOf(view, 'P02', 'escalation_followup')?.status ?? 'waiting') !== 'waiting' }],
    click: 'Under “Record yours”, select “Follow up overdue acknowledgment”.',
    onSite: 'Huda has not acknowledged within two case minutes. Rashid, the superintendent, receives the overdue item and follows it up with the crew directly.',
    system: 'If the deadline has not yet passed, the case clock is moved three minutes past the instruction. The backend records the escalation automatically and assigns Rashid a follow-up task. His follow-up is recorded as a human event; the hold on heavy work is unchanged.',
  },
  {
    id: '03-acknowledge', title: 'Huda acknowledges the instruction', persona: 'C01', device: 'site', screen: 'stop-work', setup: ISSUE, does: ['acknowledge'],
    click: 'Select “Acknowledge”.',
    onSite: 'Huda, the civil foreman, receives the stop-work instruction on the site phone and acknowledges it. The crew is still in the trench at this point.',
    system: 'The acknowledgement is recorded as its own event, separate from the instruction and from Rashid’s follow-up. The “confirm heavy work stopped” task opens.',
  },
  {
    id: '04-stop', title: 'Huda confirms heavy work has stopped', persona: 'C01', device: 'site', screen: 'stop-work', setup: ACK, does: ['stop'],
    click: 'Select “Confirm heavy work stopped”.',
    onSite: 'Huda checks that the crew has stopped work and moves them towards Shelter A, the cooled recovery area.',
    system: 'Cessation is recorded as a separate event. The alert, the acknowledgement and the actual stop each have their own time. Worker check-ins and the recovery headcount open.',
  },
  {
    id: '05-checkin', title: 'Rana checks in at the shelter', persona: 'C05', device: 'worker', screen: 'shelter', setup: STOP, does: ['checkin'],
    click: 'Select “Check in at Shelter A”, then Confirm.',
    onSite: 'Rana, a civil worker, arrives at Shelter A and confirms her own arrival on her phone. Other workers can use the shelter kiosk instead.',
    system: 'Rana’s personal arrival is recorded under her own identity. It counts towards personal arrivals only; Huda’s physical headcount is still required.',
  },
  {
    id: '06-worker-view', title: 'Rana views her own heat risk and data', persona: 'C05', device: 'worker', screen: 'now', setup: [...STOP, { as: 'C05', action: 'checkin' }],
    click: 'Review “My heat risk”, then select the “Me” tab to show privacy and my data.',
    onSite: 'Rana sees her own heat-risk band and the reasons for it, and what data the company holds about her. Supervisors see only bands and required actions, not her health details.',
    system: 'The worker risk endpoint is scoped to the signed-in worker. The heat-stress rules calculate her band from the site reading, her clothing, work type and acclimatisation. Other workers’ records are not returned.',
  },
  {
    id: '07-headcount', title: 'Huda accounts for the crew', persona: 'C01', device: 'site', screen: 'account-for-crew', setup: CHECKIN, does: ['recover'],
    click: 'Tick the attestation box, then select “Confirm 11 workers accounted for”.',
    onSite: 'Huda physically checks that all 11 affected workers are at Shelter A, whether or not they checked in on a phone.',
    system: 'The recovery headcount is recorded with the time and location. Crew planning unlocks, and Huda’s individual readiness checks and Mina’s coverage review open.',
  },
  {
    id: '08-readiness', title: 'Huda confirms individual readiness', persona: 'C01', device: 'site', screen: 'readiness', setup: RECOVER,
    click: 'Tick the workers to confirm, or select “Select all unconfirmed”, then select “Confirm selected” and confirm them ready for workshop preparation.',
    onSite: 'Huda speaks to each worker in the shelter and confirms who is fit for supervised workshop preparation under cover.',
    system: 'Each confirmation is recorded per person with a basis and an expiry time. Only confirmed workers can be included in a workshop proposal.',
  },
  {
    id: '09-coverage', title: 'Mina reviews heat and rest coverage', persona: 'P10', device: 'web', screen: 'heat-rest', setup: RECOVER,
    click: 'Choose the status, add a note, then select “Record employer coverage review”.',
    onSite: 'Mina, the employer’s contract manager, checks the C02–C12 roster against the heat and rest policy for pay and rest coverage.',
    system: 'The review is recorded as an employer record. It does not authorise work, and protective decisions never wait for it.',
  },
  {
    id: '10-proposal', title: 'Huda approves the workshop proposal', persona: 'C01', device: 'site', screen: 'proposal', setup: PROPOSAL, does: ['assign'],
    click: 'Select “Approve assessed proposal”.',
    onSite: 'Huda reviews the solver’s proposal for supervised workshop preparation and decides whether to approve it.',
    system: 'Readiness and observed activity were recorded, and the solver returned a checked proposal (applied: false). Approval is a separate human record. Starting work later is another record. Heavy trench work stays on hold throughout.',
  },
  {
    id: '11-symptom', title: 'Bilal reports dizziness', persona: 'C08', device: 'worker', screen: 'check-in', setup: ASSIGN, does: ['report'],
    click: 'Select “I feel unwell”, answer the question, then select “Send to my supervisor” and Confirm.',
    onSite: 'Bilal feels dizzy and reports it from his phone. His foreman, Huda, receives the report as a task to act on.',
    system: 'The report is recorded under Bilal’s identity and starts the first-aid route whatever the sensor reading says. Huda’s incident and removal tasks open. The current plan is invalidated for recalculation.',
  },
  {
    id: '12-removal', title: 'Huda records the incident and removal', persona: 'C01', device: 'site', screen: 'action-card', setup: REPORT, does: ['remove'],
    click: 'Select “Record the site incident”, then “Confirm Bilal removed from heat” and Confirm.',
    onSite: 'Huda records the incident and takes Bilal to the welfare and first-aid area.',
    system: 'The incident record and the removal are two separate events. Bilal is marked unavailable at Welfare, and the solver recalculates the crew plan without him.',
  },
  {
    id: '13-firstaid', title: 'Salim records first-aid contact', persona: 'P06', device: 'site', screen: 'action-card', setup: REMOVE, does: ['firstaid'],
    click: 'Select “Record first-aid contact”.',
    onSite: 'Salim, the first aider, attends to Bilal at Welfare.',
    system: 'First-aid contact is recorded. Restart evidence and the shift handover can now proceed. No health detail is shared on supervisor screens.',
  },
  {
    id: '14-delivery', title: 'Noura moves the materials delivery', persona: 'P05', device: 'web', screen: 'monitoring', setup: ASSIGN, does: ['draftDelivery'],
    click: 'Record each delivery step in turn: draft, approve, record as sent, record supplier acceptance.',
    onSite: 'Noura, the logistics coordinator, moves the truck booking from 11:30 to 15:30 so it does not arrive during the heat hold.',
    system: 'Draft, approval, sending and supplier acceptance are four separate records. The application sends nothing externally; Noura records what happened outside it.',
  },
  {
    id: '15-fresh', title: 'Huda records a fresh local reading', persona: 'C01', device: 'site', screen: 'fresh-reading', setup: FIRSTAID,
    click: 'Enter a TWL such as 180, select “Record fresh local reading”, then “Confirm water check”.',
    onSite: 'Huda, the foreman on site, takes a new reading at the trench and checks water provision before any restart review.',
    system: 'A fresh, valid T1 reading is recorded at the current case time. Restart checks must be no more than five case minutes old when Rashid records his review.',
  },
  {
    id: '16-restart', title: 'Rashid records the restart review', persona: 'P02', device: 'web', screen: 'restart-review', setup: RESTART_EVIDENCE, does: ['review'],
    click: 'Select “Record restart review”, then Confirm. Do this within five minutes of opening the step.',
    onSite: 'Rashid reviews the fresh reading and the personnel, recovery, water, crew readiness and permit checks.',
    system: 'The solver reports the restart evidence as ready for human review. Rashid’s review is recorded, but it does not release heavy trench work; resuming work is a separate site decision.',
  },
  {
    id: '17-handover', title: 'Rashid records the shift handover', persona: 'P02', device: 'web', screen: 'restart-review', setup: FIRSTAID, does: ['handover'],
    click: 'Select “Record shift handover”.',
    onSite: 'Rashid hands the shift over with the restart and delivery decisions still open.',
    system: 'The handover is recorded with the open items carried forward, so nothing is closed by the handover itself.',
  },
  {
    id: '18-cost', title: 'Amal reviews the project impact', persona: 'P01', device: 'web', screen: 'monitoring', setup: HANDOVER, does: ['costReview'],
    click: 'Select “Record cost impact review”.',
    onSite: 'Amal, the project manager, reviews the lost time and the project chronology.',
    system: 'The review is recorded as a case event. The project view shows the chronology, confirmed work and recovery minutes, employer coverage and delivery state. No cost estimate is created.',
  },
  {
    id: '19-ask', title: 'Ask the Planning Agent', persona: 'P03', device: 'web', screen: 'ask', setup: null,
    click: 'Select a suggested question such as “What needs attention?”, or type your own question and select Send.',
    onSite: 'Maya asks the Planning Agent to explain the case and the current plan in plain language.',
    system: 'The agent reads the case through persona-scoped tools and cites its sources. Model Armor and grounding results appear in Run evidence below, not on product screens. The case is kept as it is for this step.',
  },
  {
    id: '20-sensor', title: 'Sensor fault: missing data stays unknown', persona: 'P03', device: 'web', screen: 'heat-controls', setup: [{ reading: { twl: 145, kind: 'fault' } }],
    click: 'Review the civil crew card and “Task controls · Civil crew”. No action is needed.',
    onSite: 'The civil trench monitor reports an invalid reading. Civil heavy and light work show clearance blocked until a valid reading is recorded.',
    system: 'The invalid reading is recorded with its quality. The civil band shows Unknown; it is not filled in from nearby or historical data, and an invalid reading cannot clear work.',
  },
];

/** Tab identities this presenter page uses to record each persona's setup actions. */
const tabs = new Map<string, string>();

async function personaRequest<T>(personaId: string, path: string, init?: RequestInit): Promise<T> {
  let tab = tabs.get(personaId);
  const call = async (id: string, p: string, i?: RequestInit) => {
    const response = await apiFetch(`/api${p}`, { ...i, headers: { 'X-Heat-Tab-ID': id } });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail; } catch { /* Keep the status. */ }
      throw new ApiError(message, response.status);
    }
    return response.status === 204 ? null : response.json();
  };
  if (!tab) {
    tab = `tutorial-${personaId}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    await call(tab, '/session', { method: 'POST', body: JSON.stringify({ persona_id: personaId }) });
    tabs.set(personaId, tab);
  }
  return call(tab, path, init) as Promise<T>;
}

async function record(personaId: string, action: string, payload: (view: CaseView) => Record<string, unknown>) {
  const view = await personaRequest<CaseView>(personaId, '/case');
  return personaRequest<CaseView>(personaId, '/case/commands', {
    method: 'POST',
    body: JSON.stringify({ command_id: crypto.randomUUID(), case_id: view.case_id, expected_version: view.version, action, payload: payload(view) }),
  });
}

async function awaitProposal(timeoutMs = 45_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const view = await live.demoState();
    if (view?.plan_assessment?.status === 'proposed' && view.plan_assessment.id) return view;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('The solver did not return a workshop proposal in time. Open the step again.');
}

const describe = (op: SetupOp) => 'as' in op ? `${op.as} · ${op.action}` : 'advance' in op ? `Move case time ${op.advance} min` : 'awaitProposal' in op ? 'Wait for the solver proposal' : 'Inject reading';

/** Whether an operation is already reflected in the case, so continuing the case can skip it. */
function isDone(op: SetupOp, view: CaseView) {
  if ('awaitProposal' in op) return recorded(view, 'C01', 'assign') || view.plan_assessment?.status === 'proposed' && !!view.plan_assessment.id;
  if ('reading' in op) return false;
  if (op.done) return op.done(view);
  return 'as' in op && recorded(view, op.as, op.action);
}

/** Whether the step has to start from a fresh case rather than continue the current one. */
export function needsReset(step: TutorialStep, view: CaseView | null) {
  if (step.reset || !view || view.time?.status === 'ended') return true;
  return (step.does ?? []).some(action => view.tasks.some(t => t.action === action && recorded(view, t.actor_id, action)));
}

async function runSetup(ops: SetupOp[], start: CaseView, onProgress: (label: string) => void) {
  let view = start;
  for (const op of ops) {
    if (isDone(op, view)) continue;
    onProgress(describe(op));
    try {
      if ('as' in op) await record(op.as, op.action, op.payload ?? (() => ({})));
      else if ('advance' in op) await live.jumpClock(isoAt(minuteOf(view.clock) + op.advance));
      else if ('awaitProposal' in op) await awaitProposal();
      else await live.signal(view.case_id, readingPayload(view, op.reading.twl, op.reading.kind));
      view = (await live.demoState()) ?? view;
    } catch (cause) {
      throw new Error(`Tutorial setup stopped at “${describe(op)}”: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    }
  }
}

/**
 * Prepare the case for this step. The current case is continued and only the missing earlier records
 * are added. If continuing fails, the case is reset once and the earlier steps are recorded again.
 */
export async function prepareStep(step: TutorialStep, onProgress: (label: string) => void = () => {}): Promise<CaseView | null> {
  const current = await live.demoState();
  if (step.setup === null) return current;
  if (!needsReset(step, current)) {
    try { await runSetup(step.setup, current!, onProgress); return live.demoState(); }
    catch (cause) { onProgress(`Could not continue the case (${cause instanceof Error ? cause.message : 'unknown error'}). Starting again`); }
  }
  onProgress('Resetting the case to 08:00');
  await runSetup(step.setup, await live.reset(), onProgress);
  return live.demoState();
}

/** The persona window URL for a step. Same window names as the persona launcher, so windows are reused. */
export const stepUrl = (step: TutorialStep) => `/${step.device}/${step.screen}?persona=${encodeURIComponent(step.persona)}`;
export const stepWindow = (step: TutorialStep) => ({
  name: `heat-${step.persona}-${step.device}`,
  features: step.device === 'site' || step.device === 'worker' ? 'popup,width=430,height=900' : step.device === 'kiosk' ? 'popup,width=1024,height=768' : 'popup,width=1440,height=920',
});
