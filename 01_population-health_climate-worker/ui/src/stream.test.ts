import { describe, expect, it } from 'vitest';
import { act, createSession, getConnectedNext, prepareNextHumanAction, scenarioComplete, scenarioIds, type Session } from './engine';
import { applyHumanAction, driveStream, type StreamActivity } from './stream';
import { buildResponseQueue } from './responseQueueModel';

describe('scripted demo stream', () => {
  it('pauses at authority boundaries and never authorizes from timer ticks', () => {
    const initial = createSession(scenarioIds[1]);
    const reading = driveStream(initial);
    expect(reading.status).toBe('awaiting_actor');
    expect(reading.activities[0].provenance).toBe('synthetic_feed');
    expect(reading.activities[1].provenance).toBe('scripted_assistant');
    const pending = driveStream(reading.session);
    expect(pending.status).toBe('awaiting_actor');
    expect(pending.activities).toEqual([]);
    expect(pending.pendingEvent?.type).toBe('hold');
    const repeat = driveStream(pending.session);
    expect(repeat.status).toBe('awaiting_actor');
    expect(repeat.activities).toEqual([]);
    expect(repeat.session.cursor).toBe(1);
    expect(repeat.session.state.alerts.heat_case_01).toBeUndefined();
    expect(reading.session.state.task_status.civil_heavy).toBe('held');
    expect(reading.activities[0].detail).toContain('site rule put heavy trench work on hold');
    expect(reading.activities[1].detail).toContain('150 W/m² hold limit');
    const held = applyHumanAction(pending.session, 'P03');
    expect(held.activities[0].title).toBe('Maya sent the trench hold to Huda');
    expect(held.activities[0].detail).toContain('Maya sent the hold to Huda');
    expect(held.status).toBe('awaiting_actor');
    expect(held.pendingEvent?.type).toBe('ack');
    expect(held.activities[1].kind).toBe('preparation');
    expect(held.session.state.clock).toBe('2025-08-04T08:01:00+04:00');
    expect(buildResponseQueue(held.session).find(item => item.id === `event:${held.pendingEvent?.event_id}`)).toMatchObject({ actorId: 'C01', ready: true, plannedAt: '2025-08-04T08:02:00+04:00' });
    expect(initial.cursor).toBe(0);
  });

  it('restores a persisted hold with the next action ready and keeps the wrong actor blocked', () => {
    const legacy = driveStream(createSession('02_heat_alert_response')).session;
    expect(act(legacy, 'P03').status).toBe('applied');
    expect(legacy.pendingEvent).toBeNull();
    expect(legacy.state.clock).toBe('2025-08-04T08:01:00+04:00');
    const cursor = legacy.cursor;
    expect(prepareNextHumanAction(legacy)?.type).toBe('ack');
    expect(legacy.cursor).toBe(cursor);
    expect(buildResponseQueue(legacy).find(item => item.id === `event:${legacy.pendingEvent?.event_id}`)).toMatchObject({ actorId: 'C01', ready: true });
    const denied = applyHumanAction(legacy, 'P03');
    expect(denied.status).toBe('denied');
    expect(denied.session.cursor).toBe(cursor);
    expect(denied.pendingEvent?.type).toBe('ack');
    expect(denied.session.state.alerts.heat_case_01.acknowledged).toBe(false);
  });

  it('leaves the next external signal for a separate feed tick', () => {
    const signal = driveStream(createSession('07_unacknowledged_alert'));
    expect(signal.pendingEvent?.type).toBe('hold');
    const held = applyHumanAction(signal.session, 'P03');
    expect(held.status).toBe('advanced');
    expect(held.pendingEvent).toBeNull();
    expect(held.session.cursor).toBe(2);
    expect(held.session.state.clock).toBe('2025-08-04T08:01:00+04:00');
    expect(held.session.history.at(-1)?.event.type).toBe('hold');
    expect(prepareNextHumanAction(held.session)).toBeNull();
    expect(held.session.cursor).toBe(2);
    const clock = driveStream(held.session);
    expect(clock.result?.event?.type).toBe('clock');
    expect(clock.session.state.clock).toBe('2025-08-04T08:04:00+04:00');
    expect(clock.pendingEvent?.type).toBe('escalate');
  });

  it('prepares each consecutive human decision while the feed is paused, without confirming it', () => {
    let session = driveStream(createSession('02_heat_alert_response')).session;
    const expected = [
      { actor: 'P03', event: 'hold', next: 'ack', clock: '2025-08-04T08:01:00+04:00' },
      { actor: 'C01', event: 'ack', next: 'stop', clock: '2025-08-04T08:02:00+04:00' },
      { actor: 'C01', event: 'stop', next: 'recover', clock: '2025-08-04T08:03:00+04:00' },
    ];
    for (const { actor, event, next, clock } of expected) {
      expect(session.pendingEvent?.type).toBe(event);
      const cursor = session.cursor;
      const action = applyHumanAction(session, actor);
      expect(action.status).toBe('awaiting_actor');
      expect(action.session.cursor).toBe(cursor + 1);
      expect(action.pendingEvent?.type).toBe(next);
      expect(action.session.state.clock).toBe(clock);
      expect(action.session.history.at(-1)?.event.type).toBe(event);
      expect(action.session.history.some(entry => entry.event.type === next)).toBe(false);
      expect(action.activities.map(item => item.kind)).toEqual(['decision', 'preparation']);
      session = action.session;
    }
    const recovered = applyHumanAction(session, 'C01');
    expect(recovered.status).toBe('advanced');
    expect(recovered.pendingEvent).toBeNull();
    expect(recovered.session.state.clock).toBe('2025-08-04T08:04:00+04:00');
    expect(scenarioComplete(recovered.session)).toBe(true);
    expect(recovered.session.scenarioId).toBe('02_heat_alert_response');
    expect(getConnectedNext(recovered.session)).toBe('03_constrained_reassignment');
  });

  it('keeps unauthorized actions pending and exposes expected policy blocks', () => {
    let session = createSession(scenarioIds[4]);
    const staged = driveStream(session);
    expect(staged.status).toBe('awaiting_actor');
    const denied = applyHumanAction(staged.session, 'P02');
    expect(denied.status).toBe('denied');
    expect(denied.session.cursor).toBe(0);
    expect(denied.pendingEvent?.type).toBe('assign_attempt');
    expect(denied.activities[0].provenance).toBe('policy_engine');
    const blocked = applyHumanAction(denied.session, 'C01');
    expect(blocked.status).toBe('awaiting_actor');
    expect(blocked.result?.status).toBe('rejected');
    expect(blocked.activities[0].kind).toBe('blocked');
    expect(blocked.session.rejections).toEqual(['acclimatisation']);
    session = blocked.session;
    expect(session.state.assignments.civil_heavy).not.toContain('C13');
  });

  it('completes each standalone script only after explicit human actions', () => {
    for (const id of scenarioIds) {
      let session = createSession(id);
      let ticks = 0;
      while (ticks++ < 30) {
        const update = driveStream(session);
        session = update.session;
        if (update.status === 'complete' || update.status === 'transitioned') break;
        if (update.status === 'awaiting_actor') {
          const action = applyHumanAction(session, update.pendingEvent!.actor_id!);
          expect(['advanced', 'awaiting_actor']).toContain(action.status);
          session = action.session;
        } else expect(update.status).toBe('advanced');
      }
      expect(ticks).toBeLessThan(30);
      if (id !== scenarioIds[1] && id !== scenarioIds[2] && id !== scenarioIds[3]) expect(scenarioComplete(session)).toBe(true);
    }
  });

  it('streams the connected case with cumulative human and policy evidence', () => {
    let session: Session = createSession(scenarioIds[1]);
    const briefing = { actorId: 'C01', at: '2025-08-04T08:04:00+04:00', text: 'Approved ordinary-shift recovery term; payment remains unverified.' };
    const activities: StreamActivity[] = [];
    const scenes: string[] = [];
    for (let ticks = 0; ticks < 40; ticks++) {
      const update = driveStream(session);
      session = update.session;
      activities.push(...update.activities);
      if (update.status === 'transitioned') scenes.push(session.scenarioId);
      if (update.status === 'complete') break;
      if (update.status === 'awaiting_actor') {
        const action = applyHumanAction(session, update.pendingEvent!.actor_id!);
        expect(['advanced', 'awaiting_actor']).toContain(action.status);
        session = action.session;
        if (action.result?.event?.type === 'recover') { session.crewBriefing = briefing; session.commercialChecks = [{id:'recovery_roster',actorId:'C01',at:session.state.clock,snapshot:{recoveryWorkers:11}}]; }
        activities.push(...action.activities);
      } else expect(update.status).not.toBe('denied');
    }
    expect(scenes).toEqual([scenarioIds[2], scenarioIds[3], scenarioIds[9]]);
    expect(scenarioComplete(session)).toBe(true);
    expect(session.state.delivery.slot).toBe('2025-08-04T15:30:00+04:00');
    expect(session.state.task_status.civil_heavy).toBe('held');
    expect(session.history).toHaveLength(12);
    expect(session.crewBriefing).toEqual(briefing);
    expect(session.commercialChecks?.[0].snapshot).toEqual({recoveryWorkers:11});
    expect(new Set(session.history.map(item => item.event.event_id)).size).toBe(12);
    expect(session.history[0].event.scenario_id).toBe(scenarioIds[1]);
    expect(session.history.at(-1)?.event.scenario_id).toBe(scenarioIds[9]);
    expect(activities.some(item => item.title === 'Noura: approve delivery request')).toBe(true);
    expect(activities.some(item => item.title === 'Supplier accepted the new delivery time')).toBe(true);
    expect(activities.some(item => item.kind === 'blocked')).toBe(true);
    expect(activities.some(item => item.kind === 'blocked' && item.title === 'Crew move blocked')).toBe(true);
    expect(activities.some(item => item.title === 'Rashid: hand over trench hold')).toBe(true);
  });
});
