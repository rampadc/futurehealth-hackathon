import { useEffect, useState } from 'react';
import { live, type HeatRestView } from '../live';
import { navigate } from '../router';
import { PERSONAS } from '../story';
import { time } from './data';
import { CtaBar, Head, Hero, List, Metric, NoCase, Note, Row, Section } from './kit';
import type { ScreenProps } from './registry';
import { useT, WorkerFrame } from './worker/frame';

const CREW_IDS = Array.from({ length: 11 }, (_, i) => `C${String(i + 2).padStart(2, '0')}`);
/** Coverage status in the viewer's language (English outside the worker app). */
const coverageKey = (status?: string) => status === 'confirmed' ? 'cov.confirmed' : status === 'needs_verification' ? 'cov.verify' : 'cov.await';
const coverageLabel = (status?: string) => ({ 'cov.confirmed': 'Coverage confirmed', 'cov.verify': 'Needs employer verification', 'cov.await': 'Awaiting employer review' })[coverageKey(status)];
const assessmentLabel = (status?: string) => ({ awaiting_observations: 'Current observed activity needed', proposed: 'Proposal ready for Huda review', approved: 'Proposal approved', expired: 'Proposal expired', blocked: 'Plan review blocked' })[status ?? ''] ?? 'No proposal yet';
const deliveryLabel = (status?: string) => ({ not_started: 'Not started', drafted: 'Drafted', approved: 'Approved', sent: 'Sent', accepted: 'Accepted' })[status ?? ''] ?? 'Not started';
const milestoneLabel = (action: string) => ({ draftDelivery: 'Delivery drafted', approveDelivery: 'Delivery approved', sendDelivery: 'Noura confirmed sending', acceptDelivery: 'Noura confirmed supplier acceptance' })[action] ?? 'Delivery update';
const chronologyLabel = (action: string) => ({ issue: 'Stop-work instruction issued', acknowledge: 'Stop-work instruction acknowledged', stop: 'Heavy work stopped', checkin: 'Personal shelter arrival recorded', recover: 'Crew headcount confirmed', activity: 'Observed crew activity recorded', assign: 'Workshop proposal approved', start_work: 'Workshop work started', start_recovery: 'Workshop work stopped and recovery began', coverage_review: 'Employer coverage reviewed', draftDelivery: 'Delivery drafted', approveDelivery: 'Delivery approved', sendDelivery: 'Noura confirmed sending', acceptDelivery: 'Noura confirmed supplier acceptance', handover: 'Shift handover recorded', costReview: 'Cost impact reviewed' })[action] ?? 'Case milestone';

/** The worker's own coverage, in the worker's language. */
export function WorkerHeatRestScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><HeatRestScreen {...props} /></WorkerFrame>;
}

export function HeatRestScreen({ session }: ScreenProps) {
  const t = useT();
  const { caseView, person } = session;
  const [loadedPolicy, setPolicy] = useState<{ caseId: string; viewerId: string; value: HeatRestView } | null>(null);
  const [error, setError] = useState('');
  const [rosterVerified, setRosterVerified] = useState(false);
  const [status, setStatus] = useState<'confirmed' | 'needs_verification'>('confirmed');
  const [note, setNote] = useState('');
  useEffect(() => { setPolicy(null); setRosterVerified(false); setStatus('confirmed'); setNote(''); }, [caseView?.case_id, person?.id]);
  useEffect(() => {
    if (!caseView || !person) return;
    let active = true;
    const caseId = caseView.case_id, viewerId = person.id;
    void live.heatRest().then(value => { if (active) { setPolicy({ caseId, viewerId, value }); setError(''); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Coverage could not be loaded'); });
    return () => { active = false; };
  }, [caseView?.case_id, caseView?.version, person?.id]);
  if (!caseView || !person) return <NoCase session={session} />;
  const policy = loadedPolicy?.caseId === caseView.case_id && loadedPolicy.viewerId === person.id && (!loadedPolicy.value.case_id || loadedPolicy.value.case_id === caseView.case_id) ? loadedPolicy.value : null;
  const review = policy?.coverage_review;
  const mina = person.id === 'P10';
  const worker = person.id === 'C05' || person.id === 'C08';
  const arrival = caseView.headcount?.arrivals.some(a => a.person_id === person.id);
  const task = caseView.tasks.find(t => t.action === 'coverage_review' && t.actor_id === person.id);
  const commercial = person.id === 'P01' ? policy?.commercial_summary : null;
  const send = () => { if (!policy || status === 'confirmed' && !rosterVerified || !note.trim()) return; void session.act('coverage_review', { policy_id: policy.policy_id, status, crew_ids: CREW_IDS, roster_verified: rosterVerified, note: note.trim() }); };
  return <div className="hs-screen">
    <Head kicker={<>{t('hr.employer')} · Dune Civil Works</>} title={mina ? 'Heat and rest coverage review' : worker ? t('hr.title') : person.id === 'P01' ? 'Project heat and rest view' : 'Crew heat and rest coverage'} />
    {error && <p role="alert" className="hs-error">{error}</p>}
    <Section title="Sandline–Dune Heat Rest Schedule">
      <p>{worker ? t('hr.line') : `Employer heat and rest schedule · ${policy?.scope ?? 'Dune Civil Works crew'}`}</p>{policy?.commitment && <p><b>{policy.commitment}</b></p>}
      <p>{policy?.payroll_verified ? t('hr.paid') : t('hr.unpaid')}</p>
      {policy && <details><summary>{t('hr.source')}</summary><p dir="ltr" lang="en">Version 1 · policy {policy.policy_id} · source {policy.source} · case {policy.case_id ?? caseView.case_id}</p></details>}
      <Note>{t('hr.note')}</Note>
    </Section>
    <Hero>
      <Metric label={t('hr.stop')} value={policy?.records?.stop?.confirmed_at ? t('hr.confirmed') : policy?.records?.instruction?.issued_at ? t('hr.issued') : t('hr.pending')} sub={time(policy?.records?.stop?.confirmed_at)} />
      <Metric label={worker ? t('hr.arrival') : 'Shelter arrivals'} value={worker ? arrival || policy?.records?.arrivals?.some(a => a.person_id === person.id) ? t('k.recorded') : t('k.notRecorded') : `${policy?.records?.headcount?.checked_in_count ?? caseView.headcount?.checked_in_count ?? 0} / ${policy?.records?.headcount?.expected_count ?? caseView.headcount?.expected_count ?? 11}`} />
      <Metric label={t('hr.coverage')} value={t(coverageKey(review?.status))} sub={review?.reviewed_at ? time(review.reviewed_at) : undefined} />
    </Hero>
    {!worker && person.id !== 'P01' && <Section title="Case-linked operations">
      <p>Foreman headcount: {policy?.records?.headcount?.confirmed_count ?? caseView.headcount?.confirmed_count ?? 0} / {policy?.records?.headcount?.expected_count ?? caseView.headcount?.expected_count ?? 11} confirmed. Observed activity records: {policy?.records?.observed_time?.length ?? 0}.</p>
      <p>Plan review: {assessmentLabel(caseView.plan_assessment?.status)}{caseView.plan_assessment?.assessed_at ? ` · assessed ${time(caseView.plan_assessment.assessed_at)}` : ''}. Heavy trench work remains stopped.</p>
    </Section>}
    {mina && policy?.review_queue && <Section title="Employer review queue"><p>{policy.review_queue.status === 'reviewed' ? 'Review recorded' : 'Awaiting review'} · {policy.review_queue.confirmed_count} of {policy.review_queue.expected_count} confirmed by the foreman.</p></Section>}
    {commercial && <>
      <Section title="Project evidence">
        <Hero>
          <Metric label="Heavy work stopped" value={time(commercial.stop_at)} />
          <Metric label="Foreman headcount" value={`${commercial.confirmed_count ?? 0} / ${policy?.records?.headcount?.expected_count ?? 11}`} sub={time(commercial.recovery_confirmed_at)} />
          <Metric label="Employer review" value={coverageLabel(commercial.employer_review?.status ?? commercial.coverage_status)} sub={commercial.employer_review?.reviewed_at ? time(commercial.employer_review.reviewed_at) : undefined} />
        </Hero>
        <p>Confirmed recovery: {commercial.confirmed_time?.recovery_worker_minutes ?? 0} worker-minutes. Confirmed workshop work: {commercial.confirmed_time?.workshop_worker_minutes ?? 0} worker-minutes.{commercial.confirmed_time?.latest_observed_at ? ` Latest observation: ${time(commercial.confirmed_time.latest_observed_at)}.` : ' No activity observation recorded yet.'}</p>
        <p>Cost impact review: {commercial.cost_review_at ? time(commercial.cost_review_at) : 'Not recorded'}.</p>
      </Section>
      <Section title="Case chronology">
        {commercial.chronology?.length ? <List>{commercial.chronology.map((item, index) => <Row key={`${item.action}-${index}`} title={chronologyLabel(item.action)} detail={time(item.occurred_at)} />)}</List> : <p>No case milestones recorded yet.</p>}
      </Section>
      <Section title="Delivery state">
        <p>{deliveryLabel(commercial.delivery?.status)}</p>
        {commercial.delivery?.milestones.length ? <List>{commercial.delivery.milestones.map((item, index) => <Row key={`${item.action}-${index}`} title={milestoneLabel(item.action)} detail={time(item.occurred_at)} />)}</List> : <p>No delivery milestone recorded yet.</p>}
      </Section>
      <Section title="Open commercial questions">
        {commercial.unresolved_questions?.length ? <List>{commercial.unresolved_questions.map(item => <Row key={item.id} title={item.question} badge={<span className="hs-badge" data-tone="wait">Open</span>} />)}</List> : <p>No open questions in the case record.</p>}
      </Section>
    </>}
    {mina && !review && <Section title="Employer confirmation">
      <label className="hs-field">Coverage status<select value={status} onChange={e => setStatus(e.target.value as 'confirmed' | 'needs_verification')}><option value="confirmed">Confirmed</option><option value="needs_verification">Needs verification</option></select></label>
      <label className="hs-field"><input type="checkbox" checked={rosterVerified} onChange={e => setRosterVerified(e.target.checked)} /> I verified the C02–C12 crew roster against the employer’s coverage record.</label>
      <label className="hs-field">Basis or unresolved item<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} /></label>
      <button type="button" className="hs-button is-primary" disabled={task?.status !== 'ready' || status === 'confirmed' && !rosterVerified || !note.trim() || session.busy} onClick={send}>Record employer coverage review</button>
    </Section>}
    {review && <Section icon="calc" title={worker ? t('hr.reviewed') : 'Recorded employer review'}><p>{t(coverageKey(review.status))}{mina && review.note ? ` · ${review.note}` : ''}</p><p className="hs-small">{PERSONAS.find(persona => persona.id === review.reviewed_by)?.name ?? 'Mina Rahman'} · {time(review.reviewed_at)}</p></Section>}
    <CtaBar>{worker ? <button type="button" className="hs-button" onClick={() => navigate('/worker/my-plan')}>{t('hr.back')}</button> : person.id === 'C01' ? <button type="button" className="hs-button" onClick={() => navigate('/site/headcount')}>Back to headcount</button> : person.id === 'P01' ? <button type="button" className="hs-button" onClick={() => navigate('/web/monitoring')}>Back to project monitoring</button> : null}</CtaBar>
  </div>;
}
