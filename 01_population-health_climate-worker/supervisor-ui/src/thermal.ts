/** Display bands from archived ADOSH TG v4 July 2024, p5. Separate from Sandline's fictional <=150 heavy-work hold. */
export function thermalStatus(value: number | undefined, valid = true) {
  if (!valid || value === undefined || !Number.isFinite(value)) return { band: 'unknown', label: 'Unknown', intent: 'Obtain a fresh local reading. Keep existing holds in place.' };
  if (value < 115) return { band: 'red', label: 'High risk', intent: 'Apply strict work/rest controls; no lone or unacclimatised work.' };
  if (value < 140) return { band: 'amber', label: 'Caution', intent: 'Apply additional precautions; check workload, shade and acclimatisation.' };
  return { band: 'green', label: 'Low environmental risk', intent: 'Maintain hydration and self-paced work. Check task restrictions and active holds.' };
}

export type ThermalReadingValue = { twl: number; at: string };
export type ReadingReason = 'current' | 'missing' | 'failed' | 'future' | 'stale' | 'invalid';

/** Freshness applies to the local reading, independently of the environmental band and the site's heavy-work hold. */
export function assessThermalReading(reading: ThermalReadingValue | null | undefined, clock: string, sensorStatus: string) {
  const value = reading?.twl;
  const measuredAt = reading ? Date.parse(reading.at) : NaN;
  const now = Date.parse(clock);
  const ageMs = now - measuredAt;
  const numeric = typeof value === 'number' && Number.isFinite(value);
  let reason: ReadingReason;
  if (!reading) reason = 'missing';
  else if (!numeric || !Number.isFinite(measuredAt) || !Number.isFinite(now)) reason = 'invalid';
  else if (sensorStatus === 'failed') reason = 'failed';
  else if (sensorStatus !== 'serviceable') reason = 'invalid';
  else if (ageMs < 0) reason = 'future';
  else if (ageMs > 300_000) reason = 'stale';
  else reason = 'current';
  return {
    ...thermalStatus(value, reason === 'current'),
    reason,
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
    lastValue: numeric ? value : null,
    historical: numeric && (reason === 'stale' || reason === 'failed'),
  };
}
