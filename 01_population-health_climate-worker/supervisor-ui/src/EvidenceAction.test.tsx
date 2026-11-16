import { expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvidenceAction } from './EvidenceAction';
import { loadCase } from './replay';
import { initialStory, PERSONAS } from './story';
import type { CaseView } from './live';

it('keeps a human activity attestation through clock and version polls, then clears on a new case', async () => {
  const capture = await loadCase('heat_trigger', { delayMs: 0 });
  const person = PERSONAS.find(item => item.id === 'C01')!;
  const caseView = { case_id: 'case-a', version: 3, clock: capture.request.decision_at, story: initialStory(), request: capture.request, capture,
    tasks: [{ action: 'activity', actor_id: 'C01', label: 'Record observed crew activity', status: 'ready' }] } as CaseView;
  const onAction = vi.fn(async () => {});
  const renderForm = (view: CaseView) => <EvidenceAction action="activity" caseView={view} person={person} onAction={onAction} busy={false} />;
  const mounted = render(renderForm(caseView));
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Choose recovery for all after observing/ }));
  await user.click(screen.getByRole('checkbox', { name: /I observed all 11 active workers/ }));
  const submit = screen.getByRole('button', { name: 'Record observed crew activity' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
  mounted.rerender(renderForm({ ...caseView, version: 4, clock: '2025-08-04T08:05:00+04:00' }));
  expect(submit.disabled).toBe(false);
  expect((screen.getByRole('checkbox', { name: /I observed all 11 active workers/ }) as HTMLInputElement).checked).toBe(true);
  mounted.rerender(renderForm({ ...caseView, case_id: 'case-b' }));
  await act(async () => {});
  expect(submit.disabled).toBe(true);
});
