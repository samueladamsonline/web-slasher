export class SceneDebugCoordinator {
  private buildDebug: () => Record<string, unknown>

  constructor(buildDebug: () => Record<string, unknown>) {
    this.buildDebug = buildDebug
  }

  refresh() {
    if (typeof window === 'undefined') return
    ;(window as any).__dbg = this.buildDebug()
  }

  clear() {
    if (typeof window === 'undefined') return
    try {
      delete (window as any).__dbg
    } catch {
      ;(window as any).__dbg = undefined
    }
  }
}
