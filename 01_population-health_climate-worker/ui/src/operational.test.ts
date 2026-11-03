import { describe, expect, it } from 'vitest';
import { act, createSession, stepSession, type Session } from './engine';
import { scenarioIds } from './fixtures';
import { describeOperation } from './operational';

function run(session: Session, steps = Infinity) {
  for (let count = 0; count < steps; count++) {
    const result = stepSession(session);
    if (result.status === 'complete') break;
    if (result.status === 'awaiting_actor') act(session, result.event!.actor_id!);
  }
  return session;
}

describe('operational explanation', () => {
  it('covers all ten fixtures with contextual actions and existing policy references', () => {
    for (const id of scenarioIds) {
      const operation = describeOperation(run(createSession(id)));
      expect(operation.headline.length).toBeGreaterThan(5);
      expect(operation.nextAction.length).toBeGreaterThan(20);
      expect(operation.owner.length).toBeGreaterThan(3);
      expect(operation.options.length).toBeGreaterThan(0);
      expect(operation.policyIds.length).toBeGreaterThan(0);
      expect(operation.communication.reviewStatus).toContain('needs a fluent reviewer and employer approval');
    }
  });

  it('distinguishes hold, recorded stop, and recovery', () => {
    const session = createSession('02_heat_alert_response');
    expect(describeOperation(session).communication.english).toContain('is active');
    run(session, 2);
    expect(describeOperation(session).summary).toContain('has not confirmed the stop');
    run(session, 2);
    expect(describeOperation(session).summary).toContain('Cooled recovery is not recorded');
    run(session);
    expect(describeOperation(session).summary).toContain('confirmed the stop and cooled recovery');
    const continued = createSession('03_constrained_reassignment', session.state);
    expect(describeOperation(continued).summary).toContain('confirmed the stop and cooled recovery');
  });

  it('only offers the four-person workshop move when space and readiness allow', () => {
    const session = run(createSession('02_heat_alert_response'));
    expect(describeOperation(session).options[0]).toMatchObject({ available: true });
    expect(describeOperation(session).options[0].detail).toContain('4 of 6 places free');
    session.state.occupancy.workshop.push('P09');
    expect(describeOperation(session).options[0]).toMatchObject({ available: false, reason: 'The workshop does not have four free places.' });
    session.state.occupancy.workshop.pop();
    session.state.assignments.workshop_prep = ['C05', 'C06', 'C07', 'C08'];
    session.state.task_status.workshop_prep = 'active';
    expect(describeOperation(session).options[0]).toMatchObject({ available: false, reason: 'The four workers are already assigned to workshop preparation.' });
  });

  it('keeps proposal, sending, and supplier acceptance separate from the confirmed slot', () => {
    const session = createSession('04_delivery_coordination');
    run(session, 1);
    expect(describeOperation(session).summary).toContain('11:30 remains booked');
    expect(session.state.delivery.slot).toContain('11:30');
    run(session, 2);
    expect(describeOperation(session).summary).toContain('15:30 request is sent');
    expect(describeOperation(session).options[1].available).toBe(false);
    run(session);
    expect(describeOperation(session).summary).toContain('Supplier accepted 15:30');
    expect(session.state.delivery.slot).toContain('15:30');
    expect(describeOperation(session).options[1].available).toBe(true);
    expect(describeOperation(session).communication.english).toContain('supplier accepted aggregate delivery at 15:30');
  });

  it('does not turn symptoms or stale readings into clearance', () => {
    const symptoms = run(createSession('08_symptom_escalation'));
    expect(describeOperation(symptoms).summary).toContain('heat reading cannot establish fitness');
    expect(describeOperation(symptoms).options[1].available).toBe(false);
    const sensor = run(createSession('06_sensor_failure'));
    expect(describeOperation(sensor).options[1]).toMatchObject({ available: false });
    const handover = run(createSession('10_handover_and_evidence'));
    expect(describeOperation(handover).summary).toContain('2 checks remain open');
    expect(describeOperation(handover).options[1].available).toBe(false);
  });

  it('only reports forecast, failed sensor, missing acknowledgement and symptoms after they occur', () => {
    const forecast = createSession('01_pre_shift_planning');
    expect(describeOperation(forecast).summary).toContain('Check the forecast');
    run(forecast, 1);
    expect(describeOperation(forecast).summary).toContain('43°C from 11:00–16:00');

    const sensor = createSession('06_sensor_failure');
    expect(describeOperation(sensor).headline).toBe('Check the trench heat sensor');
    run(sensor, 1);
    expect(describeOperation(sensor).headline).toBe('Trench heat sensor has failed');
    expect(describeOperation(sensor).options[1].detail).not.toContain('195 W/m²');
    run(sensor, 1);
    expect(describeOperation(sensor).options[1].detail).toContain('195 W/m²');

    const alert = createSession('07_unacknowledged_alert');
    expect(describeOperation(alert).headline).toBe('Check the trench heat reading');
    run(alert, 2);
    expect(describeOperation(alert).headline).toBe('Huda has not acknowledged the trench hold');
    run(alert, 1);
    expect(describeOperation(alert).headline).toBe('Contact Huda: hold unanswered for 3 minutes');
    expect(describeOperation(alert).summary).toContain('Rashid must check the crew now');

    const symptoms = createSession('08_symptom_escalation');
    expect(describeOperation(symptoms).summary).not.toContain('Bilal Al Safa reported');
    run(symptoms, 2);
    expect(describeOperation(symptoms).headline).toContain('Bilal reported dizziness');
    run(symptoms, 1);
    expect(describeOperation(symptoms).headline).toContain('pending return review');
    expect(describeOperation(symptoms).summary).toContain('Salim’s follow-up is recorded');
    expect(describeOperation(symptoms).options[0].title).toContain('Review Bilal’s return');
  });
});
