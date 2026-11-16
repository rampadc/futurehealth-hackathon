import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatRestScreen } from './heatRest';
import { live, type CaseView, type HeatRestView } from '../live';
import { initialStory, PERSONAS } from '../story';
import type { CaseSession } from '../session';

afterEach(() => vi.restoreAllMocks());

it('does not display a cached employer review for another viewer or case', async () => {
  const caseOne = { case_id: 'case-1', version: 1, clock: '2025-08-04T08:04:00+04:00', story: initialStory(), tasks: [], capture: null } as CaseView;
  const oldPolicy = { case_id: 'case-1', policy_id: 'heat-rest-schedule-v1', title: 'Heat Rest Schedule', source: 'record', scope: 'Dune crew', coverage_review: { status: 'confirmed', roster_verified: true, note: 'Private employer basis', reviewed_by: 'P10', reviewed_at: caseOne.clock } } as HeatRestView;
  vi.spyOn(live, 'heatRest').mockResolvedValueOnce(oldPolicy).mockImplementation(() => new Promise(() => {}));
  const mina = PERSONAS.find(person => person.id === 'P10')!;
  const rana = PERSONAS.find(person => person.id === 'C05')!;
  const view = (caseView: CaseView, person: typeof mina) => <HeatRestScreen session={{ caseView, person, busy: false, act: async () => {} } as unknown as CaseSession} />;
  const mounted = render(view(caseOne, mina));
  expect(await screen.findByText(/Private employer basis/)).toBeTruthy();
  mounted.rerender(view(caseOne, rana));
  expect(screen.queryByText(/Private employer basis/)).toBeNull();
  expect(screen.queryByText('Coverage confirmed')).toBeNull();
  mounted.rerender(view({ ...caseOne, case_id: 'case-2' }, mina));
  expect(screen.queryByText(/Private employer basis/)).toBeNull();
  expect(screen.queryByText('Coverage confirmed')).toBeNull();
});
