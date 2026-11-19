import { navigate } from '../../router';
import { assessmentCapture, heatNow, intervalsOf, kindLabel, nowAndNext, taskFor, time } from '../data';
import { Band, Computed, CtaBar, Empty, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';
import { OwnRiskPanel } from '../risk';
import { En, T, useT, useWorker, WorkerFrame } from './frame';
import { RiskText } from './riskText';

const KIND_KEY: Record<string, string> = { work: 'kind.work', recovery: 'kind.recovery', unavailable: 'kind.unavailable' };

/** Worker's own status: working, resting or excluded. Never shows other workers or health detail. */
function statusOf(session: ScreenProps['session']) {
  const { caseView, person } = session;
  const story = caseView!.story;
  const id = person!.id;
  const excluded = id === 'C08' && story.reported;
  const approved = caseView!.plan_assessment ? caseView!.plan_assessment.status === 'approved' : story.assigned;
  const mine = story.assigned && approved && !(story.reported && (!story.removed || !story.firstaid)) ? intervalsOf(assessmentCapture(caseView!), id) : [];
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
  const { lang } = useWorker();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const kind = (k: string) => KIND_KEY[k] ? t(KIND_KEY[k]) : <En>{kindLabel(k)}</En>;
  const { story, excluded, current, next, recovering } = statusOf(session);
  const heat = heatNow(caseView);
  const location = caseView.request?.snapshot.workers.find(worker => worker.person_id === person.id)?.location_id;
  const inShelter = location === 'shelter_a' || location === 'shelter_b';
  const actualCurrent = current?.kind === 'work' && location !== 'workshop' ? null : current;
  const stopOrdered = story.issued && !story.stopped;
  const goToShelter = story.stopped && !story.recovered && !inShelter && location !== 'welfare';
  const workingNow = location === 'workshop' && !stopOrdered && !excluded;
  const planNeedsUpdate = story.assigned && !!caseView.plan_assessment && caseView.plan_assessment.status !== 'approved';
  const stopWorkshop = workingNow && planNeedsUpdate;
  const onRoster = !!(caseView.request?.snapshot.workers ?? caseView.capture?.request.snapshot.workers ?? caseView.workers ?? []).find(worker => worker.person_id === person.id);
  const checkin = taskFor(caseView, 'checkin');
  const checkedIn = person.id === 'C05' ? checkin?.status === 'recorded' : story.checkedIn;
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p2.title" /></h1>
    {story.issued && !story.stopped && <button type="button" className="hs-button is-danger" onClick={() => navigate('/worker/alert')}><T k="stopwork" /> · {t('p2.stop.d')}</button>}
    <Hero>
      <Metric label={<T k="p2.status" />} value={excluded ? t('w.rest') : stopOrdered ? t('p2.heatq') : goToShelter ? t('w.goShelter') : stopWorkshop ? t('w.stopWorkshop') : workingNow ? t('w.workshopWork') : planNeedsUpdate ? t('w.awaitPlan') : actualCurrent ? kind(actualCurrent.kind) : recovering ? t('p2.inrec') : heat.heavyHeld ? t('w.holdHeavy') : t('w.asBriefed')} sub={excluded ? t('w.support') : goToShelter ? t('w.goShelterA') : stopWorkshop ? t('w.followRecovery') : workingNow ? t('w.cooledPrep') : planNeedsUpdate ? t('w.followUntil') : recovering && !stopOrdered ? t('shelterA') : undefined} tone={excluded || stopOrdered || stopWorkshop ? 'red' : goToShelter || planNeedsUpdate || heat.heavyHeld && !recovering ? 'amber' : recovering && !workingNow ? 'ok' : undefined} />
      <Metric label={<T k="p2.heat" />} value={heat.reading ? `${heat.reading.twl} W/m²` : '—'} sub={<><Band band={heat.band.band} label={t(`env.${heat.band.band}`)} />{heat.heavyHeld && <> · {t('p2.heatq')}</>}</>} />
      <Metric label={<T k="p2.next" />} value={next ? <>{kind(next.kind)} {time(next.starts_at)}</> : '—'} sub={next ? (next.kind === 'work' ? t('workshop') : t('shelterA')) : t('w.waitForeman')} />
    </Hero>
    <Section icon="message" title={<T k="p2.msgs" />}>
      <List>
        {story.issued && <Row title={<T k="stopwork" />} detail={<T k="p2.stop.d" />} badge={<span className="hs-badge" data-tone="over">■</span>} onClick={() => navigate('/worker/alert')} />}
        {recovering && <Row title={<T k="p2.water" />} detail={<T k="w.cup" />} badge={<span className="hs-badge" data-tone="muted"><T k="reminder" /></span>} />}
        {person.id === 'C05' && story.stopped && <Row title={<T k="p2.ci" />} detail={checkedIn ? <T k="p2.ci.d" /> : <T k="w.notCheckedIn" />} badge={checkedIn ? <span className="hs-badge" data-tone="done" aria-hidden="true" /> : undefined} onClick={checkedIn ? undefined : () => navigate('/worker/shelter')} />}
        {story.assigned && <Row title={<T k="p2.plan" />} detail={current ? (KIND_KEY[current.kind] ? t('w.until', { kind: t(KIND_KEY[current.kind]), time: time(current.ends_at) }) : <En>{`${kindLabel(current.kind)} until ${time(current.ends_at)}`}</En>) : t('w.seePlan')} onClick={() => navigate('/worker/my-plan')} />}
      </List>
      {!story.issued && !story.assigned && <Empty>{onRoster ? <T k="w.onRoster" /> : <T k="p2.empty" />}</Empty>}
    </Section>
    <OwnRiskPanel session={session} title={t('risk.title')} wrap={s => <RiskText text={s} />} say={(k, english, vars) => lang === 'en' ? english : t(k, vars)} />
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
  if (!caseView.story.issued) return <div className="hs-screen"><h1 id="hs-title"><T k="stopwork" /></h1><Empty><T k="alert.none" /></Empty></div>;
  return <div className="hs-screen">
    <h1 id="hs-title" className="hs-label"><T k="stopwork" /> · {time(caseView.clock)}</h1>
    <Statement tone="red"><T k="alert.stop" /></Statement>
    <div className="hs-pictos" aria-hidden="true">
      <span><b>✋</b>{t('pic.stop')}</span>{caseView.story.stopped && <><span><b>⌂</b>{t('pic.shelter')}</span><span><b>💧</b>{t('pic.water')}</span><span><b>✚</b>{t('pic.help')}</span></>}
    </div>
    <CtaBar><button type="button" className="hs-button is-primary" onClick={() => navigate(caseView.story.stopped && session.person?.id === 'C05' ? '/worker/shelter' : '/worker/now')}><T k="alert.go" /></button></CtaBar>
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
    {queued ? <Statement tone="black"><T k="p6.queued" /></Statement>
      : done ? <Statement tone="black"><T k="kiosk.checked" /> · {time(caseView.clock)}</Statement>
      : <Statement source={<T k="p6.qr" />}><T k="p6.hold" /></Statement>}
    {!task && <Note><T k="p6.foreman" /></Note>}
    {task && !done && task.status !== 'ready' && <Note tone="amber"><T k="p6.opens" /></Note>}
    <CtaBar>
      {done ? <button type="button" className="hs-button" onClick={() => navigate('/worker/now')}><T k="p6.back" /></button>
        : <HoldButton disabled={!task || task.status !== 'ready' || session.busy} onConfirm={() => void session.act('checkin', {})} hint={t('hold')}><T k="p6.cta" /></HoldButton>}
    </CtaBar>
  </div>;
}
