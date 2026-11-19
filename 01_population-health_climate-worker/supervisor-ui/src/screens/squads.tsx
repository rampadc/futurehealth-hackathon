import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { live, type CaseView, type SensorState, type SiteSensors } from '../live';
import { thermalStatus } from '../thermal';
import { crew, heatNow, time } from './data';
import { Avatar, Badge, Band, List, Row } from './kit';
import { StatusIcon } from '../shared/icons';
import { TwlReadout } from './twl';
import { nameOf } from '../replay';
import siteSquads from '../../../demo/cross-scenario/site-squads.json';

/** Roster of each squad that is not on the case (shared with the backend's per-worker heat risk). */
const rosterOf = (id: string) => siteSquads.find(q => q.id === id)?.workers.map(w => w.id) ?? [];

/**
 * Squads on the Sandline–Dune site. The live case covers the civil crew; the backend has no
 * other squads on the case, so the formwork, steel-fixing and MEP squads' status is a fictional fixture
 * that lets supervisors compare squads side by side (as in ui_wireframes). Their rosters are in
 * demo/cross-scenario/site-squads.json, which the backend also reads for each worker's heat risk.
 */
export type Squad = {
  id: string; name: string; foreman: string; foremanId: string; loc: string; shelter: string; size: number;
  twl: number | null; band: string; estimated?: boolean; hold: boolean; status: string; sensor: string;
  reading: { twl: number | null; at: string; fresh: boolean };
  alerts: number; warnings: number; actions: { open: number; done: number }; responses: { done: number; total: number };
  headcount: string; breakStart: string; breakEnd: string; checks: { done: number; total: number };
  members: string[]; items: Array<{ title: string; detail: string; tone: 'error' | 'warn' }>; live?: boolean;
};

const FIXTURE: Squad[] = [
  { id: 'form', name: 'Formwork crew', foreman: 'Karim', foremanId: 'L02', loc: 'Podium deck', shelter: 'Shelter B', size: 9,
    twl: 156, band: 'green', hold: false, status: 'Working · shade rotation', sensor: 't2', reading: { twl: 158, at: '07:55', fresh: false },
    alerts: 0, warnings: 1, actions: { open: 1, done: 2 }, responses: { done: 2, total: 2 }, headcount: '9 / 9', breakStart: '12:30', breakEnd: '15:00',
    checks: { done: 3, total: 3 }, members: rosterOf('form'),
    items: [{ title: 'Refill the deck water cooler', detail: 'Below 10 L at 08:12 · owner Karim · due 08:30', tone: 'warn' }] },
  { id: 'steel', name: 'Steel fixing crew', foreman: 'Faisal', foremanId: 'L04', loc: 'Laydown yard', shelter: 'Shelter B', size: 12,
    twl: 138, band: 'amber', estimated: true, hold: false, status: 'Caution controls · sensor offline', sensor: 't3', reading: { twl: 138, at: 'forecast', fresh: false },
    alerts: 1, warnings: 1, actions: { open: 2, done: 1 }, responses: { done: 1, total: 2 }, headcount: '12 / 12', breakStart: '12:30', breakEnd: '15:00',
    checks: { done: 5, total: 8 }, members: rosterOf('steel'),
    items: [{ title: 'Base station 2 offline · band raised one level', detail: 'No heartbeat since 07:52 · forecast in use', tone: 'error' }, { title: 'Extra water and rest every 45 min', detail: 'Caution band control · owner Faisal', tone: 'warn' }] },
  { id: 'mep', name: 'MEP crew', foreman: 'José', foremanId: 'M01', loc: 'Level 2 interior', shelter: 'Shelter B', size: 6,
    twl: 168, band: 'green', hold: false, status: 'Working · covered', sensor: 'm1', reading: { twl: 168, at: '07:55', fresh: false },
    alerts: 0, warnings: 0, actions: { open: 0, done: 1 }, responses: { done: 1, total: 1 }, headcount: '6 / 6', breakStart: '—', breakEnd: '—',
    checks: { done: 0, total: 0 }, members: rosterOf('mep'), items: [] },
];

/* Site sensor settings for the current case hour (GET /api/case/site-sensors), shared by every screen in this tab. */
let siteSensors: SiteSensors | null = null;
const sensorListeners = new Set<() => void>();
const setSiteSensors = (next: SiteSensors | null) => { siteSensors = next; sensorListeners.forEach(l => l()); };
export const currentSiteSensors = () => siteSensors;

/** Keep the site sensor settings current while signed in. */
export function useSiteSensors(enabled: boolean, version?: number) {
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const load = () => live.siteSensors().then(v => { if (current && v && typeof v === 'object' && 'squads' in v) setSiteSensors(v); }).catch(() => { /* Keep the last known settings. */ });
    load();
    const timer = window.setInterval(load, 5_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [enabled, version]);
  return useSyncExternalStore(l => { sensorListeners.add(l); return () => { sensorListeners.delete(l); }; }, () => siteSensors, () => siteSensors);
}

const RAISE: Record<string, string> = { green: 'amber', amber: 'red', red: 'red', unknown: 'unknown' };
const STATE_LABEL: Record<SensorState, string> = { live: 'Live', stale: 'Reading stale', offline: 'Offline' };

/** A fixture squad at the current case hour: its sensor's TWL and state from the site settings. */
function withSensor(q: Squad, settings: SiteSensors): Squad {
  const twl = settings.squads[q.id]?.[q.sensor];
  const state = settings.sensors[q.sensor] ?? 'live';
  if (twl === undefined) return q;
  const lost = state !== 'live';
  const base = thermalStatus(twl).band;
  const band = lost ? RAISE[base] : base;
  const sensorItems = lost ? [{ title: `${q.sensor.toUpperCase()} ${state === 'offline' ? 'offline' : 'reading stale'} · band raised one level`, detail: state === 'offline' ? 'No valid reading · forecast in use' : 'Last reading over 5 minutes old · forecast in use', tone: 'error' as const }] : [];
  const items = [...sensorItems, ...q.items.filter(i => !/offline|stale/i.test(i.title) && (!/caution band/i.test(i.detail) || band !== 'green'))];
  const hour = `${String(settings.hour).padStart(2, '0')}:00`;
  return { ...q, twl, band, estimated: lost,
    status: lost ? `${band === 'green' ? 'Working' : 'Caution controls'} · sensor ${STATE_LABEL[state].toLowerCase()}` : band === 'red' ? 'High-risk controls' : band === 'amber' ? 'Caution controls' : q.status.replace(/^Caution controls · sensor offline$/, 'Working'),
    reading: { twl, at: lost ? state === 'stale' ? 'stale' : 'forecast' : hour, fresh: !lost },
    items, alerts: items.filter(i => i.tone === 'error').length, warnings: items.filter(i => i.tone === 'warn').length };
}

/** Sensors with their current state from the site settings. */
export function sensorsNow() {
  const settings = siteSensors;
  if (!settings) return SENSORS;
  return SENSORS.map(x => {
    // Base station 2 relays T3: it follows T3's state.
    const state = settings.sensors[x.id === 'bs2' ? 't3' : x.id];
    if (!state) return x;
    const twl = Object.values(settings.squads).map(by => by[x.id]).find(v => v !== undefined);
    return { ...x, off: state === 'offline', stale: state === 'stale', status: state === 'live' ? `Live${twl !== undefined && x.id !== 't1' ? ` · ${twl} W/m²` : ''}` : STATE_LABEL[state] };
  });
}

/** The civil crew from the live case, then the fixture squads. */
export function squadsFor(caseView: CaseView | null): Squad[] {
  const fixture = siteSensors ? FIXTURE.map(q => withSensor(q, siteSensors!)) : FIXTURE;
  if (!caseView) return fixture;
  const heat = heatNow(caseView);
  const people = crew(caseView);
  const story = caseView.story;
  const open = caseView.tasks.filter(t => t.status === 'ready');
  const overdue = open.filter(t => t.due_at && Date.parse(t.due_at) <= Date.parse(caseView.clock));
  const recorded = caseView.tasks.filter(t => t.status === 'recorded').length;
  // The civil crew's alerts and warnings, itemised: excluded workers and overdue actions are alerts; other open actions are warnings.
  const isOverdue = (t: (typeof open)[number]) => overdue.includes(t);
  const items: Squad['items'] = [
    ...people.filter(p => p.excluded).map(p => ({ title: `${p.name} excluded from heat work`, detail: 'Protective response · stays out of heat work', tone: 'error' as const })),
    ...overdue.map(t => ({ title: t.label, detail: `${nameOf(t.actor_id)} · overdue since ${time(t.due_at!)}`, tone: 'error' as const })),
    ...open.filter(t => !isOverdue(t)).map(t => ({ title: t.label, detail: `${nameOf(t.actor_id)}${t.due_at ? ` · due ${time(t.due_at)}` : ' · open'}`, tone: 'warn' as const })),
  ];
  const civil: Squad = {
    id: 'civil', name: 'Civil crew', foreman: 'Huda', foremanId: 'C01', loc: 'Civil trench', shelter: 'Shelter A', size: people.length,
    twl: heat.reading?.twl ?? null, band: heat.band.band, hold: heat.heavyHeld,
    status: story.stopped ? 'Heavy work stopped' : story.issued ? 'Stop instructed' : 'Working', sensor: heat.reading?.sensor_id ?? 't1',
    reading: { twl: heat.reading?.twl ?? null, at: time(heat.reading?.measured_at), fresh: heat.freshness === 'current' },
    alerts: people.filter(p => p.excluded).length + overdue.length, warnings: open.length - overdue.length,
    actions: { open: open.length, done: recorded }, responses: { done: recorded, total: recorded + open.length },
    headcount: `${caseView.headcount?.confirmed_count ?? 0} / ${caseView.headcount?.expected_count ?? people.length}`,
    breakStart: '12:30', breakEnd: '15:00', checks: { done: 0, total: 8 }, members: people.map(p => p.id), items, live: true,
  };
  return [civil, ...fixture];
}

/* The selected squad carries across screens for this tab. */
let selected = 'civil';
const listeners = new Set<() => void>();
export function useSquad(): [string, (id: string) => void] {
  const id = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => selected, () => selected);
  return [id, next => { selected = next; listeners.forEach(l => l()); }];
}

/* Crews hidden from the selector by the Filter, kept for this viewer on this device. */
const FILTER_KEY = 'hs-squad-filter';
const readHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]'); } catch { return []; } };
let hiddenSquads: string[] = readHidden();
const filterListeners = new Set<() => void>();
function setHidden(next: string[]) {
  hiddenSquads = next;
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* Private mode: keep it for this tab. */ }
  filterListeners.forEach(l => l());
}
function useHiddenSquads() {
  return useSyncExternalStore(l => { filterListeners.add(l); return () => { filterListeners.delete(l); }; }, () => hiddenSquads, () => hiddenSquads);
}

/** Filter: a dropdown of checkboxes choosing which crews the selector shows. At least one stays shown. */
function SquadFilter({ squads, hidden, onChange }: { squads: Squad[]; hidden: string[]; onChange: (id: string, show: boolean) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Close when the user clicks elsewhere or presses Escape.
  useEffect(() => {
    const close = (e: Event) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && ref.current?.open) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, []);
  const shown = squads.filter(q => !hidden.includes(q.id)).length;
  return <details className="hs-filter" ref={ref}>
    <summary className="hs-button">Filter{shown < squads.length ? ` · ${shown} of ${squads.length}` : ''}</summary>
    <fieldset className="hs-filter-menu"><legend>Crews to show</legend>
      {squads.map(q => { const on = !hidden.includes(q.id); return <label key={q.id}>
        <input type="checkbox" checked={on} disabled={on && shown === 1} onChange={e => onChange(q.id, e.target.checked)} />{q.name} <small>{q.foreman}</small>
      </label>; })}
    </fieldset>
  </details>;
}

/**
 * Squad selector: a card per squad with its foreman, alerts and warnings, plus per-screen facts.
 * Clicking anywhere on a card selects the squad. With `onItems`, the selected card's alert and
 * warning counts become a button that opens that squad's list. The cards scroll sideways as a
 * carousel, and Filter chooses which crews appear.
 */
export function SquadPicker({ squads: all, lines, onItems }: { squads: Squad[]; lines?: (q: Squad) => ReactNode[]; onItems?: (q: Squad) => void }) {
  const [current, choose] = useSquad();
  const hidden = useHiddenSquads();
  const squads = all.filter(q => !hidden.includes(q.id));
  const track = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  const measure = () => {
    const t = track.current;
    if (t) setEnds({ start: t.scrollLeft <= 1, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 1 });
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [squads.length]);
  // Keep the chosen crew in view when it changes.
  useEffect(() => { track.current?.querySelector('[aria-checked="true"]')?.closest('.hs-sq')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [current]);
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: 'smooth' });
  const filter = (id: string, show: boolean) => {
    const next = show ? hidden.filter(h => h !== id) : [...hidden, id];
    setHidden(next);
    // Hiding the chosen crew moves the choice to the first crew still shown.
    if (!show && id === current) { const first = all.find(q => !next.includes(q.id)); if (first) choose(first.id); }
  };
  return <div className="hs-squad-picker">
    <div className="hs-squad-bar">
      <span className="hs-label">Crews · {squads.length} of {all.length}</span>
      <span className="hs-grow" />
      {!(ends.start && ends.end) && <>
        <button type="button" className="hs-button hs-carousel-btn" aria-label="Previous crews" disabled={ends.start} onClick={() => page(-1)}>‹</button>
        <button type="button" className="hs-button hs-carousel-btn" aria-label="Next crews" disabled={ends.end} onClick={() => page(1)}>›</button>
      </>}
      <SquadFilter squads={all} hidden={hidden} onChange={filter} />
    </div>
    <div className="hs-squads" role="radiogroup" aria-label="Squad" ref={track} onScroll={measure}>{squads.map(q => {
    const selected = q.id === current;
    const counts = <>
      <span data-zero={!q.alerts || undefined}>{q.alerts > 0 && <StatusIcon status="error" />}<b>{q.alerts}</b> alert{q.alerts === 1 ? '' : 's'}</span>
      <span data-zero={!q.warnings || undefined}>{q.warnings > 0 && <StatusIcon status="warn" />}<b>{q.warnings}</b> warning{q.warnings === 1 ? '' : 's'}</span>
    </>;
    const opens = onItems && selected && q.alerts + q.warnings > 0;
    return <div key={q.id} className="hs-sq" data-checked={selected || undefined}>
      <button type="button" role="radio" aria-checked={selected} className="hs-sq-pick" onClick={() => choose(q.id)}>
        <span className="hs-sq-h"><Avatar id={q.foremanId} size="md" /><span><b>{q.name}</b><small>{q.foreman}</small></span></span>
      </button>
      {opens ? <button type="button" className="hs-sq-n hs-sq-open" onClick={() => onItems(q)} aria-label={`Show the ${q.name.toLowerCase()}’s ${q.alerts} alert${q.alerts === 1 ? '' : 's'} and ${q.warnings} warning${q.warnings === 1 ? '' : 's'}`}>{counts}</button>
        : <span className="hs-sq-n">{counts}</span>}
      {(lines ? lines(q) : [`${q.loc} · ${q.size} workers`]).map((l, i) => <span key={i} className="hs-sq-l">{l}</span>)}
    </div>;
  })}</div>
  </div>;
}

export const bandOf = (q: Squad) => <TwlReadout twl={q.twl} estimated={q.estimated} band={q.band} size={56} large />;

/** A fixture squad's open items, or a clear "nothing needs action". */
export function SquadItems({ squad }: { squad: Squad }) {
  if (!squad.items.length) return <p className="hs-statusline"><StatusIcon status="ok" /> Nothing needs action for the {squad.name.toLowerCase()}.</p>;
  return <List>{squad.items.map(i => <Row key={i.title} title={i.title} detail={i.detail} badge={<Badge tone={i.tone === 'error' ? 'over' : 'wait'}>{i.tone === 'error' ? 'Alert' : 'Warning'}</Badge>} />)}</List>;
}

/** Sensors and base stations on the site. t1 is the live case's sensor. */
export const SENSORS: Array<{ id: string; type: string; loc: string; squads: string[]; relay: string; status: string; off: boolean; stale?: boolean }> = [
  { id: 't1', type: 'Wet-bulb globe sensor', loc: 'Civil trench', squads: ['civil'], relay: 'Base station 1', status: 'Live', off: false },
  { id: 't2', type: 'Wet-bulb globe sensor', loc: 'Podium deck', squads: ['form'], relay: 'Base station 1', status: 'Live', off: false },
  { id: 't3', type: 'Wet-bulb globe sensor', loc: 'Laydown yard', squads: ['steel'], relay: 'Base station 2', status: 'Offline since 07:52', off: true },
  { id: 'm1', type: 'Handheld heat meter', loc: 'Level 2 interior', squads: ['mep'], relay: 'Manual · José', status: 'Read 07:55', off: false },
  { id: 'bs1', type: 'Base station', loc: 'Site cabin roof', squads: [], relay: 'LTE', status: 'Live', off: false },
  { id: 'bs2', type: 'Base station', loc: 'Laydown yard gate', squads: [], relay: 'LTE', status: 'Offline since 07:52', off: true },
  { id: 'k1', type: 'NFC check-in kiosk', loc: 'Shelter A', squads: ['civil'], relay: 'Site Wi-Fi', status: 'Live', off: false },
  { id: 'k2', type: 'NFC check-in kiosk', loc: 'Shelter B', squads: ['form', 'steel', 'mep'], relay: 'Site Wi-Fi', status: 'Live', off: false },
];
export const ZONES = [
  { id: 'trench', label: 'Civil trench', squads: ['civil'], kind: 'Exposed', x: 20, y: 150, w: 210, h: 90 },
  { id: 'deck', label: 'Podium deck', squads: ['form'], kind: 'Exposed · partial shade', x: 250, y: 40, w: 200, h: 110 },
  { id: 'yard', label: 'Laydown yard', squads: ['steel'], kind: 'Exposed', x: 470, y: 150, w: 210, h: 120 },
  { id: 'l2', label: 'Level 2 interior', squads: ['mep'], kind: 'Covered', x: 250, y: 170, w: 200, h: 100 },
  { id: 'wshop', label: 'Workshop', squads: [], kind: 'Covered · 6 places', x: 20, y: 40, w: 120, h: 80 },
  { id: 'sa', label: 'Shelter A', squads: ['civil'], kind: 'Cooled recovery', x: 150, y: 40, w: 80, h: 80, shelter: true },
  { id: 'sb', label: 'Shelter B', squads: ['form', 'steel', 'mep'], kind: 'Cooled recovery', x: 470, y: 40, w: 120, h: 90, shelter: true },
];
export const PINS: Record<string, [number, number]> = { t1: [120, 200], t2: [350, 90], t3: [600, 215], m1: [350, 225], bs1: [660, 70], bs2: [660, 255], k1: [190, 95], k2: [530, 95] };
export const TONE: Record<string, number> = { civil: 1, form: 2, steel: 3, mep: 4 };

/** The Planning Agent's friendly face and what it can help with. */
export function AgentIntro() {
  return <div className="hs-agent-intro">
    <svg className="hs-agent-face" viewBox="0 0 64 64" role="img" aria-label="Planning Agent">
      <circle cx="32" cy="36" r="22" fill="#FFD27A" stroke="currentColor" strokeWidth="2" />
      <path d="M10 30a22 22 0 0 1 44 0z" fill="#F2A900" stroke="currentColor" strokeWidth="2" /><path d="M6 30h52v5H6z" fill="#F2A900" stroke="currentColor" strokeWidth="2" /><path d="M28 9h8v10h-8z" fill="#F2A900" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="42" r="2.6" fill="currentColor" /><circle cx="40" cy="42" r="2.6" fill="currentColor" />
      <path d="M22 49c5 6 15 6 20 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="17" cy="48" r="3" fill="#F4A3A3" opacity=".6" /><circle cx="47" cy="48" r="3" fill="#F4A3A3" opacity=".6" />
    </svg>
    <div className="hs-callout"><b>Hi, I’m the Planning Agent.</b> Ask me in plain words. I can:
      <ul><li>explain why work stopped, or which rule applies to a squad</li><li>check whether a restart time is allowed</li><li>draft a work/rest plan, or a what-if for the crew</li><li>sum up a squad’s actions, readiness or headcount</li></ul>
      <small>I cite the tools I used. I never change a plan or a record; people do.</small></div>
  </div>;
}

/** A fixture squad's version of a screen: the selector, then that squad's own facts. */
export function OtherSquadScreen({ title, squad, squads, lines, children }: { title: string; squad: Squad; squads: Squad[]; lines?: (q: Squad) => ReactNode[]; children: ReactNode }) {
  return <div className="hs-screen">
    <header className="hs-head"><p className="hs-label">{title} · {squad.name}</p><h1 id="hs-title">{title}</h1><p className="hs-muted">{squad.loc} · foreman {squad.foreman} · {squad.status}</p></header>
    <SquadPicker squads={squads} lines={lines} />
    {children}
  </div>;
}
