import { useState } from 'react';
import { navigate } from '../../router';
import { assessmentCapture, intervalsOf, kindLabel, minutes, nowAndNext, time } from '../data';
import { Computed, CtaBar, Empty, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';
import { En, T, useT, useWorker, WorkerFrame } from './frame';
import { VoiceCheckIn } from './voice';

const KIND_KEY: Record<string, string> = { work: 'kind.work', recovery: 'kind.recovery', unavailable: 'kind.unavailable' };

/** Check in: tell the supervisor you feel unwell. Fixed red-flag question, no diagnosis. */
export function CheckInScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><CheckIn {...props} /></WorkerFrame>;
}
function CheckIn({ session }: ScreenProps) {
  const t = useT();
  const { online } = useWorker();
  const [step, setStep] = useState<'start' | 'unwell' | 'emergency' | 'ok'>('start');
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const report = caseView.tasks.find(x => x.action === 'report' && x.actor_id === person.id);
  const sent = report?.status === 'recorded';
  const queued = session.outbox.some(e => e.action === 'report');
  const canSend = report?.status === 'ready' && !session.busy && !queued;
  if (sent || queued) return <div className="hs-screen">
    <h1 id="hs-title"><T k="p4.title" /></h1>
    <Statement tone="black"><T k={sent ? 'p4.submitted' : 'p4.saved'} /></Statement>
    <Note><T k="p4.stay" /></Note>
    <CtaBar><button type="button" className="hs-button" onClick={() => navigate('/worker/now')}><T k="p6.back" /></button></CtaBar>
  </div>;
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p4.title" /></h1>
    <p className="hs-muted"><T k="p4.hint" /></p>
    {step === 'start' && <Section icon="message" title={<T k="p4.conv" />}>
      <div className="hs-form">
        <button type="button" className="hs-button is-danger" onClick={() => setStep('unwell')}><T k="unwell" /></button>
        <button type="button" className="hs-button" onClick={() => setStep('ok')}><T k="p4.water" /></button>
        <button type="button" className="hs-button" onClick={() => setStep('ok')}><T k="p4.ok" /></button>
      </div>
      <VoiceCheckIn onUnderstood={() => setStep('unwell')} />
    </Section>}
    {step === 'ok' && <Note><T k="p4.noted" /></Note>}
    {(step === 'unwell' || step === 'emergency') && <Section icon="message" title={<T k="p4.fixedq" />}>
      <Statement><T k="p4.q" /></Statement>
      <div className="hs-form-row">
        <button type="button" className="hs-button" aria-pressed={step === 'unwell'} onClick={() => setStep('unwell')}><T k="no" /></button>
        <button type="button" className="hs-button is-danger" aria-pressed={step === 'emergency'} onClick={() => setStep('emergency')}><T k="p4.yes" /></button>
      </div>
      {step === 'emergency' && (report
        ? <Statement tone="red"><T k="alert.em" /></Statement>
        : <Statement tone="red"><T k="p4.getHelp" /></Statement>)}
      {report && <Note><T k="p1.sees" /></Note>}
    </Section>}
    {!online && <Note tone="amber"><T k="p4.offline" /></Note>}
    {!report && (step === 'unwell' || step === 'emergency') && <Note tone="amber"><T k="p4.tellForeman" /></Note>}
    {report && (step === 'unwell' || step === 'emergency') && <CtaBar>
      <HoldButton disabled={!canSend} onConfirm={() => void session.act('report', {})} hint={t('hold')}><T k="p4.send" /></HoldButton>
    </CtaBar>}
    <Computed><T k="p4.rule" /></Computed>
  </div>;
}

/** My plan: only this worker's own work and rest times. */
export function MyPlanScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><MyPlan {...props} /></WorkerFrame>;
}
function MyPlan({ session }: ScreenProps) {
  const t = useT();
  const { caseView, person } = session;
  if (!caseView || !person) return <NoCase session={session} />;
  const story = caseView.story;
  const pending = story.reported && (!story.removed || !story.firstaid);
  const approved = caseView.plan_assessment ? caseView.plan_assessment.status === 'approved' : story.assigned;
  const planNeedsUpdate = story.assigned && !!caseView.plan_assessment && !approved;
  const mine = story.assigned && approved && !pending ? intervalsOf(assessmentCapture(caseView), person.id) : [];
  const { current, next } = nowAndNext(mine, caseView.clock);
  const location = caseView.request?.snapshot.workers.find(worker => worker.person_id === person.id)?.location_id;
  const actuallyCurrent = current?.kind === 'work' && location === 'workshop' || current?.kind === 'recovery' && (location === 'shelter_a' || location === 'shelter_b') ? current : null;
  const work = mine.filter(i => i.kind === 'work').reduce((sum, i) => sum + minutes(i), 0);
  const kind = (k: string) => KIND_KEY[k] ? t(KIND_KEY[k]) : kindLabel(k);
  const nextRest = mine.find(i => i.kind === 'recovery' && Date.parse(i.starts_at) >= Date.parse(caseView.clock));
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p5.title" /></h1>
    {!mine.length ? <Empty><T k={pending ? 'p5.updating' : planNeedsUpdate ? 'p5.needObs' : story.assigned ? 'p5.noWork' : 'p5.wait'} /></Empty> : <>
      <Hero>
        <Metric label={<T k="p5.now" />} value={actuallyCurrent ? kind(actuallyCurrent.kind) : current?.kind === 'work' ? t('p5.awaitStart') : '—'} sub={actuallyCurrent ? t('p5.until', { time: time(actuallyCurrent.ends_at) }) : current?.kind === 'work' ? t('p5.awaitStart.d') : next ? t('p5.nextAt', { time: time(next.starts_at) }) : undefined} tone={actuallyCurrent?.kind === 'recovery' ? 'ok' : undefined} />
        <Metric label={<T k="p5.nextrest" />} value={nextRest ? <bdi dir="ltr">{time(nextRest.starts_at)}–{time(nextRest.ends_at)}</bdi> : '—'} sub={t('shelterA')} />
        <Metric label={<T k="p5.workIn" />} value={t('p5.min', { n: work })} />
      </Hero>
      <Section icon="calendar" title={<T k="p5.hour" />}>
        <List>{mine.map(i => <Row key={i.starts_at} title={<><bdi dir="ltr">{time(i.starts_at)}–{time(i.ends_at)}</bdi> · {i.kind === 'work' ? t('work') : t('rest')}</>} detail={i.kind === 'work' ? t('p5.prep') : t('p5.rec')} badge={actuallyCurrent === i ? <span className="hs-badge" data-tone="plan"><T k="p5.now" /></span> : undefined} />)}</List>
      </Section>
    </>}
    <Note><T k="p5.midday" /></Note>
    {(person.id === 'C05' || person.id === 'C08') && <button type="button" className="hs-button" onClick={() => navigate('/worker/heat-rest')}><T k="p5.coverage" /></button>}
    <Computed><T k="p5.own" /></Computed>
  </div>;
}
