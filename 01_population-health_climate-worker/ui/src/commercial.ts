export type ConcernStage = 'raised' | 'routed' | 'receipt_recorded';
export type ConcernEntry = { stage: ConcernStage; at: string; actorId: string };
export type CommercialConcern = ConcernEntry & { entries: ConcernEntry[] };

const next: Record<ConcernStage | 'unraised', { actorId: string; stage: ConcernStage }> = {
  unraised: { actorId: 'C01', stage: 'raised' },
  raised: { actorId: 'P02', stage: 'routed' },
  routed: { actorId: 'P01', stage: 'receipt_recorded' },
  receipt_recorded: { actorId: '', stage: 'receipt_recorded' },
};

export function nextConcernAction(concern?: CommercialConcern) {
  return next[concern?.stage ?? 'unraised'];
}

export function recordConcern(concern: CommercialConcern | undefined, actorId: string, at: string): CommercialConcern | null {
  const action = nextConcernAction(concern);
  if (action.actorId !== actorId) return null;
  const entry = { stage: action.stage, actorId, at };
  return { ...entry, entries: [...(concern?.entries || []), entry] };
}

export function concernStatus(concern?: CommercialConcern) {
  switch (concern?.stage) {
    case 'raised': return 'Huda recorded the pay and lost-output concern; Rashid still needs to send it to Amal';
    case 'routed': return 'Rashid sent Huda’s concern to Amal; her receipt is not yet recorded';
    case 'receipt_recorded': return 'Amal received the pay and lost-output concern; cost allocation not agreed';
    default: return 'Huda has not recorded the pay and lost-output concern';
  }
}
