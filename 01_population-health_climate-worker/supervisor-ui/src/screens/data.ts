import personnel from '../../../demo/cross-scenario/personnel.json';
import type { CaseView, Task } from '../live';
import { ACTIONS, type ActionId } from '../story';
import { nameOf, type Interval, type ReplayCapture } from '../replay';
import { assessThermalReading, thermalStatus } from '../thermal';
import { timeLabel } from '../Timeline';

/** Read-only selectors over the live case, shared by the wireframe screens. */

export const time = (iso: string | null | undefined) => iso ? timeLabel(iso) : '—';
export const firstNameOf = (id: string) => nameOf(id).split(' ')[0];
export const who = (id: string) => `${firstNameOf(id)} (${id})`;

export const taskFor = (caseView: CaseView | null, action: string): Task | undefined => caseView?.tasks.find(task => task.action === action);
export const tasksOf = (caseView: CaseView | null, personId: string | undefined) => caseView?.tasks.filter(task => task.actor_id === personId) ?? [];
export const readyTasks = (caseView: CaseView | null, personId: string | undefined) => tasksOf(caseView, personId).filter(task => task.status === 'ready');

/** Owners of case actions the story module does not list (backend-only evidence actions). */
const EXTRA_OWNERS: Record<string, string> = {
  escalation_followup: 'P02', activity: 'C01', readiness: 'C01', incident_record: 'C01',
  personnel: 'C01', recovery_check: 'C01', crew_readiness: 'C01', water: 'P03',
};
const RESTART_KEYS: Record<string, string> = { permit: 'permit', personnel: 'personnel', recovery_check: 'recovery', water: 'water', crew_readiness: 'crew_readiness' };
export const ownerOf = (action: string) => ACTIONS[action as ActionId]?.actorId ?? EXTRA_OWNERS[action] ?? '';

export type Progress = { status: Task['status'] | 'open'; owner: string; task?: Task };
/**
 * Status of any case action for any viewer. The API lists only the signed-in persona's own
 * tasks, so other people's progress comes from the shared story flags, events and restart checks.
 * `open` means not recorded yet and owned by someone else.
 */
export function progress(caseView: CaseView | null, action: string): Progress {
  const owner = ownerOf(action);
  const task = taskFor(caseView, action);
  if (task) return { status: task.status, owner: task.actor_id, task };
  if (!caseView) return { status: 'open', owner };
  const flag = ACTIONS[action as ActionId]?.flag;
  const restartKey = RESTART_KEYS[action];
  const restart = restartKey ? (caseView.capture?.request.restart as Record<string, { status: string }> | null | undefined)?.[restartKey] : undefined;
  const recorded = (flag && caseView.story[flag]) || caseView.story.events.some(e => e.id === action) || restart?.status === 'confirmed';
  return { status: recorded ? 'recorded' : 'open', owner };
}

export type CrewMember = {
  id: string;
  name: string;
  location: string | null;
  availability: string | null;
  readiness: string | null;
  readinessUntil: string | null;
  lastObserved: string | null;
  reason: string | null;
  qualifications: string[];
  inRecovery: boolean;
  excluded: boolean;
};

/** Everyone on the affected crew, merging the case's live worker state with the solver snapshot. */
export function crew(caseView: CaseView | null): CrewMember[] {
  if (!caseView) return [];
  const snapshot = caseView.request?.snapshot ?? caseView.capture?.request.snapshot;
  const ids = caseView.workers?.length ? caseView.workers.map(w => w.person_id) : snapshot?.workers.map(w => w.person_id) ?? [];
  const recovered = new Set(snapshot?.recovery?.person_ids ?? []);
  const excluded = new Set(caseView.capture?.response.protective_response.excluded_worker_ids ?? []);
  return ids.map(id => {
    const live = caseView.workers?.find(w => w.person_id === id);
    const snap = snapshot?.workers.find(w => w.person_id === id);
    const person = personnel.find(p => p.id === id);
    return {
      id, name: nameOf(id),
      location: snap?.location_id ?? null,
      availability: snap?.availability ?? null,
      readiness: live?.readiness ?? snap?.readiness?.status ?? null,
      readinessUntil: snap?.readiness?.valid_until ?? null,
      lastObserved: live?.last_observed_at ?? null,
      reason: live?.reason ?? null,
      qualifications: person?.qualifications ?? [],
      inRecovery: recovered.has(id),
      excluded: excluded.has(id) || (id === 'C08' && !!caseView.story.reported),
    };
  });
}

export function reading(caseView: CaseView | null) {
  return caseView?.request?.snapshot.readings[0] ?? caseView?.capture?.request.snapshot.readings[0] ?? null;
}

/** Environmental band (ADOSH display bands) plus freshness, kept separate from the site's heavy-work hold. */
export function heatNow(caseView: CaseView | null) {
  const r = reading(caseView);
  const assessed = r && caseView ? assessThermalReading({ twl: r.twl, at: r.measured_at }, caseView.clock, r.quality === 'valid' ? 'serviceable' : r.quality) : null;
  const band = thermalStatus(r?.twl, r?.quality === 'valid');
  const held = caseView?.capture?.response.heat.held_task_ids ?? caseView?.request?.snapshot.held_task_ids ?? [];
  return { reading: r, band, freshness: assessed?.reason ?? 'missing', ageMs: assessed?.ageMs ?? null, held, heavyHeld: held.includes('civil_heavy') || !!caseView?.story.issued };
}

export const assignedIds = (capture: ReplayCapture | null | undefined) =>
  [...new Set(capture?.response.crew_rest.intervals.filter(i => i.kind === 'work' && i.task_id === 'workshop_prep').map(i => i.person_id) ?? [])];

/** The assessed proposal is a distinct, reviewable snapshot, independent of later captures. */
export const assessmentCapture = (caseView: CaseView): ReplayCapture | null => {
  if (!caseView.capture) return null;
  if (!caseView.plan_assessment) return caseView.capture;
  const { request, response } = caseView.plan_assessment;
  return request && response ? { ...caseView.capture, request, response } : null;
};

export const intervalsOf = (capture: ReplayCapture | null | undefined, personId: string): Interval[] =>
  (capture?.response.crew_rest.intervals ?? []).filter(i => i.person_id === personId).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

/** The interval running at `clock`, and the next one after it. */
export function nowAndNext(intervals: Interval[], clock: string) {
  const at = Date.parse(clock);
  const current = intervals.find(i => Date.parse(i.starts_at) <= at && at < Date.parse(i.ends_at)) ?? null;
  const next = intervals.find(i => Date.parse(i.starts_at) > at) ?? null;
  return { current, next };
}

export const minutes = (i: Interval) => Math.round((Date.parse(i.ends_at) - Date.parse(i.starts_at)) / 60_000);
export const kindLabel = (kind: string) => kind === 'work' ? 'Work' : kind === 'recovery' ? 'Recovery' : kind === 'unavailable' ? 'Unavailable' : kind;

/** Wireframe screen that handles each case action, for inbox links. */
export const SCREEN_FOR_ACTION: Record<string, { site?: string; web?: string }> = {
  issue: { site: 'stop-work', web: 'heat-controls' }, acknowledge: { site: 'stop-work', web: 'response' }, stop: { site: 'stop-work', web: 'response' },
  recover: { site: 'headcount', web: 'response' }, personnel: { site: 'headcount', web: 'restart-review' }, escalation_followup: { web: 'response' },
  readiness: { site: 'readiness', web: 'crew' }, activity: { site: 'readiness', web: 'crew' }, crew_readiness: { site: 'readiness', web: 'restart-review' }, leila: { site: 'readiness', web: 'crew' },
  assign: { site: 'proposal', web: 'crew' }, incident_record: { site: 'action-card', web: 'response' }, remove: { site: 'action-card', web: 'response' }, firstaid: { site: 'action-card', web: 'response' },
  start_work: { site: 'proposal', web: 'crew' }, start_recovery: { site: 'proposal', web: 'crew' },
  recovery_check: { site: 'action-card', web: 'restart-review' }, fresh: { site: 'fresh-reading', web: 'restart-review' }, water: { site: 'fresh-reading', web: 'restart-review' },
  permit: { web: 'restart-review' }, review: { web: 'restart-review' }, handover: { web: 'restart-review' },
};
