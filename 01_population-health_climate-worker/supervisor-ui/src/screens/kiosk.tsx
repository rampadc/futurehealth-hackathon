import { useState } from 'react';
import { langOf, preferredLanguage, tr } from '../i18n';
import { crew, time } from './data';
import { Computed, Head, Hero, Metric, NoCase, Note } from './kit';
import type { ScreenProps } from './registry';

/**
 * K1 · Shelter A kiosk: a worker taps their badge and is checked in within three seconds,
 * without reading. Badge taps are simulated by tapping a name tile.
 */
export function K1Kiosk({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [greeting, setGreeting] = useState<{ id: string; ok: boolean } | null>(null);
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
  const g = greeting && people.find(p => p.id === greeting.id);
  const gl = g ? preferredLanguage(g.name, g.id) : 'en';
  return <div className="hs-screen">
    <Head kicker={`Shelter A · ${time(caseView.clock)}`} title={<>{tr('kiosk.tap', 'en').text} · <span lang="ar" dir="rtl">{tr('kiosk.tap', 'ar').text}</span></>} />
    <Hero>
      <Metric label={<>In shelter · <span lang="ar">في الملجأ</span></>} value={String(arrived.size)} sub={`of ${people.length}`} tone="ok" />
      <Metric label={<>Water · <span lang="ar">ماء</span></>} value="💧" sub="Cooler checked by Maya" />
      <Metric label="Next" value={caseView.story.assigned ? 'Workshop' : 'Rest'} sub="your foreman will call you" />
    </Hero>
    {g && <p className="hs-statusline" role="status" lang={gl} dir={langOf(gl).dir}>{greeting!.ok ? `✓ ${tr('kiosk.checked', gl).text} · ${g.name.split(' ')[0]}` : `${g.name.split(' ')[0]}: please see Huda`}</p>}
    <ul className="hs-tiles" aria-label="Badges">{people.map(p => <li key={p.id}>
      <button type="button" data-in={arrived.has(p.id) || undefined} disabled={session.busy} onClick={() => tap(p.id)} aria-label={`${p.name}${arrived.has(p.id) ? ', checked in' : ''}`}>
        <span aria-hidden="true">{arrived.has(p.id) ? '✓' : '◯'}</span>{p.name.split(' ')[0]}<small>{p.id}</small>
      </button></li>)}
    </ul>
    <Note>Demo: tiles stand in for NFC badge taps. Only {checkin ? 'Rana’s' : 'a worker’s own'} check-in is recorded in this case; Huda records the full headcount.</Note>
    <Computed>Check-ins feed the headcount (M3) live.</Computed>
  </div>;
}
