export type StateHandler<State extends string, Ctx> = {
  onEnter?: (ctx: Ctx, prev: State, now: number) => void
  onUpdate?: (ctx: Ctx, now: number, dt: number) => void
  onExit?: (ctx: Ctx, next: State, now: number) => void
}

export class StateMachine<State extends string, Ctx> {
  private current: State
  private enteredAt: number
  private handlers: Record<State, StateHandler<State, Ctx>>

  constructor(opts: { initial: State; now: number; handlers: Record<State, StateHandler<State, Ctx>> }) {
    this.current = opts.initial
    this.enteredAt = opts.now
    this.handlers = opts.handlers
  }

  getState() {
    return this.current
  }

  timeInState(now: number) {
    return Math.max(0, now - this.enteredAt)
  }

  is(state: State) {
    return this.current === state
  }

  transition(next: State, ctx: Ctx, now: number) {
    if (next === this.current) return
    const prev = this.current
    this.handlers[prev]?.onExit?.(ctx, next, now)
    this.current = next
    this.enteredAt = now
    this.handlers[next]?.onEnter?.(ctx, prev, now)
  }

  update(ctx: Ctx, now: number, dt: number) {
    this.handlers[this.current]?.onUpdate?.(ctx, now, dt)
  }
}

