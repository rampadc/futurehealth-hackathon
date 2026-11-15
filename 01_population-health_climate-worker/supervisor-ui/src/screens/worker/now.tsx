import { navigate } from '../../router';
import { heatNow, intervalsOf, kindLabel, nowAndNext, taskFor, time } from '../data';
import { Band, Computed, CtaBar, Empty, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';
import { OwnRiskPanel } from '../risk';
import { En, T, useT, useWorker, WorkerFrame } from './frame';

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

/** Now: in three seconds, keep working, rest or act. */
export function NowScreen(props: ScreenProps) {
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
    {story.issued && !story.stopped && <button type="button" className="hs-button is-danger" onClick={() => navigate('/worker/alert')}><T k="stopwork" /> · {t('p2.stop.d')}</button>}
    <Hero>
      <Metric label={<T k="p2.status" />} value={excluded ? <En>Rest now</En> : current ? <En>{kindLabel(current.kind)}</En> : recovering ? t('p2.inrec') : <En>Work as briefed</En>} sub={excluded ? <En>Stay with the site support team</En> : recovering ? t('shelterA') : undefined} tone={excluded ? 'red' : recovering ? 'ok' : undefined} />
      <Metric label={<T k="p2.heat" />} value={heat.reading ? `${heat.reading.twl} W/m²` : '—'} sub={<><En><Band band={heat.band.band} label={heat.band.label} /></En>{heat.heavyHeld && <> · {t('p2.heatq')}</>}</>} />
      <Metric label={<T k="p2.next" />} value={next ? <><En>{kindLabel(next.kind)}</En> {time(next.starts_at)}</> : '—'} sub={next ? (next.kind === 'work' ? t('workshop') : t('shelterA')) : <En>Wait for your foreman</En>} />
    </Hero>
    <Section title={<T k="p2.msgs" />}>
      <List>
        {story.issued && <Row title={<T k="stopwork" />} detail={<T k="p2.stop.d" />} badge={<span className="hs-badge" data-tone="over">■</span>} onClick={() => navigate('/worker/alert')} />}
        {recovering && <Row title={<T k="p2.water" />} detail={<En>One cup now, then every 15 minutes.</En>} badge={<span className="hs-badge" data-tone="muted"><T k="reminder" /></span>} />}
        {person.id === 'C05' && <Row title={<T k="p2.ci" />} detail={checkedIn ? <T k="p2.ci.d" /> : <En>Not checked in yet.</En>} badge={checkedIn ? <span className="hs-badge" data-tone="done">✓</span> : undefined} onClick={checkedIn ? undefined : () => navigate('/worker/shelter')} />}
        {story.assigned && <Row title={<T k="p2.plan" />} detail={<En>{current ? `${kindLabel(current.kind)} until ${time(current.ends_at)}` : 'See My plan'}</En>} onClick={() => navigate('/worker/my-plan')} />}
      </List>
      {!story.issued && !story.assigned && <Empty><T k="p2.empty" /></Empty>}
    </Section>
    <OwnRiskPanel session={session} title={<En>My heat risk</En>} wrap={s => <En>{s}</En>} />
    <Computed><T k="p2.computed" /></Computed>
    <CtaBar><button type="button" className="hs-button is-primary" onClick={() => navigate('/worker/check-in')}><T k="unwell" /></button></CtaBar>
  </div>;
}

/** Offline: the Now screen as it looks without a network. Sending is disabled; rules on the phone still warn. */
export function OfflineScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session} forceOffline><Now {...props} /></WorkerFrame>;
}

/** Alert: the fixed stop-work notice, full screen, in the worker's language. */
export function AlertScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Alert {...props} /></WorkerFrame>;
}
function Alert({ session }: ScreenProps) {
  const t = useT();
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  if (!caseView.story.issued) return <div className="hs-screen"><h1 id="hs-title"><T k="stopwork" /></h1><Empty><En>No stop-work notice is active.</En></Empty></div>;
  return <div className="hs-screen">
    <h1 id="hs-title" className="hs-label"><T k="stopwork" /> · {time(caseView.clock)}</h1>
    <Statement tone="red" source={<T k="alert.fixed" />}><T k="alert.stop" /></Statement>
    <div className="hs-pictos" aria-hidden="true">
      <span><b>✋</b>{t('pic.stop')}</span><span><b>⌂</b>{t('pic.shelter')}</span><span><b>💧</b>{t('pic.water')}</span><span><b>✚</b>{t('pic.help')}</span>
    </div>
    <Note><En>This notice is a fixed template. Your supervisor sees that it was shown, not anything you say.</En></Note>
    <CtaBar><button type="button" className="hs-button is-primary" onClick={() => navigate(session.person?.id === 'C05' ? '/worker/shelter' : '/worker/now')}><T k="alert.go" /></button></CtaBar>
  </div>;
}

/** Shelter check-in: one tap (NFC or QR in production) records arrival at Shelter A. */
export function ShelterScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><Shelter {...props} /></WorkerFrame>;
}
function Shelter({ session }: ScreenProps) {
  const t = useT();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const task = caseView.tasks.find(t => t.action === 'checkin' && t.actor_id === person.id);
  const queued = session.outbox.some(e => e.action === 'checkin');
  const done = task?.status === 'recorded' || queued;
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p6.title" /></h1>
    {queued ? <Statement tone="black"><En>Saved on this phone · sends when the network returns</En></Statement>
      : done ? <Statement tone="black"><T k="kiosk.checked" /> · {time(caseView.clock)}</Statement>
      : <Statement source={<T k="p6.qr" />}><T k="p6.hold" /></Statement>}
    {!task && <Note><En>Only Rana’s check-in is part of this demo case. Your foreman records everyone else at the shelter.</En></Note>}
    {task && !done && task.status !== 'ready' && <Note tone="amber"><En>Check-in opens once your foreman confirms the stop.</En></Note>}
    <CtaBar>
      {done ? <button type="button" className="hs-button" onClick={() => navigate('/worker/now')}><T k="p6.back" /></button>
        : <HoldButton disabled={!task || task.status !== 'ready' || session.busy} onConfirm={() => void session.act('checkin', {})} hint={t('hold')}><T k="p6.cta" /></HoldButton>}
    </CtaBar>
  </div>;
}
