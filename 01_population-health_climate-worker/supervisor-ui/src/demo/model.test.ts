import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { clockLabel, homeDevice, isoAt, layoutIn, MAP_ZONES, minuteOf, openPersona, peopleOnSite } from './model';
import { live, type CaseView, type SiteSensors } from '../live';
import { sensorsNow, squadsFor, useSiteSensors } from '../screens/squads';

afterEach(() => { vi.restoreAllMocks(); });

describe('case time', () => {
  it('converts case minutes to GST timestamps inside the window', () => {
    expect(isoAt(0)).toBe('2025-08-04T08:00:00+04:00');
    expect(isoAt(75)).toBe('2025-08-04T09:15:00+04:00');
    expect(isoAt(500)).toBe('2025-08-04T10:29:00+04:00');
    expect(minuteOf('2025-08-04T09:30:00+04:00')).toBe(90);
    expect(clockLabel(149)).toBe('10:29');
  });
});

describe('personas', () => {
  it('opens each persona on their own device, signed in by link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect([homeDevice('C01'), homeDevice('C05'), homeDevice('P03')]).toEqual(['site', 'worker', 'web']);
    openPersona('C05');
    expect(open).toHaveBeenCalledWith('/worker?persona=C05', 'heat-C05-worker', expect.stringContaining('width=430'));
  });
});

describe('site map', () => {
  const view = { request: { snapshot: { workers: [
    { person_id: 'C05', location_id: 'shelter_a' }, { person_id: 'C06', location_id: 'shelter_a' }, { person_id: 'C07', location_id: 'civil_exposed' },
  ] } } } as unknown as CaseView;
  it('places the civil crew from the case and the foreman with most of the crew', () => {
    const people = peopleOnSite(view);
    expect(people.find(p => p.id === 'C05')).toMatchObject({ zone: 'shelter_a', caseWorker: true, persona: true });
    expect(people.find(p => p.id === 'C01')?.zone).toBe('shelter_a');
    expect(people.filter(p => p.squad === 'steel').every(p => p.zone === 'yard')).toBe(true);
  });
  it('keeps dots inside their zone', () => {
    const zone = MAP_ZONES.find(z => z.id === 'shelter_a')!;
    for (let i = 0; i < 20; i++) {
      const [x, y] = layoutIn(zone, i);
      expect(x).toBeLessThan(zone.x + zone.w); expect(y).toBeGreaterThan(zone.y);
    }
  });
});

describe('site sensors on squad screens', () => {
  const sensors: SiteSensors = { hour: 9, hours: [8, 9, 10], live_sensor_edited: false,
    sensors: { t1: 'live', t2: 'offline', t3: 'live', m1: 'stale' },
    squads: { civil: { t1: 145 }, form: { t2: 150 }, steel: { t3: 108 }, mep: { m1: 166 } } };
  it('uses the configured TWL and raises a band when the sensor reading is lost', async () => {
    vi.spyOn(live, 'siteSensors').mockResolvedValue(sensors);
    const { unmount } = renderHook(() => useSiteSensors(true, 1));
    await waitFor(() => expect(squadsFor(null).find(q => q.id === 'steel')?.twl).toBe(108));
    const squads = Object.fromEntries(squadsFor(null).map(q => [q.id, q]));
    expect(squads.steel).toMatchObject({ band: 'red', estimated: false, alerts: 0 });
    expect(squads.form).toMatchObject({ twl: 150, band: 'amber', estimated: true, alerts: 1 });
    expect(squads.mep).toMatchObject({ band: 'amber', estimated: true });
    expect(sensorsNow().find(s => s.id === 'bs2')?.off).toBe(false);
    expect(sensorsNow().find(s => s.id === 't2')?.off).toBe(true);
    await act(async () => { unmount(); });
  });
});
