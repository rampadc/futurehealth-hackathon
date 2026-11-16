import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoControl } from './DemoControl';
import { live, type CaseView } from './live';

afterEach(() => vi.restoreAllMocks());

it('does not restore an old presenter case when its request finishes after reset', async () => {
  const oldCase = { case_id: 'old-case', version: 2, clock: '2025-08-04T08:01:00+04:00', tasks: [], capture: null } as unknown as CaseView;
  const newCase = { ...oldCase, case_id: 'new-case', version: 0 };
  let finishOld!: (value: CaseView) => void;
  const oldRequest = new Promise<CaseView>(resolve => { finishOld = resolve; });
  vi.spyOn(live, 'demoState').mockImplementationOnce(() => oldRequest).mockResolvedValue(newCase);
  vi.spyOn(live, 'reset').mockResolvedValue(newCase);
  vi.spyOn(live, 'runs').mockResolvedValue([]);
  vi.spyOn(live, 'agentRuns').mockResolvedValue([]);
  render(<DemoControl caseView={oldCase} onChange={async () => {}} onReturn={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset active case' }));
  await screen.findByText(/Active case new-case/);
  await act(async () => { finishOld(oldCase); await oldRequest; });
  expect(screen.queryByText(/Active case old-case/)).toBeNull();
});
