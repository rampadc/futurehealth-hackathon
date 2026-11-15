import { describe, expect, it } from 'vitest'
import corpus from '../../demo/solver/operational-results.json'
import { CASE_IDS, loadCase, parseCapture, resolveCase } from './replay'

const changed = (edit: (root: any) => void): unknown => {
  const copy = structuredClone(corpus)
  edit(copy)
  return copy
}

describe('captured replay', () => {
  it('contains all supported cases and preserves the recorded numbers', async () => {
    expect(new Set(parseCapture(corpus).cases.map((c) => c.case_id))).toEqual(new Set(CASE_IDS))
    expect((await loadCase('heat_trigger', { delayMs: 0 })).request.planning).toBeNull()
    expect((await loadCase('canonical_timed', { delayMs: 0 })).response.crew_rest.useful_worker_minutes).toBe(120)
    expect((await loadCase('incident_no_substitute', { delayMs: 0 })).response.crew_rest.useful_worker_minutes).toBe(90)
    expect((await loadCase('incident_substitute', { delayMs: 0 })).response.crew_rest.useful_worker_minutes).toBe(120)
  })

  it('routes the response gates', () => {
    for (const stage of [0, 1]) expect(resolveCase(stage, false, false, false, 'restart_ready')).toBe('canonical_timed')
    expect(resolveCase(2, false, true, true, 'restart_ready')).toBe('removal_unconfirmed')
    expect(resolveCase(2, true, false, true, 'restart_ready')).toBe('removal_unconfirmed')
    expect(resolveCase(2, true, true, false, 'restart_ready')).toBe('incident_no_substitute')
    expect(resolveCase(2, true, true, true, 'restart_ready')).toBe('incident_substitute')
    expect(resolveCase(3, true, true, true, 'restart_stale')).toBe('restart_stale')
  })

  it('rejects missing, wrong-schema, applied and malformed captures', () => {
    expect(() => parseCapture(changed((x) => { x.cases = x.cases.filter((c: any) => c.case_id !== 'restart_ready') }))).toThrow(/missing case restart_ready/)
    expect(() => parseCapture(changed((x) => { x.schema_version = '3.0' }))).toThrow(/schema_version/)
    expect(() => parseCapture(changed((x) => { x.cases.find((c: any) => c.case_id === 'canonical_timed').response.applied = true }))).toThrow(/applied/)
    expect(() => parseCapture(changed((x) => { x.cases.find((c: any) => c.case_id === 'canonical_timed').response.crew_rest.intervals[0].starts_at = 'tomorrow' }))).toThrow(/timestamp/)
    expect(() => parseCapture(changed((x) => { x.cases.find((c: any) => c.case_id === 'canonical_timed').response.crew_rest.useful_worker_minutes = '120' }))).toThrow(/number/)
    expect(() => parseCapture(changed((x) => { x.cases.find((c: any) => c.case_id === 'canonical_timed').request.snapshot.workshop.staffing_demand.minimum = 'one' }))).toThrow(/number/)
    expect(() => parseCapture(changed((x) => { x.cases.find((c: any) => c.case_id === 'canonical_timed').response.crew_rest.timing_policy.max_work_minutes = 'fifteen' }))).toThrow(/number/)
  })

  it('supports deterministic simulated failure', async () => {
    await expect(loadCase('canonical_timed', { delayMs: 0, fail: true })).rejects.toThrow(/unavailable/)
  })

  it('isolates the authoritative capture from caller changes', async () => {
    const first = await loadCase('canonical_timed', { delayMs: 0 })
    first.response.crew_rest.useful_worker_minutes = 999
    first.request.snapshot.workshop.staffing_demand.maximum = 999
    const second = await loadCase('canonical_timed', { delayMs: 0 })
    expect(second.response.crew_rest.useful_worker_minutes).toBe(120)
    expect(second.request.snapshot.workshop.staffing_demand.maximum).toBe(4)
  })
})
