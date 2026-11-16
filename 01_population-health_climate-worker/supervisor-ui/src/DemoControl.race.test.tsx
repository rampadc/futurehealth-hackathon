import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoControl } from './DemoControl';
import { live, type CaseView } from './live';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

it('refreshes presenter evidence on focus without losing a selected historic run or reading input', async () => {
  const caseZero = { case_id: 'case-1', version: 0, clock: '2025-08-04T08:00:00+04:00', tasks: [], capture: null } as unknown as CaseView;
  let current = caseZero;
  let runs = [{ id: 'run-2', version: 2, status: 'completed' }, { id: 'run-1', version: 1, status: 'completed' }];
  vi.spyOn(live, 'demoState').mockImplementation(async () => current);
  vi.spyOn(live, 'runs').mockImplementation(async () => runs);
  vi.spyOn(live, 'agentRuns').mockResolvedValue([]);
  render(<DemoControl caseView={caseZero} onChange={async () => {}} onReturn={() => {}} />);
  await screen.findByText(/Workflow and solver runs · 2/);
  await userEvent.click(screen.getByRole('combobox', { name: 'Workflow run' }));
  await userEvent.click(screen.getByRole('option', { name: /Version 1 · completed/ }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Thermal Work Limit (W/m²)' }), { target: { value: '165' } });
  current = { ...caseZero, version: 8 };
  runs = [{ id: 'run-8', version: 8, status: 'completed' }, ...runs];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(await screen.findByText(/Active case case-1 · version 8/)).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Workflow run' }).textContent).toMatch(/Version 1/);
  expect((screen.getByRole('spinbutton', { name: 'Thermal Work Limit (W/m²)' }) as HTMLInputElement).value).toBe('165');
});

it('polls presenter state every five seconds', async () => {
  vi.useFakeTimers();
  const caseZero = { case_id: 'case-1', version: 0, clock: '2025-08-04T08:00:00+04:00', tasks: [], capture: null } as unknown as CaseView;
  let current = caseZero;
  vi.spyOn(live, 'demoState').mockImplementation(async () => current);
  vi.spyOn(live, 'runs').mockResolvedValue([]);
  vi.spyOn(live, 'agentRuns').mockResolvedValue([]);
  render(<DemoControl caseView={caseZero} onChange={async () => {}} onReturn={() => {}} />);
  await act(async () => {});
  current = { ...caseZero, version: 8 };
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByText(/Active case case-1 · version 8/)).toBeTruthy();
});
