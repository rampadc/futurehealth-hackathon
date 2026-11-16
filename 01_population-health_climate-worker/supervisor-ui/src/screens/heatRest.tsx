import { useEffect, useState } from 'react';
import { live, type HeatRestView } from '../live';
import { navigate } from '../router';
import { time } from './data';
import { CtaBar, Head, Hero, Metric, NoCase, Note, Section } from './kit';
import type { ScreenProps } from './registry';

const CREW_IDS = Array.from({ length: 11 }, (_, i) => `C${String(i + 2).padStart(2, '0')}`);

export function HeatRestScreen({ session }: ScreenProps) {
  const { caseView, person } = session;
  const [policy, setPolicy] = useState<HeatRestView | null>(null);
  const [error, setError] = useState('');
  const [rosterVerified, setRosterVerified] = useState(false);
  const [status, setStatus] = useState<'confirmed' | 'needs_verification'>('confirmed');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!caseView || !person) return;
    let active = true;
    void live.heatRest().then(value => { if (active) { setPolicy(value); setError(''); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Coverage could not be loaded'); });
    return () => { active = false; };
  }, [caseView?.case_id, caseView?.version, person?.id]);
  if (!caseView || !person) return <NoCase session={session} />;
  const review = policy?.coverage_review;
  const mina = person.id === 'P10';
  const rana = person.id === 'C05';
  const arrival = caseView.headcount?.arrivals.some(a => a.person_id === person.id);
  const task = caseView.tasks.find(t => t.action === 'coverage_review' && t.actor_id === person.id);
  const send = () => { if (!policy || !rosterVerified || !note.trim()) return; void session.act('coverage_review', { policy_id: policy.policy_id, status, crew_ids: CREW_IDS, roster_verified: true, note: note.trim() }); };
  return <div className="hs-screen">
    <Head kicker="Employer · Dune Civil Works" title={mina ? 'Heat and rest coverage review' : rana ? 'My heat and rest coverage' : person.id === 'P01' ? 'Project heat and rest view' : 'Crew heat and rest coverage'} />
    {error && <p role="alert" className="hs-error">{error}</p>}
    <Section title={policy?.title ?? 'Heat Rest Schedule'}>
      <p>{policy?.source ?? 'Loading policy…'}</p>{policy?.commitment && <p><b>{policy.commitment}</b></p>}<p className="hs-small">Policy {policy?.policy_id ?? 'heat-rest-schedule-v1'} · {rana ? 'Your own coverage' : policy?.scope ?? 'Dune Civil Works crew'} · case {policy?.case_id ?? caseView.case_id}</p>
      <Note>Coverage review is an employer record. Safety actions and recovery continue independently.</Note>
    </Section>
    <Hero>
      <Metric label="Stop-work" value={policy?.records?.stop?.confirmed_at ? 'Confirmed' : policy?.records?.instruction?.issued_at ? 'Issued' : 'Pending'} sub={time(policy?.records?.stop?.confirmed_at)} />
      <Metric label={rana ? 'My arrival' : 'Shelter arrivals'} value={rana ? arrival || policy?.records?.arrivals?.some(a => a.person_id === person.id) ? 'Recorded' : 'Not recorded' : `${policy?.records?.headcount?.checked_in_count ?? caseView.headcount?.checked_in_count ?? 0} / ${policy?.records?.headcount?.expected_count ?? caseView.headcount?.expected_count ?? 11}`} />
      <Metric label="Coverage review" value={review ? review.status.replaceAll('_', ' ') : 'Pending'} sub={review?.reviewed_at ? time(review.reviewed_at) : undefined} />
    </Hero>
    {!rana && <Section title="Case-linked operations">
      <p>Foreman headcount: {policy?.records?.headcount?.confirmed_count ?? caseView.headcount?.confirmed_count ?? 0} / {policy?.records?.headcount?.expected_count ?? caseView.headcount?.expected_count ?? 11} confirmed. Observed activity records: {policy?.records?.observed_time?.length ?? 0}.</p>
      <p>Assessed proposal: {caseView.plan_assessment?.status ?? 'none'}{caseView.plan_assessment?.assessed_at ? ` · ${time(caseView.plan_assessment.assessed_at)}` : ''}. Heavy trench work remains stopped.</p>
    </Section>}
    {mina && policy?.review_queue && <Section title="Employer review queue"><p>{policy.review_queue.status} · {policy.review_queue.confirmed_count} of {policy.review_queue.expected_count} confirmed by the foreman.</p></Section>}
    {person.id === 'P01' && policy?.commercial_summary && <Section title="Project summary"><p>Stop: {time(policy.commercial_summary.stop_at)} · recovery confirmed: {time(policy.commercial_summary.recovery_confirmed_at)} · coverage: {policy.commercial_summary.coverage_status ?? 'pending'}.</p><p>Cost impact review: {time(policy.commercial_summary.cost_review_at)}.</p></Section>}
    {mina && !review && <Section title="Employer confirmation">
      <label className="hs-field">Coverage status<select value={status} onChange={e => setStatus(e.target.value as 'confirmed' | 'needs_verification')}><option value="confirmed">Confirmed</option><option value="needs_verification">Needs verification</option></select></label>
      <label className="hs-field"><input type="checkbox" checked={rosterVerified} onChange={e => setRosterVerified(e.target.checked)} /> I verified the C02–C12 crew roster against the employer’s coverage record.</label>
      <label className="hs-field">Basis or unresolved item<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} /></label>
      <button type="button" className="hs-button is-primary" disabled={task?.status !== 'ready' || !rosterVerified || !note.trim() || session.busy} onClick={send}>Record employer coverage review</button>
    </Section>}
    {review && <Section title="Recorded employer review"><p>{review.status.replaceAll('_', ' ')} · {review.note}</p><p className="hs-small">{review.reviewed_by ?? 'Mina'} · {time(review.reviewed_at)}</p></Section>}
    <CtaBar>{rana ? <button type="button" className="hs-button" onClick={() => navigate('/worker/my-plan')}>Back to my plan</button> : person.id === 'C01' ? <button type="button" className="hs-button" onClick={() => navigate('/site/headcount')}>Back to headcount</button> : person.id === 'P01' ? <button type="button" className="hs-button" onClick={() => navigate('/web/monitoring')}>Back to project monitoring</button> : null}</CtaBar>
  </div>;
}
