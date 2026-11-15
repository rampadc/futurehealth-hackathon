import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { parseRoute } from '../router';
import { ACTIONS, PERSONAS, initialStory } from '../story';
import { SCREENS } from '../screens/registry';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let person: typeof PERSONAS[number] | null;

beforeEach(() => {
  person = null;
  vi.stubGlobal('EventSource', undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    if (path === '/api/session') {
      if (method === 'POST') { person = PERSONAS.find(p => p.id === JSON.parse(String(init!.body)).persona_id)!; return reply({ person }); }
      if (method === 'DELETE') { person = null; return reply(null); }
      return reply({ person });
    }
    if (path === '/api/case') return reply({ case_id: 'case-1', version: 3, clock: '2025-08-04T08:01:00+04:00', capture: null, story: initialStory(), tasks: [{ action: 'acknowledge', actor_id: 'C01', label: 'Acknowledge stop-work instruction', status: 'ready' }] });
    return reply({ detail: 'not found' }, 404);
  }));
});

describe('routes', () => {
  it('opens the web shell at / and keeps the classic app and presenter controls', () => {
    expect(parseRoute('/')).toEqual({ kind: 'device', device: 'web' });
    expect(parseRoute('/nope')).toEqual({ kind: 'device', device: 'web' });
    expect(parseRoute('/classic/')).toEqual({ kind: 'classic' });
    expect(parseRoute('/demo-control/')).toEqual({ kind: 'demo-control' });
  });
  it('parses device shells and screen ids', () => {
    expect(parseRoute('/site')).toEqual({ kind: 'device', device: 'site', screen: undefined });
    expect(parseRoute('/worker/P4/')).toEqual({ kind: 'device', device: 'worker', screen: 'p4' });
  });
});

describe('screen registry', () => {
  it('lists every wireframe screen once', () => {
    const ids = SCREENS.map(s => s.id);
    const expected = [...Array.from({ length: 9 }, (_, i) => `w${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `m${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `p${i + 1}`), 'k1'];
    expect([...ids].sort()).toEqual(expected.sort());
  });
  it('only names case actions the backend accepts', () => {
    const backendOnly = ['activity', 'readiness', 'incident_record', 'personnel', 'recovery_check', 'crew_readiness', 'water', 'escalation_followup'];
    const known = new Set([...Object.keys(ACTIONS), ...backendOnly]);
    for (const s of SCREENS) for (const command of s.commands) expect(known, `${s.id} → ${command}`).toContain(command);
  });
});

describe('device shell', () => {
  it('offers only the personas who use that device, then shows the screen', async () => {
    window.history.replaceState(null, '', '/site/m2');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /choose who is using this phone/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Amal Al Nadir/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Huda Al Nadir/ }));
    expect(await screen.findByRole('heading', { name: 'Stop-work instruction' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Acknowledge' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
  });

  it('moves between screens from the rail', async () => {
    person = PERSONAS.find(p => p.id === 'C01')!;
    window.history.replaceState(null, '', '/web');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Squad Monitoring' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /W6 Restart review/ }));
    expect(await screen.findByRole('heading', { name: 'Restart review' })).toBeTruthy();
    expect(window.location.pathname).toBe('/web/w6');
  });
});
