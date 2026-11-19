import { useEffect, useId, useRef, useState } from 'react';
import { tr } from '../i18n';
import type { CaseView } from '../live';
import { nameOf as personnelName } from '../replay';
import { navigate } from '../router';
import { ADMIN, PERSONAS, type StoryEvent } from '../story';
import { DEVICE_INFO, screensFor, type Device } from '../screens/registry';
import { time } from '../screens/data';

const nameOf = (id: string) => id === 'system' ? 'System' : [...PERSONAS, ADMIN].find(p => p.id === id)?.name ?? personnelName(id);

/** Workers see only crew-wide instructions, never another worker's reports or health records. */
const WORKER_EVENTS: Record<string, { key: string; screen: string }> = {
  issue: { key: 'nt.ev.issue', screen: 'now' },
  stop: { key: 'nt.ev.stop', screen: 'now' },
  assign: { key: 'nt.ev.assign', screen: 'my-plan' },
};
/** Worker tasks shown as notifications. Reporting symptoms is always available, so it is not a notification. */
const WORKER_TASKS: Record<string, string> = { checkin: 'p6.cta' };

/** Event ids that differ from the case action that records them. */
const EVENT_ACTION: Record<string, string> = { escalate: 'escalation_followup' };

export type Notice = { id: string; text: string; at?: string; due?: string; action: boolean; path: string };

const isWorker = (personId: string) => personId.startsWith('C') && personId !== 'C01';

/** The screen where a person handles a case action: this device first, then any other device they use. */
export function pathForAction(device: Device, personId: string, action: string): string | null {
  const devices = [device, ...(Object.keys(DEVICE_INFO) as Device[]).filter(d => d !== device && d !== 'kiosk')];
  for (const d of devices) {
    const screen = screensFor(d).find(s => s.commands.includes(action) && s.personas.includes(personId) && s.component);
    if (screen) return `/${d}/${screen.id}`;
  }
  return null;
}

const homeOf = (device: Device, personId: string) => {
  const screen = screensFor(device).find(s => !s.group && s.personas.includes(personId));
  return `/${device}/${screen?.id ?? ''}`;
};

/**
 * Notifications for the signed-in person, from the case record: their own open tasks, then case events
 * recorded by other people. Workers receive crew-wide instructions only.
 */
export function noticesFor(view: CaseView, personId: string, device: Device, lang: string): Notice[] {
  const worker = isWorker(personId);
  const home = homeOf(device, personId);
  const tasks: Notice[] = view.tasks
    .filter(t => t.actor_id === personId && t.status === 'ready' && (!worker || WORKER_TASKS[t.action]))
    .map(t => ({
      id: `task:${t.action}`,
      text: worker ? tr(WORKER_TASKS[t.action], lang).text : t.label,
      due: t.due_at ?? undefined,
      action: true,
      path: pathForAction(device, personId, t.action) ?? home,
    }));
  const events: Notice[] = (view.story?.events ?? [])
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.actorId !== personId && (!worker || WORKER_EVENTS[event.id]))
    .map(({ event, index }) => {
      const workerEvent = worker ? WORKER_EVENTS[event.id] : undefined;
      const mine = workerEvent ? `/worker/${workerEvent.screen}` : pathForAction(device, personId, EVENT_ACTION[event.id] ?? event.id);
      return {
        id: `event:${index}:${event.id}`,
        text: workerEvent ? tr(workerEvent.key, lang).text : event.title,
        at: event.occurred_at,
        action: false,
        path: mine ?? home,
      };
    })
    .reverse();
  return [...tasks, ...events];
}

const SEEN_KEY = (caseId: string, personId: string) => `heat-notifications-seen:${caseId}:${personId}`;
function readSeen(key: string): Set<string> {
  try { const raw = localStorage.getItem(key); return new Set(raw ? JSON.parse(raw) as string[] : []); } catch { return new Set(); }
}
function writeSeen(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* The count still works for this page view. */ }
}

/** Bell in the title bar: the count of unseen notifications, and a list that opens the related screen. */
export function NotificationBell({ view, personId, device, lang }: { view: CaseView; personId: string; device: Device; lang: string }) {
  const notices = noticesFor(view, personId, device, lang);
  const key = SEEN_KEY(view.case_id, personId);
  const [seen, setSeen] = useState(() => readSeen(key));
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => { setSeen(readSeen(key)); }, [key]);
  const unseen = notices.filter(n => !seen.has(n.id)).length;
  const markSeen = () => { const next = new Set([...seen, ...notices.map(n => n.id)]); setSeen(next); writeSeen(key, next); };
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const t = (k: string) => tr(k, lang).text;
  const label = unseen ? `${t('nt.title')}: ${unseen} ${t('nt.new')}` : t('nt.title');
  return <div className="hs-bell" ref={root} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button type="button" className="hs-bell-button" aria-label={label} title={label} aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (!open) markSeen(); setOpen(!open); }}>
      <svg className="hs-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" /><path d="M10 21h4" /></svg>
      {unseen > 0 && <span className="hs-bell-count" aria-hidden="true">{unseen > 9 ? '9+' : unseen}</span>}
    </button>
    {open && <div className="hs-bell-panel" id={panelId} role="region" aria-label={t('nt.title')} lang={lang}>
      <p className="hs-label">{t('nt.title')}</p>
      {notices.length ? <ul>{notices.map(n => <li key={n.id} data-action={n.action || undefined}>
        <button type="button" className="hs-bell-item" onClick={() => { setOpen(false); navigate(n.path); }}>
          {n.action && <span className="hs-bell-tag">{t('nt.action')}</span>}
          <span className="hs-bell-text">{n.text}</span>
          {(n.at || n.due) && <span className="hs-bell-time">{n.at ? time(n.at) : `${t('nt.due')} ${time(n.due)}`}</span>}
        </button>
      </li>)}</ul> : <p className="hs-bell-time">{t('nt.empty')}</p>}
    </div>}
  </div>;
}

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' });
const STAMP = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dayOf = (iso: string) => DAY.format(new Date(iso));

/** Supervisor web: today's case record as a date and time log, newest first, in an expandable section. */
export function ActivityLog({ view }: { view: CaseView }) {
  const today = dayOf(view.clock);
  const entries = (view.story?.events ?? []).filter((e): e is StoryEvent & { occurred_at: string } => !!e.occurred_at && dayOf(e.occurred_at) === today).reverse();
  return <details className="hs-log">
    <summary>Activity log · {today} <span className="hs-muted">({entries.length} {entries.length === 1 ? 'entry' : 'entries'})</span></summary>
    {entries.length ? <ol className="hs-log-list" tabIndex={0} aria-label={`Activity log for ${today}`}>
      {entries.map((e, index) => <li key={`${index}-${e.id}`}>
        <time dateTime={e.occurred_at}>{today} {STAMP.format(new Date(e.occurred_at))} GST</time>
        <span><b>{nameOf(e.actorId)}</b> · {e.title}</span>
      </li>)}
    </ol> : <p className="hs-muted">No actions recorded today.</p>}
  </details>;
}
