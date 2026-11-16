import { useEffect, useState } from 'react';
import type { CaseView } from './live';

/** Display only. Commands are evaluated against server time. */
export function liveInstant(view: CaseView, receivedAt: number, now = Date.now()): number {
  if (view.time?.mode !== 'elapsed' || view.time.status !== 'running') return Date.parse(view.clock);
  return Math.min(Date.parse(view.time.ends_at), Date.parse(view.clock) + Math.max(0, now - receivedAt));
}

function useLiveInstant(view: CaseView): number {
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setReceivedAt(Date.now()); }, [view.time?.server_now, view.version]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(id); }, []);
  return liveInstant(view, receivedAt, now);
}

export function LiveClock({ view }: { view: CaseView }) {
  const instant = useLiveInstant(view);
  const at = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(instant);
  const recoveryAt = view.headcount?.confirmed_at;
  const rest = recoveryAt ? Math.max(0, Math.ceil((Date.parse(recoveryAt) + 6 * 60_000 - instant) / 1_000)) : null;
  return <span role="timer">{at} GST{view.time?.mode === 'elapsed' && ` · ${view.time.status === 'running' ? 'live' : view.time.status}`}{rest !== null && rest > 0 && ` · ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')} elapsed recovery remaining (observation and authorization still required)`}</span>;
}

/** Visual reminder only; the server decides whether an approval is still timely. */
export function ApprovalCountdown({ view, deadline }: { view: CaseView; deadline: string }) {
  const remaining = Math.max(0, Math.ceil((Date.parse(deadline) - useLiveInstant(view)) / 1_000));
  return <span role="timer">{remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left to review` : 'Review window expired'}</span>;
}
