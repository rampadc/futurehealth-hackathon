/**
 * Agreed shapes for the platform endpoints behind the wireframe screens. Consent, worker data,
 * trust log and branding are served by `src/heat_safe/application/platform_api.py` and called
 * through `live.ts`; the monitor summary is still optional. Change a type only by agreement.
 */

/** Squad Monitoring · GET /api/case/monitor (optional: the monitoring screen may derive this from CaseView). */
export type MonitorSummary = {
  case_id: string;
  version: number;
  at: string;
  hourly: Array<{ hour: string; band: 'low' | 'moderate' | 'high' | 'extreme' | 'unknown'; held_task_ids: string[] }>;
  workers: Array<{ person_id: string; location_id: string | null; status: 'working' | 'recovery' | 'excluded' | 'unknown'; last_observed_at: string | null }>;
};

/** System & trust · GET /api/trust-log. Supervisors only (not workers), unlike /api/demo/*. */
export type TrustLogEntry = {
  id: string;
  at: string;
  /** `signal`: a sensor reading or an automatic escalation, not a person's record. */
  kind: 'solver_run' | 'agent_run' | 'command' | 'signal' | 'guardrail';
  summary: string;
  status: string;
  /** Proposals stay proposals: always false for solver and agent output. */
  applied: boolean;
};

/** Worker consent · GET/PUT/DELETE /api/worker/consent. Applies to the signed-in worker only. */
export type ConsentScope = 'heat_alerts' | 'check_in' | 'symptom_report' | 'wearable';
export type WorkerConsent = {
  person_id: string;
  language: string;
  consented_at: string | null;
  scopes: ConsentScope[];
};

/** Worker data · GET /api/worker/data. The signed-in worker's own records, no clinical notes. */
export type WorkerDataExport = {
  person_id: string;
  generated_at: string;
  consent: WorkerConsent;
  check_ins: Array<{ at: string; location_id: string }>;
  reports: Array<{ at: string; kind: string }>;
  plan_intervals: Array<{ kind: string; zone_id: string; starts_at: string; ends_at: string }>;
  note: string;
};

/** Branding · GET /api/brand (all), POST /api/brand/check, PUT /api/brand (admin only, confirm value PUBLISH sent after the confirmation modal). */
export type BrandSettings = {
  version: number;
  published_at: string | null;
  published_by: string | null;
  platform: BrandPalette | null;
  mobile: BrandPalette | null;
};
export type BrandCheck = { id: 'format' | 'contrast' | 'signal'; ok: boolean; label: string };
export type BrandPalette = { name: string; primary: string; on_primary: string; logo_text: string; rail_tint: boolean };

/** Site heat conditions · GET /api/case/conditions. Risk-core replay or forecast; never a local measurement. */
export type ConditionsHour = { hour: string; temperature_c: number; wbgt_c: number; relative_humidity_pct?: number | null; wet_bulb_c?: number | null; twl_sun_wm2: number; twl_zone_sun: string; twl_shade_wm2: number; twl_zone_shade: string; band_sun: string; midday_break_minutes: number; withdrawal_limit: string; data_issue: string };
export type SiteConditions =
  | { status: 'ok'; site: string; date: string; source: string; kind: 'replay' | 'forecast'; clock_hour: string; current: ConditionsHour | null;
      summary: { max_temperature_c: number; max_wbgt_c: number; min_twl_sun_wm2: number; worst_band: string; hours_high_zone_sun: number; midday_break: string; heat_programme_required: boolean; data_issues: number };
      hourly: ConditionsHour[]; zone_thresholds_wm2: { high_below: number; low_from: number }; citation: Array<{ cite: string; url: string | null }>; rules_version: string }
  | { status: 'unavailable'; site: string; date: string; message: string };

export type RiskBand = 'green' | 'amber' | 'red' | 'emergency';
export type RiskInputs = { hour: string; site: string; weather: 'ok' | 'unavailable'; local_reading: 'used' | 'lost' | 'none'; rules_version: string; squad?: string; sensor?: string };
/** GET /api/case/crew-risk: supervisors and responders. Band and action only, never the reasons. */
export type CrewRisk = {
  inputs: RiskInputs;
  crew: { band: RiskBand; at_or_above_amber: number; total: number; counts: Record<RiskBand, number> };
  workers: Array<{ person_id: string; band: RiskBand; action: string; needs_rest: boolean; check_in_person: boolean }>;
};
/** GET /api/worker/risk: the signed-in worker's own band, with the reasons only they see. */
export type OwnRisk = {
  inputs: RiskInputs; person_id: string; band: RiskBand; twl_wm2: number | null; zone: string | null;
  factors: string[]; missing_inputs: string[]; special_controls: boolean; may_work_here: boolean; work_rest: string | null; action: string;
};
