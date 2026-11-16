import { expect, it } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ApprovalCountdown, liveInstant } from './LiveClock';
import type { CaseView } from './live';

it('interpolates scenario time from the case clock even when wall time is another year', () => {
  const view = { clock: '2025-08-04T08:04:00+04:00', time: { mode: 'elapsed', status: 'running', server_now: '2026-11-16T00:00:00Z', started_at: '2026-11-16T00:00:00Z', ends_at: '2025-08-04T10:30:00+04:00' } } as CaseView;
  const receivedAt = Date.parse('2026-11-16T00:00:00Z');
  expect(new Date(liveInstant(view, receivedAt, receivedAt + 5_000)).toISOString()).toBe('2025-08-04T04:04:05.000Z');
});

it('shows the responsible reviewer the remaining scenario-time approval window', () => {
  const view = { clock: '2025-08-04T08:04:00+04:00', time: { mode: 'elapsed', status: 'running', server_now: '2026-11-16T00:00:00Z', started_at: '2026-11-16T00:00:00Z', ends_at: '2025-08-04T10:30:00+04:00' } } as CaseView;
  render(createElement(ApprovalCountdown, { view, deadline: '2025-08-04T08:04:30+04:00' }));
  expect(screen.getByRole('timer').textContent).toBe('0:30 left to review');
});
