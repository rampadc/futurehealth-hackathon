import { describe, expect, it } from 'vitest';
import { applyPreset, readingPayload, SCENARIO_PRESETS } from './scenarioPresets';
import type { CaseView } from './live';

const view = { case_id: 'case-1', clock: '2025-08-04T08:30:00+04:00', capture: null } as unknown as CaseView;

describe('presenter reading signal', () => {
  it('sends a valid reading measured at the case clock', () => {
    expect(readingPayload(view, 145, 'valid')).toMatchObject({ quality: 'valid', measured_at: view.clock, received_at: view.clock, sensor_id: 't1', zone_id: 'civil_exposed' });
  });
  it('marks a sensor fault invalid', () => {
    expect(readingPayload(view, 145, 'fault').quality).toBe('invalid');
  });
  it('backdates a stale reading by ten minutes, still received now', () => {
    expect(readingPayload(view, 180, 'stale')).toMatchObject({ quality: 'valid', measured_at: '2025-08-04T08:20:00+04:00', received_at: view.clock });
  });
});

describe('scenario presets', () => {
  const run = async (id: string) => {
    const calls: Array<[string, unknown]> = [];
    let clock = '2025-08-04T08:00:00+04:00';
    const at = () => ({ ...view, clock }) as CaseView;
    await applyPreset(SCENARIO_PRESETS.find(p => p.id === id)!, {
      reset: async () => { calls.push(['reset', null]); clock = '2025-08-04T08:00:00+04:00'; return at(); },
      signal: async (caseId: string, payload: Record<string, unknown>) => { calls.push(['signal', { caseId, payload }]); return at(); },
    });
    return calls;
  };

  it('covers the heat alert and the three countercases', () => {
    expect(SCENARIO_PRESETS.map(p => p.id)).toEqual(['02', '06', '08', '09']);
  });
  it('02 only resets: the seeded 08:00 reading is the heat alert', async () => {
    expect(await run('02')).toEqual([['reset', null]]);
  });
  it('06 injects a sensor fault at the current time', async () => {
    const calls = await run('06');
    expect(calls.map(c => c[0])).toEqual(['reset', 'signal']);
    expect(calls[1][1]).toMatchObject({ caseId: 'case-1', payload: { quality: 'invalid', received_at: '2025-08-04T08:00:00+04:00' } });
  });
  it('09 injects an improved reading measured ten minutes before 08:10', async () => {
    const calls = await run('09');
    expect(calls[1][1]).toMatchObject({ caseId: 'case-1', payload: { twl: 175, quality: 'valid', measured_at: '2025-08-04T07:50:00+04:00', received_at: '2025-08-04T08:00:00+04:00' } });
  });
});
