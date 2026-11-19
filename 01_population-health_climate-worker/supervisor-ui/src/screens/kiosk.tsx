import { useEffect, useRef, useState } from 'react';
import { LANGS, langOf, preferredLanguage, tr, useWorkerLanguage } from '../i18n';
import { live } from '../live';
import { assessmentCapture, assignedIds, crew, time } from './data';
import { Computed, Head, Hero, Metric, NoCase, Note, Avatar } from './kit';
import type { ScreenProps } from './registry';
import { StatusIcon } from '../shared/icons';

/** A kiosk visit returns to the badge screen after this long without a tap. */
const IDLE_MS = 60_000;
const READY = LANGS.filter(l => l.status === 'ready');

/**
 * Shelter A kiosk. Every visit starts the same way: the worker taps their badge (Web NFC where the
 * browser has it; name tiles always work), then picks a language. The summary is shown in that
 * language only. The tap records the worker's own shelter arrival when that task is ready.
 */
export function KioskScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [visit, setVisit] = useState<{ id: string; step: 'lang' | 'summary'; lang: string } | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const tapRef = useRef<(id: string) => void>(() => {});
  const nfc = useNfcBadges(id => tapRef.current(id));
  const [stored] = useWorkerLanguage(person?.id);
  const saved = useSavedLanguage(person?.id);
  // A shared wall tablet: an unattended visit goes back to the badge screen.
  useEffect(() => {
    if (!visit) return;
    const timer = window.setTimeout(() => setVisit(null), IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [visit]);
  if (!caseView || !person) return <NoCase session={session} />;
  const people = crew(caseView).filter(p => p.id === person.id);
  const checkin = caseView.tasks.find(t => t.action === 'checkin');
  const ownApprovedWorkshop = caseView.plan_assessment?.status === 'approved' && assignedIds(assessmentCapture(caseView)).includes(person.id);
  const arrived = new Set(caseView.headcount?.arrivals.filter(a => a.person_id === person.id).map(a => a.person_id) ?? []);
  if (checkin?.status === 'recorded') arrived.add(checkin.actor_id);
  const tap = (id: string) => {
    setUnknown(null);
    if (checkin && checkin.actor_id === id && checkin.status === 'ready') void session.act('checkin', {});
    const p = people.find(x => x.id === id);
    // The worker's own choice is offered first: on this device, then the one saved with their consent, then the site default.
    setVisit({ id, step: 'lang', lang: stored ?? saved ?? (p ? preferredLanguage(p.name, p.id) : 'en') });
  };
  tapRef.current = id => { if (people.some(p => p.id === id)) tap(id); else { setVisit(null); setUnknown(id); } };
  const who = visit && people.find(p => p.id === visit.id);

  if (visit && who && visit.step === 'lang') return <div className="hs-screen" lang={visit.lang} dir={langOf(visit.lang).dir}>
    <Head kicker={<><Avatar id={who.id} size="sm" /> {who.name.split(' ')[0]} · {who.id}</>} title={tr('lang.choose', visit.lang).text} sub={tr('lang.hint', visit.lang).text} />
    <ul className="hs-langs">{READY.map(l => <li key={l.code}>
      <button type="button" lang={l.code} dir={l.dir} aria-pressed={visit.lang === l.code} onClick={() => setVisit({ ...visit, step: 'summary', lang: l.code })}>
        {l.endonym}<small lang="en" dir="ltr">{l.english}</small>
      </button></li>)}
    </ul>
  </div>;

  if (visit && who) {
    const l = visit.lang;
    const t = (k: string) => tr(k, l).text;
    const here = arrived.has(who.id);
    return <div className="hs-screen" lang={l} dir={langOf(l).dir}>
      <Head kicker={<>{t('shelterA')} · {time(caseView.clock)} · <button type="button" className="hs-link" onClick={() => setVisit({ ...visit, step: 'lang' })}>🌐 {langOf(l).endonym}</button></>} title={who.name.split(' ')[0]} />
      {here ? <p className="hs-statusline" role="status"><StatusIcon status="ok" /> {t('kiosk.checked')}</p>
        : !session.busy && <p className="hs-statusline" role="status">{t('k.seeHuda')}</p>}
      <Hero rows numbered>
        <Metric label={t('hr.arrival')} value={here ? t('k.recorded') : t('k.notRecorded')} tone={here ? 'ok' : undefined} />
        <Metric label={t('k.water')} value="💧" sub={t('w.cup')} />
        <Metric label={t('p2.next')} value={ownApprovedWorkshop ? t('workshop') : t('k.follow')} sub={t('k.call')} />
      </Hero>
      <Note>{t('k.huda')}</Note>
      <button type="button" className="hs-button is-primary hs-kiosk-done" onClick={() => setVisit(null)}>{t('k.done')}</button>
      <Computed>{t('k.feeds')}</Computed>
    </div>;
  }

  return <div className="hs-screen">
    <Head kicker={`Shelter A · ${time(caseView.clock)}`} title={<>{tr('kiosk.tap', 'en').text} · <span lang="ar" dir="rtl">{tr('kiosk.tap', 'ar').text}</span></>} />
    <ul className="hs-kiosk-langs" aria-label="Tap your badge">{READY.filter(l => l.code !== 'en' && l.code !== 'ar').map(l => <li key={l.code} lang={l.code} dir={l.dir}>{tr('kiosk.tap', l.code).text}</li>)}</ul>
    {unknown && <p className="hs-statusline" role="status">Badge {unknown} is not on this crew. Please see Huda.</p>}
    <ul className="hs-tiles" aria-label="Badges">{people.map(p => <li key={p.id}>
      <button type="button" data-in={arrived.has(p.id) || undefined} disabled={session.busy} onClick={() => tap(p.id)} aria-label={`${p.name}${arrived.has(p.id) ? ', checked in' : ''}`}>
        <Avatar id={p.id} size="lg" /><span aria-hidden="true">{arrived.has(p.id) && <><StatusIcon status="ok" /> </>}{p.name.split(' ')[0]}</span><small>{p.id}</small>
      </button></li>)}
    </ul>
    {nfc.supported && <div className="hs-form-row">
      <button type="button" className="hs-button" disabled={nfc.state === 'listening'} onClick={() => void nfc.start()}>{nfc.state === 'listening' ? '◉ NFC reader on · tap a badge' : 'Start NFC badge reader'}</button>
      {nfc.error && <p role="alert" className="hs-error">{nfc.error}</p>}
    </div>}
  </div>;
}

/** The language a signed-in worker saved with their consent, or null when none is saved or they are not a worker. */
function useSavedLanguage(personId: string | undefined) {
  const [language, setLanguage] = useState<string | null>(null);
  useEffect(() => {
    setLanguage(null);
    if (!personId) return;
    let current = true;
    live.consent().then(c => { if (current && (c.consented_at || c.language !== 'en')) setLanguage(c.language); }).catch(() => {});
    return () => { current = false; };
  }, [personId]);
  return language;
}

type NdefReader = { scan: (options?: { signal?: AbortSignal }) => Promise<void>; onreading: ((event: { message: { records: Array<{ recordType: string; data?: DataView; encoding?: string }> } }) => void) | null; onreadingerror: (() => void) | null };

/** Web NFC (Android Chrome): reads a worker id from a text record on the badge. */
function useNfcBadges(onBadge: (personId: string) => void) {
  const Ctor = (window as unknown as { NDEFReader?: new () => NdefReader }).NDEFReader;
  const [state, setState] = useState<'idle' | 'listening'>('idle');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const start = async () => {
    if (!Ctor) return;
    setError('');
    try {
      const reader = new Ctor();
      abort.current = new AbortController();
      reader.onreading = event => {
        for (const record of event.message.records) {
          if (record.recordType !== 'text' || !record.data) continue;
          const id = new TextDecoder(record.encoding ?? 'utf-8').decode(record.data).trim().toUpperCase();
          if (/^[A-Z]\d{2}$/.test(id)) onBadge(id);
        }
      };
      reader.onreadingerror = () => setError('That badge could not be read. Try again or tap your name.');
      await reader.scan({ signal: abort.current.signal });
      setState('listening');
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'NFC permission was refused.' : 'NFC is not available on this device.');
    }
  };
  return { supported: !!Ctor, state, error, start };
}
