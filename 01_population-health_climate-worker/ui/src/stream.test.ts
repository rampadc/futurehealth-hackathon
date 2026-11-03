import { describe, expect, it } from 'vitest';
import { createSession, scenarioComplete, scenarioIds, type Session } from './engine';
import { applyHumanAction, driveStream, type StreamActivity } from './stream';

describe('scripted demo stream', () => {
  it('pauses at authority boundaries and never authorizes from timer ticks', () => {
    const initial = createSession(scenarioIds[1]);
    const reading = driveStream(initial);
    expect(reading.status).toBe('advanced');
    expect(reading.activities[0].provenance).toBe('synthetic_feed');
    const pending = driveStream(reading.session);
    expect(pending.status).toBe('awaiting_actor');
    expect(pending.activities[0].provenance).toBe('scripted_assistant');
    expect(pending.pendingEvent?.type).toBe('hold');
    const repeat = driveStream(pending.session);
    expect(repeat.status).toBe('awaiting_actor');
    expect(repeat.activities).toEqual([]);
    expect(repeat.session.cursor).toBe(1);
    expect(repeat.session.state.alerts.heat_case_01).toBeUndefined();
    expect(reading.session.state.task_status.civil_heavy).toBe('held');
    expect(reading.activities[0].detail).toContain('site rule put heavy trench work on hold');
    expect(pending.activities[0].detail).toContain('150 W/m² hold limit');
    const held = applyHumanAction(pending.session, 'P03');
    expect(held.activities[0].title).toBe('Maya sent the trench hold to Huda');
    expect(held.activities[0].detail).toContain('Maya sent the hold to Huda');
    expect(initial.cursor).toBe(0);
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
    expect(blocked.status).toBe('advanced');
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
          expect(action.status).toBe('advanced');
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
        expect(action.status).toBe('advanced');
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
