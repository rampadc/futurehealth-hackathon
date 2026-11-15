import type { ReplayCapture, ReplayRequest } from './replay';
import type { Persona, StoryState } from './story';

export type Task = { action: string; actor_id: string; label: string; status: 'ready' | 'waiting' | 'recorded'; reason?: string; due_at?: string | null };
export type Run = { id: string; version: number; status: string; error?: string | null; http_status?: number | null; graph_events?: string[]; applied?: boolean };
export type CaseView = {
  case_id: string;
  version: number;
  clock: string;
  story: StoryState;
  request?: ReplayRequest;
  capture: ReplayCapture | null;
  tasks: Task[];
  workers?: Array<{ person_id: string; last_observed_at: string | null; reason?: string; readiness?: string }>;
  retry_available?: boolean;
  runs?: Run[];
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('heat-access-expired'));
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = typeof body.detail === 'string' ? body.detail : typeof body.error === 'string' ? body.error : message;
    } catch { /* Keep the HTTP status when no JSON error is supplied. */ }
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? null as T : response.json() as Promise<T>;
}

const json = (value: unknown) => JSON.stringify(value);
export const live = {
  session: () => request<{ person: Persona | null }>('/session'),
  signIn: (persona_id: string) => request<{ person: Persona }>('/session', { method: 'POST', body: json({ persona_id }) }),
  signOut: () => request<void>('/session', { method: 'DELETE' }),
  case: () => request<CaseView | null>('/case'),
  command: (caseView: CaseView, action: string, payload: Record<string, unknown>) => request<CaseView | null>('/case/commands', {
    method: 'POST', body: json({ command_id: crypto.randomUUID(), expected_version: caseView.version, action, payload }),
  }),
  retry: (expected_version: number) => request<CaseView>('/case/retry', { method: 'POST', body: json({ expected_version }) }),
  start: () => request<CaseView>('/demo/start', { method: 'POST', body: json({ scenario: 'heat_response' }) }),
  clock: (at: string) => request<CaseView>('/demo/clock', { method: 'POST', body: json({ at }) }),
  signal: (payload: Record<string, unknown>) => request<CaseView>('/demo/signals', { method: 'POST', body: json({ kind: 'reading', payload }) }),
  runs: () => request<unknown>('/demo/runs'),
  demoState: () => request<CaseView | null>('/demo/state'),
  agentRuns: () => request<unknown>('/demo/agent-runs'),
  reset: () => request<void>('/demo/reset', { method: 'POST' }),
};
