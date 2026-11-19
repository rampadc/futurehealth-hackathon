import { useEffect, useState } from 'react';
import type { ConsentScope, WorkerConsent } from '../../contract';
import { LANGS, langOf } from '../../i18n';
import { live as api } from '../../live';
import { navigate } from '../../router';
import { time } from '../data';
import { Computed, CtaBar, Head, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section } from '../kit';
import type { ScreenProps } from '../registry';
import { En, T, useT, useWorker, WorkerFrame } from './frame';

type Consent = { checkins: boolean; wearable: boolean; at: string | null };
const NONE: Consent = { checkins: false, wearable: false, at: null };
const fromServer = (c: WorkerConsent): Consent => ({ checkins: c.scopes.includes('check_in'), wearable: c.scopes.includes('wearable'), at: c.consented_at });
const toScopes = (c: Consent): ConsentScope[] => [...(c.checkins ? ['check_in', 'symptom_report'] as const : []), ...(c.wearable ? ['wearable'] as const : [])];

/** The signed-in worker's consent, stored by the backend (`/api/worker/consent`). */
function useConsent(personId: string | undefined) {
  const [consent, setConsent] = useState<Consent>(NONE);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (personId) api.consent().then(c => { if (live) setConsent(fromServer(c)); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [personId]);
  const save = async (next: Consent, lang: string) => {
    setError('');
    try { setConsent(fromServer(await api.saveConsent(lang, toScopes(next)))); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); return false; }
  };
  const withdraw = async () => {
    setError('');
    try { setConsent(fromServer(await api.withdrawConsent())); } catch (e) { setError(e instanceof Error ? e.message : 'Could not withdraw'); }
  };
  return { consent, save, withdraw, error };
}

/** Welcome: language first (by endonym), then what to share, without pressure. */
export function WelcomeScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Welcome {...props} /></WorkerFrame>;
}
function Welcome({ session }: ScreenProps) {
  const t = useT();
  const { lang, chosen, choose } = useWorker();
  const [step, setStep] = useState<'lang' | 'consent'>(chosen ? 'consent' : 'lang');
  const { consent, save, error } = useConsent(session.person?.id);
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
    <Note><T k="lang.draft" /></Note>
  </div>;
  return <div className="hs-screen">
    <Head kicker={<button type="button" className="hs-link" onClick={() => setStep('lang')}>🌐 {langOf(lang).endonym}</button>} title={<T k="p1.title" />} />
    <Note><T k="p1.sees" /></Note>
    <Section icon="list" title={<T k="p1.choices" />}>
      <List>
        <Row title={<T k="c.checkins" />} detail={<><T k="c.checkins.s" /> · <T k="c.checkins.d" /></>} badge={<Toggle on={draft.checkins} onChange={v => setDraft({ ...draft, checkins: v })} label={t('c.checkins')} />} />
        <Row title={<T k="c.wear" />} detail={<T k="c.wear.d" />} badge={<Toggle on={draft.wearable} onChange={v => setDraft({ ...draft, wearable: v })} label={t('c.wear')} />} />
      </List>
    </Section>
    <Note><T k="p1.alerts" /> <T k="p1.later" /></Note>
    {error && <p role="alert" className="hs-error">{error}</p>}
    <CtaBar note={<T k="p1.only" />}>
      <button type="button" className="hs-button is-primary" disabled={session.busy} onClick={() => void save(draft, lang).then(ok => { if (ok) navigate('/worker/now'); })}><T k="p1.save" /></button>
    </CtaBar>
  </div>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const t = useT();
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="hs-button" onClick={() => onChange(!on)}>{on ? t('on') : t('off')}</button>;
}

/** Me: what is shared, what is stored, and the worker's own copy. */
export function MyDataScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><MyData {...props} /></WorkerFrame>;
}
function MyData({ session }: ScreenProps) {
  const t = useT();
  const { consent, withdraw, error } = useConsent(session.person?.id);
  const [failed, setFailed] = useState('');
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const events = caseView.story.events.filter(e => e.actorId === person.id);
  const download = async () => {
    setFailed('');
    try {
      const body = await api.workerData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `heat-safe-my-data-${person.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setFailed(e instanceof Error ? e.message : 'Download failed'); }
  };
  return <div className="hs-screen">
    <Head title={<T k="p8.title" />} />
    <Hero>
      <Metric label={<T k="p8.shared" />} value={<T k="p8.actions" />} tone="ok" />
      <Metric label={<T k="p8.recorded" />} value={String(events.length)} sub={<T k="p8.inCase" />} />
      <Metric label={<T k="p8.wear" />} value={consent.wearable ? t('on') : t('off')} sub={<T k="p8.notpaired" />} />
    </Hero>
    <Section icon="lock" title={<T k="p8.consent" />}>
      <List>
        <Row title={<T k="c.checkins" />} detail={consent.at ? t('p8.agreed', { date: time(consent.at) }) : <T k="p8.notChosen" />} badge={<span className="hs-badge" data-tone={consent.checkins ? 'done' : 'muted'}>{consent.checkins ? t('on') : t('off')}</span>} onClick={() => navigate('/worker/welcome')} />
      </List>
    </Section>
    <Section icon="calc" title={<T k="p8.saw" />}>
      {events.length ? <List>{events.map(e => <Row key={e.id} title={e.title} />)}</List> : <p className="hs-muted"><T k="p8.none" /></p>}
    </Section>
    <Section icon="people" title={<T k="p8.who" />}><p className="hs-muted"><T k="p8.none" /></p></Section>
    <CtaBar>
      <button type="button" className="hs-button is-primary" onClick={() => void download()}><T k="p8.download" /></button>
      <HoldButton className="hs-button is-danger" onConfirm={() => void withdraw()} hint={t('hold')} disabled={!consent.checkins && !consent.wearable}><T k="p8.delete" /></HoldButton>
    </CtaBar>
    {(error || failed) && <p role="alert" className="hs-error">{error || failed}</p>}
    <Note><T k="p8.deletebody" /></Note>
    <Computed><T k="p8.export" /></Computed>
  </div>;
}
