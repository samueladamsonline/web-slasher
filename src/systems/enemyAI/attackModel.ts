import type { Enemy } from '../../entities/Enemy'

export type AttackPhase = 'ready' | 'windup' | 'active' | 'recovery'

export type AttackVector = { x: number; y: number }

export type AttackState = {
  phase: AttackPhase
  phaseUntil: number
  cooldownUntil: number
  didStrike: boolean
  aim: AttackVector
}

export type AttackTickResult = {
  phaseChanged: boolean
  shouldStrike: boolean
}

function normalizeCardinal(vec: AttackVector): AttackVector {
  const x = typeof vec.x === 'number' && Number.isFinite(vec.x) ? vec.x : 0
  const y = typeof vec.y === 'number' && Number.isFinite(vec.y) ? vec.y : 0
  if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) return { x: 1, y: 0 }
  const len = Math.hypot(x, y) || 1
  return { x: x / len, y: y / len }
}

export function createAttackState(): AttackState {
  return {
    phase: 'ready',
    phaseUntil: 0,
    cooldownUntil: 0,
    didStrike: false,
    aim: { x: 1, y: 0 },
  }
}

export function isAttackLocked(state: AttackState) {
  return state.phase !== 'ready'
}

export function canStartAttack(enemy: Enemy, state: AttackState, now: number) {
  const atk = enemy.getAttackConfig()
  if (!atk) return false
  if (isAttackLocked(state)) return false
  return now >= state.cooldownUntil
}

export function startAttack(enemy: Enemy, state: AttackState, now: number, aim: AttackVector) {
  const atk = enemy.getAttackConfig()
  state.phase = 'windup'
  state.phaseUntil = now + Math.max(0, Math.floor(atk.windupMs))
  state.didStrike = false
  state.aim = normalizeCardinal(aim)
}

export function updateAttack(enemy: Enemy, state: AttackState, now: number): AttackTickResult {
  const atk = enemy.getAttackConfig()
  if (!atk) return { phaseChanged: false, shouldStrike: false }
  if (state.phase === 'ready') return { phaseChanged: false, shouldStrike: false }
  if (now < state.phaseUntil) return { phaseChanged: false, shouldStrike: false }

  if (state.phase === 'windup') {
    state.phase = 'active'
    state.phaseUntil = now + Math.max(0, Math.floor(atk.activeMs))
    const shouldStrike = !state.didStrike
    state.didStrike = true
    return { phaseChanged: true, shouldStrike }
  }

  if (state.phase === 'active') {
    state.phase = 'recovery'
    state.phaseUntil = now + Math.max(0, Math.floor(atk.recoveryMs))
    return { phaseChanged: true, shouldStrike: false }
  }

  state.phase = 'ready'
  state.phaseUntil = 0
  state.didStrike = false
  state.cooldownUntil = now + Math.max(0, Math.floor(atk.cooldownMs))
  return { phaseChanged: true, shouldStrike: false }
}

export function computeStrikeCenter(enemyX: number, enemyY: number, offset: number, aim: AttackVector) {
  const dir = normalizeCardinal(aim)
  return { x: enemyX + dir.x * offset, y: enemyY + dir.y * offset }
}
