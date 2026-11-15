/**
 * Agreed shapes for endpoints the wireframe screens need that the backend does not serve yet.
 * Owner C implements them in `src/heat_safe/application/`; owners A and B build against these
 * types with fixtures. Change a type here only by agreement, then add the call to `live.ts`
 * once the endpoint exists. Nothing here is called at runtime yet.
 */

/** W1 Squad Monitoring · GET /api/case/monitor (optional: W1 may derive this from CaseView). */
export type MonitorSummary = {
  case_id: string;
  version: number;
  at: string;
  hourly: Array<{ hour: string; band: 'low' | 'moderate' | 'high' | 'extreme' | 'unknown'; held_task_ids: string[] }>;
  workers: Array<{ person_id: string; location_id: string | null; status: 'working' | 'recovery' | 'excluded' | 'unknown'; last_observed_at: string | null }>;
};

/** W8 System & trust · GET /api/trust-log. Readable by supervisors, unlike /api/demo/*. */
export type TrustLogEntry = {
  id: string;
  at: string;
  kind: 'solver_run' | 'agent_run' | 'command' | 'guardrail';
  summary: string;
  status: string;
  /** Proposals stay proposals: always false for solver and agent output. */
  applied: boolean;
};

/** P1 consent · GET/POST /api/worker/consent. Applies to the signed-in worker only. */
export type WorkerConsent = {
  person_id: string;
  language: string;
  consented_at: string | null;
  scopes: Array<'heat_alerts' | 'check_in' | 'symptom_report'>;
};

/** P8 my data · GET /api/worker/data. The signed-in worker's own records, no clinical notes. */
export type WorkerDataExport = {
  person_id: string;
  generated_at: string;
  consent: WorkerConsent;
  check_ins: Array<{ at: string; location_id: string }>;
  reports: Array<{ at: string; kind: string }>;
};

/** W9 branding · GET /api/brand (all) and PUT /api/brand (admin only, typed PUBLISH). */
export type BrandSettings = {
  version: number;
  published_at: string | null;
  platform: BrandPalette;
  mobile: BrandPalette;
};
export type BrandPalette = { name: string; primary: string; on_primary: string; logo_text: string; rail_tint: boolean };
