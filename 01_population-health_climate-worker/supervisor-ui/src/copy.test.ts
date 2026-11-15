import { expect, it } from 'vitest';
import { taskReason } from './copy';

it('names the owner of a missing handoff and the people missing activity', () => {
  expect(taskReason('Waiting for issue')).toBe('Waiting for Stop heavy trench work · Maya');
  expect(taskReason('Observed activity needed through current clock: C05')).toContain('Rana Al Nadir');
});
