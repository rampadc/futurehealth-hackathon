import { describe, expect, it } from 'vitest';
import { act, advanceClock, createSession, fixtures, getConnectedNext, scenarioComplete, scenarioIds, stepSession, type Session } from './engine';

function finish(session: Session) {
  while (true) {
    const result = stepSession(session);
    if (result.status === 'complete') break;
    if (result.status === 'awaiting_actor') {
      const applied = act(session, result.event!.actor_id!);
      expect(['applied', 'rejected']).toContain(applied.status);
    } else expect(['applied', 'rejected']).toContain(result.status);
  }
  expect(scenarioComplete(session)).toBe(true);
  return session;
}

describe('fixture replay', () => {
  it('completes every standalone scenario with its expected assertions and rejections', () => {
    expect(scenarioIds).toHaveLength(10);
    for (const id of scenarioIds) {
      const session = finish(createSession(id));
      expect(session.observed).toEqual(expect.arrayContaining(fixtures[id].expected.semantic_assertions));
      expect(session.rejections).toEqual(fixtures[id].expected.expected_rejections);
    }
  });

  it('carries operational state through the connected case', () => {
    let session = finish(createSession(scenarioIds[1]));
    for (const next of [scenarioIds[2], scenarioIds[3], scenarioIds[9]]) {
      expect(getConnectedNext(session)).toBe(next);
      session = finish(createSession(next, session.state));
    }
    expect(session.state.case_id).toBe('sandline_case_01');
    expect(session.state.task_status.civil_heavy).toBe('held');
    expect(session.state.assignments.workshop_prep).toEqual(['C05', 'C06', 'C07', 'C08']);
    expect(session.state.delivery.slot).toBe('2025-08-04T15:30:00+04:00');
    expect(session.state.open_items.length).toBeGreaterThan(0);
  });

  it('requires the fixture human actor and leaves state untouched on unauthorized action', () => {
    const session = createSession(scenarioIds[1]);
    expect(stepSession(session).status).toBe('applied');
    expect(stepSession(session).status).toBe('awaiting_actor');
    const before = structuredClone(session.state);
    expect(act(session, 'P02')).toMatchObject({ status: 'denied', reason: 'unauthorized_actor' });
    expect(session.state).toEqual(before);
    expect(session.cursor).toBe(1);
    expect(act(session, 'P03').status).toBe('applied');
  });


  it('rejects malformed symptom content before changing the worker roster', () => {
    const id = scenarioIds[7];
    const event = fixtures[id].events[1];
    const original = structuredClone(event.payload);
    try {
      const session = createSession(id);
      expect(stepSession(session).status).toBe('applied');
      event.payload.observation = { text: 'dizziness' };
      expect(stepSession(session).status).toBe('awaiting_actor');
      expect(act(session, 'C01')).toMatchObject({ status: 'denied', reason: 'invalid_payload_observation' });
      expect(session.state.assignments.civil_heavy).toContain('C08');
    } finally { event.payload = original; }
  });

  it('rechecks sensor health, age, and midday at the restart transition', () => {
    const id = scenarioIds[8];
    const restartEvent = fixtures[id].events[3];
    const originalAt = restartEvent.occurred_at, originalReceived = restartEvent.received_at;
    const ready = () => {
      const session = createSession(id);
      expect(stepSession(session).status).toBe('applied');
      stepSession(session); act(session, 'C01');
      stepSession(session); act(session, 'P02');
      return session;
    };
    try {
      const failed = ready();
      failed.state.sensor_status.t1 = 'failed';
      stepSession(failed);
      expect(act(failed, 'P02')).toMatchObject({ status: 'denied', reason: 'failed_or_stale' });
      expect(failed.state.task_status.civil_heavy).toBe('held');

      const stale = ready();
      restartEvent.occurred_at = restartEvent.received_at = '2025-08-04T08:10:00+04:00';
      stepSession(stale);
      expect(act(stale, 'P02')).toMatchObject({ status: 'denied', reason: 'failed_or_stale' });
      expect(stale.state.task_status.civil_heavy).toBe('held');

      const midday = ready();
      midday.state.readings.civil_exposed.at = '2025-08-04T12:59:00+04:00';
      midday.review = { taskId: 'civil_heavy', at: '2025-08-04T12:59:00+04:00' };
      restartEvent.occurred_at = restartEvent.received_at = '2025-08-04T13:00:00+04:00';
      stepSession(midday);
      expect(act(midday, 'P02')).toMatchObject({ status: 'denied', reason: 'midday_prohibition' });
      expect(midday.state.task_status.civil_heavy).toBe('held');
    } finally { restartEvent.occurred_at = originalAt; restartEvent.received_at = originalReceived; }
  });

  it('uses a deterministic local clock and blocks a late restart', () => {
    const session = createSession(scenarioIds[8]);
    expect(stepSession(session).status).toBe('applied');
    expect(stepSession(session).status).toBe('awaiting_actor');
    expect(act(session, 'C01').status).toBe('rejected');
    expect(stepSession(session).status).toBe('awaiting_actor');
    expect(act(session, 'P02').status).toBe('applied');
    advanceClock(session, 10);
    expect(session.state.clock).toBe('2025-08-04T08:12:00+04:00');
    expect(stepSession(session).status).toBe('awaiting_actor');
    expect(act(session, 'P02')).toMatchObject({ status: 'denied', reason: 'event_time_order' });
    expect(session.state.task_status.civil_heavy).toBe('held');
  });
});
