import { describe, expect, it } from 'vitest';
import { act, createSession, stepSession, type Session } from './engine';
import { calculateCostPlan, costActions, costAssumptions } from './costModel';

function finish(session: Session) {
  for (;;) {
    const result = stepSession(session);
    if (result.status === 'complete') return session;
    if (result.status === 'awaiting_actor') expect(['applied', 'rejected']).toContain(act(session, result.event!.actor_id!).status);
    else expect(['applied', 'rejected']).toContain(result.status);
  }
}

describe('30-minute commercial planning estimate', () => {
  it('uses the recovery event and current workshop assignment without counting the four twice', () => {
    const alert = finish(createSession('02_heat_alert_response'));
    expect(calculateCostPlan(alert)).toMatchObject({
      originalRecoveryCount: 11, recoveringCount: 11, workshopCount: 0,
      originalRecoveryHours: 5.5, recoveryHours: 5.5, workshopHours: 0,
      workshopPotentialCount: 4, workshopPotentialHours: 2,
      projectedRecoveryHours: 3.5, illustrativeProjectedExposureAed: 105,
      illustrativeOriginalExposureAed: 165, illustrativeRemainingExposureAed: 165,
    });
    const reassigned = finish(createSession('03_constrained_reassignment', alert.state));
    // The replay state carries assignments but connected scenarios start a fresh event history.
    expect(calculateCostPlan(reassigned)).toMatchObject({
      originalRecoveryCount: 11, recoveringCount: 7, workshopCount: 4,
      originalRecoveryHours: 5.5, recoveryHours: 3.5, workshopHours: 2,
      workshopPotentialCount: 0, workshopPotentialHours: 0,
      projectedRecoveryHours: 3.5, illustrativeProjectedExposureAed: 105,
      illustrativeOriginalExposureAed: 165, illustrativeRemainingExposureAed: 105,
    });
  });

  it('treats the four-hour slot shift separately from a conditional one-hour standby charge', () => {
    const plan = calculateCostPlan(createSession('04_delivery_coordination'));
    expect(plan.shiftHours).toBe(4);
    expect(plan.actualSlot).toBe(costAssumptions.original_delivery_slot);
    expect(costAssumptions.fictional_reschedule_quote_aed).toBe(200);
    expect(costAssumptions.conditional_truck_standby_aed_per_hour).toBe(250);
    expect(costActions.map(action => action.actorId)).toEqual(['C01', 'P05', 'P01']);
  });
});
