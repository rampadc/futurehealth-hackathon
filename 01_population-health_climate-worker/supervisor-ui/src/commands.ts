import type { CaseView } from './live';

/**
 * Payloads for `/api/case/commands`. Shared by the desktop EvidenceAction forms and the
 * wireframe screens so both send exactly the same shapes.
 */
export const toIso = (local: string) => `${local}:00+04:00`;
/** `YYYY-MM-DDTHH:MM` in Gulf Standard Time, for datetime-local inputs. */
export const atDubai = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Dubai', hour12: false }).replace(' ', 'T').slice(0, 16);

export const CHECK_ACTIONS = new Set(['water', 'personnel', 'recovery_check', 'crew_readiness', 'permit']);

export type WorkerRef = { person_id: string };

export function caseWorkers(caseView: CaseView): WorkerRef[] {
  return caseView.workers?.length ? caseView.workers : caseView.request?.snapshot.workers ?? caseView.capture?.request.snapshot.workers ?? [];
}

export const payloads = {
  recover: (caseView: CaseView) => ({ person_ids: caseView.headcount?.arrivals.map(a => a.person_id) ?? [], zone_id: 'shelter_a' }),
  assign: (caseView: CaseView) => ({ assessment_id: caseView.plan_assessment?.id }),
  remove: () => ({ location_id: 'welfare' }),
  check: () => ({ status: 'confirmed' }),
  readiness: (personIds: string[], status: 'ready' | 'not_ready', basis: string, validUntilIso: string) => ({
    confirmations: personIds.map(person_id => ({ person_id, status, basis, valid_until: validUntilIso })),
  }),
  fresh: (caseView: CaseView, twl: number, measuredIso: string) => {
    const current = caseView.request?.snapshot.readings[0] ?? caseView.capture?.request.snapshot.readings[0];
    return { reading: { sensor_id: current?.sensor_id ?? 't1', zone_id: current?.zone_id ?? 'civil_exposed', twl, unit: 'W/m²', quality: 'valid', measured_now: true } };
  },
};

/** Payload for actions that need no form input; `null` when the action needs a form. */
export function simplePayload(action: string, caseView: CaseView): Record<string, unknown> | null {
  if (action === 'recover') return payloads.recover(caseView);
  if (action === 'assign') return payloads.assign(caseView);
  if (action === 'remove') return payloads.remove();
  if (CHECK_ACTIONS.has(action)) return payloads.check();
  if (action === 'fresh' || action === 'readiness' || action === 'leila' || action === 'activity' || action === 'start_work' || action === 'start_recovery' || action === 'coverage_review') return null;
  return {};
}
