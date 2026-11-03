import { expect, test } from 'vitest';
import { assessThermalReading, thermalStatus } from './thermal';
test('guideline colour boundaries and unknown inputs stay distinct from site hold', () => {
 expect(thermalStatus(114).band).toBe('red');
 expect(thermalStatus(115).band).toBe('amber');
 expect(thermalStatus(139.9).band).toBe('amber');
 expect(thermalStatus(140).band).toBe('green');
 expect(thermalStatus(145).band).toBe('green');
 expect(thermalStatus(190, false).band).toBe('unknown');
 expect(thermalStatus(undefined).band).toBe('unknown');
});

const clock = '2025-08-04T08:05:00+04:00';
const reading = (twl: number, at: string) => ({ twl, at });
test('freshness includes exactly five minutes and rejects future timestamps', () => {
 expect(assessThermalReading(reading(145, '2025-08-04T08:00:00+04:00'), clock, 'serviceable')).toMatchObject({ reason: 'current', band: 'green', ageMs: 300000 });
 expect(assessThermalReading(reading(145, '2025-08-04T07:59:59+04:00'), clock, 'serviceable')).toMatchObject({ reason: 'stale', band: 'unknown', lastValue: 145, historical: true });
 expect(assessThermalReading(reading(145, '2025-08-04T08:05:01+04:00'), clock, 'serviceable')).toMatchObject({ reason: 'future', band: 'unknown', lastValue: 145 });
});
test('failed and missing readings have distinct reasons and no live band', () => {
 expect(assessThermalReading(reading(190, '2025-08-04T08:04:00+04:00'), clock, 'failed')).toMatchObject({ reason: 'failed', band: 'unknown', lastValue: 190 });
 expect(assessThermalReading(null, clock, 'serviceable')).toMatchObject({ reason: 'missing', band: 'unknown', lastValue: null });
 expect(assessThermalReading(reading(190, 'bad'), clock, 'serviceable')).toMatchObject({ reason: 'invalid', band: 'unknown', lastValue: 190 });
});
