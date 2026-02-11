export type BatMode = 'hover' | 'chase' | 'return' | 'hitstun'

export type BatTransitionInput = {
  mode: BatMode
  now: number
  distToPlayer: number
  aggroRadius: number
  shouldLeash: boolean
  playerWithinLeashTerritory: boolean
  aggroCooldownUntil: number
  returningFromLeash: boolean
}

export type BatTransitionDecision = {
  nextMode: BatMode
  returningFromLeash: boolean
  aggroCooldownUntil: number
}

const DEAGGRO_HYSTERESIS = 1.15
const AGGRO_COOLDOWN_MS = 1000

export function resolveBatTransition(input: BatTransitionInput): BatTransitionDecision {
  const next: BatTransitionDecision = {
    nextMode: input.mode,
    returningFromLeash: input.returningFromLeash,
    aggroCooldownUntil: input.aggroCooldownUntil,
  }

  if (input.shouldLeash) {
    next.nextMode = 'return'
    next.returningFromLeash = true
    return next
  }

  const canAggro = input.playerWithinLeashTerritory && input.now >= input.aggroCooldownUntil
  const inAggro = input.distToPlayer < input.aggroRadius

  if (input.mode === 'hover') {
    if (canAggro && inAggro) next.nextMode = 'chase'
    return next
  }

  if (input.mode === 'chase') {
    if (input.distToPlayer > input.aggroRadius * DEAGGRO_HYSTERESIS) {
      next.nextMode = 'return'
      next.returningFromLeash = false
      next.aggroCooldownUntil = Math.max(input.aggroCooldownUntil, input.now + AGGRO_COOLDOWN_MS)
    }
    return next
  }

  if (input.mode === 'return') {
    if (!input.returningFromLeash && canAggro && inAggro) next.nextMode = 'chase'
    return next
  }

  // Hitstun falls back to chase/return based on aggro gating.
  if (canAggro && inAggro) next.nextMode = 'chase'
  else next.nextMode = 'return'
  return next
}
