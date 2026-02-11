import { describe, expect, it } from 'vitest'
import { resolveBatTransition } from '../src/systems/enemyAI/batTransitions'
import { canStartAttack, createAttackState, startAttack, updateAttack, computeStrikeCenter } from '../src/systems/enemyAI/attackModel'

const attackConfigEnemy = {
  getAttackConfig: () => ({
    damage: 1,
    knockback: 100,
    cooldownMs: 500,
    windupMs: 100,
    activeMs: 80,
    recoveryMs: 120,
    hitbox: { offset: 10, radius: 8 },
  }),
} as any

describe('EnemyAISystem bat transitions', () => {
  it('enters chase from hover when aggro conditions are met', () => {
    const out = resolveBatTransition({
      mode: 'hover',
      now: 1000,
      distToPlayer: 80,
      aggroRadius: 100,
      shouldLeash: false,
      playerWithinLeashTerritory: true,
      aggroCooldownUntil: 900,
      returningFromLeash: false,
    })
    expect(out.nextMode).toBe('chase')
  })

  it('deaggros from chase into return and starts cooldown', () => {
    const out = resolveBatTransition({
      mode: 'chase',
      now: 2000,
      distToPlayer: 130,
      aggroRadius: 100,
      shouldLeash: false,
      playerWithinLeashTerritory: true,
      aggroCooldownUntil: 0,
      returningFromLeash: false,
    })
    expect(out.nextMode).toBe('return')
    expect(out.aggroCooldownUntil).toBe(3000)
  })

  it('does not re-aggro during cooldown but re-aggros after cooldown', () => {
    const duringCooldown = resolveBatTransition({
      mode: 'return',
      now: 2500,
      distToPlayer: 70,
      aggroRadius: 100,
      shouldLeash: false,
      playerWithinLeashTerritory: true,
      aggroCooldownUntil: 3000,
      returningFromLeash: false,
    })
    expect(duringCooldown.nextMode).toBe('return')

    const afterCooldown = resolveBatTransition({
      mode: 'return',
      now: 3001,
      distToPlayer: 70,
      aggroRadius: 100,
      shouldLeash: false,
      playerWithinLeashTerritory: true,
      aggroCooldownUntil: 3000,
      returningFromLeash: false,
    })
    expect(afterCooldown.nextMode).toBe('chase')
  })
})

describe('EnemyAISystem attack model', () => {
  it('runs windup -> active -> recovery -> ready with cooldown gating', () => {
    const state = createAttackState()
    expect(canStartAttack(attackConfigEnemy, state, 0)).toBe(true)

    startAttack(attackConfigEnemy, state, 0, { x: 3, y: 0 })
    expect(state.phase).toBe('windup')

    const noStrikeYet = updateAttack(attackConfigEnemy, state, 50)
    expect(noStrikeYet.shouldStrike).toBe(false)

    const strike = updateAttack(attackConfigEnemy, state, 100)
    expect(state.phase).toBe('active')
    expect(strike.shouldStrike).toBe(true)

    updateAttack(attackConfigEnemy, state, 180)
    expect(state.phase).toBe('recovery')

    updateAttack(attackConfigEnemy, state, 300)
    expect(state.phase).toBe('ready')
    expect(canStartAttack(attackConfigEnemy, state, 700)).toBe(false)
    expect(canStartAttack(attackConfigEnemy, state, 801)).toBe(true)
  })

  it('computes strike center from normalized aim and offset', () => {
    const c = computeStrikeCenter(100, 100, 20, { x: 10, y: 0 })
    expect(c).toEqual({ x: 120, y: 100 })
  })
})
