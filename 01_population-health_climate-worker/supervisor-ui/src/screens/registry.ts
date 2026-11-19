import type { ComponentType } from 'react';
import type { CaseSession } from '../session';
import { HeatControlsScreen, ProtectiveResponseScreen } from './web/response';
import { SiteConditionsTableScreen } from './conditions';
import { CrewWorkshopScreen, WorkRestPlanScreen } from './web/plan';
import { SquadMonitoringScreen, SystemTrustScreen } from './web/monitor';
import { AdminSettingsScreen } from './web/settings';
import { SiteSetupScreen } from './web/setup';
import { TodayScreen, ActionsScreen, StopWorkScreen, CrewMessageScreen, HeadcountScreen, AffectedWorkersScreen, AccountForCrewScreen } from './site/today';
import { ReadinessScreen, ProposalScreen, ActionCardScreen } from './site/crew';
import { FreshReadingScreen, RestartReviewScreen } from './restart';
import { SiteAskScreen, WebAskScreen } from './ask';
import { NowScreen, AlertScreen, ShelterScreen, OfflineScreen } from './worker/now';
import { CheckInScreen, MyPlanScreen } from './worker/plan';
import { WelcomeScreen, MyDataScreen } from './worker/privacy';
import { KioskScreen } from './kiosk';
import { AccountScreen, WorkerAccountScreen } from './account';
import { HeatRestScreen, WorkerHeatRestScreen } from './heatRest';

export type Device = 'web' | 'site' | 'worker' | 'kiosk';
export type Owner = 'A' | 'B' | 'C';
/** Demo slice the screen belongs to (see SCREENS.md). 5 = stretch, shown as planned. */
export type Slice = 1 | 2 | 3 | 4 | 5;

export type ScreenProps = { session: CaseSession };

export type ScreenDef = {
  id: string;
  device: Device;
  name: string;
  /** Section tab on phone shells. */
  tab?: string;
  /** Sub-screen: opened from this screen, which its back link returns to. Not listed in the web rail. */
  parent?: string;
  /** `admin` screens sit in their own group at the end of the rail; `account` is reached from your photo in the title bar. */
  group?: 'admin' | 'account';
  /** Scenario time the wireframe is drawn at (GST, 4 August). */
  clock: string;
  slice: Slice;
  owner: Owner;
  /** Personas who use this screen (ids from story.ts). Empty for screens every signed-in person has (account). */
  personas: string[];
  /** CaseView fields or API routes the screen reads. */
  reads: string[];
  /** Case actions (`/api/case/commands`) the screen can send. */
  commands: string[];
  /** Backend work the screen still needs, if any. */
  needs?: string;
  /** Set once the screen is built; until then the shell shows a placeholder. */
  component?: ComponentType<ScreenProps>;
};

const s = (id: string, def: Omit<ScreenDef, 'id'>): ScreenDef => ({ id, ...def });

export const SCREENS: ScreenDef[] = [
  // Supervisor web · owner A
  s('monitoring', { device: 'web', name: 'Squad Monitoring', clock: '08:18', slice: 4, owner: 'A', personas: ['C01', 'P03', 'P02', 'P04', 'P05', 'P06', 'P01'], reads: ['workers', 'capture.response.heat', 'capture.response.crew_rest', 'tasks'], commands: ['draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery', 'costReview'], needs: 'Optional GET /api/case/monitor summary if CaseView is too heavy' , component: SquadMonitoringScreen }),
  s('heat-rest', { device: 'web', name: 'Heat and rest coverage', clock: '08:18', slice: 4, owner: 'A', personas: ['P10', 'P01', 'C01'], reads: ['GET /api/case/heat-rest', 'headcount', 'plan_assessment'], commands: ['coverage_review'], component: HeatRestScreen }),
  s('heat-controls', { device: 'web', name: 'Heat controls', clock: '08:00', slice: 1, owner: 'A', personas: ['P03'], reads: ['capture.request.snapshot.readings', 'capture.response.heat.controls', 'capture.response.decision_at'], commands: ['issue'] , component: HeatControlsScreen }),
  s('site-conditions', { device: 'web', parent: 'heat-controls', name: 'Site conditions table', clock: '08:00', slice: 1, owner: 'A', personas: ['P03'], reads: ['GET /api/case/conditions'], commands: [], component: SiteConditionsTableScreen }),
  s('response', { device: 'web', name: 'Protective response', clock: '08:04', slice: 1, owner: 'A', personas: ['C01', 'P02', 'P06'], reads: ['story', 'tasks', 'capture.response.protective_response'], commands: ['acknowledge', 'stop', 'recover', 'escalation_followup'] , component: ProtectiveResponseScreen }),
  s('crew', { device: 'web', name: 'Crew & workshop', clock: '08:10', slice: 2, owner: 'A', personas: ['C01'], reads: ['capture.request.snapshot', 'capture.request.locations', 'capture.response.crew_rest'], commands: ['readiness', 'activity', 'assign', 'leila'] , component: CrewWorkshopScreen }),
  s('work-rest', { device: 'web', name: 'Work/rest plan', clock: '08:11', slice: 2, owner: 'A', personas: ['C01', 'P02'], reads: ['capture.response.crew_rest', 'capture.request.planning'], commands: [] , component: WorkRestPlanScreen }),
  s('restart-review', { device: 'web', name: 'Restart review', clock: '15:08', slice: 3, owner: 'A', personas: ['P02', 'P04'], reads: ['story', 'capture.request.restart', 'capture.response.restart'], commands: ['review', 'handover'] , component: RestartReviewScreen }),
  s('ask', { device: 'web', name: 'Ask the Planning Agent', clock: '08:20', slice: 4, owner: 'A', personas: ['P03', 'C01', 'P02'], reads: ['GET /api/chat/history'], commands: [], needs: 'Uses existing POST /api/chat' , component: WebAskScreen }),
  s('trust', { device: 'web', name: 'System & trust', clock: '09:00', slice: 4, owner: 'A', personas: ['P02', 'P09'], reads: ['runs', 'GET /api/trust-log', 'GET /api/ready'], commands: [], needs: 'GET /api/trust-log (supervisors)' , component: SystemTrustScreen }),
  s('site-setup', { device: 'web', name: 'Site setup', clock: '07:30', slice: 5, owner: 'C', personas: ['P09', 'P03', 'P02', 'C01'], reads: ['capture.request.snapshot.readings'], commands: [], needs: 'Sensors, squads and locations beyond the civil crew are a site fixture until the backend models them.', component: SiteSetupScreen }),
  s('settings', { device: 'web', group: 'admin', name: 'Admin settings', clock: '16:40', slice: 5, owner: 'C', personas: ['P09', 'P02'], reads: ['GET /api/brand', 'POST /api/brand/check'], commands: [], needs: 'PUT /api/brand · admin only, after a confirmation modal', component: AdminSettingsScreen }),
  s('account', { device: 'web', group: 'account', name: 'My account', clock: '16:45', slice: 5, owner: 'C', personas: [], reads: ['GET /api/people/photos'], commands: [], needs: 'PUT/DELETE /api/people/me/photo · own photo only', component: AccountScreen }),
  // Site app · owner B
  s('today', { device: 'site', tab: 'today', name: 'Today', clock: '08:00', slice: 1, owner: 'B', personas: ['C01', 'P03', 'P06'], reads: ['tasks', 'story'], commands: [] , component: TodayScreen }),
  s('actions', { device: 'site', tab: 'today', parent: 'today', name: 'Your actions', clock: '08:00', slice: 1, owner: 'B', personas: ['C01', 'P03', 'P06'], reads: ['tasks'], commands: [], component: ActionsScreen }),
  s('stop-work', { device: 'site', tab: 'today', parent: 'today', name: 'Stop-work instruction', clock: '08:01', slice: 1, owner: 'B', personas: ['P03', 'C01'], reads: ['story', 'capture.response.heat.controls'], commands: ['issue', 'acknowledge', 'stop'] , component: StopWorkScreen }),
  s('crew-message', { device: 'site', tab: 'today', parent: 'stop-work', name: 'Crew communications preview', clock: '08:01', slice: 1, owner: 'B', personas: ['P03', 'C01'], reads: ['story', 'workers'], commands: [], needs: 'SMS part count is display-only; nothing is sent', component: CrewMessageScreen }),
  s('headcount', { device: 'site', tab: 'crew', name: 'Headcount', clock: '08:04', slice: 1, owner: 'B', personas: ['C01'], reads: ['workers', 'capture.request.snapshot.workers'], commands: [] , component: HeadcountScreen }),
  s('affected-workers', { device: 'site', tab: 'crew', parent: 'headcount', name: 'Affected workers', clock: '08:04', slice: 1, owner: 'B', personas: ['C01'], reads: ['workers', 'headcount'], commands: [], component: AffectedWorkersScreen }),
  s('account-for-crew', { device: 'site', tab: 'crew', parent: 'headcount', name: 'Account for the crew', clock: '08:04', slice: 1, owner: 'B', personas: ['C01'], reads: ['workers', 'headcount'], commands: ['recover', 'personnel'], component: AccountForCrewScreen }),
  s('readiness', { device: 'site', tab: 'crew', parent: 'headcount', name: 'Readiness confirmation', clock: '08:10', slice: 2, owner: 'B', personas: ['C01'], reads: ['workers'], commands: ['readiness', 'activity', 'crew_readiness'] , component: ReadinessScreen }),
  s('proposal', { device: 'site', tab: 'plan', name: 'Proposal review', clock: '08:11', slice: 2, owner: 'B', personas: ['C01'], reads: ['plan_assessment', 'workers'], commands: ['assign', 'start_work', 'start_recovery'] , component: ProposalScreen }),
  s('action-card', { device: 'site', tab: 'today', parent: 'actions', name: 'Worker action card', clock: '08:18', slice: 2, owner: 'B', personas: ['C01', 'P06'], reads: ['story', 'tasks'], commands: ['incident_record', 'remove', 'firstaid'] , component: ActionCardScreen }),
  s('fresh-reading', { device: 'site', tab: 'today', parent: 'actions', name: 'Fresh reading', clock: '15:06', slice: 3, owner: 'B', personas: ['C01'], reads: ['capture.request.snapshot.readings'], commands: ['fresh', 'water'] , component: FreshReadingScreen }),
  s('ask', { device: 'site', tab: 'ask', name: 'Ask (Planning Agent)', clock: '08:20', slice: 4, owner: 'B', personas: ['C01', 'P03'], reads: ['GET /api/chat/history'], commands: [], needs: 'Uses existing POST /api/chat' , component: SiteAskScreen }),
  s('account', { device: 'site', group: 'account', name: 'My account', clock: '16:45', slice: 5, owner: 'C', personas: [], reads: ['GET /api/people/photos'], commands: [], needs: 'PUT/DELETE /api/people/me/photo · own photo only', component: AccountScreen }),
  // Worker app · owner B
  s('welcome', { device: 'worker', name: 'Welcome: language, then consent', clock: '07:30', slice: 4, owner: 'B', personas: ['C05', 'C08'], reads: ['GET /api/worker/consent', 'PUT /api/worker/consent'], commands: [], needs: 'GET/PUT /api/worker/consent' , component: WelcomeScreen }),
  s('now', { device: 'worker', tab: 'now', name: 'Now (home)', clock: '08:04', slice: 1, owner: 'B', personas: ['C05', 'C08'], reads: ['story', 'capture.response.crew_rest.intervals'], commands: [] , component: NowScreen }),
  s('alert', { device: 'worker', parent: 'now', name: 'Alert (full screen)', clock: '08:01', slice: 1, owner: 'B', personas: ['C05', 'C08'], reads: ['story'], commands: [] , component: AlertScreen }),
  s('check-in', { device: 'worker', tab: 'check', name: 'Check in (voice and tap)', clock: '08:18', slice: 2, owner: 'B', personas: ['C05', 'C08'], reads: ['story'], commands: ['checkin', 'report'] , component: CheckInScreen }),
  s('my-plan', { device: 'worker', tab: 'plan', name: 'My plan', clock: '08:12', slice: 2, owner: 'B', personas: ['C05', 'C08'], reads: ['capture.response.crew_rest.intervals'], commands: [] , component: MyPlanScreen }),
  s('heat-rest', { device: 'worker', tab: 'plan', parent: 'my-plan', name: 'My heat and rest coverage', clock: '08:18', slice: 4, owner: 'B', personas: ['C05', 'C08'], reads: ['GET /api/case/heat-rest'], commands: [], component: WorkerHeatRestScreen }),
  s('shelter', { device: 'worker', parent: 'now', tab: 'now', name: 'Shelter check-in', clock: '08:04', slice: 1, owner: 'B', personas: ['C05'], reads: ['story'], commands: ['checkin'] , component: ShelterScreen }),
  s('offline', { device: 'worker', parent: 'now', name: 'Offline state', clock: '08:04', slice: 5, owner: 'B', personas: ['C05', 'C08'], reads: [], commands: [], needs: 'Check-ins and reports queue on the phone; supervisor decisions are never queued', component: OfflineScreen }),
  s('my-data', { device: 'worker', tab: 'me', name: 'Me: privacy and my data', clock: '17:10', slice: 4, owner: 'B', personas: ['C05', 'C08'], reads: ['GET /api/worker/data'], commands: [], needs: 'GET /api/worker/data, DELETE /api/worker/consent' , component: MyDataScreen }),
  s('account', { device: 'worker', tab: 'me', group: 'account', name: 'Me: my photo', clock: '17:12', slice: 5, owner: 'C', personas: [], reads: ['GET /api/people/photos'], commands: [], needs: 'PUT/DELETE /api/people/me/photo · own photo only', component: WorkerAccountScreen }),
  // Kiosk · owner B
  s('check-in', { device: 'kiosk', name: 'Shelter A check-in', clock: '08:04', slice: 4, owner: 'B', personas: ['C05'], reads: ['workers'], commands: ['checkin'], needs: 'NFC tap simulated with a button' , component: KioskScreen }),
];

export const DEVICE_INFO: Record<Device, { name: string; sub: string; theme: 'day' | 'glare'; tabs?: Array<[string, string]> }> = {
  web: { name: 'Supervisor web', sub: 'Desktop · 1280px+', theme: 'day' },
  site: { name: 'Site app', sub: 'Phone · supervisors and responders', theme: 'glare', tabs: [['today', 'Today'], ['crew', 'Crew'], ['plan', 'Plan'], ['ask', 'Ask']] },
  worker: { name: 'Worker app', sub: 'Phone · workers', theme: 'glare', tabs: [['now', 'Now'], ['check', 'Check in'], ['plan', 'My plan'], ['me', 'Me']] },
  kiosk: { name: 'Shelter kiosk', sub: 'Wall tablet · Shelter A', theme: 'day' },
};

/** Old paths that still open the screen that replaced them. */
const ALIASES: Record<string, string> = { 'web/branding': 'settings' };

export const screensFor = (device: Device) => SCREENS.filter(screen => screen.device === device);
export const findScreen = (device: Device, id?: string) => {
  const list = screensFor(device);
  const wanted = id && ALIASES[`${device}/${id}`] || id;
  return list.find(screen => screen.id === wanted) ?? list[0];
};
