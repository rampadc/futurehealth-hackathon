import { describe, expect, it } from 'vitest';
import { concernStatus, nextConcernAction, recordConcern } from './commercial';

describe('local commercial concern record', () => {
  it('requires the named actors in order and never marks cost allocation agreed', () => {
    const at = '2025-08-04T10:30:00+04:00';
    expect(recordConcern(undefined, 'P01', at)).toBeNull();
    const raised = recordConcern(undefined, 'C01', at)!;
    expect(nextConcernAction(raised).actorId).toBe('P02');
    expect(recordConcern(raised, 'P01', at)).toBeNull();
    const routed = recordConcern(raised, 'P02', at)!;
    const received = recordConcern(routed, 'P01', at)!;
    expect(received.stage).toBe('receipt_recorded');
    expect(received.entries.map(entry => [entry.actorId, entry.stage])).toEqual([['C01', 'raised'], ['P02', 'routed'], ['P01', 'receipt_recorded']]);
    expect(nextConcernAction(received).actorId).toBe('');
    expect(recordConcern(received, 'P01', at)).toBeNull();
    expect(concernStatus(received)).toContain('cost allocation not agreed');
  });
});
