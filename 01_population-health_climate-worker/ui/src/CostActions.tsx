import { costActions, costAssumptions, calculateCostPlan } from './costModel';
import './CostActions.css';

type Props = { session: any; actingAs: string; onRecord: (id: string) => void; onReviewAssignment?: () => void };
const time = (slot: string) => slot.slice(11, 16);
const usd = (aed: number) => (aed / costAssumptions.aed_per_usd).toFixed(2);

export default function CostActions({ session, actingAs, onRecord, onReviewAssignment }: Props) {
  const plan = calculateCostPlan(session);
  const checks: Array<{ id: string; actorId: string; at: string; snapshot?: ReturnType<typeof calculateCostPlan> }> = session.commercialChecks ?? [];
  const shifted = plan.actualSlot === plan.proposedSlot && plan.deliveryStatus === 'confirmed';
  return <section className="cost-actions" aria-labelledby="cost-actions-title">
    <header className="cost-actions__header">
      <div>
        <span className="cost-actions__eyebrow">Cost planning · next {costAssumptions.window_minutes} minutes</span>
        <h2 id="cost-actions-title">Recovery and delivery decisions</h2>
        <p>Compare the next 30 minutes. Estimates do not approve charges or restart work.</p>
      </div>
    </header>

    <div className="cost-actions__grid">
      <article className="cost-actions__card">
        <h3>People capacity</h3>
        {plan.originalRecoveryCount ? <>
          <p className="cost-actions__metric">{plan.recoveringCount} <span>currently recovering</span></p>
          <div className="cost-actions__rows">
            <div><span>Current recovery · {plan.recoveringCount} × 0.5 h</span><strong>{plan.recoveryHours} worker h · AED {plan.illustrativeRemainingExposureAed} <small>≈ USD {usd(plan.illustrativeRemainingExposureAed)}</small></strong></div>
            <div><span>After eligible workshop move · {plan.recoveringCount - plan.workshopPotentialCount} × 0.5 h</span><strong>{plan.projectedRecoveryHours} worker h · AED {plan.illustrativeProjectedExposureAed} <small>≈ USD {usd(plan.illustrativeProjectedExposureAed)}</small></strong></div>
            <div><span>Already assigned to workshop</span><strong>{plan.workshopCount} × 0.5 h = {plan.workshopHours} potential productive h</strong></div>
            <div><span>Eligible for workshop</span><strong>{plan.workshopPotentialCount} × 0.5 h = {plan.workshopPotentialHours} potential productive h</strong></div>
          </div>
          <details className="cost-actions__request"><summary>Workers and calculation basis</summary><p>{plan.workshopPotentialNames.length ? `Eligible: ${plan.workshopPotentialNames.join(", ")}.` : "No additional workshop move available."} {plan.workshopNames.length ? `Assigned: ${plan.workshopNames.join(", ")}.` : ""}</p><p className="cost-actions__fine">Original recovery: {plan.originalRecoveryCount} people, {plan.originalRecoveryHours} worker h. Based on an assumed AED {costAssumptions.illustrative_burdened_rate_aed_per_worker_hour}/worker h (≈ USD {usd(costAssumptions.illustrative_burdened_rate_aed_per_worker_hour)}), not a wage quote. Workshop hours are possible output, not cash saved.</p></details>
        </> : <p className="cost-actions__empty">Recovery has not been recorded. The roster and worker-hour estimate will appear after Huda records it.</p>}
        {plan.workshopPotentialCount > 0 && onReviewAssignment && <button className="button button-soft" onClick={onReviewAssignment}>Review workshop move</button>}<p className="cost-actions__guard">Only qualified workers may move to the cooled workshop. Recovery and the trench hold continue.</p>
      </article>

      <article className="cost-actions__card">
        <h3>Aggregate delivery</h3>
        <p className="cost-actions__metric">{time(costAssumptions.original_delivery_slot)} <span>original confirmed slot</span></p>
        <div className="cost-actions__rows">
          <div><span>{shifted ? 'Supplier accepted slot' : 'Proposed later slot'}</span><strong>{time(plan.proposedSlot)} GST · {plan.shiftHours} h later</strong></div>
          <div><span>Assumed rescheduling fee</span><strong>AED {costAssumptions.fictional_reschedule_quote_aed} <small>≈ USD {usd(costAssumptions.fictional_reschedule_quote_aed)}</small></strong></div>
          <div><span>If truck waits 1 hour instead</span><strong>AED {costAssumptions.conditional_truck_standby_aed_per_hour} <small>≈ USD {usd(costAssumptions.conditional_truck_standby_aed_per_hour)}</small></strong></div>
        </div>
        <p className="cost-actions__fine">These are alternative planning estimates: a {plan.shiftHours} h slot change is not truck waiting time. The supplier has quoted neither charge.</p>
        <p className="cost-actions__guard">Booking: {shifted ? 'later slot confirmed after supplier acceptance' : plan.deliveryStatus === 'confirmed' ? 'original slot confirmed; later slot still a proposal' : `later slot ${plan.deliveryStatus}; supplier acceptance pending`}.</p>
      </article>
    </div>

    <details className="cost-actions__request"><summary>Noura’s supplier enquiry</summary><p>Oasis dispatch: can you move aggregate delivery from 11:30 to 15:30? Please confirm availability, rescheduling fee and standby rate. The 11:30 booking stands until you accept a new time. No price is agreed.</p></details><div className="cost-actions__followup">
      <h3>Next checks</h3>
      <div className="cost-actions__checks">
        {costActions.map(action => {
          const saved = checks.find(check => check.id === action.id);
          const person = action.actorId === 'C01' ? 'Huda' : action.actorId === 'P05' ? 'Noura' : 'Amal';
          return <div className="cost-actions__check" key={action.id}>
            <div><strong>{person}</strong><span>{action.id === 'recovery_roster' ? 'Confirm recovery and workshop headcounts.' : action.id === 'supplier_quote_request' ? 'Request actual rescheduling and standby fees.' : 'Review exposure and identify missing evidence.'}</span></div>
            {saved ? <div className="cost-actions__saved">Recorded · {time(saved.at)}<small>At record: {saved.snapshot?.recoveringCount ?? '?'} recovering, {saved.snapshot?.workshopCount ?? '?'} workshop, {saved.snapshot?.deliveryStatus ?? 'unknown'} booking</small></div> : <button type="button" disabled={actingAs !== action.actorId || (action.id === 'recovery_roster' && !plan.originalRecoveryCount)} onClick={() => onRecord(action.id)}>{action.label}</button>}
            {!saved && actingAs !== action.actorId && <small>Choose {person} in “Acting as” to record this check.</small>}
          </div>;
        })}
      </div>
      <p className="cost-actions__fine">These checks are local notes. Noura must send the enquiry; the supplier must quote or accept a change.</p>
    </div>
  </section>;
}
