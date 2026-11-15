import type { ComponentType } from 'react';
import type { CaseSession } from '../session';
import { W2HeatControls, W3ProtectiveResponse } from './web/response';
import { W4CrewWorkshop, W5WorkRestPlan } from './web/plan';
import { W1SquadMonitoring, W8SystemTrust } from './web/monitor';
import { W9Branding } from './web/branding';
import { M1Today, M2StopWork, M3Headcount } from './site/today';
import { M4Readiness, M5Proposal, M6ActionCard } from './site/crew';
import { M7FreshReading, W6RestartReview } from './restart';
import { M8Ask, W7Ask } from './ask';
import { P2Now, P3Alert, P6Shelter, P7Offline } from './worker/now';
import { P4CheckIn, P5MyPlan } from './worker/plan';
import { P1Welcome, P8MyData } from './worker/privacy';
import { K1Kiosk } from './kiosk';

export type Device = 'web' | 'site' | 'worker' | 'kiosk';
export type Owner = 'A' | 'B' | 'C';
/** Demo slice the screen belongs to (see SCREENS.md). 5 = stretch, shown as planned. */
export type Slice = 1 | 2 | 3 | 4 | 5;

export type ScreenProps = { session: CaseSession };

export type ScreenDef = {
  id: string;
  device: Device;
  name: string;
  /** Bottom-tab group on phone shells. */
  tab?: string;
  /** Scenario time the wireframe is drawn at (GST, 4 August). */
  clock: string;
  slice: Slice;
  owner: Owner;
  /** Personas who use this screen (ids from story.ts). */
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
  s('w1', { device: 'web', name: 'Squad Monitoring', clock: '08:18', slice: 4, owner: 'A', personas: ['C01', 'P03', 'P02', 'P04', 'P05', 'P06', 'P01'], reads: ['workers', 'capture.response.heat', 'capture.response.crew_rest', 'tasks'], commands: ['draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery', 'costReview'], needs: 'Optional GET /api/case/monitor summary if CaseView is too heavy' , component: W1SquadMonitoring }),
  s('w2', { device: 'web', name: 'Heat controls', clock: '08:00', slice: 1, owner: 'A', personas: ['P03'], reads: ['capture.request.snapshot.readings', 'capture.response.heat.controls', 'capture.response.decision_at'], commands: ['issue'] , component: W2HeatControls }),
  s('w3', { device: 'web', name: 'Protective response', clock: '08:04', slice: 1, owner: 'A', personas: ['C01', 'P02', 'P06'], reads: ['story', 'tasks', 'capture.response.protective_response'], commands: ['acknowledge', 'stop', 'recover', 'escalation_followup'] , component: W3ProtectiveResponse }),
  s('w4', { device: 'web', name: 'Crew & workshop', clock: '08:10', slice: 2, owner: 'A', personas: ['C01'], reads: ['capture.request.snapshot', 'capture.request.locations', 'capture.response.crew_rest'], commands: ['readiness', 'activity', 'assign', 'leila'] , component: W4CrewWorkshop }),
  s('w5', { device: 'web', name: 'Work/rest plan', clock: '08:11', slice: 2, owner: 'A', personas: ['C01', 'P02'], reads: ['capture.response.crew_rest', 'capture.request.planning'], commands: [] , component: W5WorkRestPlan }),
  s('w6', { device: 'web', name: 'Restart review', clock: '15:08', slice: 3, owner: 'A', personas: ['P02', 'P04'], reads: ['story', 'capture.request.restart', 'capture.response.restart'], commands: ['review', 'handover'] , component: W6RestartReview }),
  s('w7', { device: 'web', name: 'Ask the Planning Agent', clock: '08:20', slice: 4, owner: 'A', personas: ['P03', 'C01', 'P02'], reads: ['GET /api/chat/history'], commands: [], needs: 'Uses existing POST /api/chat' , component: W7Ask }),
  s('w8', { device: 'web', name: 'System & trust', clock: '09:00', slice: 4, owner: 'A', personas: ['P02', 'P09'], reads: ['runs', 'GET /api/trust-log', 'GET /api/ready'], commands: [], needs: 'GET /api/trust-log (supervisors)' , component: W8SystemTrust }),
  s('w9', { device: 'web', name: 'Organisation branding', clock: '16:40', slice: 5, owner: 'C', personas: ['P09', 'P02'], reads: ['GET /api/brand', 'POST /api/brand/check'], commands: [], needs: 'PUT /api/brand · admin only, typed PUBLISH', component: W9Branding }),
  // Site app · owner B
  s('m1', { device: 'site', tab: 'today', name: 'Today (alert inbox)', clock: '08:00', slice: 1, owner: 'B', personas: ['C01', 'P03', 'P06'], reads: ['tasks', 'story'], commands: [] , component: M1Today }),
  s('m2', { device: 'site', tab: 'today', name: 'Stop-work instruction', clock: '08:01', slice: 1, owner: 'B', personas: ['P03', 'C01'], reads: ['story', 'capture.response.heat.controls'], commands: ['issue', 'acknowledge', 'stop'], needs: 'SMS part count is display-only; nothing is sent' , component: M2StopWork }),
  s('m3', { device: 'site', tab: 'crew', name: 'Headcount', clock: '08:04', slice: 1, owner: 'B', personas: ['C01'], reads: ['workers', 'capture.request.snapshot.workers'], commands: ['recover', 'personnel'] , component: M3Headcount }),
  s('m4', { device: 'site', tab: 'crew', name: 'Readiness confirmation', clock: '08:10', slice: 2, owner: 'B', personas: ['C01'], reads: ['workers'], commands: ['readiness', 'activity', 'crew_readiness'] , component: M4Readiness }),
  s('m5', { device: 'site', tab: 'plan', name: 'Proposal review', clock: '08:11', slice: 2, owner: 'B', personas: ['C01'], reads: ['capture.response.crew_rest'], commands: ['assign'] , component: M5Proposal }),
  s('m6', { device: 'site', tab: 'today', name: 'Worker action card', clock: '08:18', slice: 2, owner: 'B', personas: ['C01', 'P06'], reads: ['story', 'tasks'], commands: ['incident_record', 'remove', 'firstaid'] , component: M6ActionCard }),
  s('m7', { device: 'site', tab: 'today', name: 'Fresh reading', clock: '15:06', slice: 3, owner: 'B', personas: ['P03'], reads: ['capture.request.snapshot.readings'], commands: ['fresh', 'water'] , component: M7FreshReading }),
  s('m8', { device: 'site', tab: 'ask', name: 'Ask (Planning Agent)', clock: '08:20', slice: 4, owner: 'B', personas: ['C01', 'P03'], reads: ['GET /api/chat/history'], commands: [], needs: 'Uses existing POST /api/chat' , component: M8Ask }),
  // Worker app · owner B
  s('p1', { device: 'worker', name: 'Welcome: language, then consent', clock: '07:30', slice: 4, owner: 'B', personas: ['C05', 'C08'], reads: ['GET /api/worker/consent', 'PUT /api/worker/consent'], commands: [], needs: 'GET/PUT /api/worker/consent' , component: P1Welcome }),
  s('p2', { device: 'worker', tab: 'now', name: 'Now (home)', clock: '08:04', slice: 1, owner: 'B', personas: ['C05', 'C08'], reads: ['story', 'capture.response.crew_rest.intervals'], commands: [] , component: P2Now }),
  s('p3', { device: 'worker', name: 'Alert (full screen)', clock: '08:01', slice: 1, owner: 'B', personas: ['C05', 'C08'], reads: ['story'], commands: [] , component: P3Alert }),
  s('p4', { device: 'worker', tab: 'check', name: 'Check in (voice and tap)', clock: '08:18', slice: 2, owner: 'B', personas: ['C05', 'C08'], reads: ['story'], commands: ['checkin', 'report'] , component: P4CheckIn }),
  s('p5', { device: 'worker', tab: 'plan', name: 'My plan', clock: '08:12', slice: 2, owner: 'B', personas: ['C05', 'C08'], reads: ['capture.response.crew_rest.intervals'], commands: [] , component: P5MyPlan }),
  s('p6', { device: 'worker', tab: 'now', name: 'Shelter check-in', clock: '08:04', slice: 1, owner: 'B', personas: ['C05'], reads: ['story'], commands: ['checkin'] , component: P6Shelter }),
  s('p7', { device: 'worker', name: 'Offline state (across P2–P6)', clock: '08:04', slice: 5, owner: 'B', personas: ['C05', 'C08'], reads: [], commands: [], needs: 'Offline banner and disabled sending are built; a service worker with queued commands is planned' , component: P7Offline }),
  s('p8', { device: 'worker', tab: 'me', name: 'Me: privacy and my data', clock: '17:10', slice: 4, owner: 'B', personas: ['C05', 'C08'], reads: ['GET /api/worker/data'], commands: [], needs: 'GET /api/worker/data, DELETE /api/worker/consent' , component: P8MyData }),
  // Kiosk · owner B
  s('k1', { device: 'kiosk', name: 'Shelter A check-in', clock: '08:04', slice: 4, owner: 'B', personas: ['C05'], reads: ['workers'], commands: ['checkin'], needs: 'NFC tap simulated with a button' , component: K1Kiosk }),
];

export const DEVICE_INFO: Record<Device, { name: string; sub: string; theme: 'day' | 'glare'; tabs?: Array<[string, string]> }> = {
  web: { name: 'Supervisor web', sub: 'Desktop · 1280px+', theme: 'day' },
  site: { name: 'Site app', sub: 'Phone · supervisors and responders', theme: 'glare', tabs: [['today', 'Today'], ['crew', 'Crew'], ['plan', 'Plan'], ['ask', 'Ask']] },
  worker: { name: 'Worker app', sub: 'Phone · workers', theme: 'glare', tabs: [['now', 'Now'], ['check', 'Check in'], ['plan', 'My plan'], ['me', 'Me']] },
  kiosk: { name: 'Shelter kiosk', sub: 'Wall tablet · Shelter A', theme: 'day' },
};

export const screensFor = (device: Device) => SCREENS.filter(screen => screen.device === device);
export const findScreen = (device: Device, id?: string) => {
  const list = screensFor(device);
  return list.find(screen => screen.id === id) ?? list[0];
};
