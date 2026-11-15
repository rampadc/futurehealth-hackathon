/**
 * Outbox for worker actions made without a network (wireframe P7). Only a worker's own
 * check-in and "I feel unwell" report are queued: supervisor decisions are never replayed
 * later from a stale screen. Each entry keeps its command id, and the backend treats a
 * repeated command id as a replay, so a send that half-succeeded cannot record twice.
 */
export const QUEUEABLE = new Set(['checkin', 'report']);

export type Queued = { command_id: string; action: string; payload: Record<string, unknown>; queued_at: string };

const key = (personId: string) => `hs-outbox:${personId}`;

export function readOutbox(personId: string | undefined): Queued[] {
  if (!personId) return [];
  try { return JSON.parse(localStorage.getItem(key(personId)) ?? '[]') as Queued[]; } catch { return []; }
}

export function writeOutbox(personId: string, entries: Queued[]) {
  try {
    if (entries.length) localStorage.setItem(key(personId), JSON.stringify(entries));
    else localStorage.removeItem(key(personId));
  } catch { /* Storage blocked: the entry stays in memory for this page only. */ }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A fetch that never reached the server (as opposed to an HTTP error response). */
export const isNetworkError = (error: unknown) => error instanceof TypeError;
