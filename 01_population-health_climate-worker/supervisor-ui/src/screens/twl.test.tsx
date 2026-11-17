import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TWL_POLICY, twlTone, TwlChart, TwlGauge, TwlReadout } from './twl';

const hourly = [{ hour: '08:00', twl: 145 }, { hour: '09:00', twl: 155 }];

describe('TWL graphics', () => {
  it('keeps the 145 environmental band green while marking the site hold at 150', () => {
    expect(twlTone(145)).toBe('green');
    expect(TWL_POLICY).toBe(150);
    render(<TwlChart hourly={hourly} now="08:30" kindLabel="Site" />);
    expect(screen.getByText('Site Heavy-work limit: TWL ≤150 W/m²')).toBeTruthy();
    expect(screen.getByText('Environmental band does not clear site holds.')).toBeTruthy();
    const row = screen.getByRole('row', { name: /08:00/ });
    expect(within(row).getByText('Low environmental risk')).toBeTruthy();
    expect(within(row).getByText('Heavy-work limit: TWL ≤150 W/m²')).toBeTruthy();
  });

  it('fills the bar to the reading in its band colour, with the hold line and scale ends', () => {
    const { container } = render(<TwlReadout twl={130} band="amber" size={56} large />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('112');
    const fill = svg.querySelectorAll('rect')[1];
    expect(fill.getAttribute('fill')).toBe('var(--color-signal-yellow)');
    expect(Number(fill.getAttribute('width'))).toBeCloseTo(200 * (130 - 90) / 80);
    expect(Number(svg.querySelector('line')!.getAttribute('x1'))).toBeCloseTo(200 * (150 - 90) / 80);
    expect(container.querySelector('.hs-gauge-scale')!.textContent).toBe('90170');
    expect(container.querySelector('.hs-twl-num')!.textContent).toBe('130');
  });

  it('keeps a faulty 218 sensor value as unknown in its dot, table, and gauge', () => {
    render(<>
      <TwlChart hourly={hourly} now="08:30" kindLabel="Site" readings={[{ at: '08:15', twl: 218, sensor: 'S1', quality: 'invalid' }]} />
      <TwlReadout twl={218} band="unknown" />
      <TwlGauge twl={218} valid={false} />
    </>);
    const row = screen.getByRole('row', { name: /08:15/ });
    expect(within(row).getByText('Unknown')).toBeTruthy();
    expect(within(row).getByText('invalid')).toBeTruthy();
    expect(within(row).getByText('Sensor S1 · quality invalid')).toBeTruthy();
    expect(screen.getByText('08:15 · S1 · TWL 218 W/m² · Unknown · quality: invalid')).toBeTruthy();
    expect(screen.getByText('TWL 218 W/m² · Unknown')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /TWL 218 W\/m², Unknown \(faulty reading\)/ })).toHaveLength(2);
  });
});
