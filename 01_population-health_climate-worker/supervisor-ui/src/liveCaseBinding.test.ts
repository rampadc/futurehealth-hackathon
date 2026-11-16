import { afterEach, describe, expect, it, vi } from 'vitest';
import { live, type CaseView } from './live';

afterEach(() => vi.unstubAllGlobals());

describe('case-bound mutations', () => {
  it('sends the selected case on commands, retries and presenter signals', async () => {
    const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit) => {
      sent.push({ path: String(path), body: JSON.parse(String(init.body)) });
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    const caseView = { case_id: 'case-original', version: 7 } as CaseView;
    await live.command(caseView, 'recover', { person_ids: ['C02'] }, 'command-1');
    await live.retry(caseView.case_id, caseView.version);
    await live.signal(caseView.case_id, { twl: 145 });
    expect(sent).toEqual([
      { path: '/api/case/commands', body: { command_id: 'command-1', case_id: 'case-original', expected_version: 7, action: 'recover', payload: { person_ids: ['C02'] } } },
      { path: '/api/case/retry', body: { case_id: 'case-original', expected_version: 7 } },
      { path: '/api/demo/signals', body: { case_id: 'case-original', kind: 'reading', payload: { twl: 145 } } },
    ]);
  });
});
