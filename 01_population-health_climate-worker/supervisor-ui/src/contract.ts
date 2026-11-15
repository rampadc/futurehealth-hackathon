/**
 * Agreed shapes for the platform endpoints behind the wireframe screens. Consent, worker data,
 * trust log and branding are served by `src/heat_safe/application/platform_api.py` and called
 * through `live.ts`; the monitor summary is still optional. Change a type only by agreement.
 */

/** W1 Squad Monitoring · GET /api/case/monitor (optional: W1 may derive this from CaseView). */
export type MonitorSummary = {
  case_id: string;
  version: number;
  at: string;
  hourly: Array<{ hour: string; band: 'low' | 'moderate' | 'high' | 'extreme' | 'unknown'; held_task_ids: string[] }>;
  workers: Array<{ person_id: string; location_id: string | null; status: 'working' | 'recovery' | 'excluded' | 'unknown'; last_observed_at: string | null }>;
};

/** W8 System & trust · GET /api/trust-log. Supervisors only (not workers), unlike /api/demo/*. */
export type TrustLogEntry = {
  id: string;
  at: string;
  kind: 'solver_run' | 'agent_run' | 'command' | 'guardrail';
  summary: string;
  status: string;
  /** Proposals stay proposals: always false for solver and agent output. */
  applied: boolean;
};

/** P1 consent · GET/PUT/DELETE /api/worker/consent. Applies to the signed-in worker only. */
export type ConsentScope = 'heat_alerts' | 'check_in' | 'symptom_report' | 'wearable';
export type WorkerConsent = {
  person_id: string;
  language: string;
  consented_at: string | null;
  scopes: ConsentScope[];
};

/** P8 my data · GET /api/worker/data. The signed-in worker's own records, no clinical notes. */
export type WorkerDataExport = {
  person_id: string;
  generated_at: string;
  consent: WorkerConsent;
  check_ins: Array<{ at: string; location_id: string }>;
  reports: Array<{ at: string; kind: string }>;
  plan_intervals: Array<{ kind: string; zone_id: string; starts_at: string; ends_at: string }>;
  note: string;
};

/** W9 branding · GET /api/brand (all), POST /api/brand/check, PUT /api/brand (admin only, typed PUBLISH). */
export type BrandSettings = {
  version: number;
  published_at: string | null;
  published_by: string | null;
  platform: BrandPalette | null;
  mobile: BrandPalette | null;
};
export type BrandCheck = { id: 'format' | 'contrast' | 'signal'; ok: boolean; label: string };
export type BrandPalette = { name: string; primary: string; on_primary: string; logo_text: string; rail_tint: boolean };
