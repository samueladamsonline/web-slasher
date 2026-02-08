import * as Phaser from 'phaser'
import { INTERACTABLES, type InteractableDefId, type InteractableKind } from '../content/interactables'
import type { ItemId } from '../content/items'
import { ITEMS } from '../content/items'
import { DEPTH_PROP } from '../game/constants'
import type { MapKey } from '../game/types'
import { getTiledNumber, getTiledString } from '../game/tiled'
import type { WorldState } from '../game/WorldState'
import type { InventorySystem } from './InventorySystem'
import type { DialogueUI } from '../ui/DialogueUI'
import type { InteractPromptUI } from '../ui/InteractPromptUI'

type Interactable = {
  mapKey: MapKey
  objectId: number
  kind: InteractableKind
  x: number
  y: number
  radius: number
  message?: string
  rewardItemId?: ItemId
  rewardAmount?: number
  toMap?: MapKey
  toSpawn?: string
  keyCost?: number
  display?: Phaser.GameObjects.GameObject
}

export class InteractionSystem {
  static preload(scene: Phaser.Scene) {
    const ensure = (key: string, draw: (g: Phaser.GameObjects.Graphics) => { w: number; h: number }) => {
      if (scene.textures.exists(key)) return
      const g = scene.add.graphics()
      const { w, h } = draw(g)
      g.generateTexture(key, w, h)
      g.destroy()
    }

    ensure('prop-sign', (g) => {
      const w = 48
      const h = 64
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(20, 18, 8, 40, 3)
      g.fillStyle(0xd9e3ee, 1)
      g.fillRoundedRect(8, 8, 32, 20, 4)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(8, 8, 32, 20, 4)
      g.strokeRoundedRect(20, 18, 8, 40, 3)
      g.lineStyle(2, 0x0a0d12, 0.25)
      g.beginPath()
      g.moveTo(14, 15)
      g.lineTo(34, 15)
      g.moveTo(14, 20)
      g.lineTo(30, 20)
      g.strokePath()
      return { w, h }
    })

    ensure('prop-chest-closed', (g) => {
      const w = 56
      const h = 40
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(6, 14, 44, 20, 5)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(6, 10, 44, 10, 5)
      g.fillStyle(0xd9e3ee, 1)
      g.fillRoundedRect(26, 18, 8, 10, 3)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(6, 10, 44, 24, 5)
      g.strokeRoundedRect(26, 18, 8, 10, 3)
      return { w, h }
    })

    ensure('prop-chest-open', (g) => {
      const w = 56
      const h = 40
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(6, 18, 44, 16, 5)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(6, 8, 44, 12, 5)
      g.fillStyle(0x101722, 1)
      g.fillRoundedRect(10, 20, 36, 10, 4)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(6, 18, 44, 16, 5)
      g.strokeRoundedRect(6, 8, 44, 12, 5)
      return { w, h }
    })

    ensure('prop-door-locked', (g) => {
      const w = 48
      const h = 64
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(10, 10, 28, 46, 6)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(12, 12, 24, 42, 6)
      g.fillStyle(0xd9e3ee, 1)
      g.fillCircle(30, 36, 3)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(10, 10, 28, 46, 6)
      g.strokeCircle(30, 36, 3)
      g.lineStyle(2, 0x0a0d12, 0.25)
      g.beginPath()
      g.moveTo(18, 22)
      g.lineTo(30, 22)
      g.moveTo(18, 30)
      g.lineTo(30, 30)
      g.strokePath()
      g.fillStyle(0xff4b5c, 0.9)
      g.fillCircle(16, 18, 5)
      g.lineStyle(2, 0x0a0d12, 0.35)
      g.strokeCircle(16, 18, 5)
      return { w, h }
    })
  }

  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private inventory: InventorySystem
  private world: WorldState
  private dialogue: DialogueUI
  private prompt: InteractPromptUI
  private onDialogueOpen?: () => void
  private onDialogueClose?: () => void

  private keyE: Phaser.Input.Keyboard.Key
  private interactables: Interactable[] = []
  private activeTarget: Interactable | null = null
  private requestWarp: ((toMap: MapKey, toSpawn: string) => void) | null = null

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    deps: { inventory: InventorySystem; world: WorldState; dialogue: DialogueUI; prompt: InteractPromptUI },
    opts?: { onDialogueOpen?: () => void; onDialogueClose?: () => void },
  ) {
    this.scene = scene
    this.player = player
    this.inventory = deps.inventory
    this.world = deps.world
    this.dialogue = deps.dialogue
    this.prompt = deps.prompt
    this.onDialogueOpen = opts?.onDialogueOpen
    this.onDialogueClose = opts?.onDialogueClose

    const keyboard = scene.input.keyboard
    if (!keyboard) throw new Error('Keyboard input missing')
    this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
  }

  destroy() {
    this.clear()
  }

  isDialogueOpen() {
    return this.dialogue.isOpen()
  }

  getDialogueText() {
    return this.dialogue.getText()
  }

  tryInteract() {
    if (this.dialogue.isOpen()) {
      this.closeDialogue()
      return
    }
    if (this.activeTarget) this.interact(this.activeTarget)
  }

  clear() {
    this.requestWarp = null
    this.activeTarget = null
    this.prompt.hide()
    this.interactables.forEach((i) => i.display?.destroy())
    this.interactables = []
    if (this.dialogue.isOpen()) this.closeDialogue()
  }

  install(mapKey: MapKey, objects: Phaser.Types.Tilemaps.TiledObject[], opts: { requestWarp: (toMap: MapKey, toSpawn: string) => void }) {
    this.clear()
    this.requestWarp = opts.requestWarp

    const out: Interactable[] = []

    for (const o of objects) {
      const defIdRaw = getTiledString(o.properties, 'defId')
      const defId = defIdRaw && defIdRaw in INTERACTABLES ? (defIdRaw as InteractableDefId) : null
      const def = defId ? INTERACTABLES[defId] : null

      const kindRaw = (def?.kind ?? o.type) as InteractableKind
      const kind: InteractableKind | null =
        kindRaw === 'sign' || kindRaw === 'npc' || kindRaw === 'chest' || kindRaw === 'lockedWarp' ? kindRaw : null
      if (!kind) continue

      const objectId = typeof o.id === 'number' ? o.id : null
      if (!objectId) continue

      const x0 = typeof o.x === 'number' ? o.x : null
      const y0 = typeof o.y === 'number' ? o.y : null
      if (!(typeof x0 === 'number' && typeof y0 === 'number')) continue

      const w = typeof o.width === 'number' ? o.width : 0
      const h = typeof o.height === 'number' ? o.height : 0
      const x = w > 0 ? x0 + w / 2 : x0
      const y = h > 0 ? y0 + h / 2 : y0

      const radiusRaw = getTiledNumber(o.properties, 'radius')
      const radius = typeof radiusRaw === 'number' ? Math.max(20, radiusRaw) : typeof def?.radius === 'number' ? Math.max(20, def.radius) : 78

      const base: Interactable = { mapKey, objectId, kind, x, y, radius }

      if (kind === 'sign' || kind === 'npc') {
        base.message = getTiledString(o.properties, 'message') ?? def?.message ?? '...'
      }

      if (kind === 'chest') {
        const rewardRaw = getTiledString(o.properties, 'itemId')
        const rewardItemId =
          rewardRaw && rewardRaw in ITEMS ? (rewardRaw as ItemId) : def?.reward?.itemId && def.reward.itemId in ITEMS ? def.reward.itemId : undefined
        base.rewardItemId = rewardItemId
        base.rewardAmount = Math.max(1, Math.floor(getTiledNumber(o.properties, 'amount') ?? def?.reward?.amount ?? 1))
      }

      if (kind === 'lockedWarp') {
        const toMap = getTiledString(o.properties, 'toMap')
        const toSpawn = getTiledString(o.properties, 'toSpawn')
        const defToMap = def?.lockedWarp?.toMap
        const defToSpawn = def?.lockedWarp?.toSpawn
        const defKeyCost = def?.lockedWarp?.keyCost

        const finalToMap = (toMap === 'overworld' || toMap === 'cave' ? toMap : undefined) ?? defToMap
        base.toMap = finalToMap
        base.toSpawn = toSpawn ?? defToSpawn ?? 'player_spawn'
        base.keyCost = Math.max(0, Math.floor(getTiledNumber(o.properties, 'keyCost') ?? defKeyCost ?? 1))
      }

      // Visuals
      if (kind === 'sign') {
        base.display = this.scene.add.image(x, y, 'prop-sign').setOrigin(0.5, 1).setDepth(DEPTH_PROP)
      }
      if (kind === 'chest') {
        const open = this.world.isChestOpened(mapKey, objectId)
        base.display = this.scene.add
          .image(x, y, open ? 'prop-chest-open' : 'prop-chest-closed')
          .setOrigin(0.5, 1)
          .setDepth(DEPTH_PROP)
      }
      if (kind === 'lockedWarp') {
        base.display = this.scene.add.image(x, y, 'prop-door-locked').setOrigin(0.5, 1).setDepth(DEPTH_PROP)
      }
      if (kind === 'npc') {
        // TODO: swap for a real NPC sprite once we adopt a character pack.
        base.display = this.scene.add.rectangle(x, y - 22, 32, 44, 0x1f2a3a, 0.92).setStrokeStyle(2, 0xffffff, 0.22).setDepth(DEPTH_PROP)
      }

      out.push(base)
    }

    this.interactables = out
  }

  update() {
    if (this.dialogue.isOpen()) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.closeDialogue()
      return
    }

    const target = this.pickTarget()
    this.activeTarget = target

    if (target) this.prompt.showAt(target.x, target.y - 76)
    else this.prompt.hide()

    if (target && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.interact(target)
    }
  }

  private pickTarget() {
    let best: Interactable | null = null
    let bestD = Number.POSITIVE_INFINITY

    for (const i of this.interactables) {
      const dx = i.x - this.player.x
      const dy = i.y - this.player.y
      const d = dx * dx + dy * dy
      if (d > i.radius * i.radius) continue
      if (d < bestD) {
        bestD = d
        best = i
      }
    }

    return best
  }

  private interact(i: Interactable) {
    if (i.kind === 'sign' || i.kind === 'npc') {
      this.openDialogue(i.message ?? '...')
      return
    }

    if (i.kind === 'chest') {
      const opened = this.world.isChestOpened(i.mapKey, i.objectId)
      if (opened) {
        this.openDialogue('The chest is empty.')
        return
      }

      this.world.markChestOpened(i.mapKey, i.objectId)
      if (i.display && i.display instanceof Phaser.GameObjects.Image) i.display.setTexture('prop-chest-open')

      if (!i.rewardItemId) {
        this.openDialogue('You found... nothing?')
        return
      }

      this.inventory.addItem(i.rewardItemId, i.rewardAmount ?? 1)
      const def = ITEMS[i.rewardItemId]
      const amt = Math.max(1, Math.floor(i.rewardAmount ?? 1))
      const label = def.stackable && amt > 1 ? `${amt} ${def.name}s` : def.name
      this.openDialogue(`You found a ${label}.`)
      return
    }

    if (i.kind === 'lockedWarp') {
      if (!i.toMap) {
        this.openDialogue('This door leads nowhere.')
        return
      }

      const keyCost = Math.max(0, Math.floor(i.keyCost ?? 1))
      if (keyCost > 0) {
        if (!this.inventory.tryConsumeKey(keyCost)) {
          this.openDialogue(keyCost === 1 ? 'Locked. You need a key.' : `Locked. You need ${keyCost} keys.`)
          return
        }
      }

      // Warp immediately; no dialogue so we don't leave the world paused.
      this.requestWarp?.(i.toMap, i.toSpawn ?? 'player_spawn')
      return
    }
  }

  private openDialogue(text: string) {
    this.dialogue.show(text)
    this.prompt.hide()
    this.onDialogueOpen?.()
  }

  private closeDialogue() {
    this.dialogue.hide()
    this.onDialogueClose?.()
  }
}
