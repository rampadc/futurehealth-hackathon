import type { CaseView } from './live';

export type ReadingKind = 'valid' | 'fault' | 'stale';

/** The reading the presenter injects. Faults and stale readings use the same t1 contract as a valid one. */
export function readingPayload(caseView: CaseView, twl: number, kind: ReadingKind) {
  const current = caseView.capture?.request.snapshot.readings[0];
  const measured = kind === 'stale' ? new Date(Date.parse(caseView.clock) - 10 * 60_000) : new Date(Date.parse(caseView.clock));
  const gst = (d: Date) => new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 19) + '+04:00';
  return { twl, sensor_id: current?.sensor_id ?? 't1', zone_id: current?.zone_id ?? 'civil_exposed', unit: 'W/m²', quality: kind === 'fault' ? 'invalid' : 'valid', measured_at: kind === 'stale' ? gst(measured) : caseView.clock, received_at: caseView.clock };
}

export type ScenarioPreset = {
  id: '02' | '06' | '08' | '09';
  title: string;
  detail: string;
  /** Advance the reset case to this time. Omitted when 08:00, the seed clock, is already correct. */
  clock?: string;
  reading?: { twl: number; kind: ReadingKind };
};

/**
 * Rehearsal setups. Each one resets the case, then sets the clock and the local reading.
 * People still record instructions, stops, headcount and symptom reports; these buttons never do.
 */
export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: '02', title: '02 Heat alert', detail: 'Valid civil reading, TWL 145 at 08:00. Heavy work is held. People still record the instruction, the stop and the headcount.' },
  { id: '06', title: '06 Sensor fault', clock: '2025-08-04T08:04:00+04:00', reading: { twl: 145, kind: 'fault' }, detail: 'The civil monitor reports an invalid reading. The hold stays; this reading cannot clear it.' },
  { id: '08', title: '08 Symptom context', clock: '2025-08-04T08:01:00+04:00', reading: { twl: 175, kind: 'valid' }, detail: 'Valid TWL 175, outside the heavy-work hold. The band does not decide a symptom report; the worker records that.' },
  { id: '09', title: '09 Stale evidence', clock: '2025-08-04T08:10:00+04:00', reading: { twl: 175, kind: 'stale' }, detail: 'An improved reading measured ten minutes earlier. Too old to clear the hold or authorise a restart.' },
];

type PresetApi = {
  reset: () => Promise<CaseView>;
  clock: (at: string) => Promise<CaseView>;
  signal: (payload: Record<string, unknown>) => Promise<CaseView>;
};

/** Reset, then the preset’s clock and reading, in that order. Returns the case after the last step. */
export async function applyPreset(preset: ScenarioPreset, api: PresetApi): Promise<CaseView> {
  let next = await api.reset();
  if (preset.clock) next = await api.clock(preset.clock);
  if (preset.reading) next = await api.signal(readingPayload(next, preset.reading.twl, preset.reading.kind));
  return next;
}
