import assumptions from '../../demo/cross-scenario/commercial_assumptions.json';
import type { Session } from './engine';
import { baseline, fixtures, people, zones } from './fixtures';

export const costActions = [
  { id: 'recovery_roster', actorId: 'C01', label: 'Confirm roster' },
  { id: 'supplier_quote_request', actorId: 'P05', label: 'Prepare enquiry' },
  { id: 'exposure_review', actorId: 'P01', label: 'Record review' },
] as const;

const round = (value: number) => Math.round(value * 100) / 100;

export function calculateCostPlan(session: Pick<Session, 'state' | 'history' | 'pendingDeliverySlot'>) {
  const recoveryEvent = [...session.history].reverse().find(item => item.status === 'applied' && item.event.type === 'recover');
  const fallback = baseline.assignments.civil_heavy.filter(id =>
    Object.entries(session.state.occupancy).some(([zone, occupants]) => zone.startsWith('shelter') && occupants.includes(id))
    || session.state.assignments.workshop_prep?.includes(id));
  const cohort: string[] = recoveryEvent?.event.payload.person_ids ?? fallback;
  const recovering = cohort.filter(id => Object.entries(session.state.occupancy).some(([zone, people]) =>
    zone.startsWith('shelter') && people.includes(id)));
  const workshop = cohort.filter(id => session.state.assignments.workshop_prep?.includes(id)
    && session.state.task_status.workshop_prep === 'active');
  const workshopZone = zones.find(zone => zone.id === 'workshop');
  const workshopCapacity = workshopZone && 'capacity' in workshopZone ? workshopZone.capacity : 0;
  const proposedIds: string[] = fixtures['03_constrained_reassignment'].events.find(event => event.type === 'assign')?.payload.person_ids ?? [];
  const eligible = proposedIds.filter(id => recovering.includes(id)
    && people.find(person => person.id === id)?.qualifications.includes('civil_worker'));
  const workshopPotentialCount = Math.min(eligible.length, Math.max(0, workshopCapacity - session.state.occupancy.workshop.length));
  const names = (ids: string[]) => ids.map(id => people.find(person => person.id === id)?.name ?? id);
  const hoursPerWorker = assumptions.window_minutes / 60;
  const deliveryStatus = session.state.delivery.status;
  const proposedSlot = session.pendingDeliverySlot ?? assumptions.proposed_delivery_slot;
  const actualSlot = session.state.delivery.slot;
  return {
    originalRecoveryCount: cohort.length,
    recoveringCount: recovering.length,
    workshopCount: workshop.length,
    workshopNames: names(workshop),
    workshopPotentialCount,
    workshopPotentialNames: names(eligible.slice(0, workshopPotentialCount)),
    originalRecoveryHours: round(cohort.length * hoursPerWorker),
    recoveryHours: round(recovering.length * hoursPerWorker),
    workshopHours: round(workshop.length * hoursPerWorker),
    workshopPotentialHours: round(workshopPotentialCount * hoursPerWorker),
    projectedRecoveryHours: round((recovering.length - workshopPotentialCount) * hoursPerWorker),
    illustrativeOriginalExposureAed: round(cohort.length * hoursPerWorker * assumptions.illustrative_burdened_rate_aed_per_worker_hour),
    illustrativeRemainingExposureAed: round(recovering.length * hoursPerWorker * assumptions.illustrative_burdened_rate_aed_per_worker_hour),
    illustrativeProjectedExposureAed: round((recovering.length - workshopPotentialCount) * hoursPerWorker * assumptions.illustrative_burdened_rate_aed_per_worker_hour),
    deliveryStatus,
    actualSlot,
    proposedSlot,
    shiftHours: round((Date.parse(proposedSlot) - Date.parse(assumptions.original_delivery_slot)) / 3_600_000),
  };
}

export { assumptions as costAssumptions };
