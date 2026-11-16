import { describe, expect, it } from 'vitest'
import { ACTIONS, PERSONAS, applyAction, canAct, initialStory, nextHandoff, type ActionId } from './story'

describe('local walkthrough handoffs', () => {
  it('has ten distinct accounts and starts without recorded actions', () => {
    expect(PERSONAS).toHaveLength(10)
    expect(new Set(PERSONAS.map((person) => person.id)).size).toBe(10)
    expect(initialStory().events).toEqual([])
    expect(nextHandoff(initialStory())).toEqual({ actorId: 'P03', title: ACTIONS.issue.label })
  })

  it('rejects wrong role, out-of-order and repeated actions without mutation', () => {
    const initial = initialStory()
    expect(canAct(initial, 'C01', 'issue')).toBe(false)
    expect(canAct(initial, 'P02', 'review')).toBe(false)
    expect(() => applyAction(initial, 'C01', 'issue')).toThrow()
    expect(() => applyAction(initial, 'P02', 'review')).toThrow()
    const issued = applyAction(initial, 'P03', 'issue')
    expect(() => applyAction(issued, 'P03', 'issue')).toThrow()
    expect(initial.issued).toBe(false)
    expect(initial.events).toEqual([])
    expect(issued.events).toEqual([{ id: 'issue', actorId: 'P03', title: ACTIONS.issue.title }])
  })

  it('runs the full account-to-account story while keeping restart a review', () => {
    let state = initialStory()
    const steps: ActionId[] = [
      'issue', 'acknowledge', 'stop', 'checkin', 'recover', 'assign', 'report', 'remove', 'firstaid',
      'draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery', 'handover', 'costReview', 'fresh', 'permit', 'review',
    ]
    for (const id of steps) {
      const action = ACTIONS[id]
      expect(nextHandoff(state)).toEqual({ actorId: action.actorId, title: action.label })
      expect(canAct(state, action.actorId, id)).toBe(true)
      state = applyAction(state, action.actorId, id)
    }
    expect(state.events.map((event) => event.id)).toEqual(steps)
    expect(state.leila).toBe(false)
    expect(nextHandoff(state)).toEqual({ actorId: '', title: 'All handoffs recorded' })
    expect(ACTIONS.review.title).toContain('work remains stopped')
  })

  it('allows handover with restart and supplier decisions still open', () => {
    let state = initialStory()
    for (const id of ['issue', 'acknowledge', 'stop', 'checkin', 'recover', 'assign', 'report', 'remove', 'firstaid'] as ActionId[]) state = applyAction(state, ACTIONS[id].actorId, id)
    expect(canAct(state, 'P02', 'handover')).toBe(true)
    state = applyAction(state, 'P02', 'handover')
    expect(state.fresh).toBe(false)
    expect(state.permit).toBe(false)
    expect(state.reviewed).toBe(false)
    expect(state.deliveryAccepted).toBe(false)
    expect(canAct(state, 'P01', 'costReview')).toBe(true)
    expect(canAct(state, 'P02', 'review')).toBe(false)
  })

  it('uses plain site instructions in visible story text', () => {
    const visibleText = [
      ...PERSONAS.map((person) => person.description),
      ...Object.values(ACTIONS).flatMap((action) => [action.label, action.title]),
    ]
    expect(visibleText.join(' ')).not.toMatch(/\b(?:demo|synthetic|simulation|fictional|trench hold|hold open)\b/i)
  })

  it('offers optional Leila readiness only after removal and first aid', () => {
    let state = initialStory()
    for (const id of ['issue', 'acknowledge', 'stop', 'checkin', 'recover', 'assign', 'report', 'remove'] as ActionId[]) state = applyAction(state, ACTIONS[id].actorId, id)
    expect(canAct(state, 'C01', 'leila')).toBe(false)
    state = applyAction(state, 'P06', 'firstaid')
    expect(canAct(state, 'C01', 'leila')).toBe(true)
    state = applyAction(state, 'C01', 'leila')
    expect(state.leila).toBe(true)
    expect(state.events.at(-1)?.id).toBe('leila')
  })

  it('requires Noura’s approval between delivery draft and send', () => {
    let state = initialStory()
    for (const id of ['issue', 'acknowledge', 'stop', 'checkin', 'recover', 'assign', 'draftDelivery'] as ActionId[]) state = applyAction(state, ACTIONS[id].actorId, id)
    expect(canAct(state, 'P05', 'sendDelivery')).toBe(false)
    state = applyAction(state, 'P05', 'approveDelivery')
    expect(state.deliveryApproved).toBe(true)
    expect(canAct(state, 'P05', 'sendDelivery')).toBe(true)
  })
})
