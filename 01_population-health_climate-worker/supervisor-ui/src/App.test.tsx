import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { PERSONAS, initialStory } from './story';
import { loadCase } from './replay';
import type { CaseView } from './live';

let currentCase: CaseView | null;
let currentPerson: typeof PERSONAS[number] | null;
let failCommand = false;
let rejectCase = false;
let demoRuns: unknown[];
let calls: Array<{ path: string; method: string; body?: Record<string, unknown>; tabId?: string }>;
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  window.history.replaceState(null, '', '/classic');
  const capture = await loadCase('heat_trigger', { delayMs: 0 });
  const request = structuredClone(capture.request);
  request.snapshot.recovery = { recorded_at: '2025-08-04T08:04:00+04:00', person_ids: request.snapshot.workers.map(w => w.person_id), zone_id: 'shelter_a' };
  currentCase = {
    case_id: 'case-1', version: 1, clock: '2025-08-04T08:11:00+04:00', capture, request,
    story: initialStory(),
    tasks: [
      { action: 'issue', actor_id: 'P03', label: 'Stop heavy trench work', status: 'ready' },
      { action: 'acknowledge', actor_id: 'C01', label: 'Acknowledge stop-work instruction', status: 'waiting', reason: 'Waiting for Maya' },
      { action: 'activity', actor_id: 'C01', label: 'Record observed crew activity', status: 'ready' },
    ],
  };
  currentPerson = null; failCommand = false; rejectCase = false; demoRuns = []; calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body, tabId: (init?.headers as Record<string, string> | undefined)?.['X-Heat-Tab-ID'] });
    if (path === '/api/session') {
      if (method === 'POST') { currentPerson = PERSONAS.find(p => p.id === body.persona_id)!; return reply({ person: currentPerson }); }
      if (method === 'DELETE') { currentPerson = null; return reply(null); }
      return reply({ person: currentPerson });
    }
    if (path === '/api/case') return rejectCase ? reply({ detail: 'Choose a local persona' }, 401) : reply(currentCase);
    if (path === '/api/case/commands') {
      if (failCommand) return reply({ detail: 'Version conflict' }, 409);
      if (currentCase && body.action === 'issue') {
        currentCase.story = { ...currentCase.story, issued: true, events: [{ id: 'e1', actorId: 'P03', title: 'Maya instructed the crew to stop heavy trench work' }] };
        currentCase.version += 1;
        currentCase.tasks[0].status = 'recorded'; currentCase.tasks[1].status = 'ready';
      }
      return reply(currentCase);
    }
    if (path === '/api/case/retry') return reply(currentCase);
    if (path === '/api/demo/runs') return reply(demoRuns);
    if (path === '/api/demo/agent-runs') return reply([]);
    if (path === '/api/demo/state') return reply(currentCase);
    if (path === '/api/demo/start') { currentCase!.version += 1; return reply(currentCase); }
    if (path === '/api/demo/reset') { currentCase = null; return reply(null); }
    return reply({ detail: `Unexpected ${method} ${path}` }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function signIn(name: string) {
  await userEvent.setup().click(await screen.findByRole('button', { name: `Sign in as ${name}` }));
  await screen.findByRole('button', { name: 'Sign out' });
}

describe('live supervisor workspace', () => {
  it('restores a server session and never shows presenter controls in the workspace', async () => {
    currentPerson = PERSONAS[0];
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Heat response' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start heat response case' })).toBeNull();
    expect(calls.some(c => c.path === '/api/session' && c.method === 'GET')).toBe(true);
    expect(calls.some(c => c.path === '/api/case')).toBe(true);
    expect(calls.filter(c => c.path.startsWith('/api/')).every(c => !!c.tabId)).toBe(true);
  });

  it('records a ready action through the versioned command API and reloads the server case', async () => {
    render(<App />); await signIn('Maya');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Stop heavy trench work' }));
    expect(await screen.findByText('Stop-work instruction issued')).toBeTruthy();
    expect(calls.find(c => c.path === '/api/case/commands')?.body).toMatchObject({ case_id: 'case-1', expected_version: 1, action: 'issue', payload: {} });
    expect(calls.find(c => c.path === '/api/case/commands')?.body?.command_id).toBeTruthy();
    expect(calls.filter(c => c.path === '/api/case').length).toBeGreaterThan(1);
  });

  it('shows a conflict and does not report success', async () => {
    failCommand = true;
    render(<App />); await signIn('Maya');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Stop heavy trench work' }));
    expect(await screen.findByText('Version conflict')).toBeTruthy();
    expect(screen.queryByText('Stop heavy trench work recorded.')).toBeNull();
    expect(screen.getByText('New heat finding at the civil trench')).toBeTruthy();
    const beforePoll = calls.filter(call => call.path === '/api/case').length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(calls.filter(call => call.path === '/api/case').length).toBeGreaterThan(beforePoll));
    expect(screen.getByText('Version conflict')).toBeTruthy();
    expect(currentCase!.tasks[0].status).toBe('ready');
  });

  it('keeps worker actions private and offers an observed activity form only to its owner', async () => {
    const user = userEvent.setup(); render(<App />); await signIn('Huda');
    expect(screen.getByRole('button', { name: 'Record observed crew activity' })).toBeTruthy();
    expect(screen.getByText(/proposal is not evidence of activity/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop heavy trench work' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Record observed crew activity' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: /Choose recovery for all after observing/ }));
    await user.click(screen.getByRole('checkbox', { name: /I observed all 11 active workers/ }));
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() => expect(calls.find(c => c.path === '/api/case/commands')?.body).toMatchObject({ action: 'activity', payload: { through_now: true, observed: true, groups: [{ person_ids: expect.arrayContaining(['C05']), kind: 'recovery', zone_id: 'shelter_a' }] } }));
    expect((calls.find(c => c.path === '/api/case/commands')?.body?.payload as { groups: Array<{ person_ids: string[] }> }).groups[0].person_ids).toHaveLength(currentCase!.capture!.request.snapshot.workers.length);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in to your workspace' });
    expect(calls.some(c => c.path === '/api/session' && c.method === 'DELETE')).toBe(true);
  });

  it('uses a neutral waiting state when the server has no active case', async () => {
    currentCase = null;
    render(<App />); await signIn('Maya');
    expect(await screen.findByText(/There is no active case/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop heavy trench work' })).toBeNull();
    expect(screen.queryByRole('link', { name: /demo control/i })).toBeNull();
  });

  it('drops a stale private case when the server rejects the session', async () => {
    rejectCase = true;
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign in as Maya' }));
    expect(await screen.findByText('Choose a local persona')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeTruthy();
    expect(screen.queryByText('New heat finding at the civil trench')).toBeNull();
  });

  it('clears a persona if the case is scoped to a different viewer', async () => {
    currentPerson = PERSONAS.find(p => p.id === 'C05')!;
    currentCase!.viewer_id = 'C08';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeTruthy();
    expect(screen.getByText(/tab identity changed/)).toBeTruthy();
  });

  it('keeps observed activity available when the current solver response is rejected', async () => {
    const user = userEvent.setup();
    currentCase!.clock = '2025-08-04T08:19:00+04:00';
    currentCase!.capture = null;
    currentCase!.runs = [{ id: 'run-2', version: 2, status: 'failed', error: 'Observed history ends before current clock' }];
    currentCase!.workers = Array.from({ length: 11 }, (_, i) => ({ person_id: `C${String(i + 2).padStart(2, '0')}`, last_observed_at: i === 3 ? '2025-08-04T08:17:00+04:00' : '2025-08-04T08:18:00+04:00' }));
    render(<App />); await signIn('Huda');
    expect(screen.getByText(/Observed history ends before current clock/)).toBeTruthy();
    expect(screen.getByText('New heat finding at the civil trench')).toBeTruthy();
    expect(screen.queryByLabelText('From (GST)')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Choose recovery for all after observing/ }));
    await user.click(screen.getByRole('checkbox', { name: /I observed all 11 active workers/ }));
    await user.click(screen.getByRole('button', { name: 'Record observed crew activity' }));
    await waitFor(() => expect(calls.some(c => c.path === '/api/case/commands')).toBe(true));
    const groups = (calls.find(c => c.path === '/api/case/commands')!.body!.payload as { through_now: boolean; groups: Array<{ person_ids: string[] }> });
    expect(groups.through_now).toBe(true);
    expect(groups.groups[0].person_ids).toHaveLength(11);
  });

  it('withholds the revised productive plan until removal and first aid are recorded', async () => {
    const user = userEvent.setup();
    currentCase!.capture = await loadCase('incident_no_substitute', { delayMs: 0 });
    currentCase!.story = { ...initialStory(), issued: true, acknowledged: true, stopped: true, checkedIn: true, recovered: true, assigned: true, reported: true, events: [] };
    render(<App />); await signIn('Huda');
    expect(screen.getByText(/Huda must confirm Bilal’s removal and location/)).toBeTruthy();
    expect(screen.getByText(/Salim must record first-aid contact/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Proposed workshop crew' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Crew work & recovery/ }));
    expect(screen.getByText(/Updated work and recovery times are waiting for/)).toBeTruthy();
    expect(screen.queryByText('Crew plan')).toBeNull();
  });

  it('opens live presenter controls only on the direct route', async () => {
    window.history.replaceState(null, '', '/demo-control');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Demo controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start heat response case' })).toBeTruthy();
    await waitFor(() => expect(calls.some(c => c.path === '/api/demo/runs')).toBe(true));
    await waitFor(() => expect(calls.some(c => c.path === '/api/demo/agent-runs')).toBe(true));
  });

  it('selects a single workflow run and mounts raw JSON only when opened', async () => {
    const user = userEvent.setup();
    demoRuns = Array.from({ length: 38 }, (_, i) => ({ id: `run-${37 - i}`, version: 37 - i, status: 'completed', http_status: 200, applied: true, graph_events: ['project_evidence', 'heat'], request: { marker: i === 0 ? 'LATEST_RAW_MARKER' : 'OLDER_RAW_MARKER' } }));
    window.history.replaceState(null, '', '/demo-control');
    render(<App />);
    expect(await screen.findByText('Workflow and solver runs · 38')).toBeTruthy();
    expect(screen.queryByText(/LATEST_RAW_MARKER/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Selected workflow run JSON' }));
    expect(await screen.findByText(/LATEST_RAW_MARKER/)).toBeTruthy();
    await user.click(screen.getByRole('combobox', { name: 'Workflow run' }));
    await user.click(screen.getByRole('option', { name: 'Version 0 · completed · HTTP 200' }));
    expect(screen.queryByText(/LATEST_RAW_MARKER/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Selected workflow run JSON' }));
    expect(await screen.findByText(/OLDER_RAW_MARKER/)).toBeTruthy();
  });

  it('offers a server-authorised retry for an unknown plan without recording a confirmation', async () => {
    currentCase!.retry_available = true;
    currentCase!.story.stopped = true;
    currentCase!.capture!.response.crew_rest.planning_status = 'unknown';
    currentCase!.capture!.response.crew_rest.blockers = ['optimizer_unknown'];
    render(<App />); await signIn('Rashid');
    expect(screen.getByText(/Crew planning needs review/)).toBeTruthy();
    expect(screen.getByText(/The crew planner could not establish a reliable result/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry calculation' }));
    await waitFor(() => expect(calls.some(call => call.path === '/api/case/retry')).toBe(true));
    expect(calls.find(call => call.path === '/api/case/retry')?.body).toEqual({ case_id: 'case-1', expected_version: 1 });
    expect(calls.some(call => call.path === '/api/case/commands')).toBe(false);
    expect(screen.getByText('Heavy trench work is stopped')).toBeTruthy();
  });

  it('offers retry on a failed calculation with no capture, using the server permission flag', async () => {
    currentCase!.retry_available = true;
    currentCase!.capture = null;
    currentCase!.runs = [{ id: 'failed-run', version: 1, status: 'failed', http_status: 0, error: 'Solver unavailable' }];
    render(<App />); await signIn('Huda');
    expect(screen.getByText(/Solver unavailable/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry calculation' })).toBeTruthy();
  });
});
