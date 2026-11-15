import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadCase, type CaseId } from '../replay';
import { PERSONAS, initialStory, type StoryState } from '../story';
import type { CaseView, Task } from '../live';
import { SCREENS } from './registry';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let currentCase: CaseView | null;
let person: typeof PERSONAS[number] | null;
let commands: Array<{ action: string; payload: Record<string, unknown> }>;

async function makeCase(id: CaseId, story: Partial<StoryState>, tasks: Task[]): Promise<CaseView> {
  const capture = await loadCase(id, { delayMs: 0 });
  return { case_id: 'case-1', version: 4, clock: capture.request.decision_at, capture, request: structuredClone(capture.request), story: { ...initialStory(), ...story }, tasks };
}
const task = (action: string, actor_id: string, status: Task['status'], label = action): Task => ({ action, actor_id, label, status });

beforeEach(() => {
  person = null; commands = []; currentCase = null;
  vi.stubGlobal('EventSource', undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/api/session') {
      if (method === 'POST') { person = PERSONAS.find(p => p.id === body.persona_id)!; return reply({ person }); }
      return reply({ person });
    }
    if (path === '/api/case') return reply(currentCase);
    if (path === '/api/case/commands') {
      commands.push({ action: body.action, payload: body.payload });
      const t = currentCase?.tasks.find(x => x.action === body.action);
      if (t) t.status = 'recorded';
      return reply(currentCase);
    }
    if (path === '/api/chat/history') return reply({ messages: [] });
    if (path === '/api/ready') return reply({ ok: true });
    if (path.startsWith('/api/demo/')) return reply({ detail: 'Presenter access required' }, 403);
    return reply({ detail: `Unexpected ${method} ${path}` }, 404);
  }));
});

const open = async (path: string, personaId: string) => {
  person = PERSONAS.find(p => p.id === personaId)!;
  window.history.replaceState(null, '', path);
  return render(<App />);
};

describe('every built screen', () => {
  const built = SCREENS.filter(s => s.component);
  it('covers all but the branding stretch screen', () => {
    expect(SCREENS.filter(s => !s.component).map(s => s.id)).toEqual(['w9']);
  });
  for (const caseId of ['heat_trigger', 'incident_substitute', 'restart_ready'] as const) {
    it(`renders each screen for each of its personas · ${caseId}`, async () => {
      currentCase = await makeCase(caseId, caseId === 'heat_trigger' ? {} : { issued: true, acknowledged: true, stopped: true, checkedIn: true, recovered: true, assigned: true, reported: true, removed: true, firstaid: true },
        [task('issue', 'P03', 'ready'), task('acknowledge', 'C01', 'waiting'), task('report', 'C08', 'waiting'), task('checkin', 'C05', 'waiting'), task('review', 'P02', 'waiting')]);
      for (const s of built) for (const id of s.personas.filter(p => PERSONAS.some(x => x.id === p))) {
        const view = await open(`/${s.device}/${s.id}`, id);
        expect(await screen.findByRole('heading', { level: 1 }), `${s.id} as ${id}`).toBeTruthy();
        view.unmount();
      }
    }, 60_000);
  }
  it('explains an empty case instead of failing', async () => {
    for (const s of built.filter(x => x.device !== 'worker')) {
      const view = await open(`/${s.device}/${s.id}`, s.personas[0] === 'P09' ? 'P02' : s.personas[0]);
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
