import * as Phaser from 'phaser'

export type ActionId =
  | 'confirm'
  | 'newGame'
  | 'pause'
  | 'inventory'
  | 'map'
  | 'spellbook'
  | 'attack'
  | 'interact'
  | 'spell1'
  | 'spell2'
  | 'spell3'
  | 'spell4'
  | 'spell5'

export class InputSystem {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private keys: Record<ActionId, Phaser.Input.Keyboard.Key>

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard
    if (!keyboard) throw new Error('Keyboard input missing')

    this.cursors = keyboard.createCursorKeys()
    // Prevent page scrolling while using arrow keys for spells.
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
    ])
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }

    this.keys = {
      confirm: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      newGame: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N),
      pause: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      inventory: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      map: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      spellbook: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      spell1: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      spell2: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      spell3: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      spell4: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      spell5: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
    }
  }

  justPressed(action: ActionId) {
    return Phaser.Input.Keyboard.JustDown(this.keys[action])
  }

  getMoveAxes() {
    // Movement uses WASD; arrow keys are reserved for spell casting (twin-stick-ish keyboard controls).
    const left = !!this.wasd.left?.isDown
    const right = !!this.wasd.right?.isDown
    const up = !!this.wasd.up?.isDown
    const down = !!this.wasd.down?.isDown

    const vx = (right ? 1 : 0) - (left ? 1 : 0)
    const vy = (down ? 1 : 0) - (up ? 1 : 0)
    return { vx, vy }
  }

  getCastDir() {
    const candidates: { key: Phaser.Input.Keyboard.Key | undefined; dir: { x: number; y: number } }[] = [
      { key: this.cursors.left, dir: { x: -1, y: 0 } },
      { key: this.cursors.right, dir: { x: 1, y: 0 } },
      { key: this.cursors.up, dir: { x: 0, y: -1 } },
      { key: this.cursors.down, dir: { x: 0, y: 1 } },
    ]
    const down = candidates
      .filter((c) => !!c.key?.isDown)
      .sort((a, b) => (Number(b.key?.timeDown ?? 0) || 0) - (Number(a.key?.timeDown ?? 0) || 0))
    return down[0]?.dir ?? null
  }
}
