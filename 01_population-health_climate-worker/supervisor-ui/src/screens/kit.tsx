import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { taskReason } from '../copy';
import { simplePayload } from '../commands';
import type { CaseSession } from '../session';
import { progress, taskFor, time } from './data';
import { nameOf } from '../replay';
import { initialsOf, photoUrl, usePhotos } from '../people';
import { Icon, iconFor, StatusIcon, type IconName } from '../shared/icons';
import './screens.css';

/**
 * Issued Sheet building blocks for the wireframe screens. Plain elements and token CSS
 * (`screens.css`); every component works in day, glare and night themes and mirrors in RTL.
 */

type Tone = 'red' | 'amber' | 'ok' | 'black' | undefined;

export function Head({ kicker, title, sub }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return <header className="hs-head">
    {kicker && <p className="hs-label">{kicker}</p>}
    <h1 id="hs-title">{title}</h1>
    {sub && <p className="hs-muted">{sub}</p>}
  </header>;
}

export function Hero({ children }: { children: ReactNode }) {
  return <div className="hs-hero" role="group" aria-label="Summary">{children}</div>;
}

export function Metric({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return <div className="hs-metric" data-tone={tone}>
    <span className="hs-label">{label}</span>
    <strong className="hs-readout">{value}</strong>
    {sub && <span className="hs-small">{sub}</span>}
  </div>;
}

export function Section({ title, children, id, icon, tone }: { title: ReactNode; children: ReactNode; id?: string; icon?: IconName; tone?: 'red' }) {
  const auto = useId();
  const heading = id ?? auto;
  const glyph = icon ?? iconFor(title);
  return <section className="hs-section" data-tone={tone} aria-labelledby={heading}>
    <div className="hs-section-head"><h2 id={heading}>{glyph && <Icon name={glyph} />}{title}</h2></div>
    {children}
  </section>;
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className="hs-list" aria-label={label}>{children}</ul>;
}

export function Row({ title, detail, badge, onClick, lead }: { title: ReactNode; detail?: ReactNode; badge?: ReactNode; onClick?: () => void; lead?: ReactNode }) {
  const body = <>
    {lead && <span className="hs-lead">{lead}</span>}
    <span className="hs-row-text"><span className="hs-row-title">{title}</span>{detail && <span className="hs-small hs-muted">{detail}</span>}</span>
    {badge && <span className="hs-row-badge">{badge}</span>}
  </>;
  return <li className="hs-row">{onClick ? <button type="button" className="hs-row-body" onClick={onClick}>{body}<span aria-hidden="true" className="hs-chev">›</span></button> : <div className="hs-row-body">{body}</div>}</li>;
}

export type BadgeTone = 'done' | 'wait' | 'over' | 'muted' | 'plan';
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className="hs-badge" data-tone={tone}>{children}</span>;
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
/**
 * Round crew photo (ui_design_system section 26). Decorative: the name is always written
 * beside it, so screen readers skip it. Falls back to initials if there is no photo or it fails.
 */
export function Avatar({ id, size, excluded }: { id: string; size?: AvatarSize; excluded?: boolean }) {
  usePhotos();
  const src = photoUrl(id);
  const [failed, setFailed] = useState<string | null>(null);
  const photo = !!src && failed !== src;
  // Initials are drawn by CSS (attr), so they never leak into the row's accessible text.
  return <span className="hs-avatar" data-size={size} data-excluded={excluded || undefined} data-person={id} data-initials={photo ? undefined : initialsOf(id)} aria-hidden="true">
    {photo && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />}
  </span>;
}

/** Photo + name, for sentences, table cells and title bars. */
export function Person({ id, size = 'xs', children, excluded }: { id: string; size?: AvatarSize; children?: ReactNode; excluded?: boolean }) {
  return <span className="hs-person"><Avatar id={id} size={size} excluded={excluded} /><span>{children ?? nameOf(id)}</span></span>;
}

/** Overlapping crew faces: the first four, then a count. */
export function Avatars({ ids, size = 'sm', max = 4 }: { ids: string[]; size?: AvatarSize; max?: number }) {
  if (!ids.length) return null;
  return <span className="hs-avatars" aria-hidden="true">
    {ids.slice(0, max).map(id => <Avatar key={id} id={id} size={size} />)}
    {ids.length > max && <span className="hs-avatars-more">+{ids.length - max}</span>}
  </span>;
}

export function Statement({ tone, children, source }: { tone?: Tone; children: ReactNode; source?: ReactNode }) {
  return <div className="hs-statement" data-tone={tone}><p className="hs-big">{children}</p>{source && <p className="hs-small">{source}</p>}</div>;
}

export function Note({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return <p className="hs-note" data-tone={tone}>{children}</p>;
}

/** AI or solver output that no person has recorded yet: tracing paper, dashed edge. */
export function Draft({ title = 'Proposal · not applied', children }: { title?: ReactNode; children: ReactNode }) {
  return <div className="hs-draft"><p className="hs-label">{title}</p>{children}</div>;
}

/** Rule output, labelled so it is never mistaken for an AI answer. */
export function Computed({ children = 'Computed by the site rules and solver · not AI' }: { children?: ReactNode }) {
  return <p className="hs-computed">⚙ {children}</p>;
}

const BAND_TONE: Record<string, string> = { green: 'low', amber: 'caution', red: 'high', emergency: 'high', unknown: 'unknown' };
/** Environmental band: a swatch with a word, never colour alone. */
export function Band({ band, label }: { band: string; label: string }) {
  return <span className="hs-band" data-band={BAND_TONE[band] ?? 'unknown'}><span className="hs-swatch" aria-hidden="true" />{label}</span>;
}

/** Task hold: a prohibition stamp, separate from the environmental band. */
export function Hold({ children = 'Heavy-work hold' }: { children?: ReactNode }) {
  return <span className="hs-hold">{children}</span>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="hs-empty"><p>{children}</p>{action}</div>;
}

export function CtaBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="hs-cta-bar">{children}{note && <p className="hs-small hs-muted">{note}</p>}</div>;
}

/** Status of one case action in words: recorded, ready, open with its owner, or what it waits for. */
export function taskLine(session: CaseSession, action: string) {
  const p = progress(session.caseView, action);
  if (!p.owner && !p.task) return 'Not part of this case';
  if (p.status === 'recorded') return `Recorded · ${nameOf(p.owner)}`;
  if (p.status === 'open') return `Open · ${nameOf(p.owner)}`;
  const due = p.task?.due_at ? ` · due ${time(p.task.due_at)}` : '';
  if (p.status === 'ready') return 'Ready for you' + due;
  return (taskReason(p.task?.reason) ?? 'Waiting for an earlier step') + due;
}

export function taskBadge(session: CaseSession, action: string) {
  const p = progress(session.caseView, action);
  if (p.status === 'recorded') return <Badge tone="done">Recorded</Badge>;
  if (p.status === 'ready') return p.task?.due_at && Date.parse(p.task.due_at) < Date.parse(session.caseView!.clock) ? <Badge tone="over">Overdue</Badge> : <Badge tone="plan">Ready</Badge>;
  if (p.status === 'open') return <Badge tone="wait">Open</Badge>;
  return <Badge tone="wait">Waiting</Badge>;
}

type ActionProps = {
  session: CaseSession;
  action: string;
  label: string;
  /** Defaults to the shared payload for actions without a form. */
  payload?: Record<string, unknown> | (() => Record<string, unknown>);
  primary?: boolean;
  danger?: boolean;
  /** Typed confirmation word for safety-critical records (e.g. REMOVED). */
  confirm?: { word: string; title: string; body: string };
  /** Press-and-hold confirmation, used on worker screens instead of typing. */
  hold?: string;
  disabled?: boolean;
};

/** A button that records one case action. Disabled unless the signed-in persona's task is ready. */
export function ActionButton({ session, action, label, payload, primary, danger, confirm, hold, disabled }: ActionProps) {
  const [asking, setAsking] = useState(false);
  const task = taskFor(session.caseView, action);
  const state = progress(session.caseView, action);
  const mine = task?.actor_id === session.person?.id;
  const ready = !!task && task.status === 'ready' && mine;
  const run = () => {
    if (!session.caseView) return;
    const body = typeof payload === 'function' ? payload() : payload ?? simplePayload(action, session.caseView) ?? {};
    void session.act(action, body);
  };
  const className = `hs-button${primary ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`;
  if (state.status === 'recorded') return <p className="hs-statusline"><StatusIcon status="ok" /> {label} · recorded</p>;
  const off = !ready || session.busy || disabled;
  return <div className="hs-action">
    {hold ? <HoldButton className={className} disabled={off} onConfirm={run} hint={hold}>{label}</HoldButton>
      : <button type="button" className={className} disabled={off} onClick={() => confirm ? setAsking(true) : run()}>{session.busy && ready ? 'Recording…' : label}</button>}
    {!ready && <p className="hs-small hs-muted">{mine ? taskLine(session, action) : state.owner ? <Person id={state.owner}>{`${nameOf(state.owner)} records this (${state.owner})`}</Person> : 'Not part of this case'}</p>}
    {confirm && asking && <TypedConfirm word={confirm.word} title={confirm.title} body={confirm.body} onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); run(); }} />}
  </div>;
}

/** Modal that asks for a typed word before a destructive or safety-critical record. */
export function TypedConfirm({ word, title, body, onConfirm, onCancel }: { word: string; title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => { input.current?.focus(); }, []);
  return <div className="hs-overlay" role="presentation" onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
    <div className="hs-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p>{body}</p>
      <form onSubmit={e => { e.preventDefault(); if (value.trim().toUpperCase() === word) onConfirm(); }}>
        <label className="hs-field"><span>Type <b>{word}</b> to confirm</span><input ref={input} value={value} onChange={e => setValue(e.target.value)} autoComplete="off" /></label>
        <div className="hs-dialog-actions">
          <button type="button" className="hs-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="hs-button is-primary" disabled={value.trim().toUpperCase() !== word}>Confirm</button>
        </div>
      </form>
    </div>
  </div>;
}

/** Press and hold (pointer, or Space/Enter) for `ms` to confirm. Replaces typing on worker screens. */
export function HoldButton({ children, onConfirm, disabled, className = 'hs-button is-primary', hint, ms = 900 }: { children: ReactNode; onConfirm: () => void; disabled?: boolean; className?: string; hint?: string; ms?: number }) {
  const timer = useRef<number | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const start = () => { if (disabled || timer.current) return; setHolding(true); timer.current = window.setTimeout(() => { timer.current = undefined; setHolding(false); onConfirm(); }, ms); };
  const stop = () => { window.clearTimeout(timer.current); timer.current = undefined; setHolding(false); };
  useEffect(() => stop, []);
  return <button type="button" className={`${className} hs-hold-button`} data-holding={holding || undefined} disabled={disabled}
    onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={stop} onClick={e => e.preventDefault()}>
    <span className="hs-hold-fill" aria-hidden="true" style={{ transitionDuration: holding ? `${ms}ms` : '0ms' }} />
    <span className="hs-hold-text">{children}{hint && <small>{hint}</small>}</span>
  </button>;
}

export function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  const name = useId();
  return <fieldset className="hs-choice"><legend>{legend}</legend>
    {options.map(([id, label]) => <label key={id} className="hs-option"><input type="radio" name={name} checked={value === id} onChange={() => onChange(id)} /> {label}</label>)}
  </fieldset>;
}

export function NoCase({ session }: { session: CaseSession }) {
  if (session.caseView) return null;
  return <Empty>There is no active case yet. The site presenter starts the shared case.</Empty>;
}
