import { isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Clock3, ExternalLink,
  FileText, Filter, GitBranch, HardHat, HelpCircle, LayoutDashboard, MapPin, Menu,
  MoreHorizontal, PauseCircle, Play, Radio, RefreshCcw, RotateCcw, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Users, Waves, X,
} from 'lucide-react';
import { ReactFlow, Background, Controls, Handle, Position, type Edge, type Node } from '@xyflow/react';
import * as Dialog from '@radix-ui/react-dialog';
import '@xyflow/react/dist/style.css';
import { act, advanceClock, createSession, getConnectedNext, prepareNextHumanAction, resetSession, scenarioComplete, stepSession } from './engine';
import { assets, connectedSequence, crews, deliveries, fixtures, organisations, people, policies, scenarioIds, sources, tasks, zones, type ScenarioId } from './fixtures';
import { ThermalReading } from './ThermalReading';
import ForecastPlan from './ForecastPlan';
import ScenarioVisual from './ScenarioVisual';
import RecommendationBasis from './RecommendationBasis';
import CostActions from './CostActions';
import SiteOperations from './SiteOperations';
import { costActions, calculateCostPlan } from './costModel';
import { describeOperation, type Operation } from './operational';
import { applyHumanAction, driveStream, type StreamActivity } from './stream';
import decisionContext from '../../demo/cross-scenario/decision_context.json';
import { concernStatus, nextConcernAction, recordConcern } from './commercial';
import ResponseQueue from './ResponseQueue';
import type { QueueAction } from './responseQueueModel';

type View = 'overview' | 'handover' | 'site' | 'policies' | 'workflows';
type Dataset = 'people' | 'crews' | 'tasks' | 'zones' | 'assets' | 'deliveries' | 'organisations';
const STORE = 'sandline-heat-safe-v1';
const CHANNEL = 'sandline-heat-safe';
const STREAM_LEASE = 'sandline-heat-safe-stream-owner';
const PLAYBACK = 'sandline-heat-safe-playback';
const ROLE_STORE = 'sandline-heat-safe-role';
const TAB_ID = crypto.randomUUID();
function readPlayback() { try { return JSON.parse(localStorage.getItem(PLAYBACK) || 'null') || {playing:true,speed:1400}; } catch { return {playing:true,speed:1400}; } }
const title = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const caseNames: Record<ScenarioId,string> = {
  '01_pre_shift_planning':'Plan trench work before the 43°C forecast peak',
  '02_heat_alert_response':'Stop trench work and move eleven workers to recovery',
  '03_constrained_reassignment':'Move four qualified workers to the cooled workshop',
  '04_delivery_coordination':'Ask Oasis to move aggregate delivery to 15:30',
  '05_restricted_worker_assignment':'Keep Noor and Adil off heavy trench work',
  '06_sensor_failure':'Civil monitor fails; electrical reading cannot clear trench',
  '07_unacknowledged_alert':'Rashid checks an unanswered trench hold',
  '08_symptom_escalation':'Bilal reports dizziness despite a non-hold reading',
  '09_restart_review':'Rashid checks restart; a later stale reading blocks it',
  '10_handover_and_evidence':'Hand over the held trench, seven recovering workers and delivery',
};
const incidentTitles: Record<ScenarioId, string> = {
  '01_pre_shift_planning': 'Morning work plan',
  '02_heat_alert_response': 'Trench heat hold',
  '03_constrained_reassignment': 'Trench heat hold',
  '04_delivery_coordination': 'Trench heat hold',
  '05_restricted_worker_assignment': 'Worker assignment review',
  '06_sensor_failure': 'Trench monitor failure',
  '07_unacknowledged_alert': 'Unanswered trench hold',
  '08_symptom_escalation': 'Worker needs first aid',
  '09_restart_review': 'Trench restart review',
  '10_handover_and_evidence': 'Trench heat hold',
};
const caseName = (id: string) => caseNames[id as ScenarioId] || fixtures[id as ScenarioId].meta.title;
const time = (value?: string) => value ? new Date(value).toLocaleTimeString('en-AU', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const fmt = (value: unknown) => isValidElement(value) ? value : Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—');
const personName = (id?: string) => people.find(p => p.id === id)?.name ?? id ?? 'Site team';
const eventLabel = (type: string, event?: {payload?:Record<string,any>}) => type === 'assign_attempt' && event?.payload?.task_id === 'civil_heavy' ? 'Check Noor and Adil’s heavy-work request' : ({ forecast:'Forecast heat outlook', recommendation:'Review early trench work plan', twl: 'Local heat measurement', hold: 'Issue trench hold', ack: 'Huda acknowledges the hold', stop: 'Huda confirms trench work stopped', recover: 'Move civil crew to cooled recovery', assign_attempt:'Check proposed fourteen-person workshop move', assign:'Move four workers to workshop preparation', check:'Check Noor and Adil on supervised light work', delivery_draft:'Draft later aggregate delivery request', delivery_approve:'Approve supplier contact', delivery_send:'Send aggregate slot request', delivery_accept:'Supplier accepts 15:30 booking', sensor_fail:'Civil heat monitor fails', clearance_attempt:'Check requested civil clearance', clock:'Site clock advances', escalate:'Escalate missing acknowledgment', symptom:'Bilal reports dizziness', first_aid:'Salim records first aid response', restart_attempt:'Check trench restart request', review:'Rashid reviews restart conditions', restart:'Rashid authorizes trench restart', handover:'Rashid confirms shift handover' } as Record<string,string>)[type] ?? title(type);
const policyNames: Record<string,string> = { p_heat_program:'Site heat protection and acclimatisation', p_twl_process:'How local heat conditions are assessed', p_twl_assumptions:'Limits of the TWL guidance', p_midday:'Summer midday outdoor work restriction', p_heavy_hold:'Sandline heavy trench work hold', p_stale:'Fresh, working local monitor required', p_escalate:'Escalate a hold without acknowledgment', p_restart:'Checks required before trench restart', p_symptoms:'Respond to reported heat illness' };
const policyRule = (rule: string) => rule.replace(' No computation is performed in this demo.', '').replace(' in this demo;', ';').replace('an invented Sandline trigger', 'a Sandline site trigger');
const policyName = (id: string) => policyNames[id] || title(id.replace(/^p_/,''));
const classificationName = (value: string) => ({fictional_site_policy:'Sandline site rule', published_requirement:'Published requirement', guidance_or_reported_practice:'Guidance or reported practice'} as Record<string,string>)[value] || title(value);
const stageName = (value: string) => ({raised:'Huda raised the concern', routed:'Rashid sent it to Amal', receipt_recorded:'Amal received it for review'} as Record<string,string>)[value] || title(value);
const costHeading: Record<ScenarioId,string> = {
  '01_pre_shift_planning':'Check whether changing the work schedule adds cost',
  '02_heat_alert_response':'Verify recovery pay and record the cost of stopped trench work',
  '03_constrained_reassignment':'Record workshop output and remaining crew recovery time',
  '04_delivery_coordination':'Check supplier rescheduling charges and programme delay',
  '05_restricted_worker_assignment':'Review the staffing impact of Noor and Adil’s light-work restriction',
  '06_sensor_failure':'Record verification delay from the failed civil monitor',
  '07_unacknowledged_alert':'Reconcile alert, response and actual stop times',
  '08_symptom_escalation':'Refer any pay or absence question to Dune’s employer team',
  '09_restart_review':'Record actual hold and restart times for programme review',
  '10_handover_and_evidence':'Hand Amal the unresolved pay, output and supplier costs',
};
const outcomeNames: Record<string,string> = {
  forecast_used_for_planning:'43°C forecast used to plan the morning trench window', no_safety_clearance:'Forecast has not cleared work',
  restricted_heavy_assignment_rejected:'Noor and Adil’s heavy-work request was blocked', supervised_light_assignment_preserved:'Noor and Adil remain on supervised light work',
  civil_measurement_unavailable:'Civil work-front measurement unavailable', other_zone_not_substituted:'Electrical reading was not used for civil clearance', clearance_blocked:'Civil clearance request was blocked',
  hold_open:'Trench hold remains open', no_acknowledgment:'No acknowledgment from Huda was recorded', superintendent_escalated:'Rashid was asked to verify the crew directly',
  first_aider_alerted:'Salim was contacted about Bilal', worker_removed_from_task:'Bilal was removed from trench work', no_diagnosis:'No diagnosis entered in the shared site record', incident_recorded:'First aid follow-up recorded',
  improvement_not_auto_restart:'Improved reading did not restart trench work', human_review_recorded:'Rashid’s restart checks were recorded', stale_branch_blocked:'Later stale reading blocked another restart request',
};
const readableItem = (value: string) => value.replace(/\bfictional /gi, '').replace('The replay confirms', 'The record confirms').replace(/\bC08\b/g, 'Bilal').replace(/\bC13\b/g, 'Noor').replace(/\bC14\b/g, 'Adil').replace(/\bP01\b/g, 'Amal').replace(/\bP02\b/g, 'Rashid').replace(/\bP03\b/g, 'Maya').replace(/\bP05\b/g, 'Noura').replace(/\bP06\b/g, 'Salim').replace(/\bt1\b/g, 'civil heat monitor').replace(/\bt2\b/g, 'electrical heat monitor').replace(/sandline_case_01|heat_case_01/g, 'the linked trench incident');
const evidenceText = (item: any) => item.kind === 'hold' ? `Maya issued the trench hold at ${time(item.at)} GST. Huda’s stop confirmation is recorded separately.` : item.kind === 'first_aid' ? `Salim recorded Bilal’s trained assessment and referral decision at ${time(item.at)} GST. Clinical detail is not in this record.` : readableItem(JSON.stringify(item));
const crewName = (id?:string) => ({principal:'Sandline site team', civil:'Dune civil crew', electrical:'Electrical preparation crew', logistics:'Receiving yard crew'} as Record<string,string>)[id || ''] || '—';
const assetName = (id:string) => ({t1:'Civil trench heat monitor',t2:'Electrical work-front heat monitor',t3:'Receiving yard heat monitor',water_1:'Drinking water supply',radio_net:'Site radio network',excavator_01:'Civil trench excavator',forklift_01:'Receiving yard forklift',twl_portable_01:'Portable heat monitor'} as Record<string,string>)[id] || title(id);
const concernText = 'Heavy trench work is held. Dune’s ordinary-shift recovery term covers this civil crew, but the site record does not verify payroll. Please review lost output, standby and any supplier rescheduling cost; no client allowance or cost allocation is agreed.';
const crewBriefingText = 'The heavy trench task is held. Move to cooled recovery and follow Huda’s instructions. Dune’s approved Heat Rest Schedule covers required recovery during your ordinary rostered shift. This site record does not show that payroll has been processed. Ask Dune’s employer team about your individual pay.';
const concernStep = {
  unraised: 'Huda records the concern for Rashid to route.',
  raised: 'Rashid routes Huda’s concern to Amal.',
  routed: 'Amal records receipt for commercial review.',
  receipt_recorded: 'Amal has received the concern. Cost review remains open.',
};
function activityTime(item: StreamActivity, clock: string) {
  return Date.parse(item.at) > Date.parse(clock) ? `Scheduled ${time(item.at)} GST` : `${time(item.at)} GST`;
}
function chapterActionStatus(session: any, type: string, carriedState: boolean) {
  if (session.history.some((entry: any) => entry.status === 'applied' && entry.event.type === type)) return 'Recorded';
  if (carriedState) return 'Starting state';
  if (session.pendingEvent?.type === type) return 'Awaiting action';
  return 'No record';
}

function initialSession() {
  try { const stored = JSON.parse(localStorage.getItem(STORE) || 'null'); if (stored?.scenarioId && scenarioIds.includes(stored.scenarioId)) return readySession(stored); } catch { /* Ignore stale demo state. */ }
  return createSession('02_heat_alert_response');
}

function readySession(session: any) {
  if (!session.pendingEvent) prepareNextHumanAction(session);
  return session;
}

function useDemoSession() {
  const [session, setSession] = useState<any>(initialSession);
  const sessionRef = useRef(session);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORE && e.newValue) { try { const next = readySession(JSON.parse(e.newValue)); sessionRef.current = next; setSession(next); } catch { /* Ignore malformed external state. */ } } };
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => { try { const next = JSON.parse(localStorage.getItem(STORE) || 'null'); if (next) { readySession(next); sessionRef.current = next; setSession(next); } } catch { /* Ignore malformed external state. */ } };
    window.addEventListener('storage', onStorage);
    return () => { channel.close(); window.removeEventListener('storage', onStorage); };
  }, []);
  const update = useCallback((change: (current: any) => any) => {
    const next = change(sessionRef.current);
    if (next === sessionRef.current) return;
    sessionRef.current = next;
    setSession(next);
    localStorage.setItem(STORE, JSON.stringify(next));
    const channel = new BroadcastChannel(CHANNEL); channel.postMessage('refresh'); channel.close();
  }, []);
  return { session, update };
}

function Status({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral'|'danger'|'good'|'warn'|'blue' }) { return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>; }
const actionLabels: Record<string,string> = {
  recommendation:'Record proposed plan', hold:'Issue hold', ack:'Acknowledge hold',
  stop:'Confirm work stopped', recover:'Confirm 11 in recovery', assign_attempt:'Check assignment',
  assign:'Assign four workers', check:'Confirm light work', delivery_draft:'Draft new slot',
  delivery_approve:'Approve request', delivery_send:'Send request', sensor_fail:'Record sensor failure',
  clearance_attempt:'Check clearance', escalate:'Record escalation', symptom:'Record symptoms',
  first_aid:'Record first-aid response', restart_attempt:'Check restart', review:'Complete review',
  restart:'Authorise restart', handover:'Confirm handover',
};
const actionLabel = (event?: {type:string; payload?:Record<string,any>}) => event ? actionLabels[event.type] ?? eventLabel(event.type,event) : '';
const actionExplanation = (event: {type:string;payload?:Record<string,any>}, session: any) => event.type === 'assign_attempt' && event.payload?.task_id === 'civil_heavy' ? 'Noor and Adil are on acclimatisation day two. Check the attempted heavy trench assignment against that restriction; a rejected request leaves them on supervised light work.' : event.type === 'clearance_attempt' ? `Check the ${event.payload?.using_sensor_id === 't2' ? 'electrical-zone reading' : 'failed or stale civil-zone reading'}. It cannot establish current trench conditions. Arrange a fresh reading from a working trench monitor.` : event.type === 'restart_attempt' && session.history.some((entry:any)=>entry.event.type==='restart' && entry.status==='applied') ? 'The earlier restart record does not clear a later request when the local reading has gone stale. Check current conditions again.' : actionContext[event.type] || describeOperation(session).nextAction;
const responseRoles = ['P03', 'C01', 'P06', 'P05', 'P02', 'P01'];
const roleLabel = (id: string) => ({ P03: 'Maya · HSE', C01: 'Huda · foreman', P06:'Salim · first aider', P05: 'Noura · logistics', P02: 'Rashid · superintendent', P01: 'Amal · project manager' } as Record<string,string>)[id] || personName(id);
const actionPolicy: Record<string,string> = { hold:'p_heavy_hold', ack:'p_heavy_hold', stop:'p_heavy_hold', recover:'p_heat_program', assign_attempt:'p_heat_program', assign:'p_heat_program', delivery_draft:'p_heavy_hold', delivery_approve:'p_heavy_hold', delivery_send:'p_heavy_hold', restart_attempt:'p_restart', review:'p_restart', restart:'p_restart', handover:'p_restart' };
const actionContext: Record<string,string> = {
  hold:'The local work-front reading triggered Sandline’s heavy-work hold. Confirm the instruction and route it to Huda.',
  ack:'Confirm you received Maya’s hold instruction. This does not yet confirm the crew stopped.',
  stop:'Confirm the civil heavy task is stopped and the affected crew has been accounted for.',
  recover:'Confirm eleven affected workers reached cooled recovery before any reassignment.',
  recommendation:'Confirm the proposed 08:00–11:00 plan with Rashid after checking trench heat, crew, water, rest and permits.',
  assign_attempt:'Check the proposed move against the named workers’ qualifications, recovery status and available workshop places. A blocked proposal moves nobody.',
  assign:'Confirm Rana, Yusuf, Dana and Bilal move from recovery to supervised preparation in the cooled workshop. Trench work stays held.',
  delivery_draft:'Record a proposed 15:30 aggregate slot. The supplier’s confirmed 11:30 slot remains in force.',
  delivery_approve:'Approve the proposed 15:30 request for supplier contact; this does not change the confirmed slot.',
  delivery_send:'Confirm sending the approved 15:30 request to supplier dispatch. Wait for acceptance before treating it as confirmed.',
  handover:'Confirm the shift record cites the heat hold, accepted delivery slot, and unresolved restart checks.',
  review:'Attest that the fresh local measurement, people, water, rest, permit and midday checks were reviewed.',
  restart:'Authorize restart only after the superintendent review is recorded.',
  check:'Confirm Noor and Adil are on supervised marking and materials checks. Both are on acclimatisation day two.',
  sensor_fail:'Confirm the civil work-front monitor has failed. Its last reading cannot clear the trench; request a fresh local assessment.',
  clearance_attempt:'Check whether the selected monitor is working, current and in the civil zone. A rejected request does not clear the trench.',
  escalate:'The two-minute acknowledgment window has passed. Record the escalation to Rashid; he must contact Huda or the work front and verify whether work stopped.',
  symptom:'Record Bilal’s dizziness report, remove him from the task and contact Salim. A normal environmental reading does not settle an individual symptom report.',
  first_aid:'Salim records that a trained assessment and referral decision occurred. Clinical details stay in the first-aid process.',
  restart_attempt:'Check the requested restart against current local evidence and Rashid’s review. A rejected request leaves the hold in force.',
};
function responseFacts(session: any) {
  const state = session.state;
  const inRecovery = ['shelter_a','shelter_b','welfare'].flatMap(id => state.occupancy[id] || []).filter(id => String(id).startsWith('C')).length;
  const inWorkshop = (state.assignments.workshop_prep || []).filter((id:string) => ['C05','C06','C07','C08'].includes(id)).length;
  const held = state.task_status.civil_heavy === 'held';
  const hold = Object.values(state.alerts || {}).find((item:any) => item.task_id === 'civil_heavy') as any;
  const detected = !!state.case_id || (!!state.readings.civil_exposed && state.readings.civil_exposed.twl <= 150);
  const protectedCrew = held && hold?.status === 'stopped' && inRecovery + inWorkshop === 11;
  const replanned = inWorkshop === 4;
  const coordinated = state.delivery.status === 'confirmed' && time(state.delivery.slot) === '15:30';
  const handedOver = session.scenarioId === '10_handover_and_evidence' && session.observed.includes('unresolved_items_visible');
  return { inRecovery, inWorkshop, held, hold, detected, protectedCrew, replanned, coordinated, handedOver };
}
function commercialContextStatus(session: any) {
  if (session.scenarioId === '04_delivery_coordination' && !responseFacts(session).coordinated) return 'The 15:30 slot remains proposed or sent until supplier acceptance; charges and allocation are unconfirmed.';
  return readableItem(decisionContext[session.scenarioId as ScenarioId].commercial.status);
}
function JourneyProgress({session}:{session:any}) {
  const facts = responseFacts(session);
  const stages = [
    ['Hold issued', !!facts.hold, facts.hold?.at ? `${time(facts.hold.at)} GST` : facts.hold ? 'Starting record · time unavailable' : 'Awaiting Maya'],
    ['Acknowledged', !!facts.hold?.acknowledged, facts.hold?.acknowledged ? 'Huda confirmed receipt' : 'Awaiting Huda'],
    ['Work stopped', facts.hold?.status === 'stopped', facts.hold?.status === 'stopped' ? 'Huda confirmed stop' : 'Stop unconfirmed'],
    ['Crew in recovery', facts.inRecovery + facts.inWorkshop === 11, `${facts.inRecovery + facts.inWorkshop} of 11 located`],
  ] as const;
  return <ol className="journey-progress" aria-label="Incident response progress">{stages.map(([stage,done,detail],index) => <li key={stage} className={done ? 'done' : stages.slice(0,index).every(([,complete])=>complete) ? 'current' : 'future'}><span>{done ? <Check size={13}/> : index + 1}</span><div><strong>{stage}</strong><small>{detail}</small></div></li>)}</ol>;
}
function downloadHandover(session: any) {
  const facts = responseFacts(session);
  const context = decisionContext[session.scenarioId as ScenarioId];
  const lines = [
    `PROJECT SANDLINE · SHIFT HANDOVER · ${session.state.case_id || 'Incident pending'}`,
    `Site time: ${time(session.state.clock)} GST`,
    `Status: ${facts.handedOver ? 'Confirmed by superintendent' : 'Draft from current state'}`,
    ...(connectedSequence.includes(session.scenarioId) ? [
      `Civil heavy work: ${facts.held ? 'HELD; restart requires superintendent authorization' : 'Active'}`,
      `Recorded recovery or workshop locations: ${facts.inRecovery + facts.inWorkshop}/11 workers; ${facts.inRecovery} in cooled recovery; ${facts.inWorkshop} on supervised workshop preparation`,
      `Confirmed aggregate booking: ${time(session.state.delivery.slot)} GST${facts.coordinated ? ' (15:30 change accepted by supplier)' : ' (original commitment)'}`,
      ...(!facts.coordinated && session.pendingDeliverySlot ? [`Proposed aggregate change: ${time(session.pendingDeliverySlot)} GST; ${session.state.delivery.status}; supplier acceptance pending.`] : []),
    ] : [
      `Situation: ${describeOperation(session).headline}`,
      `Affected: ${describeOperation(session).affected}`,
      `Next action: ${describeOperation(session).nextAction}`,
    ]),
    ...(session.history.filter((entry:any) => entry.status === 'applied').map((entry:any) => `Recorded in this case: ${eventLabel(entry.event.type, entry.event)} · ${entry.event.actor_id ? personName(entry.event.actor_id) : 'Site or supplier signal'} · ${time(entry.at)} GST.`)),
    'Starting state values may lack a corresponding confirmation event in this case.',
    `Existing site process (scenario context, not an event confirmation): ${readableItem(context.existingProcess)}`,
    `Cost and pay context: ${context.commercial.items.map(readableItem).join(' ')}`,
    ...(connectedSequence.includes(session.scenarioId) ? [
      `Output and pay concern: ${concernStatus(session.commercialConcern)}.`,
      `Crew briefing: ${session.crewBriefing ? `Huda recorded the prepared briefing at ${time(session.crewBriefing.at)} GST (local note).` : 'Prepared for Huda; no briefing recorded.'}`,
      `Prepared worker briefing: ${session.crewBriefing?.text || crewBriefingText}`,
      `Concern text for review: ${concernText}`,
    ] : []),
    ...(connectedSequence.includes(session.scenarioId) ? (session.commercialConcern?.entries || []).map((entry: {stage:string;actorId:string;at:string}) => `Concern note: ${personName(entry.actorId)} ${stageName(entry.stage)} at ${time(entry.at)} GST (case record).`) : []),
    `Commercial review owner: ${context.commercial.owner}. Status: ${commercialContextStatus(session)}.`,
    ...(session.commercialChecks || []).map((entry:any) => `Planning note: ${entry.id} · ${personName(entry.actorId)} · ${time(entry.at)} GST · estimate snapshot ${JSON.stringify(entry.snapshot)}`),
    `Checks and cost questions: ${readableItem(context.trustQuestion)} ${readableItem(context.moneyQuestion)}`,
    ...context.evidenceNeeded.map((item: string) => `Evidence to verify: ${readableItem(item)}`),
    ...(connectedSequence.includes(session.scenarioId) ? [session.crewBriefing ? 'Huda’s local briefing note is recorded; payroll execution is not verified. Recorded worker periods do not establish an approved claim.' : 'No crew briefing or payroll execution is recorded. Recorded worker periods do not establish an approved claim.'] : []),
    connectedSequence.includes(session.scenarioId) ? (facts.held ? 'Next shift: keep civil heavy work held; verify fresh local TWL, people, water, rest, permit and midday rule before any restart.' : 'Next shift: continue local heat monitoring and review any new trigger before changing work.') : `Next shift: ${describeOperation(session).nextAction}`,
    ...session.state.open_items.map((item:string) => `Still to check: ${readableItem(item)}`),
    ...session.state.evidence.map((item:Record<string,string>) => `Recorded: ${evidenceText(item)}`),
    'Confirm outstanding actions with the responsible people before closing this record.',
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/plain'}));
  const link = document.createElement('a'); link.href = url; link.download = 'sandline-shift-handover.txt'; link.click();
  URL.revokeObjectURL(url);
}
function SectionTitle({ eyebrow, title: heading, aside }: { eyebrow?: string; title: string; aside?: React.ReactNode }) { return <div className="section-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{heading}</h2></div>{aside}</div>; }
function Empty({ icon: Icon = CheckCircle2, title: heading, text }: { icon?: any; title: string; text: string }) { return <div className="empty"><Icon size={24}/><strong>{heading}</strong><p>{text}</p></div>; }

function App() {
  const { session, update } = useDemoSession();
  const [path, setPath] = useState(window.location.pathname);
  const [view, setView] = useState<View>('overview');
  const [deskDetail, setDeskDetail] = useState(false);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [caseFilter, setCaseFilter] = useState('all');
  const [browsedCase, setBrowsedCase] = useState<ScenarioId>(() => initialSession().scenarioId);
  const [dataset, setDataset] = useState<Dataset>('people');
  const [siteMode, setSiteMode] = useState<'operations'|'register'>('operations');
  const [siteSearch, setSiteSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const [actingAs, setActingAs] = useState(() => localStorage.getItem(ROLE_STORE) || 'P03');
  const [playing, setPlaying] = useState(() => readPlayback().playing);
  const [speed, setSpeed] = useState(() => readPlayback().speed);
  const presenter = path === '/presenter';
  const presenterLibrary = path === '/presenter/library';
  const fixture = fixtures[session.scenarioId as ScenarioId];
  const caseSession = browsedCase === session.scenarioId ? session : createSession(browsedCase);
  const operation = describeOperation(session);
  const caseOperation = describeOperation(caseSession);
  const caseEvents = fixtures[browsedCase].events;
  const casePending = caseSession.pendingEvent;
  const caseComplete = scenarioComplete(caseSession);
  const selectedPolicy = policies.find(p => p.id === policyId);
  const selectedSource = sources.find(s => s.id === selectedPolicy?.source_id);
  const events = fixture.events;
  const nextEvent = events[session.cursor];
  const pending = session.pendingEvent;
  const complete = scenarioComplete(session);
  const taskCounts = (Object.values(session.state.task_status || {}) as string[]).reduce((acc: Record<string,number>, status: any) => { acc[status] = (acc[status] || 0) + 1; return acc; }, {} as Record<string,number>);
  const activeAlerts = Object.values(session.state.alerts || {}).filter((a: any) => !['closed','resolved'].includes(a?.status)).length;
  const facts = responseFacts(session);
  const heldTasks = tasks.filter(task => session.state.task_status[task.id] === 'held');
  const currentReadings = zones.filter(zone => zone.sensor_id).map(zone => ({ zone, reading: session.state.readings[zone.id] }));
  useEffect(() => { const listener = () => setPath(window.location.pathname); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { localStorage.setItem(ROLE_STORE, actingAs); }, [actingAs]);
  useEffect(() => {
    const sync = () => { const playback = readPlayback(); setPlaying(playback.playing); setSpeed(playback.speed); };
    const onStorage = (event: StorageEvent) => { if (event.key === PLAYBACK) sync(); };
    const channel = new BroadcastChannel(PLAYBACK);
    channel.onmessage = sync;
    window.addEventListener('storage', onStorage);
    return () => { channel.close(); window.removeEventListener('storage', onStorage); };
  }, []);
  const setPlayback = (nextPlaying: boolean, nextSpeed: number) => { localStorage.setItem(PLAYBACK, JSON.stringify({playing:nextPlaying,speed:nextSpeed})); setPlaying(nextPlaying); setSpeed(nextSpeed); const channel = new BroadcastChannel(PLAYBACK); channel.postMessage('refresh'); channel.close(); };
  useEffect(() => {
    if (!presenter || !playing) return;
    const tick = () => {
      try {
        const lease = JSON.parse(localStorage.getItem(STREAM_LEASE) || 'null');
        if (lease?.owner !== TAB_ID && lease?.expires > Date.now()) return;
        localStorage.setItem(STREAM_LEASE, JSON.stringify({ owner: TAB_ID, expires: Date.now() + Math.max(3000, speed * 3) }));
      } catch { /* A stale lease must not stop the local demo. */ }
      update(current => {
      const stored = JSON.parse(localStorage.getItem(STORE) || 'null') || current;
      if (stored.pendingEvent) return stored === current ? current : stored;
      const result = driveStream(stored);
      const next: any = result.session;
      next.activityLog = [...(stored.activityLog || []), ...result.activities].slice(-60);
      return next;
      });
    };
    const timer = window.setInterval(tick, speed);
    return () => { window.clearInterval(timer); try { const lease = JSON.parse(localStorage.getItem(STREAM_LEASE) || 'null'); if (lease?.owner === TAB_ID) localStorage.removeItem(STREAM_LEASE); } catch { /* Ignore a stale lease. */ } };
  }, [presenter, playing, speed, update]);
  const navigate = (next: string) => { window.history.pushState({}, '', next); setPath(next); setMobileNav(false); };
  const openQueueAction = (action?: QueueAction) => {
    setView(action?.target === 'handover' ? 'handover' : 'overview');
    setDeskDetail(action?.target !== 'handover');
    window.setTimeout(() => {
      const id = action?.id.startsWith('cost:') ? `queue-cost-${action.id.slice(5)}`
        : action?.id === 'crew-briefing' || action?.id === 'commercial-concern' ? `queue-${action.id}`
        : action?.id.startsWith('event:') ? 'queue-pending-action' : action?.target === 'handover' ? 'cost-actions-title' : 'queue-incident';
      const target = document.getElementById(id) ?? document.getElementById('queue-incident');
      if (action?.id === 'crew-briefing' || action?.id === 'commercial-concern') target?.querySelector('details.action-copy')?.setAttribute('open', '');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
  };
  const selectCase = (id: ScenarioId) => { update(s => resetSession(structuredClone(s), id)); setBrowsedCase(id); setNotice(`${caseName(id)} loaded`); };
  const applyStep = () => {
    update(current => {
      const result = driveStream(current);
      const next: any = result.session;
      next.activityLog = [...(current.activityLog || []), ...result.activities].slice(-60);
      return next;
    });
  };
  const applyAction = () => {
    if (!pending?.actor_id) return;
    if (actingAs !== pending.actor_id) { setNotice(`Only ${personName(pending.actor_id)} can ${actionLabel(pending).toLowerCase()}. Switch the acting role to continue.`); return; }
    const result = applyHumanAction(session, actingAs);
    if (result.status === 'denied') { setNotice(result.activities[0]?.detail || 'The policy check blocked this action.'); return; }
    const next: any = result.session;
    next.activityLog = [...(session.activityLog || []), ...result.activities].slice(-60);
    update(() => next);
    setNotice(result.result?.status === 'rejected' ? result.activities[0]?.detail || 'Policy blocked the request.' : `${actionLabel(pending)} recorded by ${personName(actingAs)}`);
  };
  const applyConcern = () => {
    if (!responseFacts(session).held) return;
    update(current => {
      if (!responseFacts(current).held) return current;
      const next = recordConcern(current.commercialConcern, actingAs, current.state.clock);
      return next ? { ...current, commercialConcern: next } : current;
    });
    setNotice('The pay and lost-output concern was recorded for the next named reviewer.');
  };
  const applyCostAction = (id:string) => {
    const action = costActions.find(item => item.id === id);
    if (!action || action.actorId !== actingAs) return;
    update(current => {
      if ((current.commercialChecks || []).some((entry:any) => entry.id === id)) return current;
      return {...current, commercialChecks:[...(current.commercialChecks || []), {id,actorId:actingAs,at:current.state.clock,snapshot:calculateCostPlan(current)}]};
    });
    setNotice('Review note saved locally. No supplier message, payment or cost approval was issued.');
  };
  const applyBriefing = () => {
    if (actingAs !== 'C01') return;
    update(current => responseFacts(current).held && !current.crewBriefing
      ? { ...current, crewBriefing: { actorId: 'C01', at: current.state.clock, text: crewBriefingText } }
      : current);
    setNotice('Huda’s crew briefing recorded locally; payroll remains unverified.');
  };
  const applyClock = (minutes: number) => update(s => { const next = structuredClone(s); advanceClock(next, minutes); return next; });
  const reset = () => { update(s => resetSession(structuredClone(s), s.scenarioId)); setNotice('Case returned to its starting site record'); };
  const nextConnected = () => {
    const nextId = getConnectedNext(session);
    if (!nextId) { setNotice('The trench incident handover is the last connected case.'); return; }
    applyStep();
    setNotice(`${caseName(nextId)} loaded with the carried site state`);
  };
  const sideItems: { id: View; label: string; icon: any }[] = [
    { id: 'overview', label: 'Response desk', icon: LayoutDashboard }, { id: 'site', label: 'Site & shift', icon: HardHat },
    { id: 'handover', label: 'Shift handover', icon: ClipboardCheck },
    { id: 'policies', label: 'Policies & sources', icon: ShieldCheck }, { id: 'workflows', label: 'Workflow detail', icon: GitBranch },
  ];

  const libraryView = <><div className="page-intro"><div><div className="eyebrow">OPERATIONS / CASE MANAGEMENT</div><h1>Scenario library</h1><p>Inspect the current response or explore an independent operational situation.</p></div><Status tone="blue">10 authored scenarios</Status></div><div className="cases-layout"><section className="card case-list"><div className="case-list-head"><strong>All cases</strong><span>{scenarioIds.length} total</span></div><div className="searchbox"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cases" aria-label="Search cases"/></div><div className="filter-row"><Filter size={15}/><select aria-label="Filter cases" value={caseFilter} onChange={e => setCaseFilter(e.target.value)}><option value="all">All cases</option><option value="connected">Connected story</option><option value="standalone">Other scenarios</option></select></div><div className="case-items">{scenarioIds.filter(id => (caseFilter === 'all' || (caseFilter === 'connected') === connectedSequence.includes(id)) && `${caseName(id)} ${id}`.toLowerCase().includes(search.toLowerCase())).map(id => <button key={id} className={`case-item ${browsedCase === id ? 'selected' : ''}`} onClick={() => setBrowsedCase(id)}><div className="case-list-icon">{id.slice(0,2)}</div><div><strong>{caseName(id)}</strong><span>{connectedSequence.includes(id) ? 'Connected narrative' : 'Standalone scenario'}</span></div><ChevronRight size={16}/></button>)}</div></section><div className="case-detail"><div className="case-detail-head"><div className="eyebrow">CASE {browsedCase.slice(0,2)} / PROJECT SANDLINE</div><div className="detail-heading"><div><h2>{caseName(browsedCase)}</h2><p>Local time {time(caseSession.state.clock)} GST · {caseEvents.length} planned steps · {caseSession.cursor} recorded</p></div><Status tone={casePending ? 'warn' : caseComplete ? 'good' : 'blue'}>{browsedCase !== session.scenarioId ? 'Preview' : casePending ? 'Awaiting person' : caseComplete ? 'Replay complete' : 'In progress'}</Status></div></div><div className="detail-toolbar"><div className="progress"><span style={{width:`${Math.min(100,(caseSession.cursor/caseEvents.length)*100)}%`}}/></div><span>{Math.round(caseSession.cursor/caseEvents.length*100)}% of planned steps processed</span></div><IncidentView operation={caseOperation} session={caseSession} pending={browsedCase === session.scenarioId ? casePending : null} activities={browsedCase === session.scenarioId ? session.activityLog || [] : []} actingAs={actingAs} onAction={applyAction} onConcern={applyConcern} onBriefing={applyBriefing} onOpenPolicy={setPolicyId} preview={browsedCase !== session.scenarioId}/><div className="detail-duo"><section className="card"><SectionTitle eyebrow="CHRONOLOGY" title="Case timeline"/><Timeline events={caseEvents} cursor={caseSession.cursor} pending={casePending} history={caseSession.history}/></section><section className="card"><SectionTitle eyebrow="SITE IMPACT" title="Tasks and responsibilities"/><div className="task-stack">{tasks.map(task => <div className="task-row" key={task.id}><div><strong>{task.description}</strong><span>{zones.find(z => z.id === task.zone_id)?.name} · {(caseSession.state.assignments[task.id]||[]).length} current assignees</span></div><Status tone={caseSession.state.task_status[task.id] === 'held' ? 'danger' : caseSession.state.task_status[task.id] === 'active' ? 'good' : 'neutral'}>{title(caseSession.state.task_status[task.id] || 'unknown')}</Status></div>)}</div></section></div><div className="detail-duo"><section className="card"><SectionTitle eyebrow="OUTCOME CHECK" title="Response confirmations"/><ul className="check-list">{(connectedSequence.includes(browsedCase) ? [
  ['Local condition reviewed', !!caseSession.state.readings.civil_exposed && caseSession.state.readings.civil_exposed.twl <= 150],
  ['Civil heavy work held', caseSession.state.task_status.civil_heavy === 'held'],
  ['Foreman confirmed stop', Object.values(caseSession.state.alerts || {}).some((a:any) => a.task_id === 'civil_heavy' && a.status === 'stopped')],
  ['Eleven workers accounted for', responseFacts(caseSession).inRecovery + responseFacts(caseSession).inWorkshop === 11],
  ['Four workers in cooled workshop', responseFacts(caseSession).inWorkshop === 4],
  ['Supplier accepted 15:30', responseFacts(caseSession).coordinated],
  ['Handover recorded', responseFacts(caseSession).handedOver],
] : fixtures[browsedCase].expected.semantic_assertions.map(assertion => [outcomeNames[assertion] || title(assertion), caseSession.observed.includes(assertion)])).map(([label, recorded]) => <li key={String(label)}>{recorded ? <CheckCircle2 size={17}/> : <Clock3 size={17} className="pending-check"/>}{label}<small>{recorded ? 'Recorded' : 'Open'}</small></li>)}</ul></section><section className="card"><SectionTitle eyebrow="AUDIT TRAIL" title="Current record"/><div className="state-list"><div><span>Decision records</span><strong>{caseSession.state.evidence?.length || 0}</strong></div><div><span>Open items</span><strong>{caseSession.state.open_items?.length || 0}</strong></div><div><span>Delivery status</span><strong>{title(caseSession.state.delivery?.status || 'unknown')}</strong></div><div><span>Incident ID</span><strong>{caseSession.state.case_id || '—'}</strong></div></div><div className="record-list">{caseSession.state.evidence.map((item:any,index:number)=><div key={index}><strong>{item.kind === 'hold' ? 'Trench hold instruction' : item.kind === 'first_aid' ? 'Bilal’s first aid response' : 'Site decision record'}</strong><span>{evidenceText(item)}</span></div>)}{caseSession.state.open_items.map((item:string,index:number)=><div key={`open-${index}`}><strong>Still needs review</strong><span>{readableItem(item)}</span></div>)}</div><button className="text-button" onClick={() => {navigate('/');setView('policies')}}>Inspect supporting policies <ArrowRight size={15}/></button></section></div></div></div></>;

  const policyDrawer = <Dialog.Root open={!!policyId} onOpenChange={open => {if (!open) setPolicyId(null)}}><Dialog.Portal><Dialog.Overlay className="drawer-layer"/><Dialog.Content className="policy-drawer" aria-describedby={undefined}><div className="drawer-top"><span>POLICY DETAIL</span><Dialog.Close className="icon-button" aria-label="Close policy details"><X size={18}/></Dialog.Close></div>{selectedPolicy && <div className="drawer-body"><Status tone={selectedPolicy.classification === 'fictional_site_policy' ? 'warn' : 'blue'}>{classificationName(selectedPolicy.classification)}</Status><Dialog.Title className="drawer-title">{policyName(selectedPolicy.id)}</Dialog.Title><p className="drawer-rule">{policyRule(selectedPolicy.rule)}</p><div className="drawer-divider"/><h3>Where this rule comes from</h3>{selectedSource ? <><p>{selectedSource.title}</p><a className="button button-soft" href={selectedSource.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={15}/></a>{selectedSource.temporal_note && <p className="source-note">{selectedSource.temporal_note}</p>}</> : <p>Project Sandline site rule. This is a site control, not a regulatory threshold.</p>}<div className="drawer-divider"/><div className="source-note"><CircleAlert size={16}/> An action is recorded only after the responsible person confirms it.</div></div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;

  if (presenterLibrary) return <div className="presenter-shell">
    <div className="presenter-top"><div className="presenter-brand"><div className="brand-icon"><Waves size={18}/></div><div><strong>Heat-Safe</strong><span>Scenario library · presenter</span></div></div><div className="top-actions"><button className="button button-quiet" onClick={() => navigate('/presenter')}><ChevronLeft size={16}/> Presenter console</button><button className="button button-quiet" onClick={() => {navigate('/');setView('overview');setDeskDetail(false)}}>Response desk <ArrowRight size={16}/></button></div></div>
    <main className="content">{libraryView}</main>{policyDrawer}{notice && <div role="status" className="toast"><CheckCircle2 size={16}/>{notice}</div>}
  </div>;

  if (presenter) return <div className="presenter-shell">
    <div className="presenter-top"><div className="presenter-brand"><div className="brand-icon"><Waves size={18}/></div><div><strong>Heat-Safe</strong><span>Presenter console</span></div></div><div className="top-actions"><button className="button button-quiet" onClick={() => navigate('/presenter/library')}><BookOpen size={16}/> Scenario library</button><button className="button button-quiet" onClick={() => navigate('/')}><ChevronLeft size={16}/> Back to workspace</button></div></div>
    <main className="presenter-main"><div className="presenter-hero"><div><div className="eyebrow">PROJECT SANDLINE · SIMULATED DEMO</div><h1>Incoming events, live decisions.</h1><p>The scripted feed advances on its own. It pauses whenever a named person must confirm an action. The operator workspace shows the same state.</p></div><div className="presenter-live"><Radio size={18}/><div><strong>{playing ? "Feed running" : "Feed paused"}</strong><span>Shared across open tabs</span></div></div></div>
      <div className="presenter-grid"><section className="card presenter-control"><SectionTitle eyebrow="01 / SELECT" title="Scenario" aside={<Status tone="blue">{scenarioIds.indexOf(session.scenarioId)+1} of 10</Status>}/><label className="label" htmlFor="scenario-select">Case fixture</label><select id="scenario-select" value={session.scenarioId} onChange={e => {setPlayback(false,speed);selectCase(e.target.value as ScenarioId)}}>{scenarioIds.map(id => <option value={id} key={id}>{id.slice(0,2)} · {caseName(id)}</option>)}</select><p className="scenario-lede">{connectedSequence.includes(session.scenarioId) ? "This chapter continues the civil heat incident and carries site state forward." : "Independent operational test of a named response and policy gate."}</p><div className="connected-box"><div><GitBranch size={18}/><strong>Connected narrative</strong></div><p>02 → 03 → 04 → 10 carries the resulting site state forward.</p><button className="button button-soft" disabled={!connectedSequence.includes(session.scenarioId) || !complete || !getConnectedNext(session)} onClick={nextConnected}>Load next connected case <ArrowRight size={15}/></button></div></section>
      <section className="card presenter-control"><SectionTitle eyebrow="02 / ADVANCE" title="Live event feed" aside={<span className="small-muted">{session.cursor} / {events.length} events</span>}/><div className="progress"><span style={{width:`${Math.min(100,(session.cursor/events.length)*100)}%`}}/></div><div className="current-event"><div className="eyebrow">{pending ? 'WAITING FOR NAMED PERSON' : complete ? 'CASE COMPLETE' : 'NEXT SCRIPTED SIGNAL'}</div><strong>{pending ? eventLabel(pending.type, pending) : complete ? 'All fixture events processed' : eventLabel(nextEvent.type, nextEvent)}</strong><p>{pending ? `${personName(pending.actor_id)} must confirm. The feed will resume after their action.` : complete ? 'The linked case will load on the next tick when available.' : `${time(nextEvent.occurred_at)} GST · scripted synthetic feed`}</p></div>{pending && <><ActorPicker value={actingAs} onChange={setActingAs}/>{actingAs !== pending.actor_id && <p className="role-block">Only {personName(pending.actor_id)} can complete this step. Select that role to continue.</p>}</>}<div className="control-actions"><button className="button button-primary" onClick={pending ? applyAction : applyStep} disabled={pending ? actingAs !== pending.actor_id : complete && !getConnectedNext(session)}>{pending ? <><Check size={16}/> {actionLabel(pending)}</> : <><ArrowRight size={16}/> Advance one event</>}</button><button className="button button-soft" onClick={() => setPlayback(!playing,speed)}>{playing ? <><PauseCircle size={16}/> Pause feed</> : <><Play size={16}/> Play feed</>}</button><button className="button button-quiet" onClick={() => {setPlayback(false,speed);reset()}}><RotateCcw size={16}/> Reset</button></div><div className="clock-controls"><span><Clock3 size={15}/> Site clock {time(session.state.clock)}</span><label className="speed-picker">Feed speed <select aria-label="Feed speed" value={speed} onChange={e => setPlayback(playing,Number(e.target.value))}><option value={2400}>Slow</option><option value={1400}>Normal</option><option value={650}>Fast</option></select></label><button onClick={() => applyClock(1)}>+1 min</button><button onClick={() => applyClock(5)}>+5 min</button></div></section></div>
      <div className="presenter-grid lower"><section className="card"><SectionTitle eyebrow="03 / OBSERVE" title="What changed"/><div className="mini-stats"><div><strong>{activeAlerts}</strong><span>active alerts</span></div><div><strong>{taskCounts.held || 0}</strong><span>tasks held</span></div><div><strong>{(session.state.open_items || []).length}</strong><span>open items</span></div></div><Timeline events={events} cursor={session.cursor} pending={pending} history={session.history}/></section><section className="card"><SectionTitle eyebrow="PRESENTER NOTES" title="How to show it"/><ol className="notes"><li>Open the <button className="inline-link" onClick={() => navigate('/')}>operator workspace</button> in another tab.</li><li>Use 02 → 03 → 04 → 10 for the full narrative; use 06 to demonstrate sensor uncertainty.</li><li>Let the feed advance external signals, then use the named role to confirm human decisions.</li><li>Point to case evidence and source classification before calling an outcome complete.</li></ol><div className="note-warning"><CircleAlert size={17}/><p>All actors, conditions, actions and decisions are synthetic. A replay is not a live site command or safety clearance.</p></div></section></div>
    </main>{notice && <div role="status" className="toast"><CheckCircle2 size={16}/>{notice}</div>}</div>;

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="sidebar-head"><div className="brand-icon"><Waves size={18}/></div><div className="brand-copy"><strong>Heat-Safe</strong><span>Sandline workspace</span></div><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18}/></button></div><div className="sidebar-group-label">INCIDENT WORKSPACE</div><nav aria-label="Main navigation">{sideItems.slice(0,3).map(({id,label,icon:Icon}) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => {setView(id);if(id==='overview')setDeskDetail(false);if(id==='site')setSiteMode('operations');setMobileNav(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="sidebar-group-label">REFERENCE</div><nav aria-label="Reference navigation">{sideItems.slice(3).map(({id,label,icon:Icon}) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => {setView(id);if(id==='overview')setDeskDetail(false);if(id==='site')setSiteMode('operations');setMobileNav(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="sidebar-context"><div className="context-icon"><HardHat size={17}/></div><div><strong>Project Sandline</strong><span>Mussafah, Abu Dhabi</span></div><ChevronDown size={15}/></div><div className="sidebar-foot"><span className="online-dot"/> Site workspace <HelpCircle size={14}/></div></div></aside>
  {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
  <div className="main-column"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{sideItems.find(i => i.id === view)?.label}</strong></div><div className="top-actions"><label className="workspace-role">Acting as <select aria-label="Current view role" value={actingAs} onChange={e=>setActingAs(e.target.value)}>{responseRoles.map(id=><option key={id} value={id}>{roleLabel(id)}</option>)}</select></label><span className="top-date"><Clock3 size={15}/> 04 Aug 2025 · {time(session.state.clock)} GST</span><button className="icon-button" title="Open active case" aria-label="Open active case" onClick={() => {setView('overview');setDeskDetail(true)}}><Bell size={18}/>{activeAlerts > 0 && <i/>}</button><div className="avatar" title="Site HSE workspace">HS</div></div></header>
  <main className="content">
    {view === 'overview' && !deskDetail && <ResponseQueue session={session} actingAs={actingAs} onOpen={openQueueAction}/>}
    {view === 'overview' && deskDetail && <>
      <header className="incident-page-header">
        <button className="incident-back-link" onClick={() => setDeskDetail(false)}><ChevronLeft size={14}/> Response queue</button>
        <div className="incident-page-heading"><div><h1>{incidentTitles[session.scenarioId]}</h1><p>Project Sandline <span aria-hidden="true">·</span> {session.state.case_id ? session.state.case_id.replace(/_/g, ' ') : 'Site planning'}</p></div>
        <Status tone={heldTasks.length || pending ? 'warn' : complete ? 'good' : 'neutral'}>{heldTasks.length ? 'Heavy work held' : pending?.type === 'hold' ? 'Hold decision pending' : pending ? 'Action pending' : complete ? 'Replay complete' : 'Monitoring'}</Status>
        </div>
      </header>
      {connectedSequence.includes(session.scenarioId) && <JourneyProgress session={session}/>}
      <IncidentView operation={operation} session={session} pending={pending} activities={session.activityLog || []} actingAs={actingAs} onAction={applyAction} onConcern={applyConcern} onBriefing={applyBriefing} onCostAction={applyCostAction} onOpenPolicy={setPolicyId}/>
      {connectedSequence.includes(session.scenarioId) && <CostActions session={session} actingAs={actingAs} onRecord={applyCostAction} onReviewAssignment={()=>document.querySelector('.copilot-action')?.scrollIntoView({block:'center',behavior:'smooth'})}/>}
      <details className="supporting-records">
        <summary><span><strong>Supporting site records</strong><small>Local readings, recent actions and cooled-space occupancy</small></span><ChevronDown size={16}/></summary>
        <div className="supporting-records__body">
          <section className="card zone-table-card" aria-labelledby="zones-heading"><div className="section-title"><div><div className="eyebrow">Local measurements</div><h2 id="zones-heading">Work zones</h2></div><button className="text-button" onClick={() => {setDataset('zones');setSiteMode('register');setView('site')}}>Open records <ArrowRight size={15}/></button></div><details className="zone-policy-note"><summary>ADOSH environmental bands · Sandline heavy-work hold ≤150 W/m² <ChevronDown size={13}/></summary><p>The site hold is a separate Sandline rule and can apply when the environmental reading is green.</p></details><div className="zone-legend"><span><i className="legend-dot danger"/> High risk · &lt;115</span><span><i className="legend-dot warn"/> Caution · 115 ≤ TWL &lt; 140</span><span><i className="legend-dot good"/> Low environmental risk · ≥140</span><span><i className="legend-dot neutral"/> Unknown</span></div><div className="table-wrap"><table className="zone-table"><thead><tr><th>Zone</th><th>Local TWL · condition and freshness</th><th>Affected work</th><th></th></tr></thead><tbody>{currentReadings.map(({zone,reading}) => { const zoneTasks = tasks.filter(task => task.zone_id === zone.id); const held = zoneTasks.filter(task => session.state.task_status[task.id] === 'held').length; return <tr key={zone.id}><td><strong>{zone.name}</strong><small>{zone.id.replace(/_/g, ' ')}</small></td><td><ThermalReading reading={reading} clock={session.state.clock} sensorStatus={session.state.sensor_status[zone.sensor_id!]} compact/></td><td>{held ? `${held} held / ${zoneTasks.length} tasks` : `${zoneTasks.length} task${zoneTasks.length === 1 ? '' : 's'} tracked`}</td><td><button className="row-link" aria-label={`View ${zone.name} in site register`} onClick={() => {setDataset('zones');setSiteSearch(zone.id);setSiteMode('register');setView('site')}}><ArrowUpRight size={16}/></button></td></tr>})}</tbody></table></div></section>
          <div className="overview-grid lower-overview"><section className="card"><SectionTitle title="Site signals and team actions"/><Timeline events={events} cursor={session.cursor} pending={pending} history={session.history} compact/></section><section className="card"><SectionTitle title="Recorded occupancy" aside={<button className="text-button" onClick={() => {setDataset('zones');setSiteMode('register');setView('site')}}>All zones <ArrowRight size={15}/></button>}/><p className="occupancy-source">Roster and confirmed moves · no live camera feed.</p><div className="recovery-list">{zones.filter(zone => zone.type === 'cooled').map(zone => <div key={zone.id}><span><strong>{zone.name}</strong><small>Recorded people / capacity</small></span><b>{session.state.occupancy[zone.id]?.length || 0} / {zone.capacity}</b></div>)}</div></section></div>
        </div>
      </details>
    </>}
    {view === 'handover' && <><button className="button button-quiet response-queue-back" onClick={() => {setView('overview');setDeskDetail(false)}}><ChevronLeft size={16}/> Back to response queue</button><div className="page-intro"><div><div className="eyebrow">PROJECT SANDLINE / {session.state.case_id || 'INCIDENT PENDING'}</div><h1>{connectedSequence.includes(session.scenarioId) ? facts.held ? `Trench work held; ${facts.inRecovery} workers in recovery` : 'Trench response for the next shift' : operation.headline}</h1><p>{facts.handedOver ? 'Rashid confirmed this record. The trench hold and outstanding checks remain visible below.' : 'Draft for the next shift from actions recorded so far.'}</p></div><Status tone={facts.handedOver ? 'good' : 'warn'}>{facts.handedOver ? 'Confirmed by Rashid' : 'Draft from current state'}</Status></div>{connectedSequence.includes(session.scenarioId) && <JourneyProgress session={session}/>}<section className="card handover-card"><SectionTitle eyebrow="CURRENT SHIFT RECORD" title={connectedSequence.includes(session.scenarioId) ? facts.held ? `Trench work held; ${facts.inRecovery} workers still recovering` : 'Trench work and crew status' : operation.headline} aside={<span className="small-muted">{time(session.state.clock)} GST · site record</span>}/>{pending?.actor_id && <div className="handover-priority"><div><span>NEXT NAMED ACTION</span><strong>{personName(pending.actor_id)} · {actionLabel(pending)}</strong></div><button className="button button-soft" onClick={()=>{setView('overview');setDeskDetail(true);window.scrollTo({top:0,behavior:'smooth'})}}>Open incident <ArrowRight size={15}/></button></div>}{connectedSequence.includes(session.scenarioId) ? <div className="handover-grid"><div><span>Work control</span><strong>{facts.held ? 'Heavy trench work remains held' : 'Heavy trench work active'}</strong><p>{facts.held ? 'Rashid must review a fresh trench reading, crew, water, rest, permit and midday rule before releasing the hold.' : 'Continue local heat monitoring and site controls.'}</p></div><div><span>Crew locations</span><strong>{facts.inRecovery + facts.inWorkshop} of 11 workers</strong><p>{facts.inRecovery} in cooled recovery; {facts.inWorkshop} on supervised workshop preparation.</p></div><div><span>Confirmed delivery booking</span><strong>{time(session.state.delivery.slot)} · supplier {facts.coordinated ? 'accepted change' : 'original commitment'}</strong><p>{facts.coordinated ? '15:30 accepted; arrival and charges still need review.' : session.pendingDeliverySlot ? `${time(session.pendingDeliverySlot)} change ${session.state.delivery.status}; supplier acceptance pending.` : 'No later slot is confirmed.'}</p></div></div> : <div className="handover-standalone"><strong>{operation.headline}</strong><p>{operation.affected}</p><p><strong>Next action:</strong> {operation.nextAction}</p></div>}{connectedSequence.includes(session.scenarioId) ? <div className="handover-actions"><h3>Recorded confirmations</h3><p>“Starting state” identifies an existing record without a confirmation time in this case.</p><ul>{[
  ['Maya · HSE', 'Civil hold instruction', chapterActionStatus(session, 'hold', session.state.evidence.some((item:any) => item.kind === 'hold'))],
  ['Huda · foreman', 'Crew stop', chapterActionStatus(session, 'stop', facts.hold?.status === 'stopped')],
  ['Huda · foreman', 'Crew recovery', chapterActionStatus(session, 'recover', facts.inRecovery + facts.inWorkshop === 11)],
  ['Huda · foreman', 'Four-worker workshop assignment', chapterActionStatus(session, 'assign', facts.replanned)],
  ['Noura · logistics', 'Later delivery request sent', chapterActionStatus(session, 'delivery_send', session.state.delivery.status === 'sent' || facts.coordinated)],
  ['Oasis · supplier', '15:30 slot accepted', chapterActionStatus(session, 'delivery_accept', facts.coordinated)],
  ['Rashid · superintendent', 'Shift handover', chapterActionStatus(session, 'handover', facts.handedOver)],
].map(([who,what,status],index)=><li key={index}><span>{who}</span><strong>{what}</strong><small>{status}</small></li>)}</ul></div> : <div className="handover-actions"><h3>Recorded actions</h3><ul>{session.history.filter((entry:any) => entry.status === 'applied').map((entry:any,index:number)=><li key={index}><span>{entry.event.actor_id ? personName(entry.event.actor_id) : 'Site signal'}</span><strong>{eventLabel(entry.event.type, entry.event)}</strong><small>Recorded</small></li>)}</ul>{session.history.filter((entry:any) => entry.status === 'applied').length === 0 && <p>No action recorded in this case.</p>}</div>}{connectedSequence.includes(session.scenarioId) ? <><CostActions session={session} actingAs={actingAs} onRecord={applyCostAction} onReviewAssignment={()=>{setView('overview');setDeskDetail(true)}}/><details className="handover-commercial"><summary>Pay commitment and earlier concern records</summary><p>Required ordinary-shift recovery is protected paid rest under Dune’s Heat Rest Schedule. Actual payroll remains unverified.</p><p>{concernStatus(session.commercialConcern)}.</p>{(session.commercialConcern?.entries || []).map((entry:any,index:number)=><p key={index}>{personName(entry.actorId)} · {stageName(entry.stage)} · {time(entry.at)} GST</p>)}</details></> : <div className="handover-commercial"><h3>{costHeading[session.scenarioId as ScenarioId]}</h3><p>{commercialContextStatus(session)}</p><p><strong>Owner:</strong> {decisionContext[session.scenarioId as ScenarioId].commercial.owner}</p></div>}<div className="handover-unresolved"><h3>Next-shift checks</h3><ul>{connectedSequence.includes(session.scenarioId) ? (facts.held ? <><li>Rashid: keep heavy trench work held; check fresh local TWL, crew, water, rest, permit and midday rule before any restart.</li><li>Huda: {session.crewBriefing ? "carry the recorded crew briefing into the next shift" : "review and record the crew briefing"}; keep the recovery count current.</li></> : <li>Rashid: continue local heat monitoring before changing work.</li>) : <li>{operation.nextAction}</li>}{connectedSequence.includes(session.scenarioId) ? <><li>Dune employer team: verify individual payroll against the approved ordinary-shift term.</li><li>Amal: review Dune lost output, standby, supplier charges and any client contract treatment. Allocation remains open.</li><li>Noura: verify the supplier booking, actual delivery and any rescheduling charges.</li></> : null}{session.state.open_items.map((item:string,index:number)=><li key={`${item}-${index}`}>Recorded unresolved item: {readableItem(item)}</li>)}</ul></div><div className="handover-foot"><span>{facts.handedOver ? 'Handover confirmed in the incident record; commercial questions remain open.' : session.scenarioId === '10_handover_and_evidence' && pending?.type === 'handover' ? `Waiting on ${personName(pending.actor_id)} to confirm this record.` : 'This draft updates as actions are recorded.'}</span><button className="button button-soft" onClick={() => downloadHandover(session)}>Download handover <ArrowDownRight size={15}/></button></div></section></>}
    {view === 'site' && <><div className="tabbar site-view-tabs" role="tablist" aria-label="Site views"><button role="tab" aria-selected={siteMode==='operations'} className={siteMode==='operations' ? 'selected' : ''} onClick={()=>setSiteMode('operations')}>Map & schedule</button><button role="tab" aria-selected={siteMode==='register'} className={siteMode==='register' ? 'selected' : ''} onClick={()=>setSiteMode('register')}>Records</button></div>{siteMode==='operations' && <SiteOperations session={session} onOpenIncident={()=>{setView('overview');setDeskDetail(true)}} onOpenRegister={()=>{setSiteSearch('');setSiteMode('register')}}/>}{siteMode==='register' && <><div className="page-intro"><div><div className="eyebrow">PROJECT SANDLINE / CURRENT SITE STATE</div><h1>Assignments, recorded occupancy and work holds</h1><p>Current rosters, cooled spaces, local monitors and the supplier booking for this case.</p></div><Status tone="good">Mussafah · Abu Dhabi</Status></div><div className="site-summary"><div><HardHat size={19}/><strong>{people.length}</strong><span>Personnel</span></div><div><Users size={19}/><strong>{crews.length}</strong><span>Crews</span></div><div><MapPin size={19}/><strong>{zones.length}</strong><span>Zones</span></div><div><Radio size={19}/><strong>{assets.length}</strong><span>Assets</span></div></div><div className="card site-card"><div className="site-head"><div><div className="eyebrow">SITE REGISTER</div><h2>People, work and resources</h2></div><div className="searchbox"><Search size={17}/><input value={siteSearch} onChange={e => setSiteSearch(e.target.value)} placeholder="Search records" aria-label="Search site records"/></div></div><div className="tabbar" role="tablist" aria-label="Site datasets">{(['people','crews','tasks','zones','assets','deliveries','organisations'] as Dataset[]).map(id => <button role="tab" aria-selected={dataset === id} className={dataset === id ? 'selected' : ''} onClick={() => setDataset(id)} key={id}>{title(id)} <span>{({people,crews,tasks,zones,assets,deliveries,organisations} as any)[id].length}</span></button>)}</div><SiteTable dataset={dataset} query={siteSearch} session={session}/></div></>}</>}
    {view === 'policies' && <><div className="page-intro"><div><div className="eyebrow">GOVERNANCE / EVIDENCE REGISTER</div><h1>Rules behind the hold, recovery and restart checks</h1><p>Each rule shows whether it comes from a published requirement, guidance or Sandline’s site policy.</p></div><Status tone="blue">{policies.length} rules</Status></div><div className="policy-intro"><ShieldCheck size={22}/><div><strong>Read the classification before acting</strong><p>Site rules supplement published requirements. Follow the named approval process before changing work.</p></div></div><div className="policy-grid">{policies.map(p => <button className="card policy-card" key={p.id} onClick={() => setPolicyId(p.id)}><Status tone={p.classification === 'fictional_site_policy' ? 'warn' : p.classification === 'published_requirement' ? 'blue' : 'neutral'}>{classificationName(p.classification)}</Status><h3>{policyName(p.id)}</h3><p>{policyRule(p.rule)}</p><div>{p.source_id ? sources.find(s => s.id === p.source_id)?.title : 'Project Sandline site policy'}<ArrowUpRight size={16}/></div></button>)}</div><section className="card sources-card"><SectionTitle eyebrow="ORIGINAL MATERIAL" title="Source register"/><div className="source-list">{sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><FileText size={17}/><span>{s.title}<small>{classificationName(s.classification)}</small></span><ExternalLink size={15}/></a>)}</div></section></>}
    {view === 'workflows' && <><div className="page-intro"><div><div className="eyebrow">AUTOMATION / HUMAN AUTHORITY</div><h1>Who acts after each site signal</h1><p>Select a step to see the named person, source and whether the action has been recorded.</p></div><Status tone="blue">Current incident · {caseName(session.scenarioId)}</Status></div><Workflow key={session.scenarioId} fixture={fixture} session={session} selected={selectedNode} onSelect={setSelectedNode}/></>}
  </main></div>{policyDrawer}{notice && <div role="status" className="toast"><CheckCircle2 size={16}/>{notice}</div>}</div>;
}

function IncidentView({operation,session,pending,activities,actingAs,onAction,onConcern,onBriefing,onCostAction,onOpenPolicy,preview=false}:{operation:Operation;session:any;pending:any;activities:StreamActivity[];actingAs:string;onAction:()=>void;onConcern:()=>void;onBriefing:()=>void;onCostAction?:(id:string)=>void;onOpenPolicy:(id:string)=>void;preview?:boolean}) {
  const facts = responseFacts(session);
  const decision = decisionContext[session.scenarioId as ScenarioId];
  const concernAction = nextConcernAction(session.commercialConcern);
  const concernLabels = { unraised: 'Raise cost concern', raised: 'Route concern to Amal', routed: 'Record receipt for review', receipt_recorded: '' };
  const concernStage = session.commercialConcern?.stage ?? 'unraised';
  const concernReady = facts.held;
  const canRecordConcern = connectedSequence.includes(session.scenarioId) && concernReady && concernAction.actorId === actingAs && !preview;
  const isCivilResponse = ['02_heat_alert_response','03_constrained_reassignment'].includes(session.scenarioId);
  const caseOrigin: Record<ScenarioId,string> = { '01_pre_shift_planning':'Forecast planning · current local reading still required', '02_heat_alert_response':'Civil work-front heat reading', '03_constrained_reassignment':'Civil hold and recovery record', '04_delivery_coordination':'Civil hold and aggregate booking', '05_restricted_worker_assignment':'Acclimatisation roster restriction', '06_sensor_failure':'Civil work-front heat monitor', '07_unacknowledged_alert':'Trench hold acknowledgment', '08_symptom_escalation':'Worker symptom response', '09_restart_review':'Local measurement and restart review', '10_handover_and_evidence':'Trench hold, crew and delivery handover' };
  const headline = isCivilResponse && facts.held ? facts.hold?.status !== 'stopped' ? 'Civil trench work needs to stop.' : facts.inWorkshop === 4 ? 'Four workers are preparing materials in the cooled workshop.' : facts.inRecovery < 11 ? 'Civil trench work has stopped. Move the crew into recovery.' : 'The civil crew is in cooled recovery.' : operation.headline;
  const context = isCivilResponse ? !facts.held ? 'The civil crew is working at the trench. Maya is monitoring the local heat reading.' : `The site heat trigger held heavy trench work. ${facts.hold?.status === 'stopped' ? `Huda confirmed the stop; ${facts.inRecovery} workers are in cooled recovery and ${facts.inWorkshop} are in the workshop. Huda is the foreman, so she is counted separately.` : facts.hold ? 'Huda has not confirmed the crew stop. The affected crew is eleven workers plus Huda, the foreman.' : 'Maya still needs to issue the hold instruction to Huda.'}` : session.scenarioId === '04_delivery_coordination' ? facts.coordinated ? 'Oasis accepted the 15:30 aggregate booking. Noura checks receiving-yard readiness and briefs Dune; the trench remains held.' : `The trench hold affects the original 11:30 aggregate booking. Noura’s 15:30 request needs Oasis’s acceptance before the confirmed time changes. Current booking: ${time(session.state.delivery.slot)} GST.` : operation.summary;
  const owner = pending ? personName(pending.actor_id) : operation.owner;
  const yours = pending?.actor_id === actingAs;
  const policyId = pending && actionPolicy[pending.type];
  const connected = connectedSequence.includes(session.scenarioId);
  const acknowledgmentDue = facts.hold?.at ? new Date(Date.parse(facts.hold.at) + 120_000).toISOString() : null;
  const acknowledgmentStatus = !facts.hold ? 'Awaiting hold instruction' : facts.hold.acknowledged ? 'Huda acknowledged' : facts.hold.status === 'escalated' ? 'Escalated to Rashid' : acknowledgmentDue ? `${Date.parse(session.state.clock) >= Date.parse(acknowledgmentDue) ? 'Overdue' : 'Due'} ${time(acknowledgmentDue)} GST` : 'Deadline unavailable';
  const provenance: Record<StreamActivity['provenance'],string> = { synthetic_feed:'Site input', scripted_assistant:'Assistant', policy_engine:'Deterministic policy check', human_action:'Named team action' };
  return <section id="queue-incident" tabIndex={-1} className="incident-card" aria-label="Current incident">
    <div className="incident-document">
      <div className="incident-meta"><span>{session.state.case_id || `CASE ${session.scenarioId.slice(0,2)}`}</span><span>{connected ? 'Dune Civil · 11 workers + Huda' : operation.affected}</span><span>{time(session.state.clock)} GST</span>{connected && <span className={!facts.hold?.acknowledged && facts.hold && facts.hold.status !== 'escalated' && Date.parse(session.state.clock) >= Date.parse(acknowledgmentDue!) ? 'incident-meta-overdue' : ''}>Ack: {acknowledgmentStatus}</span>}</div>
      <div className="incident-head"><div><div className="eyebrow">{preview ? 'CASE PREVIEW · ' : ''}{caseOrigin[session.scenarioId as ScenarioId]}</div><h2>{headline}</h2></div><Status tone={pending ? 'warn' : facts.held ? 'danger' : 'blue'}>{pending ? yours ? 'Your decision' : `Waiting on ${personName(pending.actor_id).split(' ')[0]}` : facts.held ? 'Work held' : scenarioComplete(session) ? 'Case events recorded' : 'Awaiting site update'}</Status></div>
      {session.scenarioId === '01_pre_shift_planning' && session.cursor > 0 ? <ForecastPlan /> : <p className="incident-context">{context}</p>}
      <ScenarioVisual session={session} />
      <div className="incident-facts"><div><span>Work control</span><strong>{session.scenarioId === '05_restricted_worker_assignment' ? 'Heavy-work request restricted; light work under review' : session.scenarioId === '08_symptom_escalation' && session.notifiedSymptoms?.includes('C08') ? 'Bilal removed; first aid response' : session.scenarioId === '06_sensor_failure' && session.state.sensor_status.t1 === 'failed' ? 'Local reading unavailable' : facts.held ? 'Heavy trench work held' : 'Heavy trench work active'}</strong></div><div><span>Affected crew</span><strong>{connected ? `${facts.inRecovery} in recovery · ${facts.inWorkshop} workshop` : operation.affected}</strong></div><div><span>{connected ? 'Supplier booking' : 'Decision owner'}</span><strong>{connected ? `${time(session.state.delivery.slot)} GST · ${facts.coordinated ? 'later slot accepted' : 'original slot'}` : owner}</strong></div></div>
      {connectedSequence.includes(session.scenarioId) ? <div className="decision-context connected-commercial" aria-label="Crew pay and cost follow-up">
        <div className="connected-commercial-head"><strong>Crew pay and lost output</strong><span>Human review required</span></div>
        <div className="connected-commercial-grid">
          <div><span>RECOVERY PAY</span><strong>Dune’s ordinary-shift term applies to this civil crew</strong><p>Required recovery is paid rest under Dune’s shift agreement. Payroll is not verified.</p></div>
          <div><span>DELAY AND DELIVERY COSTS</span><strong>Amal owns the outstanding review</strong><p>Amal needs verified delay, output and supplier charges before agreeing who pays.</p></div>
        </div>
        {facts.held ? <><div id="queue-crew-briefing" tabIndex={-1} className="connected-commercial-action"><div><span>HUDA · CREW BRIEFING</span><small>{session.crewBriefing ? `Recorded at ${time(session.crewBriefing.at)} GST` : 'Briefing not recorded'}</small><details className="action-copy"><summary>Read prepared crew briefing</summary><p>{session.crewBriefing?.text || crewBriefingText}</p></details></div>{!session.crewBriefing && <button className="button button-soft" onClick={onBriefing} disabled={actingAs !== 'C01' || preview}>Record briefing</button>}</div>
        <div id="queue-commercial-concern" tabIndex={-1} className="connected-commercial-action concern"><div><span>COST REVIEW · {concernStatus(session.commercialConcern)}</span><small>{concernStep[concernStage as keyof typeof concernStep]}{concernAction.actorId && actingAs !== concernAction.actorId ? ` Choose ${personName(concernAction.actorId)} to continue.` : ''}</small><details className="action-copy"><summary>Read concern wording</summary><p>{concernText}</p></details></div>{concernAction.actorId && <button className="button button-soft" onClick={onConcern} disabled={!canRecordConcern}>{concernLabels[concernStage as keyof typeof concernLabels]}</button>}</div></> : <div className="connected-commercial-action"><div><span>PREPARED CREW BRIEFING AND COST RECORD</span><p>Huda’s crew briefing and the output and pay concern become available after the site rule places heavy work on hold.</p></div></div>}
        {!!session.commercialConcern?.entries?.length && <ol className="concern-history">{session.commercialConcern.entries.map((entry:{stage:string;actorId:string;at:string},index:number) => <li key={index}>{personName(entry.actorId)} · {stageName(entry.stage)} · {time(entry.at)} GST · local note</li>)}</ol>}
        <details className="decision-details"><summary>Agreement and supporting records <ChevronDown size={13}/></summary><p><strong>Shift agreement:</strong> Dune Civil Works Heat Rest Schedule, ordinary rostered shift only. Dune’s employer team must confirm individual payroll.</p><p><strong>Existing process:</strong> {readableItem(decision.existingProcess)}</p><p><strong>Records still needed:</strong> {decision.evidenceNeeded.map(readableItem).join('; ')}.</p><p>The assistant can prepare a chronology and drafts. It cannot confirm wages, settle cost allocation or approve a claim.</p></details>
      </div> : <div className="decision-context" aria-label="Trust and money coordination">
        <div className="decision-issues"><div><span>SITE DECISION</span><p>{readableItem(decision.trustQuestion)}</p></div><div><span>PAY AND COSTS</span><p>{readableItem(decision.moneyQuestion)}</p></div></div>
        <div className="commercial-record"><div><strong>{costHeading[session.scenarioId as ScenarioId]}</strong><span>{commercialContextStatus(session)}</span><small>Owner: {decision.commercial.owner}. Verify time, output and charges before agreeing who pays.</small></div></div>
        <details className="decision-details"><summary>Existing process, records and assistant role <ChevronDown size={13}/></summary><p><strong>Existing workflow:</strong> {readableItem(decision.existingProcess)}</p><p><strong>Why it matters:</strong> {readableItem(decision.pain)}</p><p><strong>Human coordination:</strong> {readableItem(decision.coordinationNeed)}</p><p><strong>Assistant:</strong> {readableItem(decision.aiContribution)} It prepares a neutral chronology, missing-record prompts and draft communication; it cannot grant stop authority, confirm wages, settle cost allocation, diagnose illness or approve a claim.</p><p><strong>Rest and cost records:</strong> {decision.commercial.items.map(readableItem).join(' ')} Recorded worker periods are not payroll confirmation or automatically payable delay.</p><p><strong>Records still needed:</strong> {decision.evidenceNeeded.map(readableItem).join('; ')}.</p></details>
      </div>}
      <RecommendationBasis scenarioId={session.scenarioId}/><div className="incident-section-head"><div><Sparkles size={15}/><h3>Activity</h3></div><span>Site and assistant updates</span></div>
      <div className="activity-feed" aria-live="polite">{activities.length ? activities.slice(-4).reverse().map((item,index) => <details key={`${item.eventId || item.at}-${item.kind}-${index}`} className={`activity-item activity-${item.kind}`} open={index === 0 && (item.kind === 'preparation' || item.kind === 'blocked')}><summary><span className="activity-mark">{item.kind === 'blocked' ? <X size={13}/> : item.kind === 'decision' ? <Check size={13}/> : <Sparkles size={13}/>}</span><span><strong>{item.title}</strong><small>{provenance[item.provenance]} · {activityTime(item, session.state.clock)}</small></span><ChevronDown size={14}/></summary><p>{item.detail}</p></details>) : <p className="activity-empty">Waiting for the first site signal.</p>}{activities.length > 4 && <details className="earlier-activity"><summary>Show {activities.length - 4} earlier updates</summary>{activities.slice(0,-4).reverse().map((item,index) => <div key={`${item.eventId || item.at}-${item.kind}-${index}`}><strong>{item.title}</strong><small>{provenance[item.provenance]} · {activityTime(item, session.state.clock)}</small><p>{item.detail}</p></div>)}</details>}</div>
      <details className="incident-evidence"><summary><span>Evidence and policy basis</span><ChevronDown size={15}/></summary><div className="evidence-body"><p>{operation.summary}</p>{operation.policyIds.map(id => <button key={id} className="text-button" onClick={()=>onOpenPolicy(id)}>{policyName(id)}<ArrowUpRight size={13}/></button>)}<ThermalReading reading={session.state.readings.civil_exposed} clock={session.state.clock} sensorStatus={session.state.sensor_status.t1}/><div className="message-preview"><strong>Prepared communication · review required</strong><p>{operation.communication.english}</p><p lang="ar" dir="rtl">{operation.communication.arabicDraft}</p><small>Draft translation for human review. No message is sent from this panel.</small></div></div></details>
    </div>
    <aside className="incident-copilot" aria-label="Case assistant">
      <div className="copilot-heading"><Sparkles size={16}/><strong>Next named action</strong><span>Decision support</span></div>
      <div className="copilot-content"><div className="eyebrow">{pending ? yours ? 'Your decision' : `Waiting on ${owner}` : 'Current site response'}</div><h3>{pending ? actionLabel(pending) : operation.headline}</h3><p>{pending ? actionExplanation(pending, session) : operation.nextAction} </p>
      {pending && <div id="queue-pending-action" tabIndex={-1} className="copilot-action"><div className="decision-owner"><span>Decision owner</span><strong>{owner}</strong></div>{policyId && <button className="decision-policy" onClick={() => onOpenPolicy(policyId)}>Decision basis: {policyName(policyId)} <ArrowUpRight size={13}/></button>}<button className="button button-primary" onClick={onAction} disabled={!yours || preview}>{pending.type === 'ack' ? 'Acknowledge' : actionLabel(pending)} <ArrowRight size={15}/></button>{!yours && <p className="role-block">{owner} must confirm. Choose their role in “Acting as”.</p>}</div>}
      <details className="copilot-options" open={!pending}><summary>Options prepared <span>{operation.options.length}</span><ChevronDown size={14}/></summary>{operation.options.map(item => <div className="copilot-option" key={item.title}><div><span className={`option-indicator ${item.available ? 'available' : ''}`}/><strong>{item.title}</strong></div><p>{item.detail} {item.reason}</p></div>)}</details></div>
      <div className="copilot-foot"><ShieldCheck size={14}/> Actions require the named person</div>
    </aside>
  </section>;
}

function ActorPicker({value,onChange}:{value:string;onChange:(value:string)=>void}) { return <label className="actor-picker">Acting as <select value={value} onChange={e=>onChange(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.name} · {title(p.role)}</option>)}</select></label>; }
function Metric({ icon: Icon, label, value, detail, tone }: { icon: any; label: string; value: number; detail: string; tone: string }) { return <div className="metric card"><div className={`metric-icon ${tone}`}><Icon size={19}/></div><span>{label}</span><strong>{value}</strong><small>{detail} <ArrowUpRight size={13}/></small></div>; }
function ActionCard({icon: Icon, type, heading, body, button, onClick}: {icon:any;type:string;heading:string;body:string;button:string;onClick:()=>void}) { return <div className="action-card"><div className="action-card-icon"><Icon size={22}/></div><div><div className="eyebrow">{type}</div><h3>{heading}</h3><p>{body}</p>{button && <button className="button button-primary" onClick={onClick}>{button}<ArrowRight size={16}/></button>}</div></div>; }
function eventSource(event:any) {
  if (event.actor_id) return `${personName(event.actor_id)} · responsible person`;
  if (event.type === 'twl') return `${assetName(event.payload?.sensor_id)} · local sensor`;
  if (event.type === 'forecast') return 'Regional forecast · weather feed';
  if (event.type === 'delivery_accept') return 'Oasis dispatch · supplier reply';
  if (event.type === 'clock') return 'Demo clock · deadline check';
  return 'Site event';
}
function Timeline({events,cursor,pending,history=[],compact=false}:{events:any[];cursor:number;pending:any;history?:any[];compact?:boolean}) { const list = compact ? events.slice(Math.max(0,cursor-2),Math.min(events.length,Math.max(3,cursor+1))) : events; return <div className="timeline">{list.map((event,index) => { const actual = compact ? events.indexOf(event) : index; const outcome = history.find((item:any)=>item.event.event_id===event.event_id); const state = outcome?.status === 'rejected' ? 'rejected' : actual < cursor ? 'done' : pending?.event_id === event.event_id ? 'waiting' : actual === cursor ? 'next' : 'future'; return <div className={`timeline-item ${state}`} key={event.event_id}><div className="timeline-marker">{state === 'done' ? <Check size={12}/> : state === 'rejected' ? <X size={12}/> : <span/>}</div><div className="timeline-info"><div><strong>{eventLabel(event.type, event)}</strong><span>{time(event.occurred_at)}</span></div><p>{eventSource(event)} · {state === 'rejected' ? `Rejected: ${title(outcome?.reason || 'policy gate')}` : state === 'done' ? 'Recorded in this case' : state === 'waiting' ? 'Awaiting named action' : state === 'next' ? 'Next signal' : 'Upcoming'}</p></div></div>})}</div>; }

const datasets = {people,crews,tasks,zones,assets,deliveries,organisations};
function SiteTable({dataset,query,session}:{dataset:Dataset;query:string;session:any}) { const rows = (datasets[dataset] as any[]).filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())); const columns: Record<Dataset,[string,(row:any)=>unknown][]> = {
  people:[['Person',r=>r.name],['Role',r=>title(r.role)],['Employer',r=>organisations.find(o=>o.id===r.organisation_id)?.name],['Crew',r=>crewName(r.crew_id)],['Heat-work status',r=>r.acclimatisation === 'restricted_day_2' ? 'Day two of acclimatisation · supervised light work only' : 'Acclimatisation complete']],
  crews:[['Crew',r=>crewName(r.id)],['Employer',r=>organisations.find(o=>o.id===r.organisation_id)?.name],['Lead',r=>personName(r.lead_id)],['People',r=>r.member_ids.length]],
  tasks:[['Work',r=>r.description],['Location',r=>zones.find(z=>z.id===r.zone_id)?.name],['Crew',r=>crewName(r.crew_id)],['Status',r=>title(session.state.task_status[r.id]||'unknown')],['Assigned people',r=>(session.state.assignments[r.id]||[]).map((id:string)=>personName(id)).join(', ')||'—']],
  zones:[['Location',r=>r.name],['Condition',r=>r.type === 'cooled' ? 'Cooled recovery or indoor work' : 'Exposed outdoor work'],['Local monitor',r=>r.sensor_id ? assetName(r.sensor_id) : 'No local monitor'],['Local TWL',r=>r.sensor_id ? <ThermalReading reading={session.state.readings[r.id]} clock={session.state.clock} sensorStatus={session.state.sensor_status[r.sensor_id]} compact/> : 'No TWL monitor assigned'],['Occupied places',r=>r.capacity ? `${(session.state.occupancy[r.id]||[]).length} / ${r.capacity}` : '—'],['People present',r=>(session.state.occupancy[r.id]||[]).map((id:string)=>personName(id)).join(', ')||'—']],
  assets:[['Equipment',r=>assetName(r.id)],['Purpose',r=>title(r.type)],['Location',r=>zones.find(z=>z.id===r.zone_id)?.name||'Site-wide'],['Status',r=>title(session.state.sensor_status[r.id]||r.status)]],
  deliveries:[['Delivery',r=>'Aggregate for civil trench work'],['Supplier',r=>organisations.find(o=>o.id===r.supplier_id)?.name||'—'],['Booked time',r=>time(session.state.delivery.id===r.id ? session.state.delivery.slot : r.slot)],['Request state',r=>title(session.state.delivery.id===r.id ? session.state.delivery.status : r.status)]],
  organisations:[['Organisation',r=>r.name],['Role',r=>title(r.role)],['Authority',r=>r.authority]]
}; return <div className="table-wrap"><table><thead><tr>{columns[dataset].map(([label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}>{columns[dataset].map(([label,fn])=><td key={label}>{fmt(fn(row))}</td>)}</tr>)}</tbody></table>{rows.length===0&&<Empty icon={Search} title="No matching records" text="Try another search term."/>}</div>; }

function FlowNode({ data }: any) { const Icon = data.actor ? Users : data.type === 'twl' ? Radio : ShieldCheck; return <div className={`flow-node ${data.selected ? 'selected' : ''} ${data.actor ? 'human' : ''}`}><Handle type="target" position={Position.Left}/><div className="flow-icon"><Icon size={17}/></div><div><span>{data.actor ? 'HUMAN ACTION' : 'SITE SIGNAL'}</span><strong>{data.label}</strong><small>{data.time} · {data.status}</small></div><Handle type="source" position={Position.Right}/></div>; }
const nodeTypes = { event: FlowNode };
function Workflow({fixture,session,selected,onSelect}:{fixture:any;session:any|null;selected:string|null;onSelect:(id:string|null)=>void}) { const events = fixture.events; const nodes:Node[] = events.map((event:any,index:number)=>({id:event.event_id,type:'event',position:{x:(index%3)*300,y:Math.floor(index/3)*190},data:{label:eventLabel(event.type, event),type:event.type,actor:event.actor_id,time:time(event.occurred_at),selected:event.event_id===selected,status:session ? index < session.cursor ? session.history.find((h:any)=>h.event.event_id===event.event_id)?.status === 'rejected' ? 'Blocked' : 'Recorded' : session.pendingEvent?.event_id === event.event_id ? 'Awaiting person' : 'Upcoming' : 'Scenario reference'}})); const edges:Edge[] = events.slice(1).map((event:any,index:number)=>({id:`e-${index}`,source:events[index].event_id,target:event.event_id,type:'smoothstep',animated:false,style:{stroke:'#c9d2dc',strokeWidth:2}})); const selectedEvent = events.find((e:any)=>e.event_id===selected); const selectedIndex = events.indexOf(selectedEvent); const execution = !session ? 'Scenario reference' : selectedIndex < session.cursor ? session.history.find((h:any)=>h.event.event_id===selected)?.status === 'rejected' ? 'Blocked' : 'Recorded' : session.pendingEvent?.event_id === selected ? 'Awaiting person' : 'Upcoming'; return <div className="workflow-layout"><div className="card workflow-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.15}} onNodeClick={(_,node)=>onSelect(node.id)} onKeyDown={event=>{if(event.key === "Enter" || event.key === " "){const id=(event.target as HTMLElement).closest("[data-id]")?.getAttribute("data-id");if(id){event.preventDefault();onSelect(id)}}}} onPaneClick={()=>onSelect(null)} proOptions={{hideAttribution:true}}><Background color="#e8edf3" gap={20}/><Controls showInteractive={false}/></ReactFlow></div><div className="card workflow-inspector"><SectionTitle eyebrow="INSPECTOR" title={selectedEvent ? eventLabel(selectedEvent.type, selectedEvent) : 'Select a step'}/>{selectedEvent ? <><Status tone={selectedEvent.actor_id ? 'warn' : 'blue'}>{selectedEvent.actor_id ? 'Human action' : 'External input'}</Status><div className="inspect-list"><div><span>Recorded status</span><strong>{execution}</strong></div><div><span>Site time</span><strong>{time(selectedEvent.occurred_at)} GST</strong></div><div><span>Source</span><strong>{selectedEvent.actor_id ? 'Team confirmation' : 'Site feed'}</strong></div><div><span>Person or source</span><strong>{selectedEvent.actor_id ? personName(selectedEvent.actor_id) : 'Site or supplier signal'}</strong></div><div><span>Recorded event reference</span><strong>{selectedEvent.event_id}</strong></div></div>{selectedEvent.type === 'twl' && <><p>Event measurement · freshness assessed against the current site clock</p><ThermalReading reading={{twl:selectedEvent.payload.twl,at:selectedEvent.payload.measured_at}} clock={session?.state.clock || selectedEvent.occurred_at} sensorStatus={selectedEvent.payload.quality === 'valid' ? session?.state.sensor_status[selectedEvent.payload.sensor_id] || 'serviceable' : 'invalid'}/></>}<details className="workflow-payload"><summary>Recorded event data and values</summary><p>{selectedEvent.actor_id ? `${personName(selectedEvent.actor_id)} is responsible for ${eventLabel(selectedEvent.type, selectedEvent).toLowerCase()}.` : `This ${eventLabel(selectedEvent.type, selectedEvent).toLowerCase()} comes from the site feed.`}</p><pre>{JSON.stringify(selectedEvent.payload,null,2)}</pre></details></> : <Empty icon={GitBranch} title="Explore the response" text="Choose a step to see its source, owner, recorded status and event data."/>}<div className="inspector-foot"><ShieldCheck size={16}/> Each decision needs the named person’s confirmation.</div></div></div>; }

export default App;
