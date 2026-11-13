import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { classifyThermalWorkLimit, ThermalWorkLimit, type ThermalWorkLimitReading } from './ThermalWorkLimit';

const decisionAt = '2025-08-04T08:05:00+04:00';
const reading = (twl: number, measured_at = decisionAt, quality = 'valid'): ThermalWorkLimitReading => ({
  twl, measured_at, quality, zone_id: 'civil_exposed',
});

describe('Thermal Work Limit traffic light', () => {
  it.each([
    [114.9, 'red', 'High risk'],
    [115, 'amber', 'Caution'],
    [139.9, 'amber', 'Caution'],
    [140, 'green', 'Low environmental risk'],
    [145, 'green', 'Low environmental risk'],
  ] as const)('classifies %s as %s', (twl, band, label) => {
    expect(classifyThermalWorkLimit(reading(twl), decisionAt)).toMatchObject({ band, label, reason: 'current' });
  });

  it('shows a green environmental band and the separate work restriction reminder', () => {
    render(<ThermalWorkLimit reading={reading(145)} decisionAt={decisionAt} />);
    expect(screen.getByRole('heading', { name: 'Thermal Work Limit' })).toBeTruthy();
    expect(screen.getByText('145')).toBeTruthy();
    expect(screen.getByText('Low environmental risk', { selector: '.MuiChip-label' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Environmental TWL traffic light' })).toBeNull();
    expect(screen.getByText('Environmental heat band only. Check task-specific work restrictions.')).toBeTruthy();

  });

  it('treats five minutes as current, but retains a later stale value only as history', () => {
    expect(classifyThermalWorkLimit(reading(145, '2025-08-04T08:00:00+04:00'), decisionAt).band).toBe('green');
    const old = reading(145, '2025-08-04T07:59:59+04:00');
    expect(classifyThermalWorkLimit(old, decisionAt)).toMatchObject({ band: 'unknown', reason: 'stale', lastValue: 145 });
    render(<ThermalWorkLimit reading={old} decisionAt={decisionAt} />);
    expect(screen.getByText('145')).toBeTruthy();
    expect(screen.getByText('Unknown', { selector: '.MuiChip-label' })).toBeTruthy();
    expect(screen.getByText('Reading out of date')).toBeTruthy();
    expect(screen.getByText('Last recorded value · historical')).toBeTruthy();
  });

  it.each([
    ['missing', undefined, 'missing'],
    ['bad quality', reading(145, decisionAt, 'invalid'), 'invalid'],
    ['nonfinite', reading(Number.NaN), 'invalid'],
    ['future', reading(145, '2025-08-04T08:05:01+04:00'), 'future'],
  ] as const)('keeps %s readings neutral', (_name, value, reason) => {
    expect(classifyThermalWorkLimit(value, decisionAt)).toMatchObject({ band: 'unknown', label: 'Unknown', reason });
    render(<ThermalWorkLimit reading={value} decisionAt={decisionAt} />);
    expect(screen.getByText('Unknown', { selector: '.MuiChip-label' })).toBeTruthy();
  });
});
