import { useEffect, useRef, useState } from 'react';
import { copy } from './copy';
import { ApiError, live, type CaseView } from './live';
import type { Persona } from './story';
import { isReady } from './shared/ui';
import { isNetworkError, isOffline, QUEUEABLE, outboxScope, readOutbox, writeOutbox, type Queued } from './offline';
import { establishTabId, rotateTabId } from './tabSession';
import { ACCESS_GENERATION_KEY } from './accessGeneration';

type Options = { onSignedIn?: () => void; onSignedOut?: () => void };

/**
 * Persona session and live case state, shared by every shell (desktop, site, worker, kiosk).
 * Polls the live case while signed in; every request carries this tab's identity.
 */
export function useCaseSession({ onSignedIn, onSignedOut }: Options = {}) {
  const [person, setPerson] = useState<Persona | null>(null);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actionError = useRef(false);
  const [feedback, setFeedback] = useState('');
  const requestNumber = useRef(0);
  const activePersonId = useRef<string | null>(null);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const flushing = useRef(false);

  const refreshCase = async (expectedCaseId?: string) => {
    const current = ++requestNumber.current;
    const expectedPersonId = activePersonId.current;
    try {
      const next = await live.case();
      if (current !== requestNumber.current || expectedPersonId !== activePersonId.current) return false;
      if (next?.viewer_id && activePersonId.current && next.viewer_id !== activePersonId.current) {
        await rotateTabId();
        activePersonId.current = null; setPerson(null); setCaseView(null);
        setError('This tab identity changed. Choose your persona again.');
        return false;
      }
      if (current === requestNumber.current) { setCaseView(next); if (!actionError.current) setError(''); }
      return !expectedCaseId || next?.case_id === expectedCaseId;
    } catch (cause) {
      if (current !== requestNumber.current || expectedPersonId !== activePersonId.current) return false;
      if (cause instanceof ApiError && cause.status === 401) { actionError.current = false; activePersonId.current = null; setPerson(null); setCaseView(null); }
      if (current === requestNumber.current && !actionError.current) setError(cause instanceof Error ? cause.message : copy.loadError);
      return false;
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await establishTabId();
        const session = await live.session();
        if (!active) return;
        activePersonId.current = session.person?.id ?? null;
        const currentCase = session.person ? await live.case() : null;
        if (currentCase?.viewer_id && session.person && currentCase.viewer_id !== session.person.id) {
          await rotateTabId(); activePersonId.current = null;
          if (active) { setPerson(null); setCaseView(null); setError('This tab identity changed. Choose your persona again.'); }
        } else if (active) { setPerson(session.person); setCaseView(currentCase); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : copy.loadError);
      } finally { if (active) setInitialising(false); }
    })();
    return () => { active = false; requestNumber.current++; };
  }, []);

  useEffect(() => {
    if (!person) return;
    const polling = window.setInterval(() => { void refreshCase(); }, 5_000);
    const focus = () => { void refreshCase(); };
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(polling); window.removeEventListener('focus', focus); };
  }, [person?.id]);

  const signIn = async (selected: Persona) => {
    requestNumber.current++;
    actionError.current = false;
    setBusy(true); setError('');
    try {
      const result = await live.signIn(selected.id);
      activePersonId.current = result.person.id;
      setPerson(result.person); onSignedIn?.();
      await refreshCase();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    requestNumber.current++;
    actionError.current = false;
    setBusy(true); setError('');
    try {
      await live.signOut();
      requestNumber.current++; activePersonId.current = null; setPerson(null); setCaseView(null); setFeedback(''); onSignedOut?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign out'); }
    finally { setBusy(false); }
  };

  const queue = (entry: Queued) => {
    if (!person) return;
    const scope = outboxScope(person.id);
    const next = [...readOutbox(scope).filter(e => e.action !== entry.action || e.case_id !== entry.case_id), entry];
    writeOutbox(scope, next); setOutbox(next);
    setFeedback('Saved on this phone. It will send when the network returns.');
  };

  /** Send queued worker actions once the network is back. Stops at the first network failure. */
  const flush = async () => {
    if (!person || flushing.current || isOffline()) return;
    const scope = outboxScope(person.id);
    const pending = readOutbox(scope);
    if (!pending.length) return;
    flushing.current = true;
    let remaining = [...pending];
    let stale = 0;
    let sent = 0;
    try {
      for (const entry of pending) {
        if (scope !== outboxScope(person.id) || activePersonId.current !== person.id) break;
        const current = await live.case();
        if (scope !== outboxScope(person.id) || activePersonId.current !== person.id) break;
        if (current?.viewer_id && current.viewer_id !== person.id) {
          await rotateTabId(); activePersonId.current = null;
          setPerson(null); setCaseView(null); setError('This tab identity changed. Choose your persona again.');
          break;
        }
        if (!current || entry.case_id !== current.case_id) {
          stale++;
          remaining = remaining.filter(e => e.command_id !== entry.command_id);
          continue;
        }
        const task = current?.tasks.find(t => t.action === entry.action && t.actor_id === person.id);
        // Not open yet (an earlier step is missing): keep it for the next flush.
        if (current && task?.status === 'waiting') continue;
        try {
          if (current && task && task.status === 'ready') { await live.command(current, entry.action, entry.payload, entry.command_id); sent++; }
        } catch (cause) {
          if (isNetworkError(cause)) break;
          actionError.current = true;
          setError(`A saved ${entry.action === 'report' ? 'report' : 'check-in'} could not be sent: ${cause instanceof Error ? cause.message : 'unknown error'}`);
        }
        remaining = remaining.filter(e => e.command_id !== entry.command_id);
      }
    } catch (cause) {
      if (!isNetworkError(cause)) { actionError.current = true; setError(cause instanceof Error ? cause.message : copy.loadError); }
    } finally {
      writeOutbox(scope, remaining);
      setOutbox(scope === outboxScope(person.id) ? remaining : readOutbox(outboxScope(person.id)));
      flushing.current = false;
      if (stale && scope === outboxScope(person.id)) setFeedback(`${stale} saved action${stale === 1 ? '' : 's'} from an earlier case discarded.${sent ? ` ${sent} current-case action${sent === 1 ? '' : 's'} sent.` : ' Nothing was sent for the new case.'}`);
      else if (remaining.length < pending.length) { setFeedback('Saved actions sent.'); await refreshCase(); }
    }
  };

  useEffect(() => {
    setOutbox(person ? readOutbox(outboxScope(person.id)) : []);
    if (!person) return;
    void flush();
    const online = () => { void flush(); };
    const accessChanged = (event: StorageEvent) => { if (event.key === ACCESS_GENERATION_KEY) { setOutbox(readOutbox(outboxScope(person.id))); void flush(); } };
    window.addEventListener('online', online);
    window.addEventListener('storage', accessChanged);
    return () => { window.removeEventListener('online', online); window.removeEventListener('storage', accessChanged); };
  }, [person?.id, caseView?.case_id]);

  const act = async (action: string, payload: Record<string, unknown>) => {
    if (!caseView || !person || !isReady(caseView, action) || busy) return;
    const command_id = crypto.randomUUID();
    if (QUEUEABLE.has(action) && isOffline()) { queue({ command_id, case_id: caseView.case_id, action, payload, queued_at: new Date().toISOString() }); return; }
    actionError.current = false; setBusy(true); setError(''); setFeedback('');
    try {
      await live.command(caseView, action, payload, command_id);
      if (await refreshCase(caseView.case_id)) setFeedback(`Recorded: ${caseView.tasks.find(task => task.action === action)?.label ?? action}.`);
    } catch (cause) {
      if (QUEUEABLE.has(action) && isNetworkError(cause)) { queue({ command_id, case_id: caseView.case_id, action, payload, queued_at: new Date().toISOString() }); return; }
      if (await refreshCase(caseView.case_id)) { actionError.current = true; setError(cause instanceof Error ? cause.message : 'The action could not be recorded'); }
    } finally { setBusy(false); }
  };

  const retryCalculation = async () => {
    if (!caseView?.retry_available || busy) return;
    actionError.current = false;
    setBusy(true); setError(''); setFeedback('');
    try {
      await live.retry(caseView.case_id, caseView.version);
      if (await refreshCase(caseView.case_id)) setFeedback('Calculation retried. Review the latest solver status.');
    } catch (cause) {
      if (await refreshCase(caseView.case_id)) { actionError.current = true; setError(cause instanceof Error ? cause.message : 'The calculation could not be retried'); }
    } finally { setBusy(false); }
  };

  return { person, caseView, setCaseView, initialising, busy, error, feedback, setFeedback, refreshCase, signIn, signOut, act, retryCalculation, outbox, flush };
}

export type CaseSession = ReturnType<typeof useCaseSession>;
