/** Local, fictional handoffs for the desktop walkthrough. Captured solver data stays read only. */
export interface Persona {
  id: string
  name: string
  role: string
  organisation: string
  description: string
}

export const PERSONAS: Persona[] = [
  { id: 'P03', name: 'Maya Al Qamar', role: 'Safety officer', organisation: 'Sandline', description: 'Monitors local heat conditions and instructs the crew to stop heavy trench work.' },
  { id: 'P02', name: 'Rashid Al Wadi', role: 'Superintendent', organisation: 'Sandline', description: 'Reviews restart conditions and records the shift handover.' },
  { id: 'P04', name: 'Tariq Al Safa', role: 'Permit coordinator', organisation: 'Sandline', description: 'Confirms the permit check for restart review.' },
  { id: 'P05', name: 'Noura Al Nadir', role: 'Logistics coordinator', organisation: 'Sandline', description: 'Coordinates the later materials delivery.' },
  { id: 'P06', name: 'Salim Al Wadi', role: 'First aider', organisation: 'Sandline', description: 'Records first aid contact after Bilal’s report.' },
  { id: 'P01', name: 'Amal Al Nadir', role: 'Project manager', organisation: 'Sandline', description: 'Reviews the project cost impact at handover.' },
  { id: 'C01', name: 'Huda Al Nadir', role: 'Civil foreman', organisation: 'Dune Civil Works', description: 'Accounts for the crew and supervises the workshop move.' },
  { id: 'C05', name: 'Rana Al Nadir', role: 'Civil worker', organisation: 'Dune Civil Works', description: 'Checks in to cooled recovery after heavy trench work stops.' },
  { id: 'C08', name: 'Bilal Al Safa', role: 'Civil worker', organisation: 'Dune Civil Works', description: 'Reports dizziness and follows the first aid route.' },
]

type Flag = 'issued' | 'acknowledged' | 'stopped' | 'checkedIn' | 'recovered' | 'assigned' | 'reported' | 'removed' | 'firstaid' | 'leila' | 'fresh' | 'permit' | 'reviewed' | 'deliveryDrafted' | 'deliveryApproved' | 'deliverySent' | 'deliveryAccepted' | 'handover' | 'costReviewed'
/** Organisation admin for the platform screens (W8, W9). Not part of the nine-person case story. */
export const ADMIN: Persona = { id: 'P09', name: 'Hessa Al Qamar', role: 'HSE systems admin', organisation: 'Sandline', description: 'Publishes company branding and reviews the trust log.' }

export interface StoryEvent { id: string; actorId: string; title: string }
export type StoryState = Record<Flag, boolean> & { events: StoryEvent[] }

export type ActionId = 'issue' | 'acknowledge' | 'stop' | 'checkin' | 'recover' | 'assign' | 'report' | 'remove' | 'firstaid' | 'leila' | 'draftDelivery' | 'approveDelivery' | 'sendDelivery' | 'acceptDelivery' | 'fresh' | 'permit' | 'review' | 'handover' | 'costReview'
interface StoryAction { label: string; actorId: string; prerequisites: Flag[]; title: string; flag: Flag }
export const ACTIONS: Record<ActionId, StoryAction> = {
  issue: { label: 'Stop heavy trench work', actorId: 'P03', prerequisites: [], title: 'Maya instructed the crew to stop heavy trench work', flag: 'issued' },
  acknowledge: { label: 'Acknowledge stop-work instruction', actorId: 'C01', prerequisites: ['issued'], title: 'Huda acknowledged the stop-work instruction', flag: 'acknowledged' },
  stop: { label: 'Confirm heavy work has stopped', actorId: 'C01', prerequisites: ['acknowledged'], title: 'Huda confirmed heavy trench work has stopped', flag: 'stopped' },
  checkin: { label: 'Check in to cooled recovery', actorId: 'C05', prerequisites: ['stopped'], title: 'Rana checked in to cooled recovery', flag: 'checkedIn' },
  recover: { label: 'Account for crew in recovery', actorId: 'C01', prerequisites: ['checkedIn'], title: 'Huda accounted for the affected crew in recovery', flag: 'recovered' },
  assign: { label: 'Confirm workshop assignment', actorId: 'C01', prerequisites: ['recovered'], title: 'Huda confirmed the supervised workshop move', flag: 'assigned' },
  report: { label: 'Report dizziness', actorId: 'C08', prerequisites: ['assigned'], title: 'Bilal requested assistance', flag: 'reported' },
  remove: { label: 'Confirm removal from work', actorId: 'C01', prerequisites: ['reported'], title: 'Huda confirmed Bilal’s removal from work', flag: 'removed' },
  firstaid: { label: 'Record first aid contact', actorId: 'P06', prerequisites: ['removed'], title: 'Salim recorded first aid contact', flag: 'firstaid' },
  leila: { label: 'Confirm Leila’s workshop readiness', actorId: 'C01', prerequisites: ['removed', 'firstaid'], title: 'Huda confirmed Leila’s workshop readiness', flag: 'leila' },
  draftDelivery: { label: 'Draft later delivery', actorId: 'P05', prerequisites: ['assigned'], title: 'Noura drafted a later delivery', flag: 'deliveryDrafted' },
  approveDelivery: { label: 'Approve delivery request', actorId: 'P05', prerequisites: ['deliveryDrafted'], title: 'Noura approved the delivery request', flag: 'deliveryApproved' },
  sendDelivery: { label: 'Record delivery request sent', actorId: 'P05', prerequisites: ['deliveryApproved'], title: 'Noura recorded the delivery request as sent', flag: 'deliverySent' },
  acceptDelivery: { label: 'Record supplier acceptance', actorId: 'P05', prerequisites: ['deliverySent'], title: 'Noura recorded supplier acceptance', flag: 'deliveryAccepted' },
  fresh: { label: 'Record fresh local reading', actorId: 'P03', prerequisites: ['firstaid'], title: 'Maya recorded a fresh local reading', flag: 'fresh' },
  permit: { label: 'Confirm permit check', actorId: 'P04', prerequisites: ['fresh'], title: 'Tariq confirmed the permit check', flag: 'permit' },
  review: { label: 'Record restart review', actorId: 'P02', prerequisites: ['permit', 'fresh', 'removed', 'firstaid'], title: 'Rashid recorded the restart review; work remains stopped', flag: 'reviewed' },
  handover: { label: 'Record shift handover', actorId: 'P02', prerequisites: ['assigned', 'firstaid'], title: 'Rashid recorded the shift handover with restart decisions carried forward', flag: 'handover' },
  costReview: { label: 'Review project cost impact', actorId: 'P01', prerequisites: ['handover'], title: 'Amal reviewed the project cost impact', flag: 'costReviewed' },
}

export function initialStory(): StoryState {
  return {
    issued: false, acknowledged: false, stopped: false, checkedIn: false, recovered: false, assigned: false,
    reported: false, removed: false, firstaid: false, leila: false, fresh: false, permit: false, reviewed: false,
    deliveryDrafted: false, deliveryApproved: false, deliverySent: false, deliveryAccepted: false, handover: false, costReviewed: false, events: [],
  }
}

export function canAct(state: StoryState, actorId: string, actionId: ActionId): boolean {
  const action = ACTIONS[actionId]
  return !!action && action.actorId === actorId && !state[action.flag] && action.prerequisites.every((flag) => state[flag])
}

export function applyAction(state: StoryState, actorId: string, actionId: ActionId): StoryState {
  if (!canAct(state, actorId, actionId)) throw Error(`Action ${actionId} is unavailable for ${actorId}`)
  const action = ACTIONS[actionId]
  return { ...state, [action.flag]: true, events: [...state.events, { id: actionId, actorId, title: action.title }] }
}

const coreOrder: ActionId[] = [
  'issue', 'acknowledge', 'stop', 'checkin', 'recover', 'assign', 'report', 'remove', 'firstaid',
  'draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery', 'handover', 'costReview', 'fresh', 'permit', 'review',
]
export function nextHandoff(state: StoryState): { actorId: string; title: string } {
  const next = coreOrder.find((id) => canAct(state, ACTIONS[id].actorId, id))
  return next ? { actorId: ACTIONS[next].actorId, title: ACTIONS[next].label } : { actorId: '', title: 'All handoffs recorded' }
}
