import { navigate } from '../../router';
import { heatNow, intervalsOf, kindLabel, nowAndNext, taskFor, time } from '../data';
import { Band, Computed, CtaBar, Empty, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';
import { T, useT, useWorker, WorkerFrame } from './frame';

/** Worker's own status: working, resting or excluded. Never shows other workers or health detail. */
function statusOf(session: ScreenProps['session']) {
  const { caseView, person } = session;
  const story = caseView!.story;
  const id = person!.id;
  const excluded = id === 'C08' && story.reported;
  const mine = story.assigned && !(story.reported && (!story.removed || !story.firstaid)) ? intervalsOf(caseView!.capture, id) : [];
  const { current, next } = nowAndNext(mine, caseView!.clock);
  const recovering = story.stopped || story.checkedIn || current?.kind === 'recovery';
  return { story, excluded, current, next, recovering };
}

/** P2 · Now: in three seconds, keep working, rest or act. */
export function P2Now(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Now {...props} /></WorkerFrame>;
}
function Now({ session }: ScreenProps) {
  const t = useT();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const { story, excluded, current, next, recovering } = statusOf(session);
  const heat = heatNow(caseView);
  const checkin = taskFor(caseView, 'checkin');
  const checkedIn = person.id === 'C05' ? checkin?.status === 'recorded' : story.checkedIn;
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p2.title" /></h1>
    {story.issued && !story.stopped && <button type="button" className="hs-button is-danger" onClick={() => navigate('/worker/p3')}><T k="stopwork" /> · {t('p2.stop.d')}</button>}
    <Hero>
      <Metric label={<T k="p2.status" />} value={excluded ? 'Rest now' : current ? kindLabel(current.kind) : recovering ? t('p2.inrec') : 'Work as briefed'} sub={excluded ? 'Stay with the site support team' : recovering ? t('shelterA') : undefined} tone={excluded ? 'red' : recovering ? 'ok' : undefined} />
      <Metric label={<T k="p2.heat" />} value={heat.reading ? `${heat.reading.twl} W/m²` : '—'} sub={<><Band band={heat.band.band} label={heat.band.label} />{heat.heavyHeld && <> · {t('p2.heatq')}</>}</>} />
      <Metric label={<T k="p2.next" />} value={next ? `${kindLabel(next.kind)} ${time(next.starts_at)}` : '—'} sub={next ? (next.kind === 'work' ? t('workshop') : t('shelterA')) : 'Wait for your foreman'} />
    </Hero>
    <Section title={<T k="p2.msgs" />}>
      <List>
        {story.issued && <Row title={<T k="stopwork" />} detail={<T k="p2.stop.d" />} badge={<span className="hs-badge" data-tone="over">■</span>} onClick={() => navigate('/worker/p3')} />}
        {recovering && <Row title={<T k="p2.water" />} detail="One cup now, then every 15 minutes." badge={<span className="hs-badge" data-tone="muted"><T k="reminder" /></span>} />}
        {person.id === 'C05' && <Row title={<T k="p2.ci" />} detail={checkedIn ? 'Checked in. Your rest time has started.' : 'Not checked in yet.'} badge={checkedIn ? <span className="hs-badge" data-tone="done">✓</span> : undefined} onClick={checkedIn ? undefined : () => navigate('/worker/p6')} />}
        {story.assigned && <Row title={<T k="p2.plan" />} detail={current ? `${kindLabel(current.kind)} until ${time(current.ends_at)}` : 'See My plan'} onClick={() => navigate('/worker/p5')} />}
      </List>
      {!story.issued && !story.assigned && <Empty><T k="p2.empty" /></Empty>}
    </Section>
    <Computed><T k="p2.computed" /></Computed>
    <CtaBar><button type="button" className="hs-button is-primary" onClick={() => navigate('/worker/p4')}><T k="unwell" /></button></CtaBar>
  </div>;
}

/** P7 · Offline: P2 as it looks without a network. Sending is disabled; rules on the phone still warn. */
export function P7Offline(props: ScreenProps) {
  return <WorkerFrame session={props.session} forceOffline><Now {...props} /></WorkerFrame>;
}

/** P3 · Alert: the fixed stop-work notice, full screen, in the worker's language. */
export function P3Alert(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Alert {...props} /></WorkerFrame>;
}
function Alert({ session }: ScreenProps) {
  const t = useT();
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  if (!caseView.story.issued) return <div className="hs-screen"><h1 id="hs-title"><T k="stopwork" /></h1><Empty>No stop-work notice is active.</Empty></div>;
  return <div className="hs-screen">
    <h1 id="hs-title" className="hs-label"><T k="stopwork" /> · {time(caseView.clock)}</h1>
    <Statement tone="red" source={<T k="alert.fixed" />}><T k="alert.stop" /></Statement>
    <div className="hs-pictos" aria-hidden="true">
      <span><b>✋</b>{t('pic.stop')}</span><span><b>⌂</b>{t('pic.shelter')}</span><span><b>💧</b>{t('pic.water')}</span><span><b>✚</b>{t('pic.help')}</span>
    </div>
    <Note>This notice is a fixed template. Your supervisor sees that it was shown, not anything you say.</Note>
    <CtaBar><button type="button" className="hs-button is-primary" onClick={() => navigate(session.person?.id === 'C05' ? '/worker/p6' : '/worker/p2')}><T k="alert.go" /></button></CtaBar>
  </div>;
}

/** P6 · Shelter check-in: one tap (NFC or QR in production) records arrival at Shelter A. */
export function P6Shelter(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Shelter {...props} /></WorkerFrame>;
}
function Shelter({ session }: ScreenProps) {
  const t = useT();
  const { online } = useWorker();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const task = caseView.tasks.find(t => t.action === 'checkin' && t.actor_id === person.id);
  const done = task?.status === 'recorded';
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p6.title" /></h1>
    {done ? <Statement tone="black"><T k="kiosk.checked" /> · {time(caseView.clock)}</Statement>
      : <Statement source={<T k="p6.qr" />}><T k="p6.hold" /></Statement>}
    {!task && <Note>Only Rana’s check-in is part of this demo case. Your foreman records everyone else at the shelter.</Note>}
    {task && !done && task.status !== 'ready' && <Note tone="amber">Check-in opens once your foreman confirms the stop.</Note>}
    <CtaBar>
      {done ? <button type="button" className="hs-button" onClick={() => navigate('/worker/p2')}><T k="p6.back" /></button>
        : <HoldButton disabled={!task || task.status !== 'ready' || session.busy || !online} onConfirm={() => void session.act('checkin', {})} hint={t('hold')}><T k="p6.cta" /></HoldButton>}
    </CtaBar>
  </div>;
}
