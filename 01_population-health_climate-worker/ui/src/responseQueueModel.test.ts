import { describe, expect, it } from 'vitest';
import { createSession } from './engine';
import { fixtures } from './fixtures';
import { buildResponseQueue } from './responseQueueModel';

describe('response queue', () => {
  it('lists only the current incident and only unrecorded actions', () => {
    const session = createSession('02_heat_alert_response');
    expect(buildResponseQueue(session)).toEqual([]);
    session.state.task_status.civil_heavy = 'held';
    session.state.alerts.heat_case_01 = { task_id: 'civil_heavy', status: 'open', acknowledged: false, at: '2025-08-04T11:00:00+04:00' };
    session.state.clock = '2025-08-04T11:03:00+04:00';
    const before = buildResponseQueue(session);
    expect(before.filter(action => action.id === 'hold-ack')).toHaveLength(1);
    expect(before.find(action => action.id === 'hold-ack')).toMatchObject({ actorId: 'C01', overdue: true });
    session.pendingEvent = fixtures['02_heat_alert_response'].events.find(event => event.type === 'ack')!;
    const pending = buildResponseQueue(session);
    expect(pending.filter(action => action.title === 'Acknowledge trench hold')).toHaveLength(1);
    session.pendingEvent = null;
    session.state.alerts.heat_case_01.acknowledged = true;
    session.state.alerts.heat_case_01.status = 'stopped';
    session.crewBriefing = { actorId: 'C01', at: session.state.clock, text: 'Recorded' };
    session.commercialChecks = [{ id: 'recovery_roster', actorId: 'C01', at: session.state.clock, snapshot: {} }];
    expect(buildResponseQueue(session).some(action => ['hold-ack', 'crew-stop', 'crew-briefing', 'cost:recovery_roster'].includes(action.id))).toBe(false);
  });

  it('keeps an escalated hold with Rashid and never invents a due time', () => {
    const session = createSession('07_unacknowledged_alert');
    session.state.alerts.alert = { task_id: 'civil_heavy', status: 'escalated', acknowledged: false, at: '2025-08-04T08:01:00+04:00' };
    session.state.clock = '2025-08-04T08:04:00+04:00';
    const action = buildResponseQueue(session).find(item => item.id === 'hold-verify');
    expect(action).toMatchObject({ actorId: 'P02', ready: false });
    expect(action?.dueAt).toBeUndefined();
    expect(action?.overdue).toBeUndefined();
  });
});
