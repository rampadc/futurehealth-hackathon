import { describe, expect, it } from 'vitest';
import { ADMIN, PERSONAS } from '../story';
import { findScreen, screensFor } from '../screens/registry';
import { stepUrl, TUTORIAL_STEPS } from './tutorialSteps';

const SHOTS = Object.keys(import.meta.glob('./tutorial/*.png'));

/** Case action owners, from the backend ACTIONS table (service.py). */
const OWNER: Record<string, string> = {
  issue: 'P03', acknowledge: 'C01', stop: 'C01', checkin: 'C05', recover: 'C01', readiness: 'C01', activity: 'C01', assign: 'C01',
  report: 'C08', incident_record: 'C01', remove: 'C01', firstaid: 'P06', fresh: 'C01', water: 'C01', permit: 'P04',
  personnel: 'C01', recovery_check: 'C01', crew_readiness: 'C01', handover: 'P02',
};

describe('presenter tutorial steps', () => {
  it('have unique ids and a screenshot for each step', () => {
    expect(new Set(TUTORIAL_STEPS.map(s => s.id)).size).toBe(TUTORIAL_STEPS.length);
    for (const step of TUTORIAL_STEPS) expect(SHOTS, step.id).toContain(`./tutorial/${step.id}.png`);
  });

  it('open a screen that the step persona can use', () => {
    const people = new Set([...PERSONAS, ADMIN].map(p => p.id));
    for (const step of TUTORIAL_STEPS) {
      expect(people.has(step.persona), step.id).toBe(true);
      const screen = findScreen(step.device, step.screen);
      expect(screensFor(step.device).some(s => s.id === step.screen), `${step.id} screen`).toBe(true);
      expect(screen.personas.includes(step.persona), `${step.id} persona`).toBe(true);
      expect(stepUrl(step)).toBe(`/${step.device}/${step.screen}?persona=${step.persona}`);
    }
  });

  it('record each setup action as the persona who owns it', () => {
    for (const step of TUTORIAL_STEPS) for (const op of step.setup ?? []) {
      if ('as' in op) expect(op.as, `${step.id} ${op.action}`).toBe(OWNER[op.action]);
    }
  });

  it('write explanations for the site and the system on every step', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.click.length, step.id).toBeGreaterThan(10);
      expect(step.onSite.length, step.id).toBeGreaterThan(20);
      expect(step.system.length, step.id).toBeGreaterThan(20);
    }
  });
});
