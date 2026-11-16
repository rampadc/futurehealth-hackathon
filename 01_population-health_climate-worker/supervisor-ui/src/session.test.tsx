import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { live, type CaseView } from './live';
import { PERSONAS, initialStory } from './story';
import { useCaseSession } from './session';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('polls the signed-in case every five seconds and refreshes on focus', async () => {
  vi.useFakeTimers();
  const person = PERSONAS.find(p => p.id === 'C01')!;
  const view = { case_id: 'case-1', version: 1, clock: '2025-08-04T08:04:00+04:00', story: initialStory(), capture: null, tasks: [], viewer_id: 'C01' } as CaseView;
  vi.spyOn(live, 'session').mockResolvedValue({ person });
  const load = vi.spyOn(live, 'case').mockResolvedValue(view);
  let result!: ReturnType<typeof renderHook<ReturnType<typeof useCaseSession>, unknown>>;
  await act(async () => { result = renderHook(() => useCaseSession()); await Promise.resolve(); await Promise.resolve(); });
  expect(result.result.current.initialising).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5_000); await Promise.resolve(); });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
  expect(load).toHaveBeenCalledTimes(3);
  result.unmount();
});
