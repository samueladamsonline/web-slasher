import * as Phaser from 'phaser'

export type ActionId = 'confirm' | 'newGame' | 'pause' | 'inventory' | 'map' | 'attack' | 'cast' | 'interact' | 'weapon1' | 'weapon2'

export class InputSystem {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private keys: Record<ActionId, Phaser.Input.Keyboard.Key>

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard
    if (!keyboard) throw new Error('Keyboard input missing')

    this.cursors = keyboard.createCursorKeys()
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
      attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      cast: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      weapon1: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      weapon2: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
    }
  }

  justPressed(action: ActionId) {
    return Phaser.Input.Keyboard.JustDown(this.keys[action])
  }

  getMoveAxes() {
    const left = !!this.cursors.left?.isDown || !!this.wasd.left?.isDown
    const right = !!this.cursors.right?.isDown || !!this.wasd.right?.isDown
    const up = !!this.cursors.up?.isDown || !!this.wasd.up?.isDown
    const down = !!this.cursors.down?.isDown || !!this.wasd.down?.isDown

    const vx = (right ? 1 : 0) - (left ? 1 : 0)
    const vy = (down ? 1 : 0) - (up ? 1 : 0)
    return { vx, vy }
  }
}
