import { useEffect, useState } from 'react';
import { navigate } from '../../router';
import { crew, firstNameOf, incidentPerson, time, who } from '../data';
import { Avatar, ConfirmButton, CtaBar, Empty, Head, List, NoCase, Note, Row, Section, Statement } from '../kit';
import type { ScreenProps } from '../registry';

const VIA: Record<string, string> = { phone: 'Worker app', kiosk: 'Shelter A kiosk', foreman: 'Reported by Huda' };

/**
 * Report an unwell worker: the foreman records a report for a crew member who has no phone or is too
 * unwell to use one. The same fixed red-flag question as the worker app; no symptom detail is recorded.
 */
export function ReportUnwell({ session, compact }: ScreenProps & { compact?: boolean }) {
  const { caseView, person } = session;
  const [pick, setPick] = useState<string | null>(null);
  const [answer, setAnswer] = useState<'no' | 'yes' | null>(null);
  useEffect(() => { setPick(null); setAnswer(null); }, [caseView?.case_id]);
  if (!caseView) return null;
  const reports = caseView.story.reports ?? [];
  const reported = new Set(reports.map(r => r.person_id));
  const task = caseView.tasks.find(t => t.action === 'report' && t.actor_id === person?.id);
  const canReport = !!task && person?.id === 'C01';
  const available = crew(caseView).filter(p => !reported.has(p.id));
  const incident = incidentPerson(caseView);
  const choose = (id: string) => { setPick(id); setAnswer(null); };
  const record = () => { if (pick) void session.act('report', { person_id: pick }).then(() => { setPick(null); setAnswer(null); }); };
  return <>
    {reports.length > 0 && <Section title="Reported unwell">
      <List>{reports.map(r => <Row key={r.person_id} lead={<Avatar id={r.person_id} size="md" />} title={who(r.person_id)}
        detail={`${time(r.occurred_at)} · ${VIA[r.via] ?? r.via} · ${r.person_id === incident ? 'Removal and first-aid steps open' : 'Keep off work and with someone'}`}
        badge={<span className="hs-badge" data-tone="over">Needs rest now</span>}
        onClick={r.person_id === incident && !compact ? () => navigate('/site/action-card') : undefined} />)}</List>
    </Section>}
    {canReport && <Section title="Report an unwell worker">
      {!compact && <p className="hs-muted">For a worker without a phone or too unwell to use one. Their name is recorded; no health detail is recorded.</p>}
      {available.length ? <List>{available.map(p => <Row key={p.id} lead={<Avatar id={p.id} size="md" />} title={who(p.id)}
        detail={p.location ? p.location.replace('_', ' ') : undefined}
        badge={pick === p.id ? <span className="hs-badge" data-tone="plan">Selected</span> : undefined}
        onClick={() => choose(p.id)} />)}</List>
        : <Empty>Every worker on this crew is reported unwell.</Empty>}
      {pick && <>
        <Statement>Is {firstNameOf(pick)} confused, have they vomited, or have they stopped sweating?</Statement>
        <div className="hs-form-row">
          <button type="button" className="hs-button" aria-pressed={answer === 'no'} onClick={() => setAnswer('no')}>No</button>
          <button type="button" className="hs-button is-danger" aria-pressed={answer === 'yes'} onClick={() => setAnswer('yes')}>Yes, one of these</button>
        </div>
        {answer === 'yes' && <Statement tone="red" source="⚙ Escalation rule">Emergency. Call 998 now. Start cooling and keep someone with {firstNameOf(pick)}.</Statement>}
        {answer && <Note>Keep {firstNameOf(pick)} off work and with someone until first aid has seen them.</Note>}
        <CtaBar>
          <ConfirmButton className="hs-button is-danger" disabled={!answer || session.busy}
            title={`Report ${firstNameOf(pick)} unwell`} body={`This records that ${who(pick)} needs rest now, under your name. ${firstNameOf(pick)} is removed from planned work.`}
            confirmLabel="Record report" cancelLabel="Cancel" onConfirm={record}>Report {firstNameOf(pick)} unwell</ConfirmButton>
        </CtaBar>
      </>}
    </Section>}
  </>;
}

/** Site app screen for the foreman. */
export function ReportUnwellScreen({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  return <div className="hs-screen">
    <Head kicker={`Crew · ${time(caseView.clock)} GST`} title="Report an unwell worker" />
    <ReportUnwell session={session} />
    <Note>If a worker is confused, has vomited or stopped sweating: call 998, start cooling and keep someone with them.</Note>
  </div>;
}
