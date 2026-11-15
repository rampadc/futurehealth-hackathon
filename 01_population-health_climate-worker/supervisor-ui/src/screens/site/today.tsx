import { navigate } from '../../router';
import { crew, heatNow, SCREEN_FOR_ACTION, tasksOf, time, who } from '../data';
import { Band, Computed, CtaBar, Empty, Head, Hero, List, Metric, NoCase, Row, Section, Statement, taskBadge, taskLine, ActionButton, Note } from '../kit';
import type { ScreenProps } from '../registry';
import { smsInfo, tr, preferredLanguage, langOf, isReady as langReady } from '../../i18n';

const order = { ready: 0, waiting: 1, recorded: 2 } as const;

/** Today: the signed-in responder's actions, most urgent first. */
export function TodayScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView) return <NoCase session={session} />;
  const story = caseView.story;
  const heat = heatNow(caseView);
  const people = crew(caseView);
  const accounted = people.filter(p => p.inRecovery).length;
  const mine = tasksOf(caseView, person?.id).sort((a, b) => order[a.status] - order[b.status]);
  const first = mine.find(t => t.status === 'ready');
  const open = (action: string) => { const target = SCREEN_FOR_ACTION[action]?.site; if (target) navigate(`/site/${target}`); };
  return <div className="hs-screen">
    <Head kicker={`Today · ${time(caseView.clock)} GST`} title="Your actions" />
    <Hero>
      <Metric label="Stop-work" value={story.issued ? 'Heavy work' : 'None yet'} sub={story.issued ? (story.stopped ? 'Stopped and confirmed' : 'Instruction issued') : 'Awaiting safety review'} tone={story.issued ? 'red' : undefined} />
      <Metric label="Accounted" value={`${accounted} / ${people.length}`} sub="Shelter A" tone={people.length && accounted === people.length ? 'ok' : undefined} />
      <Metric label="TWL" value={heat.reading ? `${heat.reading.twl} W/m²` : '—'} sub={<><Band band={heat.band.band} label={heat.band.label} /> · {heat.reading?.sensor_id ?? 'no sensor'} · {time(heat.reading?.measured_at)}</>} />
    </Hero>
    <Section title="Actions" hint="Tap to open">
      {mine.length ? <List label="Your actions">{mine.map(task => <Row key={task.action} title={task.label} detail={taskLine(session, task.action)} badge={taskBadge(session, task.action)} onClick={SCREEN_FOR_ACTION[task.action]?.site ? () => open(task.action) : undefined} />)}</List>
        : <Empty>No actions for you in this case. {heat.reading && `TWL ${heat.reading.twl} W/m² at ${time(heat.reading.measured_at)}.`}</Empty>}
    </Section>
    <Computed />
    {first && SCREEN_FOR_ACTION[first.action]?.site && <CtaBar><button type="button" className="hs-button is-primary" onClick={() => open(first.action)}>{first.label}</button></CtaBar>}
  </div>;
}

/** Stop-work instruction: Maya issues; Huda acknowledges and confirms the stop. */
export function StopWorkScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  if (!caseView) return <NoCase session={session} />;
  const story = caseView.story;
  const heat = heatNow(caseView);
  const followup = caseView.tasks.find(t => t.action === 'escalation_followup');
  const overdue = !!followup && followup.status !== 'waiting';
  const people = crew(caseView);
  const safety = person?.id === 'P03';
  return <div className="hs-screen">
    <Head kicker={`Stop-work · ${time(caseView.clock)} GST`} title="Stop-work instruction" />
    <Statement tone="red" source={<>Sandline heat plan · TWL {heat.reading?.twl ?? '—'} W/m² at {time(heat.reading?.measured_at)} · site rule ≤ 150 holds heavy work · <Band band={heat.band.band} label={heat.band.label} /> does not release it</>}>
      Stop heavy exposed civil work. Move the crew to Shelter A.
    </Statement>
    {story.issued && !story.acknowledged && <Note tone={overdue ? 'red' : 'amber'}>{overdue ? '■ Acknowledgement overdue. Rashid has been asked to follow up.' : '▲ Escalates to Rashid if not acknowledged within 2 minutes.'}</Note>}
    <Section title="Recipients">
      <List>
        <Row title="Huda (C01) · Dune foreman" detail={`Stop and account for ${people.length} affected workers.`} badge={taskBadge(session, story.acknowledged ? 'stop' : 'acknowledge')} />
        <Row title="Separate light task" detail="Not affected by this instruction." badge={<span className="hs-badge" data-tone="muted">Not affected</span>} />
      </List>
    </Section>
    <Section title="What worker phones receive" hint="Fixed template · reviewed translation">
      <SmsPreview workerIds={people.map(p => p.id)} names={people.map(p => p.name)} />
    </Section>
    <Note>Nothing is sent from this demo. The preview shows the message size each crew language would need.</Note>
    <CtaBar>
      {safety ? <ActionButton session={session} action="issue" label="Record instruction issued" primary />
        : !story.acknowledged ? <ActionButton session={session} action="acknowledge" label="Acknowledge" primary />
          : <ActionButton session={session} action="stop" label="Confirm heavy work stopped" primary />}
      {story.stopped && <button type="button" className="hs-button" onClick={() => navigate('/site/headcount')}>Go to headcount</button>}
    </CtaBar>
  </div>;
}

function SmsPreview({ workerIds, names }: { workerIds: string[]; names: string[] }) {
  const counts = new Map<string, number>();
  names.forEach((n, i) => { const l = preferredLanguage(n, workerIds[i]); counts.set(l, (counts.get(l) ?? 0) + 1); });
  if (!counts.size) counts.set('en', workerIds.length);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return <ul className="hs-list">{langs.map(([code, n]) => {
    const use = langReady(code) ? code : 'en';
    const text = `${tr('stopwork', use).text}: ${tr('alert.stop', use).text}`;
    const info = smsInfo(text);
    const lang = langOf(code);
    return <li key={code} className="hs-row"><div className="hs-row-body"><span className="hs-row-text">
      <span className="hs-row-title"><span lang={code} dir={lang.dir}>{lang.endonym}</span> · {n} worker{n === 1 ? '' : 's'}{use !== code && ' · falls back to English'}</span>
      <span lang={use} dir={langOf(use).dir}>{text}</span>
      <span className="hs-small hs-muted">SMS · {info.encoding} · {info.length} / {info.limit} chars · {info.parts} part{info.parts === 1 ? '' : 's'}</span>
    </span></div></li>;
  })}</ul>;
}

/** Headcount: every affected worker in a safe recovery place. */
export function HeadcountScreen({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const people = crew(caseView);
  const accounted = people.filter(p => p.inRecovery);
  const missing = people.filter(p => !p.inRecovery);
  const recoveredAt = caseView.request?.snapshot.recovery?.recorded_at ?? caseView.capture?.request.snapshot.recovery?.recorded_at;
  return <div className="hs-screen">
    <Head kicker={`Headcount · ${time(caseView.clock)} GST`} title="Headcount · Shelter A" />
    <Hero>
      <Metric label="Accounted" value={`${accounted.length} / ${people.length}`} sub={missing.length ? 'not complete' : 'all affected workers'} tone={missing.length ? 'red' : 'ok'} />
      <Metric label="Not yet recorded" value={String(missing.length)} sub={missing.map(p => p.name.split(' ')[0]).join(', ') || 'none'} />
      <Metric label="Recorded" value={time(recoveredAt)} sub="Shelter A" />
    </Hero>
    <Section title="Affected workers" hint="Kiosk and phone check-ins appear live">
      <List>{people.map(p => <Row key={p.id} title={who(p.id)} detail={p.inRecovery ? `In cooled recovery · Shelter A` : `Last known: ${p.location ?? 'unknown'}`} badge={p.inRecovery ? <span className="hs-badge" data-tone="done">✓ Arrived</span> : <span className="hs-badge" data-tone="wait">Not recorded</span>} />)}</List>
    </Section>
    <CtaBar note="Confirm only after you have seen each worker in Shelter A.">
      <ActionButton session={session} action="recover" label={`Confirm all ${people.length} accounted for`} primary />
      <ActionButton session={session} action="personnel" label="Confirm personnel check for restart" />
    </CtaBar>
  </div>;
}
