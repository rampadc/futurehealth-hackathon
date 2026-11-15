import { useEffect, useRef, useState } from 'react';
import { langOf, preferredLanguage, tr } from '../i18n';
import { crew, time } from './data';
import { Computed, Head, Hero, Metric, NoCase, Note, Avatar } from './kit';
import type { ScreenProps } from './registry';

/**
 * Shelter A kiosk: a worker taps their badge and is checked in within three seconds,
 * without reading. Badges are read with Web NFC where the browser has it; name tiles always work.
 */
export function KioskScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [greeting, setGreeting] = useState<{ id: string; ok: boolean } | null>(null);
  const tapRef = useRef<(id: string) => void>(() => {});
  const nfc = useNfcBadges(id => tapRef.current(id));
  if (!caseView || !person) return <NoCase session={session} />;
  const people = crew(caseView);
  const checkin = caseView.tasks.find(t => t.action === 'checkin');
  const arrived = new Set(people.filter(p => p.inRecovery).map(p => p.id));
  if (checkin?.status === 'recorded') arrived.add(checkin.actor_id);
  const tap = (id: string) => {
    const own = checkin && checkin.actor_id === id && checkin.status === 'ready';
    if (own) void session.act('checkin', {});
    setGreeting({ id, ok: !!own || arrived.has(id) });
  };
  tapRef.current = id => { if (people.some(p => p.id === id)) tap(id); else setGreeting({ id, ok: false }); };
  const g = greeting && people.find(p => p.id === greeting.id);
  const gl = g ? preferredLanguage(g.name, g.id) : 'en';
  return <div className="hs-screen">
    <Head kicker={`Shelter A · ${time(caseView.clock)}`} title={<>{tr('kiosk.tap', 'en').text} · <span lang="ar" dir="rtl">{tr('kiosk.tap', 'ar').text}</span></>} />
    <Hero>
      <Metric label={<>In shelter · <span lang="ar">في الملجأ</span></>} value={String(arrived.size)} sub={`of ${people.length}`} tone="ok" />
      <Metric label={<>Water · <span lang="ar">ماء</span></>} value="💧" sub="Cooler checked by Maya" />
      <Metric label="Next" value={caseView.story.assigned ? 'Workshop' : 'Rest'} sub="your foreman will call you" />
    </Hero>
    {greeting && !g && <p className="hs-statusline" role="status">Badge {greeting.id} is not on this crew. Please see Huda.</p>}
    {g && <p className="hs-statusline" role="status" lang={gl} dir={langOf(gl).dir}>{greeting!.ok ? `✓ ${tr('kiosk.checked', gl).text} · ${g.name.split(' ')[0]}` : `${g.name.split(' ')[0]}: please see Huda`}</p>}
    <ul className="hs-tiles" aria-label="Badges">{people.map(p => <li key={p.id}>
      <button type="button" data-in={arrived.has(p.id) || undefined} disabled={session.busy} onClick={() => tap(p.id)} aria-label={`${p.name}${arrived.has(p.id) ? ', checked in' : ''}`}>
        <Avatar id={p.id} size="lg" /><span aria-hidden="true">{arrived.has(p.id) ? '✓ ' : ''}{p.name.split(' ')[0]}</span><small>{p.id}</small>
      </button></li>)}
    </ul>
    {nfc.supported && <div className="hs-form-row">
      <button type="button" className="hs-button" disabled={nfc.state === 'listening'} onClick={() => void nfc.start()}>{nfc.state === 'listening' ? '◉ NFC reader on · tap a badge' : 'Start NFC badge reader'}</button>
      {nfc.error && <p role="alert" className="hs-error">{nfc.error}</p>}
    </div>}
    <Note>{nfc.supported ? 'Badges are NFC tags holding the worker id (for example C05) as a text record. Tiles also work.' : 'This browser has no Web NFC, so tiles stand in for badge taps (Android Chrome reads real badges).'} Only {checkin ? 'Rana’s' : 'a worker’s own'} check-in is recorded in this case; Huda records the full headcount.</Note>
    <Computed>Check-ins feed the site headcount live.</Computed>
  </div>;
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
