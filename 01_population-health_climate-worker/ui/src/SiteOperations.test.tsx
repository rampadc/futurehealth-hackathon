import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { baseline } from './fixtures';
import SiteOperations from './SiteOperations';

const render = (state: any, history: any[] = [], scenarioId = '02_heat_alert_response') => renderToStaticMarkup(<SiteOperations session={{ state, history, scenarioId, pendingDeliverySlot: null }} />);

test('schedule keeps planned windows separate from replay status and delivery acceptance', () => {
  const state = structuredClone(baseline);
  state.task_status.civil_heavy = 'held';
  const held = render(state);
  expect(held).toContain('Planned windows');
  expect(held).toContain('WORK HELD');
  expect(held).toContain('Aggregate: original 11:30 slot');
  expect(held).toContain('planning option · not requested');
  state.delivery.slot = '2025-08-04T15:30:00+04:00';
  expect(render(state)).toContain('current confirmed booking 15:30');
});

test('map reads only a matching fresh local sensor and labels assignments separately from occupancy', () => {
  const state = structuredClone(baseline);
  expect(render(state)).toContain('T1 · 175 W/m² · green');
  expect(render(state)).toContain('14 assigned to active tasks');
  expect(render(state)).toContain('2 recorded present');
  state.readings.civil_exposed.sensor_id = 't2';
  expect(render(state)).toContain('Civil trench preparation; T1 reading unavailable');
  state.readings.civil_exposed.sensor_id = 't1';
  state.clock = '2025-08-04T08:03:00+04:00';
  expect(render(state)).toContain('T1 · 175 W/m² · green');
  state.clock = '2025-08-04T08:03:01+04:00';
  expect(render(state)).toContain('Civil trench preparation; T1 reading unavailable');
});

test('early trench proposal appears only after its replay event and is not a clearance', () => {
  const state = structuredClone(baseline);
  expect(render(state, [], '01_pre_shift_planning')).not.toContain('Suggested 08:00–11:00');
  const history = [{ status: 'applied', event: { type: 'recommendation' } }];
  expect(render(state, history, '01_pre_shift_planning')).toContain('Suggested 08:00–11:00; no clearance');
});

test('schedule provides real timeline controls and instructions', () => {
  const markup = render(structuredClone(baseline));
  expect(markup).toContain('Zoom in +');
  expect(markup).toContain('Zoom out −');
  expect(markup).toContain('Full day');
  expect(markup).toContain('Drag timeline to pan');
});
