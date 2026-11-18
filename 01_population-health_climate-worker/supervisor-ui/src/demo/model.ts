import type { CaseView, SensorState, SiteSettings } from '../live';
import { PERSONAS, ADMIN } from '../story';
import { screensFor, type Device } from '../screens/registry';
import { squadsFor } from '../screens/squads';
import { thermalStatus } from '../thermal';

/** Case window: 08:00 to 10:30 GST on 4 August 2025. */
export const DAY_START = '2025-08-04T08:00:00+04:00';
export const DAY_END = '2025-08-04T10:30:00+04:00';
export const WINDOW_MINUTES = (Date.parse(DAY_END) - Date.parse(DAY_START)) / 60_000;

export const minuteOf = (instant: number | string) => (Number(typeof instant === 'string' ? Date.parse(instant) : instant) - Date.parse(DAY_START)) / 60_000;
/** Case minute (0–149) to a GST timestamp the backend accepts. */
export function isoAt(minute: number) {
  const m = Math.max(0, Math.min(WINDOW_MINUTES - 1, Math.round(minute)));
  const total = 8 * 60 + m;
  return `2025-08-04T${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00+04:00`;
}
export const clockLabel = (minute: number) => { const t = 8 * 60 + Math.floor(minute); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export const SQUAD_NAMES: Record<string, string> = { civil: 'Civil crew', form: 'Formwork crew', steel: 'Steel fixing crew', mep: 'MEP crew' };
export const SENSOR_LABEL: Record<string, string> = { t1: 'T1 · Civil trench', t2: 'T2 · Podium deck', t3: 'T3 · Laydown yard', m1: 'M1 · Level 2 interior' };
export const STATE_LABEL: Record<SensorState, string> = { live: 'Live', stale: 'Stale', offline: 'Offline' };

/** Band colours shared by the grid, the map and the risk chips. */
export const BAND_COLOR: Record<string, string> = {
  green: 'var(--color-signal-green)', amber: 'var(--color-signal-yellow)', red: 'var(--color-signal-red)',
  emergency: '#5B1A8C', unknown: 'var(--color-pencil)',
};
export const BAND_TEXT: Record<string, string> = { green: '#fff', amber: 'var(--color-ink)', red: '#fff', emergency: '#fff', unknown: '#fff' };
export const BAND_LABEL: Record<string, string> = { green: 'Low risk', amber: 'Caution', red: 'High risk', emergency: 'Emergency', unknown: 'Unknown' };
export const twlBand = (twl: number | undefined) => thermalStatus(twl).band;

/** Site map zones, in a 1000 × 560 plan. */
export type MapZone = { id: string; label: string; kind: string; x: number; y: number; w: number; h: number; cooled?: boolean; tone?: number };
export const MAP_ZONES: MapZone[] = [
  { id: 'workshop', label: 'Workshop', kind: 'Covered · 6 places', x: 20, y: 20, w: 200, h: 180, cooled: true },
  { id: 'shelter_a', label: 'Shelter A', kind: 'Cooled recovery · civil', x: 240, y: 20, w: 220, h: 180, cooled: true, tone: 1 },
  { id: 'deck', label: 'Podium deck', kind: 'Exposed · formwork', x: 480, y: 20, w: 260, h: 180, tone: 2 },
  { id: 'shelter_b', label: 'Shelter B', kind: 'Cooled recovery · other squads', x: 760, y: 20, w: 220, h: 180, cooled: true },
  { id: 'civil_exposed', label: 'Civil trench', kind: 'Exposed · heavy trench work', x: 20, y: 220, w: 440, h: 180, tone: 1 },
  { id: 'l2', label: 'Level 2 interior', kind: 'Covered · MEP', x: 480, y: 220, w: 260, h: 180, tone: 4 },
  { id: 'yard', label: 'Laydown yard', kind: 'Exposed · steel fixing', x: 760, y: 220, w: 220, h: 320, tone: 3 },
  { id: 'office', label: 'Site office', kind: 'Sandline team', x: 20, y: 420, w: 300, h: 120, cooled: true },
  { id: 'welfare', label: 'Welfare and first aid', kind: 'Cooled', x: 340, y: 420, w: 400, h: 120, cooled: true },
];
export const SENSOR_PINS: Record<string, [number, number, string]> = {
  t1: [430, 250, 'zone'], t2: [710, 50, 'zone'], t3: [950, 250, 'zone'], m1: [710, 250, 'zone'],
  k1: [430, 50, 'kiosk'], k2: [950, 50, 'kiosk'], bs1: [290, 450, 'base'], bs2: [950, 510, 'base'],
};
/** Fixture squads work in their own zone. */
const SQUAD_ZONE: Record<string, string> = { form: 'deck', steel: 'yard', mep: 'l2' };
/** Sandline staff and the employer's manager. Location is a site fixture. */
const STAFF_ZONE: Record<string, string> = { P01: 'office', P02: 'office', P03: 'office', P04: 'office', P05: 'office', P06: 'welfare', P07: 'workshop', P08: 'workshop', P09: 'office', P10: 'office' };

export type MapPerson = { id: string; zone: string; squad: string | null; caseWorker: boolean; persona: boolean };

/** Everyone on site at the case clock: the civil crew from the case snapshot, the fixture squads and the staff. */
export function peopleOnSite(caseView: CaseView | null): MapPerson[] {
  const personas = new Set([...PERSONAS, ADMIN].map(p => p.id));
  const snapshot = caseView?.request?.snapshot ?? caseView?.capture?.request.snapshot;
  const civil = (snapshot?.workers ?? []).map(w => ({ id: w.person_id, zone: MAP_ZONES.some(z => z.id === w.location_id) ? w.location_id : 'civil_exposed', squad: 'civil', caseWorker: true, persona: personas.has(w.person_id) }));
  // The foreman stays with most of the crew.
  const counts = civil.reduce<Record<string, number>>((all, p) => ({ ...all, [p.zone]: (all[p.zone] ?? 0) + 1 }), {});
  const crewZone = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'civil_exposed';
  const foreman = { id: 'C01', zone: crewZone, squad: 'civil', caseWorker: false, persona: true };
  const fixture = squadsFor(null).flatMap(q => q.members.map(id => ({ id: `${q.id}:${id}`, zone: SQUAD_ZONE[q.id] ?? 'yard', squad: q.id, caseWorker: false, persona: false })));
  const staff = Object.entries(STAFF_ZONE).map(([id, zone]) => ({ id, zone, squad: null, caseWorker: false, persona: personas.has(id) }));
  return [foreman, ...civil, ...fixture, ...staff];
}

/** Dot positions inside a zone, filling rows below the zone label. */
export function layoutIn(zone: MapZone, index: number) {
  const step = 26, top = zone.y + 52, left = zone.x + 18;
  // Keep the right 64 px of a zone for its sensor pin.
  const perRow = Math.max(1, Math.floor((zone.w - 24 - 64) / step));
  return [left + (index % perRow) * step, top + Math.floor(index / perRow) * step] as const;
}

/** Each persona's own device: the foreman on the site phone, workers on the worker phone, everyone else on the web. */
export function homeDevice(id: string): Device {
  if (id === 'C01') return 'site';
  if (id === 'C05' || id === 'C08') return 'worker';
  return 'web';
}
export const devicesFor = (id: string): Device[] => (['web', 'site', 'worker', 'kiosk'] as Device[]).filter(d => screensFor(d).some(s => s.personas.includes(id)));
export const DEVICE_LABEL: Record<Device, string> = { web: 'Supervisor web', site: 'Site phone', worker: 'Worker phone', kiosk: 'Shelter kiosk' };

/** Open a persona's screens in their own window, signed in as that persona. */
export function openPersona(id: string, device: Device = homeDevice(id)) {
  const phone = device === 'site' || device === 'worker';
  const features = phone ? 'popup,width=430,height=900' : device === 'kiosk' ? 'popup,width=1024,height=768' : 'popup,width=1440,height=920';
  return window.open(`/${device}?persona=${encodeURIComponent(id)}`, `heat-${id}-${device}`, features);
}

/** Cell value changes from the scenario defaults, for the "edited" marks. */
export const isEdited = (settings: SiteSettings, defaults: SiteSettings, squad: string, sensor: string, hour: number) =>
  settings.twl[squad]?.[sensor]?.[String(hour)] !== defaults.twl[squad]?.[sensor]?.[String(hour)];
