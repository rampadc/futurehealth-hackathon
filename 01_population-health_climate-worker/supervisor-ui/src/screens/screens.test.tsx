import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadCase, type CaseId } from '../replay';
import { ADMIN, PERSONAS, initialStory, type StoryState } from '../story';
import type { CaseView, Task } from '../live';
import { SCREENS } from './registry';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let currentCase: CaseView | null;
let person: typeof PERSONAS[number] | null;
let commands: Array<{ action: string; payload: Record<string, unknown> }>;
let commandIds: string[];
let brand: { version: number; published_at: string | null; published_by: string | null; platform: unknown; mobile: unknown };
let brandCalls: Array<Record<string, unknown>>;
let consent: { person_id: string; language: string; scopes: string[]; consented_at: string | null };
const checks = (primary: string) => [{ id: 'signal', ok: primary !== '#D32F2F', label: primary === '#D32F2F' ? 'Brand colour reads as the stop signal' : 'Brand colour does not read as a safety signal' }];

async function makeCase(id: CaseId, story: Partial<StoryState>, tasks: Task[]): Promise<CaseView> {
  const capture = await loadCase(id, { delayMs: 0 });
  return { case_id: 'case-1', version: 4, clock: capture.request.decision_at, capture, request: structuredClone(capture.request), story: { ...initialStory(), ...story }, tasks };
}
const task = (action: string, actor_id: string, status: Task['status'], label = action): Task => ({ action, actor_id, label, status });

beforeEach(() => {
  person = null; commands = []; commandIds = []; currentCase = null; brandCalls = [];
  brand = { version: 0, published_at: null, published_by: null, platform: null, mobile: null };
  consent = { person_id: 'C05', language: 'en', scopes: [], consented_at: null };
  vi.stubGlobal('EventSource', undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/api/session') {
      if (method === 'POST') { person = [...PERSONAS, ADMIN].find(p => p.id === body.persona_id)!; return reply({ person }); }
      return reply({ person });
    }
    if (path === '/api/case') return reply(currentCase);
    if (path === '/api/case/commands') {
      commands.push({ action: body.action, payload: body.payload }); commandIds.push(body.command_id);
      const t = currentCase?.tasks.find(x => x.action === body.action);
      if (t) t.status = 'recorded';
      return reply(currentCase);
    }
    if (path === '/api/chat/history') return reply({ messages: [] });
    if (path === '/api/ready') return reply({ ok: true });
    if (path === '/api/brand') {
      if (method === 'PUT') { brand = { version: brand.version + 1, published_at: '2025-08-04T16:40:00+04:00', published_by: 'P09', platform: body.platform, mobile: body.mobile }; brandCalls.push(body); return reply(brand); }
      return reply(brand);
    }
    if (path === '/api/brand/check') return reply({ platform: checks(body.platform.primary), mobile: checks(body.mobile.primary) });
    if (path === '/api/trust-log') return reply([{ id: 'event-1', at: '2025-08-04T08:01:00+04:00', kind: 'command', summary: 'Maya Al Qamar: stop-work', status: 'recorded', applied: true }]);
    if (path === '/api/worker/consent') {
      if (method === 'PUT') consent = { person_id: person!.id, language: body.language, scopes: body.scopes, consented_at: body.scopes.length ? '2025-08-04T07:30:00+04:00' : null };
      if (method === 'DELETE') consent = { ...consent, scopes: [], consented_at: null };
      return reply(consent);
    }
    if (path.startsWith('/api/demo/')) return reply({ detail: 'Presenter access required' }, 403);
    return reply({ detail: `Unexpected ${method} ${path}` }, 404);
  }));
});

const open = async (path: string, personaId: string) => {
  person = [...PERSONAS, ADMIN].find(p => p.id === personaId)!;
  window.history.replaceState(null, '', path);
  return render(<App />);
};

describe('every built screen', () => {
  const built = SCREENS.filter(s => s.component);
  it('covers every wireframe screen', () => {
    expect(SCREENS.filter(s => !s.component).map(s => s.id)).toEqual([]);
  });
  for (const caseId of ['heat_trigger', 'incident_substitute', 'restart_ready'] as const) {
    it(`renders each screen for each of its personas · ${caseId}`, async () => {
      currentCase = await makeCase(caseId, caseId === 'heat_trigger' ? {} : { issued: true, acknowledged: true, stopped: true, checkedIn: true, recovered: true, assigned: true, reported: true, removed: true, firstaid: true },
        [task('issue', 'P03', 'ready'), task('acknowledge', 'C01', 'waiting'), task('report', 'C08', 'waiting'), task('checkin', 'C05', 'waiting'), task('review', 'P02', 'waiting')]);
      for (const s of built) for (const id of s.personas) {
        const view = await open(`/${s.device}/${s.id}`, id);
        expect(await screen.findByRole('heading', { level: 1 }), `${s.id} as ${id}`).toBeTruthy();
        view.unmount();
      }
    }, 60_000);
  }
  it('explains an empty case instead of failing', async () => {
    // Branding (W9) is organisation-wide and does not need a case.
    for (const s of built.filter(x => x.device !== 'worker' && x.id !== 'w9')) {
      const view = await open(`/${s.device}/${s.id}`, s.personas[0]);
      expect(await screen.findByText(/There is no active case/)).toBeTruthy();
      view.unmount();
    }
  });
});

describe('stop-work', () => {
  it('Huda acknowledges from the site app', async () => {
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('issue', 'P03', 'recorded'), task('acknowledge', 'C01', 'ready')]);
    await open('/site/m2', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
  });

  it('only the owner can issue: Huda sees no enabled issue button on W2', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    await open('/web/w2', 'C01');
    const button = await screen.findByRole('button', { name: 'Issue stop-work instruction' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Maya Al Qamar records this \(P03\)/)).toBeTruthy();
  });

  it('records the headcount for every affected worker at Shelter A', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true, checkedIn: true }, [task('recover', 'C01', 'ready')]);
    await open('/site/m3', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: /accounted for/ }));
    await waitFor(() => expect(commands[0]?.action).toBe('recover'));
    expect(commands[0].payload.zone_id).toBe('shelter_a');
    expect((commands[0].payload.person_ids as string[]).length).toBe(currentCase!.request!.snapshot.workers.length);
  });
});

describe('assistance', () => {
  it('needs the typed word REMOVED before recording a removal', async () => {
    currentCase = await makeCase('removal_unconfirmed', { reported: true, assigned: true }, [task('incident_record', 'C01', 'recorded'), task('remove', 'C01', 'ready')]);
    await open('/site/m6', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm Bilal removed from heat' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/to confirm/), 'removed');
    await userEvent.click(confirm);
    await waitFor(() => expect(commands).toEqual([{ action: 'remove', payload: { location_id: 'welfare' } }]));
  });

  it('Bilal reports feeling unwell with press and hold', async () => {
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('report', 'C08', 'ready')]);
    await open('/worker/p4', 'C08');
    await userEvent.click(await screen.findByRole('button', { name: 'I feel unwell' }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    const send = screen.getByRole('button', { name: /Send to my supervisor/ });
    fireEvent.keyDown(send, { key: ' ' });
    await waitFor(() => expect(commands).toEqual([{ action: 'report', payload: {} }]), { timeout: 2000 });
  });
});

describe('worker app languages', () => {
  it('mirrors the stop-work alert in Arabic', async () => {
    localStorage.setItem('hs-worker-lang:C05', 'ar');
    currentCase = await makeCase('heat_trigger', { issued: true }, []);
    const { container } = await open('/worker/p3', 'C05');
    await screen.findByRole('heading', { level: 1 });
    const frame = container.querySelector('.hs-worker')!;
    expect(frame.getAttribute('dir')).toBe('rtl');
    expect(frame.getAttribute('lang')).toBe('ar');
    localStorage.removeItem('hs-worker-lang:C05');
  });
});

describe('restart review', () => {
  it('lists all eight checks and keeps heavy work stopped', async () => {
    currentCase = await makeCase('restart_ready', { fresh: true, permit: true, removed: true, firstaid: true }, [task('review', 'P02', 'ready')]);
    await open('/web/w6', 'P02');
    expect(await screen.findByText('Crew readiness check')).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter(li => /check|reading|removal|contact/i.test(li.textContent ?? '')).length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/stays stopped/)).toBeTruthy();
  });
});

describe('platform screens', () => {
  it('only the admin publishes branding, after typing PUBLISH', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    const view = await open('/web/w9', 'P02');
    expect(await screen.findByText(/No company palette yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /example palette/ })).toBeNull();
    view.unmount();
    await open('/web/w9', 'P09');
    await userEvent.click(await screen.findByRole('button', { name: /example palette/ }));
    const publish = await screen.findByRole('button', { name: 'Publish branding' }) as HTMLButtonElement;
    await waitFor(() => expect(publish.disabled).toBe(false));
    await userEvent.click(publish);
    await userEvent.type(screen.getByLabelText(/to confirm/), 'PUBLISH');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(brandCalls).toHaveLength(1));
    expect(brandCalls[0].confirm).toBe('PUBLISH');
    expect(await screen.findByText('Published version 1')).toBeTruthy();
  });

  it('saves worker consent on the server and lets the worker withdraw it', async () => {
    localStorage.setItem('hs-worker-lang:C05', 'en');
    currentCase = await makeCase('heat_trigger', {}, []);
    const view = await open('/worker/p1', 'C05');
    await userEvent.click(await screen.findByRole('switch', { name: 'Check-ins' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    await waitFor(() => expect(consent.scopes).toEqual(['check_in', 'symptom_report']));
    view.unmount();
    await open('/worker/p8', 'C05');
    const withdraw = await screen.findByRole('button', { name: /Withdraw consent/ });
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(withdraw, { key: ' ' });
    await waitFor(() => expect(consent.scopes).toEqual([]), { timeout: 2000 });
    localStorage.removeItem('hs-worker-lang:C05');
  });

  it('shows the trust log to supervisors on W8', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/w8', 'P02');
    expect(await screen.findByText('Maya Al Qamar: stop-work')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
  });
});

describe('offline worker actions', () => {
  it('queues a check-in without a network and sends it once when the network returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/worker/p6', 'C05');
    const hold = await screen.findByRole('button', { name: /Check in at Shelter A/ });
    fireEvent.keyDown(hold, { key: ' ' });
    expect(await screen.findByText(/1 saved action waiting to send/, {}, { timeout: 2000 })).toBeTruthy();
    expect(commands).toEqual([]);
    expect(JSON.parse(localStorage.getItem('hs-outbox:C05')!)).toHaveLength(1);
    const queuedId = JSON.parse(localStorage.getItem('hs-outbox:C05')!)[0].command_id;
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    expect(commandIds).toEqual([queuedId]);
    await waitFor(() => expect(localStorage.getItem('hs-outbox:C05')).toBeNull());
    online.mockRestore();
  });

  it('never queues supervisor decisions', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('acknowledge', 'C01', 'ready')]);
    await open('/site/m2', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
    expect(localStorage.getItem('hs-outbox:C01')).toBeNull();
    online.mockRestore();
  });
});

describe('voice and badges', () => {
  it('turns a spoken check-in into the fixed red-flag question; the words are not sent', async () => {
    class FakeRecognition {
      lang = ''; interimResults = false; continuous = false;
      onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'I feel dizzy' }]] }); this.onend?.(); }, 0); }
      stop() {} abort() {}
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('report', 'C08', 'ready')]);
    await open('/worker/p4', 'C08');
    fireEvent.keyDown(await screen.findByRole('button', { name: /Hold and speak/ }), { key: ' ' });
    expect(await screen.findByText('“I feel dizzy”')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: 'I feel unwell' }).at(-1)!);
    expect(await screen.findByText(/Are you confused/)).toBeTruthy();
    expect(commands).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('checks a worker in from an NFC badge', async () => {
    let reader: { onreading: ((e: unknown) => void) | null } | undefined;
    class FakeReader { onreading: ((e: unknown) => void) | null = null; onreadingerror = null; constructor() { reader = this; } async scan() {} }
    vi.stubGlobal('NDEFReader', FakeReader);
    currentCase = await makeCase('heat_trigger', { stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/kiosk/k1', 'C05');
    await userEvent.click(await screen.findByRole('button', { name: 'Start NFC badge reader' }));
    await waitFor(() => expect(reader).toBeTruthy());
    reader!.onreading!({ message: { records: [{ recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode('c05').buffer) }] } });
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    vi.unstubAllGlobals();
  });
});
