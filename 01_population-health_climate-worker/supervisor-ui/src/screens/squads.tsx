import { useSyncExternalStore, type ReactNode } from 'react';
import type { CaseView } from '../live';
import { crew, heatNow, time } from './data';
import { Avatar, Badge, Band, List, Row } from './kit';
import { StatusIcon } from '../shared/icons';
import { TwlReadout } from './twl';

/**
 * Squads on the Sandline–Dune site. The live case covers the civil crew; the backend has no
 * other squads yet, so the formwork, steel-fixing and MEP squads are a fictional fixture that
 * lets supervisors compare squads side by side (as in ui_wireframes). Replace the fixture with
 * an API read when the backend models more than one squad.
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
    twl: 156, band: 'green', hold: false, status: 'Working · shade rotation', sensor: 't2', reading: { twl: 158, at: '15:05', fresh: true },
    alerts: 0, warnings: 1, actions: { open: 1, done: 2 }, responses: { done: 2, total: 2 }, headcount: '9 / 9', breakStart: '12:30', breakEnd: '15:00',
    checks: { done: 3, total: 3 }, members: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'],
    items: [{ title: 'Refill the deck water cooler', detail: 'Below 10 L at 08:12 · owner Karim · due 08:30', tone: 'warn' }] },
  { id: 'steel', name: 'Steel fixing crew', foreman: 'Faisal', foremanId: 'L04', loc: 'Laydown yard', shelter: 'Shelter B', size: 12,
    twl: 138, band: 'amber', estimated: true, hold: false, status: 'Caution controls · sensor offline', sensor: 't3', reading: { twl: 138, at: 'forecast', fresh: false },
    alerts: 1, warnings: 1, actions: { open: 2, done: 1 }, responses: { done: 1, total: 2 }, headcount: '12 / 12', breakStart: '12:30', breakEnd: '15:00',
    checks: { done: 5, total: 8 }, members: ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'],
    items: [{ title: 'Base station 2 offline · band raised one level', detail: 'No heartbeat since 07:52 · forecast in use', tone: 'error' }, { title: 'Extra water and rest every 45 min', detail: 'Caution band control · owner Faisal', tone: 'warn' }] },
  { id: 'mep', name: 'MEP crew', foreman: 'José', foremanId: 'M01', loc: 'Level 2 interior', shelter: 'Shelter B', size: 6,
    twl: 168, band: 'green', hold: false, status: 'Working · covered', sensor: 'm1', reading: { twl: 168, at: '15:00', fresh: true },
    alerts: 0, warnings: 0, actions: { open: 0, done: 1 }, responses: { done: 1, total: 1 }, headcount: '6 / 6', breakStart: '—', breakEnd: '—',
    checks: { done: 0, total: 0 }, members: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'], items: [] },
];

/** The civil crew from the live case, then the fixture squads. */
export function squadsFor(caseView: CaseView | null): Squad[] {
  if (!caseView) return FIXTURE;
  const heat = heatNow(caseView);
  const people = crew(caseView);
  const story = caseView.story;
  const open = caseView.tasks.filter(t => t.status === 'ready');
  const overdue = open.filter(t => t.due_at && Date.parse(t.due_at) <= Date.parse(caseView.clock));
  const recorded = caseView.tasks.filter(t => t.status === 'recorded').length;
  const civil: Squad = {
    id: 'civil', name: 'Civil crew', foreman: 'Huda', foremanId: 'C01', loc: 'Civil trench', shelter: 'Shelter A', size: people.length,
    twl: heat.reading?.twl ?? null, band: heat.band.band, hold: heat.heavyHeld,
    status: story.stopped ? 'Heavy work stopped' : story.issued ? 'Stop instructed' : 'Working', sensor: heat.reading?.sensor_id ?? 't1',
    reading: { twl: heat.reading?.twl ?? null, at: time(heat.reading?.measured_at), fresh: heat.freshness === 'current' },
    alerts: people.filter(p => p.excluded).length + overdue.length, warnings: open.length - overdue.length,
    actions: { open: open.length, done: recorded }, responses: { done: recorded, total: recorded + open.length },
    headcount: `${caseView.headcount?.confirmed_count ?? 0} / ${caseView.headcount?.expected_count ?? people.length}`,
    breakStart: '12:30', breakEnd: '15:00', checks: { done: 0, total: 8 }, members: people.map(p => p.id), items: [], live: true,
  };
  return [civil, ...FIXTURE];
}

/* The selected squad carries across screens for this tab. */
let selected = 'civil';
const listeners = new Set<() => void>();
export function useSquad(): [string, (id: string) => void] {
  const id = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => selected, () => selected);
  return [id, next => { selected = next; listeners.forEach(l => l()); }];
}

/** Squad selector: a card per squad with its foreman, alerts and warnings, plus per-screen facts. */
export function SquadPicker({ squads, lines }: { squads: Squad[]; lines?: (q: Squad) => ReactNode[] }) {
  const [current, choose] = useSquad();
  return <div className="hs-squads" role="radiogroup" aria-label="Squad">{squads.map(q =>
    <button key={q.id} type="button" role="radio" aria-checked={q.id === current} className="hs-sq" onClick={() => choose(q.id)}>
      <span className="hs-sq-h"><Avatar id={q.foremanId} size="md" /><span><b>{q.name}</b><small>{q.foreman}</small></span></span>
      <span className="hs-sq-n">
        <span data-zero={!q.alerts || undefined}>{q.alerts > 0 && <StatusIcon status="error" />}<b>{q.alerts}</b> alert{q.alerts === 1 ? '' : 's'}</span>
        <span data-zero={!q.warnings || undefined}>{q.warnings > 0 && <StatusIcon status="warn" />}<b>{q.warnings}</b> warning{q.warnings === 1 ? '' : 's'}</span>
      </span>
      {(lines ? lines(q) : [`${q.loc} · ${q.size} workers`]).map((l, i) => <span key={i} className="hs-sq-l">{l}</span>)}
    </button>)}</div>;
}

export const bandOf = (q: Squad) => <TwlReadout twl={q.twl} estimated={q.estimated} band={q.band} size={56} large />;

/** A fixture squad's open items, or a clear "nothing needs action". */
export function SquadItems({ squad }: { squad: Squad }) {
  if (!squad.items.length) return <p className="hs-statusline"><StatusIcon status="ok" /> Nothing needs action for the {squad.name.toLowerCase()}.</p>;
  return <List>{squad.items.map(i => <Row key={i.title} title={i.title} detail={i.detail} badge={<Badge tone={i.tone === 'error' ? 'over' : 'wait'}>{i.tone === 'error' ? 'Alert' : 'Warning'}</Badge>} />)}</List>;
}

/** Sensors and base stations on the site. t1 is the live case's sensor. */
export const SENSORS = [
  { id: 't1', type: 'Wet-bulb globe sensor', loc: 'Civil trench', squads: ['civil'], relay: 'Base station 1', status: 'Live', off: false },
  { id: 't2', type: 'Wet-bulb globe sensor', loc: 'Podium deck', squads: ['form'], relay: 'Base station 1', status: 'Live', off: false },
  { id: 't3', type: 'Wet-bulb globe sensor', loc: 'Laydown yard', squads: ['steel'], relay: 'Base station 2', status: 'Offline since 07:52', off: true },
  { id: 'm1', type: 'Handheld heat meter', loc: 'Level 2 interior', squads: ['mep'], relay: 'Manual · José', status: 'Read 15:00', off: false },
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
