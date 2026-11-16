import { accessGeneration } from './accessGeneration';
import { tabSessionHeader } from './tabSession';

/**
 * Outbox for worker actions made without a network (worker offline state). Only a worker's own
 * check-in and "I feel unwell" report are queued: supervisor decisions are never replayed
 * later from a stale screen. Each entry keeps its command id, and the backend treats a
 * repeated command id as a replay, so a send that half-succeeded cannot record twice.
 */
export const QUEUEABLE = new Set(['checkin', 'report']);

export type Queued = { command_id: string; case_id: string; action: string; payload: Record<string, unknown>; queued_at: string };

export const outboxScope = (personId: string) => `hs-outbox:${accessGeneration()}:${tabSessionHeader()['X-Heat-Tab-ID']}:${personId}`;

export function readOutbox(scope: string | undefined): Queued[] {
  if (!scope) return [];
  try {
    const entries = JSON.parse(localStorage.getItem(scope) ?? '[]') as unknown;
    return Array.isArray(entries) ? entries.filter((e): e is Queued => !!e && typeof e === 'object' && typeof e.case_id === 'string' && typeof e.command_id === 'string' && QUEUEABLE.has(e.action)) : [];
  } catch { return []; }
}

export function writeOutbox(scope: string, entries: Queued[]) {
  try {
    if (entries.length) localStorage.setItem(scope, JSON.stringify(entries));
    else localStorage.removeItem(scope);
  } catch { /* Storage blocked: the entry stays in memory for this page only. */ }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A fetch that never reached the server (as opposed to an HTTP error response). */
export const isNetworkError = (error: unknown) => error instanceof TypeError;
