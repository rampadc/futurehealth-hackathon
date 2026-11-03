import type { Session } from './engine';
import { people, policies, tasks, zones } from './fixtures';

export type OperationalOption = { title: string; detail: string; available: boolean; reason: string };
export type Operation = {
  headline: string;
  summary: string;
  nextAction: string;
  owner: string;
  affected: string;
  options: OperationalOption[];
  communication: {
    audience: string;
    english: string;
    arabicDraft: string;
    reviewStatus: string;
  };
  policyIds: string[];
};

const name = (id: string) => people.find(person => person.id === id)?.name ?? id;
const clock = (value: string) => value.slice(11, 16);
const option = (title: string, detail: string, available: boolean, reason: string): OperationalOption => ({ title, detail, available, reason });

/** Explain the synthetic site record. This never authorises work or sends a message. */
export function describeOperation(session: Session): Operation {
  const s = session.state;
  const civil = s.task_status.civil_heavy;
  const held = civil === 'held';
  const alert = Object.values(s.alerts).find(item => item.task_id === 'civil_heavy');
  const alertMinutes = alert?.at ? Math.max(0, Math.floor((Date.parse(s.clock) - Date.parse(alert.at)) / 60_000)) : 0;
  const alertOverdue = !!alert && !alert.acknowledged && alert.status !== 'escalated' && alertMinutes >= 2;
  const stopped = alert?.status === 'stopped';
  const recovered = session.observed.includes('recovery_recorded') || (s.occupancy.shelter_a ?? []).some(id => s.assignments.civil_heavy.includes(id));
  const occupants = s.occupancy.workshop ?? [];
  const workshopCapacity = zones.find(zone => zone.id === 'workshop')?.capacity ?? 0;
  const free = Math.max(0, workshopCapacity - occupants.length);
  const candidates = ['C05', 'C06', 'C07', 'C08'];
  const workshopTask = tasks.find(task => task.id === 'workshop_prep')!;
  const recoveryReady = candidates.every(id => Object.entries(s.occupancy).some(([zoneId, ids]) => zoneId.startsWith('shelter_') && ids.includes(id)));
  const ready = candidates.every(id => {
    const person = people.find(item => item.id === id);
    return person?.acclimatisation === 'complete' && workshopTask.required_qualifications.every(q => person.qualifications.includes(q)) &&
      !Object.entries(s.assignments).some(([taskId, ids]) => taskId !== 'civil_heavy' && taskId !== 'workshop_prep' && s.task_status[taskId] === 'active' && ids.includes(id));
  });
  const assigned = candidates.every(id => s.assignments.workshop_prep.includes(id)) && s.task_status.workshop_prep === 'active';
  const canMove = held && stopped && free >= candidates.length && ready && recoveryReady && !assigned;
  const slot = clock(s.delivery.slot);
  const proposed = session.pendingDeliverySlot ? clock(session.pendingDeliverySlot) : null;
  const deliveryStatus = s.delivery.status;
  const base: Operation = {
    headline: 'Review the site response', summary: '', nextAction: '', owner: '', affected: '', options: [],
    communication: {
      audience: 'Civil crew and site supervisor',
      english: 'Prepared message, not sent: Heavy trench work is on hold. Huda must confirm the crew has stopped and moved to cooled recovery. Rashid must review conditions before any restart.',
      arabicDraft: 'مسودة تجريبية للمراجعة: العمل المدني الشاق معلّق. أكّد استجابة المشرف واتبع إجراءات التعافي في الموقع. لا تستأنف العمل دون مراجعة المسؤول.',
      reviewStatus: 'Arabic draft needs a fluent reviewer and employer approval before worker use. No message was sent.',
    },
    policyIds: [],
  };
  const addPolicies = (...ids: string[]) => { base.policyIds = ids.filter(id => policies.some(policy => policy.id === id)); };
  const heldStatus = held ? stopped ? `Trench work is held; Huda confirmed the stop${recovered ? ' and cooled recovery.' : '. Cooled recovery is not recorded.'}` :
    `Trench work is held; Huda ${alert?.acknowledged ? 'acknowledged the alert but has not confirmed the stop.' : 'has not confirmed the stop.'}` :
    'Heavy trench work is active.';
  const workshop = `Cooled workshop: ${free} of ${workshopCapacity} places free.`;
  const move = option('Move four to workshop', `Huda can supervise Rana, Yusuf, Dana and Bilal preparing pipe markers. ${workshop} Trench work stays held.`, canMove,
    assigned ? 'The four workers are already assigned to workshop preparation.' : !held ? 'Heavy trench work is not on hold.' : !stopped ? 'Huda must confirm the trench crew stopped first.' : !recoveryReady ? 'Confirm the four workers reached cooled recovery first.' : free < candidates.length ? 'The workshop does not have four free places.' : !ready ? 'One or more workers do not meet the qualification, acclimatisation or current assignment checks.' : 'Huda must record the move before it takes effect.');

  switch (session.scenarioId) {
    case '01_pre_shift_planning':
      base.headline = session.cursor > 0 ? 'Review the morning trench plan' : 'Plan around the heat forecast';
      base.summary = session.cursor > 0 ? 'Proposed trench work: 08:00–11:00. Forecast peak: 43°C from 11:00–16:00. Huda checks the crew plan; Noura checks the 11:30 delivery.' : 'Check the forecast before setting trench work and delivery times.';
      base.nextAction = 'Maya checks the current trench reading, water, rest and permit. Rashid reviews the morning plan.';
      base.owner = `${name('P03')} · site HSE officer`;
      base.affected = 'Dune Civil Works trench crew and the yard team planning outdoor work.';
      base.options = [option('Review morning plan', 'Rashid checks the 08:00–11:00 window with Huda after Maya checks local conditions.', true, 'Maya still needs a current trench reading.'), option('Clear work from forecast', 'The regional forecast does not measure trench conditions.', false, 'Maya needs a current trench reading and Rashid’s site decision.')];
      addPolicies('p_heat_program', 'p_twl_process', 'p_twl_assumptions'); break;
    case '02_heat_alert_response':
    case '03_constrained_reassignment':
      base.headline = held ? 'Keep heavy trench work on hold' : 'Check the trench heat reading';
      base.summary = `${heldStatus} ${!held ? 'Maya checks the trench reading.' : !stopped ? 'Huda must account for the crew.' : !recovered ? 'Move the crew to cooled recovery.' : assigned ? 'Four workers are preparing pipe markers.' : 'Huda can check a four-person workshop move.'} ${workshop} Other zones need local checks.`;
      base.nextAction = !held ? 'Maya checks the trench heat reading and records the site response.' : !alert ? 'Maya sends the trench hold instruction to Huda.' : !alert.acknowledged ? 'Huda acknowledges the hold and checks where each crew member is.' : !stopped ? 'Huda confirms heavy trench work has stopped and accounts for the crew.' : !recovered ? 'Huda moves the crew to cooled recovery and records who arrived.' : assigned ? 'Huda supervises the four workers preparing pipe markers in the cooled workshop; the trench hold stays in place.' : 'Huda checks space and qualifications for four-person workshop preparation, then records any move.';
      base.owner = !held || !alert ? `${name('P03')} · site HSE officer` : `${name('C01')} · Dune Civil Works foreman`;
      base.affected = held ? assigned ? 'Seven trench workers remain in cooled recovery; Rana, Yusuf, Dana and Bilal are preparing pipe markers in the workshop.' : stopped ? recovered ? 'Eleven trench workers have a recorded stop and cooled recovery; Huda must keep them accounted for.' : 'Eleven trench workers have a recorded stop but still need cooled recovery.' : 'Eleven trench workers need Huda to confirm the stop and account for them.' : 'The trench crew is working; Maya is checking local heat conditions.';
      base.options = held ? [move, option('Restart trench work', 'Rashid must review a fresh local reading, crew, water, rest, permit and midday restriction.', false, 'The hold remains until Rashid approves a restart.') ] : [option('Check trench heat', 'Maya needs a current trench reading.', true, 'Heavy trench work is held at 150 W/m² or below.')];
      addPolicies('p_heavy_hold', 'p_twl_process', 'p_restart'); break;
    case '04_delivery_coordination':
      base.headline = deliveryStatus === 'confirmed' && slot === '15:30' ? 'Prepare for the 15:30 delivery' : 'Review the 11:30 delivery';
      base.summary = `${deliveryStatus === 'confirmed' && slot === '15:30' ? 'Supplier accepted 15:30; Noura checks yard readiness.' : proposed ? `The 15:30 request is ${deliveryStatus}; 11:30 remains booked until supplier acceptance.` : `The supplier is booked for ${slot}; Noura checks yard capacity.`} ${heldStatus}`;
      base.nextAction = deliveryStatus === 'confirmed' && slot === '15:30' ? 'Noura checks yard staffing for the accepted 15:30 arrival and briefs Dune Civil Works.' : deliveryStatus === 'draft' ? 'Noura approves or revises the 15:30 request before contacting the supplier.' : deliveryStatus === 'approved' ? 'Noura sends the approved 15:30 request to the supplier dispatcher.' : deliveryStatus === 'sent' ? 'Noura waits for supplier acceptance or rejection; the 11:30 booking still stands.' : 'Noura proposes a delivery time the yard can receive and seeks approval.';
      base.owner = `${name('P05')} · Sandline logistics coordinator`;
      base.affected = 'Oasis Aggregate Supply dispatcher, the yard receiving team and Dune Civil Works.';
      base.options = [deliveryStatus === 'confirmed' && slot === '15:30' ? option('Check 15:30 receiving', 'Noura checks yard staffing and briefs Dune Civil Works. Trench work stays held.', true, 'Supplier accepted 15:30.') : option('Request 15:30 delivery', 'Noura checks the yard and seeks supplier acceptance. Trench work stays held.', true, deliveryStatus === 'sent' ? 'Supplier acceptance is pending.' : deliveryStatus === 'approved' ? 'Noura approved the request but has not sent it.' : deliveryStatus === 'draft' ? 'Noura has not approved the draft.' : 'Noura must approve and the supplier must accept.'), option('Book 15:30', 'Only supplier acceptance changes the booking.', deliveryStatus === 'confirmed' && slot === '15:30', deliveryStatus === 'confirmed' && slot === '15:30' ? 'Supplier accepted 15:30.' : '11:30 is still booked.')];
      base.communication.audience = 'Supplier dispatch and Sandline receiving team';
      base.communication.english = slot === '15:30' && deliveryStatus === 'confirmed' ? 'Prepared message, not sent: The supplier accepted aggregate delivery at 15:30. Noura will confirm yard readiness. Heavy trench work remains on hold.' : `Prepared message, not sent: Heavy trench work is on hold. Can the supplier move the aggregate delivery from ${slot} to 15:30? Please confirm with Noura before changing the booking.`;
      base.communication.arabicDraft = slot === '15:30' && deliveryStatus === 'confirmed' ? 'مسودة تجريبية للمراجعة: تم تسجيل قبول المورد لموعد توريد الركام الساعة 15:30. أكّد جاهزية ساحة الاستلام مع منسق الخدمات اللوجستية؛ يظل تعليق العمل المدني ساريًا.' : `مسودة تجريبية للمراجعة: العمل المدني معلّق. يرجى مراجعة موعد توريد الركام المقترح الساعة 15:30؛ الموعد المؤكد المسجل هو ${slot}. أكّد أي تغيير عبر منسق الخدمات اللوجستية.`;
      addPolicies('p_heavy_hold', 'p_heat_program'); break;
    case '05_restricted_worker_assignment':
      base.headline = 'Keep Noor and Adil on supervised light work';
      base.summary = `Noor and Adil are on acclimatisation day 2. Their heavy trench assignment ${session.rejections.includes('acclimatisation') ? 'was blocked' : 'is not allowed'}; Huda keeps them on supervised marking and materials checks.`;
      base.nextAction = 'Huda checks that Noor and Adil stay on supervised marking and materials checks.';
      base.owner = `${name('C01')} · Dune Civil Works foreman`;
      base.affected = 'Noor and Adil, and the trench crew Huda supervises.';
      base.options = [option('Keep light work', 'Huda supervises Noor and Adil on marking and materials checks.', true, 'Huda checks their attendance and conditions.'), option('Assign heavy trench work', 'Noor and Adil are on acclimatisation day 2.', false, 'They cannot join heavy trench work yet.')];
      addPolicies('p_heat_program', 'p_twl_assumptions'); break;
    case '06_sensor_failure':
      base.headline = s.sensor_status.t1 === 'failed' ? 'Trench heat sensor has failed' : 'Check the trench heat sensor';
      base.summary = `${heldStatus} ${s.sensor_status.t1 === 'failed' ? 'Maya needs a working sensor and fresh trench reading.' : 'Maya checks the trench sensor and reading.'} The electrical area reading cannot clear trench work; readings expire after five minutes.`;
      base.nextAction = s.sensor_status.t1 === 'failed' ? 'Maya arranges a fresh trench measurement from a working sensor and keeps heavy trench work on hold for review.' : 'Maya checks the trench sensor before relying on its reading.';
      base.owner = `${name('P03')} · site HSE officer`;
      base.affected = 'Dune Civil Works heavy trench crew.';
      base.options = [option('Measure trench heat', 'Maya needs a working sensor and a reading no more than five minutes old.', s.sensor_status.t1 === 'serviceable', s.sensor_status.t1 === 'failed' ? 'The trench sensor has failed.' : 'A fresh reading and site review are still needed.'), option('Use electrical reading', s.readings.electrical_exposed?.twl === 195 ? 'The 195 W/m² reading measures a different area.' : 'It measures a different area.', false, 'It cannot lift the trench hold.')];
      addPolicies('p_stale', 'p_restart', 'p_twl_process'); break;
    case '07_unacknowledged_alert':
      base.headline = alert?.status === 'escalated' ? 'Rashid must check the unconfirmed trench stop' : alertOverdue ? `Contact Huda: hold unanswered for ${alertMinutes} minutes` : alert ? 'Huda has not acknowledged the trench hold' : held ? 'Send the trench hold to Huda' : 'Check the trench heat reading';
      base.summary = alert?.status === 'escalated' ? 'Huda did not acknowledge within two minutes. Rashid must verify the crew stopped; no stop is recorded.' : alertOverdue ? `Hold sent at ${clock(alert!.at!)}; no acknowledgement or stop recorded. Rashid must check the crew now.` : alert ? `Hold sent at ${clock(alert.at!)}. Huda must acknowledge and confirm the stop; alert Rashid after two minutes without a reply.` : held ? 'Maya sends Huda the hold and asks her to confirm the stop.' : 'Maya checks the trench reading against the heat rule.';
      base.nextAction = alert?.status === 'escalated' || alertOverdue ? 'Rashid contacts Huda, verifies the crew has stopped and records the response.' : alert ? 'Huda acknowledges the hold, stops heavy trench work and accounts for the crew.' : held ? 'Maya sends the trench hold instruction to Huda.' : 'Maya checks the current trench reading and applies the site heat rule.';
      base.owner = alert?.status === 'escalated' || alertOverdue ? `${name('P02')} · Sandline superintendent` : alert ? `${name('C01')} · Dune Civil Works foreman` : `${name('P03')} · site HSE officer`;
      base.affected = 'Dune Civil Works heavy trench crew, Huda and Rashid.';
      base.options = [option('Alert Rashid', 'Escalate an unanswered hold after two minutes.', alertOverdue, alert?.status === 'escalated' ? 'Rashid has already been alerted.' : alertOverdue ? `Unanswered for ${alertMinutes} minutes.` : 'Wait until the hold has been unanswered for two minutes.'), option('Confirm crew stopped', 'An alert does not prove a stop.', false, 'Rashid must verify the stop with Huda.')];
      addPolicies('p_escalate', 'p_heavy_hold'); break;
    case '08_symptom_escalation': {
      const personId = session.notifiedSymptoms[0];
      const aidRecorded = s.evidence.some(item => item.kind === 'first_aid' && item.person_id === personId);
      base.headline = aidRecorded ? 'Keep Bilal off trench work pending return review' : personId ? 'Bilal reported dizziness; contact first aid' : 'Watch for symptoms and contact first aid';
      base.summary = personId ? `Bilal reported dizziness. ${aidRecorded ? 'Salim’s follow-up is recorded; keep Bilal off trench work pending return review.' : 'Keep him off trench work and call Salim for first aid.'} The trench heat reading cannot establish fitness.` : 'Huda sends anyone reporting symptoms to Salim for first aid. A heat reading cannot establish individual fitness.';
      base.nextAction = personId ? aidRecorded ? 'Rashid follows up with Salim and keeps Bilal off the task until the site process resolves his status.' : 'Salim responds to Bilal and records the assessment and referral decision.' : 'Huda sends any worker reporting symptoms to Salim immediately.';
      base.owner = personId ? aidRecorded ? `${name('P02')} · Sandline superintendent` : `${name('P06')} · site first aider` : `${name('C01')} · Dune Civil Works foreman`;
      base.affected = personId ? `${name(personId)} and Huda’s trench crew. Health details stay in the first-aid record.` : 'Any worker reporting symptoms.';
      base.options = [aidRecorded ? option('Review Bilal’s return', 'Salim’s response is recorded; Bilal stays off trench work pending site review.', true, 'The heat reading does not establish fitness.') : option('Contact first aid', personId ? 'Keep Bilal off the task; Salim assesses and decides on referral.' : 'Remove anyone with symptoms and contact Salim.', true, 'Respond regardless of the heat reading.'), option('Return based on heat reading', 'An area reading does not establish individual fitness.', false, personId ? 'Bilal needs the first-aid process.' : 'Symptoms need first-aid review.')];
      base.communication.audience = 'Foreman and trained first aider';
      base.communication.english = personId ? 'Prepared message, not sent: Bilal reported dizziness. Keep him off heavy trench work and contact Salim, the trained first aider. Follow the site emergency process if needed.' : 'Prepared message, not sent: If a worker reports symptoms, remove them from the task and contact Salim, the trained first aider. Follow the site emergency process if needed.';
      if (personId) base.communication.arabicDraft = 'مسودة تجريبية للمراجعة: أبلغ عامل عن أعراض. أبعده عن المهمة واتصل بمسعف مدرّب. اتبع إجراءات الطوارئ في الموقع عند الحاجة؛ لا تستنتج جاهزيته من قراءة TWL.';
      addPolicies('p_symptoms', 'p_heat_program'); break;
    }
    case '09_restart_review':
      {
      const reading = s.readings.civil_exposed;
      const fresh = s.sensor_status.t1 === 'serviceable' && reading?.sensor_id === 't1' && Date.parse(s.clock) - Date.parse(reading.at) >= 0 && Date.parse(s.clock) - Date.parse(reading.at) <= 300_000;
      const localDate = s.clock.slice(0, 10), localTime = s.clock.slice(11, 16);
      const midday = localDate >= '2025-06-15' && localDate <= '2025-09-15' && localTime >= '12:30' && localTime < '15:00';
      const restartReady = held && !!session.review && fresh && reading.twl > 150 && !midday;
      base.headline = held ? 'Rashid must review before trench work restarts' : session.history.some(item => item.event.type === 'restart' && item.status === 'applied') ? 'Monitor the restarted trench crew' : 'Check why heavy trench work is active';
      base.summary = `${held ? 'Trench work stays held until Rashid approves a restart.' : 'Huda monitors the restarted crew.'} ${session.review ? 'Rashid’s review is recorded.' : 'Rashid’s review is still needed.'} ${fresh ? 'The trench reading is fresh.' : 'A fresh trench reading is needed for any restart decision.'}`;
      base.nextAction = held ? 'Rashid checks a fresh trench reading, crew, water, rest, permit and the 12:30–15:00 outdoor-work ban before deciding.' : 'Huda monitors the restarted crew. Any later restart request needs a fresh trench reading and review.';
      base.owner = `${name('P02')} · Sandline superintendent`;
      base.affected = 'Dune Civil Works heavy trench crew.';
      base.options = [option('Ask Rashid to restart', 'Rashid checks fresh trench heat above 150 W/m², crew, water, rest, permit and midday rule.', restartReady, !held ? 'Rashid already approved the restart.' : !session.review ? 'Rashid’s review is not recorded.' : !fresh ? 'A fresh trench reading is missing.' : midday ? 'Outdoor work is prohibited from 12:30 to 15:00.' : reading.twl <= 150 ? 'The trench reading still triggers the hold.' : 'Only Rashid can authorize restart.'), option('Restart from reading alone', 'A better reading does not authorize work.', false, 'Rashid must complete the review and check the midday rule.')];
      addPolicies('p_restart', 'p_stale', 'p_midday', 'p_heavy_hold'); break;
      }
    case '10_handover_and_evidence':
      base.headline = s.open_items.length ? 'Handover recorded; checks remain open' : 'Hand over the trench hold';
      base.summary = `Trench work stays held. Delivery: ${deliveryStatus === 'confirmed' ? `booked for ${slot}` : `${deliveryStatus} for ${slot}`}. ${assigned ? 'Four workers are preparing pipe markers in the cooled workshop.' : 'No workshop move is recorded.'} ${s.open_items.length ? `${s.open_items.length} checks remain open: ` : ''}The incoming supervisor needs a fresh trench reading and permit review before restart.`;
      base.nextAction = s.open_items.length ? 'Incoming supervisor obtains a fresh trench reading and permit review before asking Rashid to consider restart.' : 'Rashid tells the incoming supervisor that the trench hold remains, what Huda recorded, the delivery status and the fresh-reading and permit checks still needed.';
      base.owner = `${name('P02')} · Sandline superintendent`;
      base.affected = 'Incoming site supervisor, Dune Civil Works, Noura and the supplier dispatcher.';
      base.options = [option('Hand over open checks', 'Rashid passes on the hold, crew response and delivery booking.', true, 'Trench work stays held pending restart checks.'), option('Close trench hold', 'A fresh trench reading and permit review are still needed.', false, 'Handover does not lift the hold.')];
      addPolicies('p_restart', 'p_stale', 'p_heat_program'); break;
  }
  if (session.scenarioId !== '04_delivery_coordination' && session.scenarioId !== '08_symptom_escalation') {
    base.communication.english = held ? stopped ? recovered ? 'Prepared message, not sent: Heavy trench work remains on hold. Huda has confirmed the stop and cooled recovery. Rashid must review current conditions before any restart.' : 'Prepared message, not sent: Heavy trench work is on hold. Huda has confirmed the stop and must move the crew to cooled recovery. Rashid must review conditions before any restart.' : 'Prepared message, not sent: Heavy trench work is on hold. Huda must confirm the crew has stopped and moved to cooled recovery. Rashid must review conditions before any restart.' : 'Prepared message, not sent: Heavy trench work is active. Maya must check current trench conditions. Tell Huda and Salim, the first aider, about any symptoms.';
    base.communication.arabicDraft = held ? 'مسودة تجريبية للمراجعة: العمل المدني الشاق معلّق. أكّد استجابة المشرف واتبع إجراءات التعافي في الموقع. لا تستأنف العمل دون مراجعة المسؤول.' : 'مسودة تجريبية للمراجعة: العمل المدني الشاق نشط في هذه المحاكاة. تحقّق من الظروف المحلية الحالية واتبع خطة الموقع للحرارة؛ أبلغ المشرف والمسعف عن أي أعراض.';
  }
  return base;
}
