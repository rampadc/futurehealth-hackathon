import { ACTIONS, PERSONAS, type ActionId } from './story';
import { nameOf } from './replay';

/** Shared product wording; source evidence retains its original terminology. */
export const copy = {
  signInDescription: 'Manage site instructions, crew recovery and shift handovers.',
  accountHint: 'Select your account to continue. Sign out when handing over to another person.',
  stoppedTitle: 'Heavy trench work is stopped',
  stoppedDetail: 'Workshop preparation and required recovery are managed separately.',
  stoppedStatus: 'Work stopped',
  pendingTitle: 'New heat finding at the civil trench',
  pendingDetail: 'Maya must review the local reading and issue the stop-work instruction.',
  instructionTitle: 'Stop-work instruction issued',
  instructionDetail: 'Huda must acknowledge the instruction and confirm that heavy trench work has stopped.',
  recorded: (label: string) => `${label} recorded.`,
  unsupportedQuestion: 'Choose one of the suggested questions, or contact the person responsible for the next action.',
  loadError: 'Case information could not be loaded. Please try again.',
};

export const buttonLabels: Record<ActionId, string> = {
  issue: 'Stop work', acknowledge: 'Acknowledge', stop: 'Confirm stopped',
  checkin: 'Check in', recover: 'Confirm headcount', assign: 'Confirm assignment',
  report: 'Report dizziness', remove: 'Confirm removal', firstaid: 'Record contact',
  leila: 'Confirm readiness', draftDelivery: 'Draft request', approveDelivery: 'Approve',
  sendDelivery: 'Record sent', acceptDelivery: 'Record acceptance', fresh: 'Record reading',
  permit: 'Confirm permit', review: 'Record review', handover: 'Record handover', costReview: 'Record review',
};

const reasonLabels: Record<string, string> = {
  reading_stale: 'Local reading is out of date',
  twl_heavy_limit: 'TWL at or below the heavy-work limit (150 W/m²)',
  permit_confirmation_required: 'Permit confirmation is needed',
  midday_restriction: 'Outdoor work is restricted at this time',
  optimizer_unknown: 'The crew planner could not establish a reliable result',
  model_invalid: 'The crew plan did not pass validation',
};
export const reasonLabel = (code: string) => reasonLabels[code] ?? code.replaceAll('_', ' ');

export function taskReason(reason: string | undefined): string | undefined {
  const described = reason?.replace(/\bC\d{2}\b/g, id => nameOf(id));
  if (!described?.startsWith('Waiting for ')) return described;
  const owners: Record<string, string> = { activity: 'C01', readiness: 'C01', incident_record: 'C01', personnel: 'C01', recovery_check: 'C01', crew_readiness: 'C01', water: 'P03', escalation_followup: 'P02' };
  return 'Waiting for ' + described.slice('Waiting for '.length).split(', ').map(id => {
    const action = ACTIONS[id as ActionId];
    const ownerId = action?.actorId ?? owners[id];
    const owner = PERSONAS.find(person => person.id === ownerId)?.name.split(' ')[0];
    return `${action?.label ?? reasonLabel(id)}${owner ? ` · ${owner}` : ''}`;
  }).join(', ');
}
