export type StatusEffectKind = 'slow'

export type SlowEffect = {
  kind: 'slow'
  // Movement speed multiplier (0..1). For example 0.5 means 50% slower.
  moveSpeedMul: number
  durationMs: number
}

// Expand this union as new effects are implemented (stun, burn, etc.).
export type StatusEffect = SlowEffect

type ActiveEffect = { effect: StatusEffect; until: number }

function clamp01(v: unknown, def = 1) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def
  return Math.max(0, Math.min(1, n))
}

function clampMs(v: unknown, def = 0) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def
  return Math.max(0, n)
}

export class StatusEffects {
  private active: ActiveEffect[] = []

  apply(now: number, effect: StatusEffect) {
    if (!effect || typeof effect !== 'object') return false

    if (effect.kind === 'slow') {
      const mul = clamp01(effect.moveSpeedMul, 1)
      const dur = clampMs(effect.durationMs, 0)
      if (dur <= 0) return false
      if (mul >= 0.9999) return false

      const until = now + dur
      this.active.push({ effect: { kind: 'slow', moveSpeedMul: mul, durationMs: dur }, until })
      this.prune(now)
      // Keep this bounded; if lots of effects are applied, keep the most-recent ones.
      if (this.active.length > 12) this.active = this.active.slice(-8)
      return true
    }

    return false
  }

  has(kind: StatusEffectKind, now: number) {
    this.prune(now)
    return this.active.some((a) => a.effect.kind === kind)
  }

  getMoveSpeedMul(now: number) {
    this.prune(now)
    let mul = 1
    for (const a of this.active) {
      if (a.effect.kind === 'slow') mul = Math.min(mul, a.effect.moveSpeedMul)
    }
    return mul
  }

  listKinds(now: number): StatusEffectKind[] {
    this.prune(now)
    const kinds = new Set<StatusEffectKind>()
    for (const a of this.active) kinds.add(a.effect.kind)
    return Array.from(kinds)
  }

  private prune(now: number) {
    if (this.active.length === 0) return
    this.active = this.active.filter((a) => a.until > now)
  }
}

