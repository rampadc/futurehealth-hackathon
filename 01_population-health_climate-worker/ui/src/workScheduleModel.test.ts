import { expect, test } from 'vitest';
import { baseline } from './fixtures';
import { dayEnd, dayStart, workScheduleModel } from './workScheduleModel';

const model = (contractor = 'all', suggested = false, accepted = false) => workScheduleModel(structuredClone(baseline), contractor, suggested, accepted ? 'Supplier accepted' : 'Planning option · not requested', accepted);

test('schedule dates and group rows use fixed GST instants', () => {
  expect(dayStart.toISOString()).toBe('2025-08-04T03:00:00.000Z');
  expect(dayEnd.toISOString()).toBe('2025-08-04T12:00:00.000Z');
  const { groups, items } = model();
  expect(groups.map(group => group.id)).toEqual(['civil_heavy', 'civil_light', 'electrical_prep', 'yard_receive', 'workshop_prep', 'delivery']);
  expect(items.find(item => item.id === 'civil_heavy')?.start).toEqual(dayStart);
  expect(items.find(item => item.id === 'delivery-proposed')?.start).toEqual(new Date('2025-08-04T11:30:00.000Z'));
});

test('outdoor restriction bands are scoped to exposed rows and contractor filter preserves delivery', () => {
  const { items } = model();
  expect(items.filter(item => String(item.id).startsWith('restriction-')).map(item => item.group)).toEqual(['civil_heavy', 'civil_light', 'electrical_prep', 'yard_receive']);
  expect(model('electroco').groups.map(group => group.id)).toEqual(['electrical_prep', 'delivery']);
});

test('suggestion and accepted slot are labelled without changing planned or original instants', () => {
  expect(model().items.some(item => item.id === 'suggested-civil-heavy')).toBe(false);
  const { items } = model('all', true, true);
  expect(items.find(item => item.id === 'suggested-civil-heavy')?.selectable).toBe(false);
  expect(items.find(item => item.id === 'delivery-original')?.content).toBe('Original · 11:30');
  expect(items.find(item => item.id === 'delivery-proposed')?.content).toBe('Accepted · 15:30');
});
