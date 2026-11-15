import { useEffect, useState } from 'react';
import { LANGS, langOf } from '../../i18n';
import { navigate } from '../../router';
import { intervalsOf, time } from '../data';
import { Computed, CtaBar, Head, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section } from '../kit';
import type { ScreenProps } from '../registry';
import { T, useT, useWorker, WorkerFrame } from './frame';

type Consent = { checkins: boolean; wearable: boolean; at: string | null };
const NONE: Consent = { checkins: false, wearable: false, at: null };
const KEY = 'hs-worker-consent';

/** Consent choices, kept on this phone only until the worker consent endpoint exists. */
function useConsent(personId: string | undefined) {
  const read = (): Consent => { try { return { ...NONE, ...JSON.parse(localStorage.getItem(`${KEY}:${personId}`) ?? 'null') }; } catch { return NONE; } };
  const [consent, setConsent] = useState<Consent>(read);
  useEffect(() => { setConsent(read()); }, [personId]);
  const save = (next: Consent) => { setConsent(next); try { localStorage.setItem(`${KEY}:${personId}`, JSON.stringify(next)); } catch { /* Private mode: this session only. */ } };
  return [consent, save] as const;
}

/** P1 · Welcome: language first (by endonym), then what to share, without pressure. */
export function P1Welcome(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Welcome {...props} /></WorkerFrame>;
}
function Welcome({ session }: ScreenProps) {
  const t = useT();
  const { lang, chosen, choose } = useWorker();
  const [step, setStep] = useState<'lang' | 'consent'>(chosen ? 'consent' : 'lang');
  const [consent, save] = useConsent(session.person?.id);
  const [draft, setDraft] = useState(consent);
  useEffect(() => setDraft(consent), [consent]);
  if (!session.person) return <NoCase session={session} />;
  if (step === 'lang') return <div className="hs-screen">
    <Head title={<T k="lang.choose" />} sub={<T k="lang.hint" />} />
    <ul className="hs-langs">{LANGS.map(l => <li key={l.code}>
      <button type="button" lang={l.code} dir={l.dir} aria-pressed={lang === l.code && chosen} disabled={l.status !== 'ready'} onClick={() => { choose(l.code); setStep('consent'); }}>
        {l.endonym}<small lang="en" dir="ltr">{l.english}{l.status !== 'ready' && ` · ${t('lang.soon')}`}</small>
      </button></li>)}
    </ul>
    <Note>Translations are drafts and need native-speaker review before real use.</Note>
  </div>;
  return <div className="hs-screen">
    <Head kicker={<button type="button" className="hs-link" onClick={() => setStep('lang')}>🌐 {langOf(lang).endonym}</button>} title={<T k="p1.title" />} />
    <Note><T k="p1.sees" /></Note>
    <Section title={<T k="p1.choices" />}>
      <List>
        <Row title={<T k="c.checkins" />} detail={<><T k="c.checkins.s" /> · <T k="c.checkins.d" /></>} badge={<Toggle on={draft.checkins} onChange={v => setDraft({ ...draft, checkins: v })} label={t('c.checkins')} />} />
        <Row title={<T k="c.wear" />} detail={<T k="c.wear.d" />} badge={<Toggle on={draft.wearable} onChange={v => setDraft({ ...draft, wearable: v })} label={t('c.wear')} />} />
      </List>
    </Section>
    <Note><T k="p1.alerts" /> <T k="p1.later" /></Note>
    <CtaBar note="Saved on this phone only in this demo.">
      <button type="button" className="hs-button is-primary" onClick={() => { save({ ...draft, at: new Date().toISOString() }); navigate('/worker/p2'); }}><T k="p1.save" /></button>
    </CtaBar>
  </div>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const t = useT();
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="hs-button" onClick={() => onChange(!on)}>{on ? t('on') : t('off')}</button>;
}

/** P8 · Me: what is shared, what is stored, and the worker's own copy. */
export function P8MyData(props: ScreenProps) {
  return <WorkerFrame session={props.session}><MyData {...props} /></WorkerFrame>;
}
function MyData({ session }: ScreenProps) {
  const t = useT();
  const { lang } = useWorker();
  const [consent, save] = useConsent(session.person?.id);
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const events = caseView.story.events.filter(e => e.actorId === person.id);
  const intervals = intervalsOf(caseView.capture, person.id);
  const download = () => {
    const body = { person_id: person.id, generated_at: new Date().toISOString(), language: lang, consent, recorded_actions: events.map(e => e.title), plan_intervals: intervals, note: 'What this demo case holds about you. Clinical notes are never stored in the shared operations record.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `heat-safe-my-data-${person.id}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  return <div className="hs-screen">
    <Head title={<T k="p8.title" />} />
    <Hero>
      <Metric label={<T k="p8.shared" />} value={<T k="p8.actions" />} tone="ok" />
      <Metric label="Recorded actions" value={String(events.length)} sub="in this case" />
      <Metric label={<T k="p8.wear" />} value={consent.wearable ? t('on') : t('off')} sub={<T k="p8.notpaired" />} />
    </Hero>
    <Section title={<T k="p8.consent" />}>
      <List>
        <Row title={<T k="c.checkins" />} detail={consent.at ? t('p8.agreed', { date: time(consent.at) }) : 'Not chosen yet.'} badge={<span className="hs-badge" data-tone={consent.checkins ? 'done' : 'muted'}>{consent.checkins ? t('on') : t('off')}</span>} onClick={() => navigate('/worker/p1')} />
      </List>
    </Section>
    <Section title="What your supervisor saw">
      {events.length ? <List>{events.map(e => <Row key={e.id} title={e.title} />)}</List> : <p className="hs-muted"><T k="p8.none" /></p>}
    </Section>
    <Section title={<T k="p8.who" />}><p className="hs-muted"><T k="p8.none" /></p></Section>
    <CtaBar>
      <button type="button" className="hs-button is-primary" onClick={download}><T k="p8.download" /></button>
      <HoldButton className="hs-button is-danger" onConfirm={() => save({ ...NONE })} hint={t('hold')}><T k="p8.delete" /></HoldButton>
    </CtaBar>
    <Note><T k="p8.deletebody" /></Note>
    <Computed>Consent is saved on this phone in this demo; the worker consent service is planned.</Computed>
  </div>;
}
