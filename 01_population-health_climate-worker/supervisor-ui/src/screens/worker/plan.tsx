import { useState } from 'react';
import { navigate } from '../../router';
import { intervalsOf, kindLabel, minutes, nowAndNext, time } from '../data';
import { Computed, CtaBar, Empty, Hero, HoldButton, List, Metric, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';
import { En, T, useT, useWorker, WorkerFrame } from './frame';
import { VoiceCheckIn } from './voice';

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
    <Statement tone="black" source={<T k="p4.rule" />}><T k="p4.sys" /></Statement>
    {queued && <Note tone="amber"><T k="p4.offline" /></Note>}
    <Note><En>Help is on the way. Stay where you are and with someone.</En></Note>
    <CtaBar><button type="button" className="hs-button" onClick={() => navigate('/worker/now')}><T k="p6.back" /></button></CtaBar>
  </div>;
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p4.title" /></h1>
    <p className="hs-muted"><T k="p4.hint" /></p>
    {step === 'start' && <Section title={<T k="p4.conv" />}>
      <div className="hs-form">
        <button type="button" className="hs-button is-danger" onClick={() => setStep('unwell')}><T k="unwell" /></button>
        <button type="button" className="hs-button" onClick={() => setStep('ok')}><T k="p4.water" /></button>
        <button type="button" className="hs-button" onClick={() => setStep('ok')}><T k="p4.ok" /></button>
      </div>
      <VoiceCheckIn onUnderstood={() => setStep('unwell')} />
    </Section>}
    {step === 'ok' && <Note><En>Noted on this phone. Drink water and keep to your rest times. Only “I feel unwell” asks your supervisor for help.</En></Note>}
    {(step === 'unwell' || step === 'emergency') && <Section title={<T k="p4.fixedq" />}>
      <Statement><T k="p4.q" /></Statement>
      <div className="hs-form-row">
        <button type="button" className="hs-button" aria-pressed={step === 'unwell'} onClick={() => setStep('unwell')}><T k="no" /></button>
        <button type="button" className="hs-button is-danger" aria-pressed={step === 'emergency'} onClick={() => setStep('emergency')}><T k="p4.yes" /></button>
      </div>
      {step === 'emergency' && <Statement tone="red"><T k="alert.em" /></Statement>}
      <Note><T k="p1.sees" /></Note>
    </Section>}
    {!online && <Note tone="amber"><T k="p4.offline" /></Note>}
    {!report && (step === 'unwell' || step === 'emergency') && <Note tone="amber"><En>In this demo only Bilal’s report reaches the case. Tell your foreman in person.</En></Note>}
    {(step === 'unwell' || step === 'emergency') && <CtaBar>
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
  const mine = story.assigned && !pending ? intervalsOf(caseView.capture, person.id) : [];
  const { current, next } = nowAndNext(mine, caseView.clock);
  const work = mine.filter(i => i.kind === 'work').reduce((sum, i) => sum + minutes(i), 0);
  const nextRest = mine.find(i => i.kind === 'recovery' && Date.parse(i.starts_at) >= Date.parse(caseView.clock));
  return <div className="hs-screen">
    <h1 id="hs-title"><T k="p5.title" /></h1>
    {!mine.length ? <Empty><En>{pending ? 'Your times are being updated after a report on your crew. Stay in recovery.' : story.assigned ? 'You have no work assigned in this plan. Stay in recovery.' : 'Your foreman has not confirmed the plan yet.'}</En></Empty> : <>
      <Hero>
        <Metric label={<T k="p5.now" />} value={current ? kindLabel(current.kind) : '—'} sub={current ? `until ${time(current.ends_at)}` : next ? `next at ${time(next.starts_at)}` : undefined} tone={current?.kind === 'recovery' ? 'ok' : undefined} />
        <Metric label={<T k="p5.nextrest" />} value={nextRest ? `${time(nextRest.starts_at)}–${time(nextRest.ends_at)}` : '—'} sub={t('shelterA')} />
        <Metric label="Work in plan" value={`${work} min`} />
      </Hero>
      <Section title={<T k="p5.hour" />}>
        <List>{mine.map(i => <Row key={i.starts_at} title={`${time(i.starts_at)}–${time(i.ends_at)} · ${i.kind === 'work' ? t('work') : t('rest')}`} detail={i.kind === 'work' ? t('p5.prep') : t('p5.rec')} badge={current === i ? <span className="hs-badge" data-tone="plan"><T k="p5.now" /></span> : undefined} />)}</List>
      </Section>
    </>}
    <Note><T k="p5.midday" /></Note>
    {person.id === 'C05' && <button type="button" className="hs-button" onClick={() => navigate('/worker/heat-rest')}>View my heat and rest coverage</button>}
    <Computed><T k="p5.own" /></Computed>
  </div>;
}
