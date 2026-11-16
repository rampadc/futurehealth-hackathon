import type { ReplayCapture, ReplayRequest } from './replay';
import type { Persona, StoryState } from './story';
import type { BrandCheck, BrandPalette, BrandSettings, ConsentScope, CrewRisk, OwnRisk, SiteConditions, TrustLogEntry, WorkerConsent, WorkerDataExport } from './contract';
import { tabSessionHeader } from './tabSession';

export type Task = { action: string; actor_id: string; label: string; status: 'ready' | 'waiting' | 'recorded'; reason?: string; due_at?: string | null };
export type Run = { id: string; version: number; status: string; error?: string | null; http_status?: number | null; graph_events?: string[]; applied?: boolean };
export type CaseView = {
  case_id: string;
  version: number;
  clock: string;
  story: StoryState;
  request?: ReplayRequest | null;
  capture: ReplayCapture | null;
  tasks: Task[];
  workers?: Array<{ person_id: string; last_observed_at: string | null; reason?: string; readiness?: string }>;
  retry_available?: boolean;
  runs?: Run[];
  viewer_id?: string;
  time?: { mode: 'elapsed' | 'legacy'; server_now: string; started_at: string; ends_at: string; status: 'running' | 'ended' | 'historical' };
  headcount?: { expected_count: number; checked_in_count: number; confirmed_count: number; cooled_recovery_count?: number; welfare_count?: number; confirmed_at: string | null; arrivals: Array<{ person_id: string; checked_in_at: string }> };
  plan_assessment?: { id: string | null; assessed_at: string | null; observed_through: string | null; approval_deadline: string | null; status: 'proposed' | 'approved' | 'expired' | 'awaiting_observations' | 'blocked'; approved_at?: string | null; started_worker_ids?: string[]; request: ReplayRequest | null; response: ReplayCapture['response'] | null; check?: unknown } | null;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { ...tabSessionHeader(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api${path}`, init);
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
  command: (caseView: CaseView, action: string, payload: Record<string, unknown>, command_id: string = crypto.randomUUID()) => request<CaseView | null>('/case/commands', {
    method: 'POST', body: json({ command_id, case_id: caseView.case_id, expected_version: caseView.version, action, payload }),
  }),
  retry: (case_id: string, expected_version: number) => request<CaseView>('/case/retry', { method: 'POST', body: json({ case_id, expected_version }) }),
  start: () => request<CaseView>('/demo/start', { method: 'POST', body: json({ scenario: 'heat_response' }) }),
  signal: (case_id: string, payload: Record<string, unknown>) => request<CaseView>('/demo/signals', { method: 'POST', body: json({ case_id, kind: 'reading', payload }) }),
  runs: () => request<unknown>('/demo/runs'),
  demoState: () => request<CaseView | null>('/demo/state'),
  agentRuns: () => request<unknown>('/demo/agent-runs'),
  reset: () => request<CaseView>('/demo/reset', { method: 'POST' }),
  consent: () => request<WorkerConsent>('/worker/consent'),
  saveConsent: (language: string, scopes: ConsentScope[]) => request<WorkerConsent>('/worker/consent', { method: 'PUT', body: json({ language, scopes }) }),
  withdrawConsent: () => request<WorkerConsent>('/worker/consent', { method: 'DELETE' }),
  workerData: () => request<WorkerDataExport>('/worker/data'),
  conditions: () => request<SiteConditions | null>('/case/conditions'),
  crewRisk: () => request<CrewRisk | null>('/case/crew-risk'),
  ownRisk: () => request<OwnRisk | null>('/worker/risk'),
  heatRest: () => request<HeatRestView>('/case/heat-rest'),
  trustLog: () => request<TrustLogEntry[]>('/trust-log'),
  brand: () => request<BrandSettings>('/brand'),
  checkBrand: (platform: BrandPalette, mobile: BrandPalette) => request<{ platform: BrandCheck[]; mobile: BrandCheck[] }>('/brand/check', { method: 'POST', body: json({ platform, mobile, expected_version: 0, confirm: '' }) }),
  photos: () => request<{ photos: Record<string, string> }>('/people/photos'),
  uploadPhoto: (image: string) => request<{ person_id: string; updated_at: string }>('/people/me/photo', { method: 'PUT', body: json({ image }) }),
  removePhoto: () => request<{ person_id: string; updated_at: null }>('/people/me/photo', { method: 'DELETE' }),
  publishBrand: (platform: BrandPalette, mobile: BrandPalette, expected_version: number, confirm: string) => request<BrandSettings>('/brand', { method: 'PUT', body: json({ platform, mobile, expected_version, confirm }) }),
};

export type HeatRestView = {
  policy_id: string; title: string; case_id?: string; source: string; scope: string; commitment?: string; payroll_verified?: boolean;
  coverage_review: null | { status: 'confirmed' | 'needs_verification'; crew_ids?: string[]; roster_verified: boolean; note: string; reviewed_by?: string; reviewed_at?: string };
  records?: { instruction?: { issued_at?: string; acknowledged_at?: string } | null; stop?: { confirmed_at?: string } | null; headcount?: { expected_count: number; checked_in_count: number; confirmed_count: number; confirmed_at?: string | null }; arrivals?: Array<{ person_id: string; checked_in_at: string }>; observed_time?: Array<{ person_id?: string; kind: string; starts_at: string; ends_at: string }> };
  review_queue?: { status: 'pending' | 'reviewed'; policy_id: string; expected_count: number; confirmed_count: number };
  commercial_summary?: { stop_at?: string | null; recovery_confirmed_at?: string | null; confirmed_count?: number; coverage_status?: string; cost_review_at?: string | null;
    chronology?: Array<{ action: string; title: string; occurred_at: string }>;
    confirmed_time?: { recovery_worker_minutes: number; workshop_worker_minutes: number; latest_observed_at: string | null };
    employer_review?: { status: string; roster_verified: boolean; reviewed_at: string } | null;
    delivery?: { status: 'not_started' | 'drafted' | 'approved' | 'sent' | 'accepted'; milestones: Array<{ action: string; occurred_at: string }> };
    unresolved_questions?: Array<{ id: string; question: string; status: 'open' }>;
  };
  [key: string]: unknown;
};
