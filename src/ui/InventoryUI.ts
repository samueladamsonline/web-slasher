import * as Phaser from 'phaser'
import { ITEMS, type EquipmentSlot, type ItemId } from '../content/items'
import { SPELLS } from '../content/spells'
import { WEAPONS } from '../content/weapons'
import { DEPTH_UI } from '../game/constants'
import type { InventoryItemStack, InventorySystem, SlotRef } from '../systems/InventorySystem'

type SlotView = {
  ref: SlotRef
  bg: Phaser.GameObjects.Rectangle
  icon: Phaser.GameObjects.Image
  qty: Phaser.GameObjects.Text
  label?: Phaser.GameObjects.Text
}

function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && v in ITEMS
}

function slotLabel(slot: EquipmentSlot) {
  if (slot === 'helmet') return 'Helmet'
  if (slot === 'chest') return 'Chest'
  if (slot === 'gloves') return 'Gloves'
  if (slot === 'boots') return 'Boots'
  if (slot === 'weapon') return 'Weapon'
  if (slot === 'shield') return 'Shield'
  return 'Equipment'
}

export class InventoryUI {
  static preload(scene: Phaser.Scene) {
    const ensure = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, size = 32) => {
      if (scene.textures.exists(key)) return
      const g = scene.add.graphics()
      draw(g)
      g.generateTexture(key, size, size)
      g.destroy()
    }

    // Simple item icons (placeholder art, consistent style with other UI textures).
    ensure('item-helmet', (g) => {
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(6, 9, 20, 15, 6)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(7, 10, 18, 13, 6)
      g.fillStyle(0xd9e3ee, 0.9)
      g.fillCircle(12, 16, 2)
      g.fillCircle(20, 16, 2)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(6, 9, 20, 15, 6)
    })

    ensure('item-helmet-fire', (g) => {
      // Helmet with a warm "ember" gem to read as a spell-granting hood.
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(6, 9, 20, 15, 6)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(7, 10, 18, 13, 6)
      g.fillStyle(0xff6b3d, 0.95)
      g.fillCircle(16, 15, 3)
      g.fillStyle(0xffd96b, 0.65)
      g.fillCircle(15, 14, 1.5)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(6, 9, 20, 15, 6)
    })

    ensure('item-chest', (g) => {
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(7, 7, 18, 20, 5)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(8, 8, 16, 18, 5)
      g.fillStyle(0xd9e3ee, 0.85)
      g.fillRoundedRect(14, 9, 4, 16, 2)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(7, 7, 18, 20, 5)
    })

    ensure('item-chest-hearty', (g) => {
      // Same base silhouette, with a "heart" strap to read as max-HP gear.
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(7, 7, 18, 20, 5)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(8, 8, 16, 18, 5)
      g.fillStyle(0xff4b5c, 0.95)
      g.fillRoundedRect(11, 11, 10, 4, 2)
      g.fillStyle(0xffc0c7, 0.55)
      g.fillCircle(13, 12, 1.8)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(7, 7, 18, 20, 5)
      g.lineStyle(2, 0x0a0d12, 0.35)
      g.strokeRoundedRect(11, 11, 10, 4, 2)
    })

    ensure('item-gloves', (g) => {
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(7, 14, 8, 10, 4)
      g.fillRoundedRect(17, 14, 8, 10, 4)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(8, 17, 6, 5, 3)
      g.fillRoundedRect(18, 17, 6, 5, 3)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(7, 14, 8, 10, 4)
      g.strokeRoundedRect(17, 14, 8, 10, 4)
    })

    ensure('item-gloves-quick', (g) => {
      // Slightly brighter gloves with a small "speed" stripe.
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(7, 14, 8, 10, 4)
      g.fillRoundedRect(17, 14, 8, 10, 4)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(8, 17, 6, 5, 3)
      g.fillRoundedRect(18, 17, 6, 5, 3)
      g.fillStyle(0xffd96b, 0.9)
      g.fillRoundedRect(9, 15, 4, 2, 1)
      g.fillRoundedRect(19, 15, 4, 2, 1)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(7, 14, 8, 10, 4)
      g.strokeRoundedRect(17, 14, 8, 10, 4)
    })

    ensure('item-gloves-frost', (g) => {
      // Gloves with a cool "ice" highlight.
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(7, 14, 8, 10, 4)
      g.fillRoundedRect(17, 14, 8, 10, 4)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(8, 17, 6, 5, 3)
      g.fillRoundedRect(18, 17, 6, 5, 3)
      g.fillStyle(0x76fff8, 0.7)
      g.fillRoundedRect(9, 15, 4, 2, 1)
      g.fillRoundedRect(19, 15, 4, 2, 1)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(7, 14, 8, 10, 4)
      g.strokeRoundedRect(17, 14, 8, 10, 4)
    })

    ensure('item-boots', (g) => {
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(8, 11, 7, 14, 3)
      g.fillRoundedRect(17, 11, 7, 14, 3)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(7, 22, 10, 4, 2)
      g.fillRoundedRect(16, 22, 10, 4, 2)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(8, 11, 7, 14, 3)
      g.strokeRoundedRect(17, 11, 7, 14, 3)
      g.strokeRoundedRect(7, 22, 10, 4, 2)
      g.strokeRoundedRect(16, 22, 10, 4, 2)
    })

    ensure('item-boots-swift', (g) => {
      // Boots with a cool "wind" highlight.
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(8, 11, 7, 14, 3)
      g.fillRoundedRect(17, 11, 7, 14, 3)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(7, 22, 10, 4, 2)
      g.fillRoundedRect(16, 22, 10, 4, 2)
      g.fillStyle(0x76fff8, 0.55)
      g.fillRoundedRect(9, 13, 4, 2, 1)
      g.fillRoundedRect(18, 13, 4, 2, 1)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(8, 11, 7, 14, 3)
      g.strokeRoundedRect(17, 11, 7, 14, 3)
      g.strokeRoundedRect(7, 22, 10, 4, 2)
      g.strokeRoundedRect(16, 22, 10, 4, 2)
    })

    ensure('item-shield', (g) => {
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(10, 6, 12, 20, 6)
      g.fillStyle(0x6b4c2a, 1)
      g.fillRoundedRect(11, 7, 10, 18, 6)
      g.fillStyle(0xd9e3ee, 0.85)
      g.fillRoundedRect(15, 10, 2, 12, 1)
      g.fillRoundedRect(13, 15, 6, 2, 1)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(10, 6, 12, 20, 6)
    })

    ensure('item-sword', (g) => {
      g.fillStyle(0x1b1b1b, 0.8)
      g.fillRoundedRect(9, 20, 6, 7, 3)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(6, 22, 12, 4, 2)
      g.fillStyle(0xd9e3ee, 1)
      g.fillRoundedRect(15, 8, 12, 4, 2)
      g.fillTriangle(27, 8, 30, 10, 27, 12)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(15, 8, 12, 4, 2)
      g.strokeTriangle(27, 8, 30, 10, 27, 12)
    })

    ensure('item-greatsword', (g) => {
      g.fillStyle(0x1b1b1b, 0.8)
      g.fillRoundedRect(9, 19, 7, 9, 4)
      g.fillStyle(0x3b2a1a, 1)
      g.fillRoundedRect(5, 22, 15, 4, 2)
      g.fillStyle(0xd9e3ee, 1)
      g.fillRoundedRect(15, 7, 13, 5, 2)
      g.fillTriangle(28, 7, 31, 10, 28, 12)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeRoundedRect(15, 7, 13, 5, 2)
      g.strokeTriangle(28, 7, 31, 10, 28, 12)
    })
  }

  private scene: Phaser.Scene
  private inventory: InventorySystem

  private container: Phaser.GameObjects.Container
  private dim: Phaser.GameObjects.Rectangle
  private frame: Phaser.GameObjects.Rectangle
  private panel: Phaser.GameObjects.Rectangle
  private equipHeader: Phaser.GameObjects.Text
  private bagHeader: Phaser.GameObjects.Text
  private detailsHeader: Phaser.GameObjects.Text
  private bagPanel: Phaser.GameObjects.Rectangle
  private detailsPanel: Phaser.GameObjects.Rectangle
  private bagHover: Phaser.GameObjects.Rectangle
  private title: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text
  private coinsKeys: Phaser.GameObjects.Text
  private hoverText: Phaser.GameObjects.Text
  private detailsIcon: Phaser.GameObjects.Image
  private detailsTitle: Phaser.GameObjects.Text
  private detailsBody: Phaser.GameObjects.Text

  private equipSlots: Record<EquipmentSlot, SlotView>
  private bagSlots: SlotView[] = []

  private hovered: SlotRef | null = null
  private bagGrid: { left: number; top: number; slot: number; gap: number; cols: number; rows: number } | null = null
  private detailsRegion: { left: number; top: number; w: number; h: number } | null = null
  private dragging:
    | {
        from: SlotRef
        stack: InventoryItemStack
        icon: Phaser.GameObjects.Image
        qty: Phaser.GameObjects.Text
      }
    | null = null
  private shieldDisabled = false
  private inputEnabled = false

  constructor(scene: Phaser.Scene, inventory: InventorySystem) {
    this.scene = scene
    this.inventory = inventory

    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.58).setOrigin(0, 0)
    // Diablo-2-ish palette: brass frame, dark stone inner panel.
    this.frame = scene.add.rectangle(0, 0, 10, 10, 0x5a4522, 0.98).setOrigin(0.5, 0.5)
    this.frame.setStrokeStyle(4, 0xf3e2b0, 0.08)
    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x171a1f, 0.98).setOrigin(0.5, 0.5)
    this.panel.setStrokeStyle(2, 0xe0c68a, 0.18)

    this.equipHeader = scene.add
      .text(0, 0, 'EQUIPPED', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#e0c68a',
      })
      .setOrigin(0, 0.5)

    this.bagHeader = scene.add
      .text(0, 0, 'STASH', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#e0c68a',
      })
      .setOrigin(0, 0.5)

    this.detailsHeader = scene.add
      .text(0, 0, 'DETAILS', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#e0c68a',
      })
      .setOrigin(0, 0.5)
      .setVisible(false)

    this.bagPanel = scene.add.rectangle(0, 0, 10, 10, 0x0b111a, 0.68).setOrigin(0.5, 0.5)
    this.bagPanel.setStrokeStyle(2, 0xe0c68a, 0.22)

    this.detailsPanel = scene.add.rectangle(0, 0, 10, 10, 0x0b111a, 0.68).setOrigin(0.5, 0.5)
    this.detailsPanel.setStrokeStyle(2, 0xe0c68a, 0.22)
    this.detailsPanel.setVisible(false)

    this.bagHover = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0.5, 0.5)
    this.bagHover.setStrokeStyle(2, 0xf3e2b0, 0.38)
    this.bagHover.setVisible(false)

    this.title = scene.add
      .text(0, 0, 'INVENTORY', {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        color: '#f1e6c8',
      })
      .setOrigin(0.5, 0.5)

    this.hint = scene.add
      .text(0, 0, 'I or ESC: Close    Drag items to equip/unequip', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#d7d3c8',
      })
      .setOrigin(0.5, 0.5)

    this.coinsKeys = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#e0c68a',
      })
      .setOrigin(0, 0.5)

    this.hoverText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#f4f2ec',
      })
      .setOrigin(0, 0.5)

    this.detailsIcon = scene.add.image(0, 0, 'item-coin').setOrigin(0.5, 0.5)
    this.detailsIcon.setVisible(false)

    this.detailsTitle = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#f1e6c8',
        wordWrap: { width: 260, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setVisible(false)

    this.detailsBody = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#d7d3c8',
        wordWrap: { width: 260, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setOrigin(0, 0)
      .setVisible(false)

    const makeSlot = (ref: SlotRef, style: 'equip' | 'bag', labelText?: string) => {
      const isEquip = style === 'equip'
      const bg = scene.add.rectangle(0, 0, 10, 10, 0x0b111a, isEquip ? 0.88 : 0).setOrigin(0.5, 0.5)
      if (isEquip) {
        bg.setStrokeStyle(3, 0xe0c68a, 0.28)
      } else {
        // Bag cells are rendered inside one big rectangle (Diablo-2-ish).
        // These per-cell rects still exist for layout, but they are not interactive and not visible.
        bg.setVisible(false)
      }

      const icon = scene.add.image(0, 0, 'item-coin').setOrigin(0.5, 0.5)
      icon.setVisible(false)

      const qty = scene.add
        .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f4f2ec' })
        .setOrigin(1, 1)
      qty.setVisible(false)

      let label: Phaser.GameObjects.Text | undefined
      if (isEquip && labelText) {
        label = scene.add
          .text(0, 0, labelText, {
            fontFamily: 'Georgia, serif',
            fontSize: '10px',
            color: '#e0c68a',
          })
          .setOrigin(0, 0)
          .setAlpha(0.7)
      }

      const view: SlotView = { ref, bg, icon, qty, label }
      return view
    }

    this.equipSlots = {
      helmet: makeSlot({ type: 'equip', slot: 'helmet' }, 'equip', 'HELM'),
      chest: makeSlot({ type: 'equip', slot: 'chest' }, 'equip', 'CHEST'),
      gloves: makeSlot({ type: 'equip', slot: 'gloves' }, 'equip', 'GLOVES'),
      boots: makeSlot({ type: 'equip', slot: 'boots' }, 'equip', 'BOOTS'),
      weapon: makeSlot({ type: 'equip', slot: 'weapon' }, 'equip', 'WEAPON'),
      shield: makeSlot({ type: 'equip', slot: 'shield' }, 'equip', 'SHIELD'),
    }

    for (let i = 0; i < this.inventory.getBagSize(); i++) {
      this.bagSlots.push(makeSlot({ type: 'bag', index: i }, 'bag'))
    }

    const equipViews = Object.values(this.equipSlots)
    this.container = scene.add.container(0, 0, [
      this.dim,
      this.frame,
      this.panel,
      this.title,
      this.equipHeader,
      this.bagHeader,
      this.bagPanel,
      this.bagHover,
      this.hoverText,
      this.hint,
      this.coinsKeys,
      this.detailsPanel,
      this.detailsHeader,
      this.detailsIcon,
      this.detailsTitle,
      this.detailsBody,
      ...equipViews.flatMap((v) => (v.label ? [v.bg, v.label, v.icon, v.qty] : [v.bg, v.icon, v.qty])),
      ...this.bagSlots.flatMap((v) => [v.bg, v.icon, v.qty]),
    ])
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)
    this.container.setVisible(false)

    scene.scale.on('resize', this.layout, this)
    scene.input.on('pointerdown', this.onPointerDown, this)
    scene.input.on('pointermove', this.onPointerMove, this)
    scene.input.on('pointerup', this.onPointerUp, this)

    this.layout()
    this.refresh()
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.scene.input.off('pointerdown', this.onPointerDown, this)
    this.scene.input.off('pointermove', this.onPointerMove, this)
    this.scene.input.off('pointerup', this.onPointerUp, this)
    this.container.destroy(true)
    this.clearDrag()
  }

  isVisible() {
    return this.container.visible
  }

  show() {
    this.container.setVisible(true)
    this.layout()
    this.enableInput(true)
    this.setHovered(null)
    this.refresh()
  }

  hide() {
    this.container.setVisible(false)
    this.enableInput(false)
    this.setHovered(null)
    this.bagHover.setVisible(false)
    this.hoverText.setVisible(false)
    this.clearDrag()
  }

  refresh() {
    const coins = this.inventory.getCoins()
    const keys = this.inventory.getKeys()
    this.coinsKeys.setText(`Coins: ${coins}    Keys: ${keys}`)

    for (const [slot, view] of Object.entries(this.equipSlots) as [EquipmentSlot, SlotView][]) {
      const id = this.inventory.getEquipment(slot)
      this.setSlotStack(view, id ? { id, qty: 1 } : null)
    }

    const bag = this.inventory.getBag()
    for (let i = 0; i < this.bagSlots.length; i++) {
      const view = this.bagSlots[i]
      const stack = bag[i]
      this.setSlotStack(view, stack)
    }

    this.updateShieldDisabled()
    this.updateHoverUI()
  }

  private setSlotStack(view: SlotView, stack: InventoryItemStack | null) {
    if (!stack) {
      view.icon.setVisible(false)
      view.qty.setVisible(false)
      if (view.label) view.label.setAlpha(0.75)
      if (view.ref.type === 'equip') view.bg.setStrokeStyle(3, 0xe0c68a, 0.22)
      return
    }

    const def = ITEMS[stack.id]
    view.icon.setTexture(def.texture)
    view.icon.setVisible(true)
    if (view.label) view.label.setAlpha(0.35)

    // Scale based on the current slot size (layout sets bg size).
    const base = 32
    const slotW = typeof view.bg.width === 'number' && view.bg.width > 0 ? view.bg.width : 52
    const factor = view.ref.type === 'equip' ? 0.8 : 0.72
    const scale = Math.max(0.7, Math.min(2.2, (slotW * factor) / base))
    view.icon.setScale(scale)

    // Backpack items do not stack (qty is always 1). Keep the label for future.
    view.qty.setVisible(false)

    if (view.ref.type === 'equip') view.bg.setStrokeStyle(3, 0xe0c68a, 0.34)
  }

  private onSlotDown(ref: SlotRef) {
    if (!this.container.visible) return
    if (!this.inputEnabled) return
    if (this.dragging) return

    const stack = ref.type === 'bag' ? this.inventory.getBagItem(ref.index) : (() => {
      const id = this.inventory.getEquipment(ref.slot)
      return id ? ({ id, qty: 1 } satisfies InventoryItemStack) : null
    })()

    if (!stack) return

    const def = ITEMS[stack.id]
    const icon = this.scene.add.image(0, 0, def.texture).setOrigin(0.5, 0.5)
    icon.setScrollFactor(0)
    icon.setDepth(DEPTH_UI + 5)
    icon.setScale(1.55)

    const qty = this.scene.add
      .text(0, 0, def.stackable && stack.qty > 1 ? String(stack.qty) : '', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f4f2ec' })
      .setOrigin(1, 1)
    qty.setScrollFactor(0)
    qty.setDepth(DEPTH_UI + 6)
    qty.setVisible(def.stackable && stack.qty > 1)

    // Fade the origin slot while dragging.
    const originView = this.getView(ref)
    if (originView) originView.icon.setAlpha(0.35)

    this.dragging = { from: ref, stack, icon, qty }
    this.onPointerMove(this.scene.input.activePointer)
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.container.visible) return
    if (!this.inputEnabled) return
    if (this.dragging) return
    const ref = this.getDropTargetAt(pointer.x, pointer.y)
    if (!ref) return
    this.onSlotDown(ref)
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    const x = pointer.x
    const y = pointer.y
    if (this.dragging) {
      this.dragging.icon.setPosition(x, y)
      this.dragging.qty.setPosition(x + 18, y + 18)
    }

    if (!this.container.visible) return
    this.setHovered(this.getDropTargetAt(x, y))
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.dragging) return

    const from = this.dragging.from
    const stack = this.dragging.stack
    let to = this.getDropTargetAt(pointer.x, pointer.y)

    this.clearDrag()

    if (!to) return
    if (this.isSameRef(from, to)) return

    // Convenience: allow dropping a weapon onto the shield box (common D2 muscle memory).
    if (to.type === 'equip' && (to as any).slot === 'shield') {
      const def = ITEMS[stack.id]
      if (def.kind === 'equipment' && def.equip?.slot === 'weapon') {
        to = { type: 'equip', slot: 'weapon' }
      }
    }

    const res = this.inventory.moveItem(from, to)
    if (!res.ok) {
      // Quick negative feedback: flash the destination.
      if (to.type === 'equip') {
        const v = this.getView(to)
        if (v) {
          v.bg.setStrokeStyle(3, 0xff4b5c, 0.7)
          this.scene.time.delayedCall(140, () => {
            if (!v.bg?.active) return
            this.updateShieldDisabled()
            this.updateHoverUI()
          })
        }
      } else if (to.type === 'bag') {
        this.bagHover.setStrokeStyle(2, 0xff4b5c, 0.75)
        this.scene.time.delayedCall(140, () => {
          if (!this.bagHover?.active) return
          this.bagHover.setStrokeStyle(2, 0xf3e2b0, 0.38)
        })
      }
      return
    }

    this.refresh()
  }

  private clearDrag() {
    if (!this.dragging) return
    this.dragging.icon.destroy()
    this.dragging.qty.destroy()

    const originView = this.getView(this.dragging.from)
    if (originView) originView.icon.setAlpha(1)

    this.dragging = null
  }

  private getView(ref: SlotRef): SlotView | null {
    if (ref.type === 'equip') return this.equipSlots[ref.slot]
    return this.bagSlots[ref.index] ?? null
  }

  private isSameRef(a: SlotRef | null, b: SlotRef | null) {
    if (!a || !b) return false
    if (a.type !== b.type) return false
    if (a.type === 'equip') return (a as any).slot === (b as any).slot
    return (a as any).index === (b as any).index
  }

  private setHovered(ref: SlotRef | null) {
    if (this.isSameRef(this.hovered, ref)) return
    this.hovered = ref
    this.updateHoverUI()
  }

  private bagIndexAt(x: number, y: number) {
    const g = this.bagGrid
    if (!g) return null
    const { left, top, slot, gap, cols, rows } = g
    const gridW = cols * slot + (cols - 1) * gap
    const gridH = rows * slot + (rows - 1) * gap
    if (x < left || y < top) return null
    if (x >= left + gridW || y >= top + gridH) return null

    const step = slot + gap
    const col = Math.min(cols - 1, Math.floor((x - left) / step))
    const row = Math.min(rows - 1, Math.floor((y - top) / step))
    const idx = row * cols + col
    if (idx < 0 || idx >= cols * rows) return null
    return idx
  }

  private updateShieldDisabled() {
    const hands = this.inventory.getWeaponDef()?.hands ?? 1
    const disabled = hands === 2
    const v = this.equipSlots.shield
    const wasDisabled = this.shieldDisabled
    this.shieldDisabled = disabled

    if (disabled) {
      v.bg.setFillStyle(0x0b111a, 0.35)
      v.bg.setStrokeStyle(3, 0xd7d3c8, 0.12)
      v.icon.setAlpha(0.35)
      if (v.label) v.label.setAlpha(0.25)
      v.bg.disableInteractive()
      // If the cursor was hovering this slot, clear it.
      if (this.hovered?.type === 'equip' && (this.hovered as any).slot === 'shield') this.setHovered(null)
    } else {
      v.bg.setFillStyle(0x0b111a, 0.88)
      v.bg.setStrokeStyle(3, 0xe0c68a, 0.28)
      v.icon.setAlpha(1)
      if (v.label) v.label.setAlpha(this.inventory.getEquipment('shield') ? 0.35 : 0.75)
    }

    if (this.container.visible && wasDisabled !== disabled) {
      this.enableInput(true)
    }
  }

  private getEquipRefAt(x: number, y: number): SlotRef | null {
    for (const [slot, view] of Object.entries(this.equipSlots) as [EquipmentSlot, SlotView][]) {
      if (slot === 'shield' && this.shieldDisabled) continue
      const w = typeof view.bg.displayWidth === 'number' && view.bg.displayWidth > 0 ? view.bg.displayWidth : view.bg.width
      const h = typeof view.bg.displayHeight === 'number' && view.bg.displayHeight > 0 ? view.bg.displayHeight : view.bg.height
      const left = view.bg.x - w / 2
      const right = view.bg.x + w / 2
      const top = view.bg.y - h / 2
      const bottom = view.bg.y + h / 2
      if (x >= left && x <= right && y >= top && y <= bottom) return view.ref
    }
    return null
  }

  private getDropTargetAt(x: number, y: number): SlotRef | null {
    const equipRef = this.getEquipRefAt(x, y)
    if (equipRef) return equipRef

    const idx = this.bagIndexAt(x, y)
    if (typeof idx === 'number') return { type: 'bag', index: idx }

    return null
  }

  private updateHoverUI() {
    // Equip hover stroke.
    for (const [slot, v] of Object.entries(this.equipSlots) as [EquipmentSlot, SlotView][]) {
      // Shield may be disabled while a 2H weapon is equipped; keep its muted style.
      const hands = this.inventory.getWeaponDef()?.hands ?? 1
      const shieldDisabled = slot === 'shield' && hands === 2
      if (shieldDisabled) continue

      const hovered = this.hovered?.type === 'equip' && (this.hovered as any).slot === slot
      if (hovered) v.bg.setStrokeStyle(3, 0xf4f2ec, 0.45)
      else v.bg.setStrokeStyle(3, 0xe0c68a, 0.28)
    }

    // Bag hover highlight.
    if (this.hovered?.type === 'bag') {
      const idx = (this.hovered as any).index as number
      const v = this.bagSlots[idx]
      if (v) {
        this.bagHover.setVisible(true)
        this.bagHover.setPosition(v.bg.x, v.bg.y)
        const s = typeof v.bg.width === 'number' && v.bg.width > 0 ? v.bg.width : 24
        this.bagHover.setSize(s + 2, s + 2)
      } else {
        this.bagHover.setVisible(false)
      }
    } else {
      this.bagHover.setVisible(false)
    }

    // Hover label.
    let itemId: string | null = null
    if (this.hovered?.type === 'equip') {
      const slot = (this.hovered as any).slot as EquipmentSlot
      itemId = this.inventory.getEquipment(slot)
    } else if (this.hovered?.type === 'bag') {
      const idx = (this.hovered as any).index as number
      itemId = this.inventory.getBagItem(idx)?.id ?? null
    }

    if (isItemId(itemId)) {
      this.hoverText.setText(ITEMS[itemId].name)
      this.hoverText.setVisible(true)
    } else {
      this.hoverText.setText('')
      this.hoverText.setVisible(false)
    }

    this.updateDetailsUI(isItemId(itemId) ? itemId : null)
  }

  private updateDetailsUI(itemId: ItemId | null) {
    const region = this.detailsRegion
    if (!region) {
      this.detailsPanel.setVisible(false)
      this.detailsHeader.setVisible(false)
      this.detailsIcon.setVisible(false)
      this.detailsTitle.setVisible(false)
      this.detailsBody.setVisible(false)
      return
    }

    this.detailsPanel.setVisible(true)
    this.detailsHeader.setVisible(true)

    const pad = 14
    const left = region.left + pad
    const top = region.top + pad
    const innerW = Math.max(80, region.w - pad * 2)

    // Keep wrapping coherent with the live layout.
    this.detailsTitle.setWordWrapWidth(innerW)
    this.detailsBody.setWordWrapWidth(innerW)

    if (!itemId) {
      this.detailsIcon.setVisible(false)
      this.detailsTitle.setText('Equipped Stats').setPosition(left, top).setVisible(true)

      const stats = this.inventory.getPlayerStats()
      const lines: string[] = []

      if (stats.weapon) {
        lines.push(`Weapon: ${stats.weapon.name}`)
        lines.push(`Attack Damage: +${stats.attackDamage}`)
      } else {
        lines.push(`Weapon: None`)
        lines.push(`Attack Damage: 0`)
      }

      lines.push(`Attack Speed: +${Math.floor(stats.attackSpeedPct)}%`)
      lines.push(`Move Speed: +${Math.floor(stats.moveSpeedPct)}%`)
      lines.push(`Max HP: +${Math.floor(stats.maxHpBonus)} Hearts`)

      if (stats.spells.length) {
        const formatted = stats.spells
          .map((s) => {
            const spellDef = SPELLS[s.id]
            return `${spellDef?.name ?? String(s.id)} (Lv ${s.level})`
          })
          .join(', ')
        lines.push(`Spells: ${formatted}`)
      } else {
        lines.push(`Spells: None`)
      }

      lines.push('')
      lines.push('Tip: Hover an item to see its stats.')

      this.detailsBody.setText(lines.join('\n')).setPosition(left, top + 30).setVisible(true)
      return
    }

    const def = ITEMS[itemId]
    const lines: string[] = []

    if (def.kind === 'equipment' && def.equip) {
      if (def.equip.slot === 'weapon') {
        const w = WEAPONS[def.equip.weaponId]
        lines.push(`Slot: Weapon`)
        if (w) {
          lines.push(`Hands: ${w.hands === 2 ? 'Two-Handed' : 'One-Handed'}`)
          lines.push(`Attack Damage: +${w.damage}`)
        }
      } else {
        lines.push(`Slot: ${slotLabel(def.equip.slot)}`)
        lines.push(`Armor: +${def.equip.armor}`)

        const ms = def.equip.moveSpeedPct
        if (typeof ms === 'number' && Number.isFinite(ms) && ms !== 0) lines.push(`Move Speed: +${Math.floor(ms)}%`)

        const as = def.equip.attackSpeedPct
        if (typeof as === 'number' && Number.isFinite(as) && as !== 0) lines.push(`Attack Speed: +${Math.floor(as)}%`)

        const hp = def.equip.maxHpBonus
        if (typeof hp === 'number' && Number.isFinite(hp) && hp !== 0) lines.push(`Max HP: +${Math.floor(hp)} Hearts`)

        const spells = def.equip.spells
        if (Array.isArray(spells) || def.equip.slot === 'helmet') {
          const list = Array.isArray(spells) ? spells : []
          if (list.length) {
            const formatted = list
              .map((s) => {
                const spellDef = SPELLS[s.id]
                const lvl = typeof s.level === 'number' && Number.isFinite(s.level) ? Math.max(1, Math.floor(s.level)) : 1
                return `${spellDef?.name ?? String(s.id)} (Lv ${lvl})`
              })
              .join(', ')
            lines.push(`Spells: ${formatted}`)
          } else {
            lines.push(`Spells: None`)
          }
        }
      }

      // Small affordance: show whether this is equipped.
      const equippedSlot = def.equip.slot
      const equipped = this.inventory.getEquipment(equippedSlot) === def.id
      if (equipped) lines.push('')
      if (equipped) lines.push('Equipped')
    } else if (def.id === 'coin') {
      lines.push('Currency')
    } else if (def.id === 'key') {
      lines.push('Key Item')
      lines.push('Opens locked doors.')
    } else if (def.id === 'heart') {
      lines.push('Consumable')
      lines.push('Heals +1 HP.')
    }

    this.detailsIcon.setTexture(def.texture)
    this.detailsIcon.setPosition(left + 18, top + 18)
    this.detailsIcon.setScale(1.15)
    this.detailsIcon.setVisible(true)

    this.detailsTitle.setText(def.name).setPosition(left + 44, top + 2).setVisible(true)
    this.detailsBody.setText(lines.join('\n')).setPosition(left, top + 44).setVisible(true)
  }

  private enableInput(enabled: boolean) {
    this.inputEnabled = enabled
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    this.dim.setSize(w, h)

    // Compact, D2-style overlay. The stash is only 5x5, so keep the panel smaller on desktop.
    const pw = Math.min(w - 24, Math.max(520, Math.min(740, Math.floor(w * 0.86))))
    const ph = Math.min(h - 24, Math.max(420, Math.min(560, Math.floor(h * 0.86))))
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)

    this.frame.setSize(pw + 14, ph + 14)
    this.frame.setPosition(cx, cy)

    this.panel.setSize(pw, ph)
    this.panel.setPosition(cx, cy)

    this.title.setPosition(cx, cy - ph / 2 + 40)
    this.hint.setPosition(cx, cy + ph / 2 - 22)

    // Inner content region.
    const padX = 28
    const headerH = 78
    const footerH = 64
    const innerLeft = Math.floor(cx - pw / 2 + padX)
    const innerRight = Math.floor(cx + pw / 2 - padX)
    const innerTop = Math.floor(cy - ph / 2 + headerH)
    const innerBottom = Math.floor(cy + ph / 2 - footerH)
    const innerW = Math.max(1, innerRight - innerLeft)
    const innerH = Math.max(1, innerBottom - innerTop)

    // Left: 3x2 equipped grid. Right: one big backpack rectangle (15x10).
    const cols = this.inventory.getBagCols()
    const rows = this.inventory.getBagRows()

    let equipSlot = Math.max(46, Math.min(76, Math.floor(innerH / 3.4)))
    const bagPad = 14
    const midGapBase = 28
    let rowGap = 12
    let colGap = 12
    let midGap = midGapBase
    let bagGap = 1
    let bagCell = 22

    for (let attempt = 0; attempt < 10; attempt++) {
      rowGap = Math.max(10, Math.floor(equipSlot * 0.22))
      colGap = Math.max(12, Math.floor(equipSlot * 0.24))
      midGap = Math.max(midGapBase, Math.floor(equipSlot * 0.35))
      bagGap = Math.max(0, Math.floor(equipSlot * 0.04))

      const equipW = equipSlot * 2 + colGap
      const bagWAvail = innerW - equipW - midGap

      const cellByW = Math.floor((bagWAvail - bagPad * 2 - (cols - 1) * bagGap) / cols)
      const cellByH = Math.floor((innerH - bagPad * 2 - (rows - 1) * bagGap) / rows)
      bagCell = Math.min(cellByW, cellByH)

      if (bagCell >= 20) break
      equipSlot = Math.max(44, equipSlot - 4)
    }

    bagCell = Math.max(16, Math.min(44, bagCell))

    const equipW = equipSlot * 2 + colGap
    const equipH = equipSlot * 3 + rowGap * 2

    const bagW = cols * bagCell + (cols - 1) * bagGap + bagPad * 2
    const bagH = rows * bagCell + (rows - 1) * bagGap + bagPad * 2

    // Align equip and bag vertically in the available space.
    const equipTop = innerTop + Math.floor((innerH - equipH) / 2)
    const bagLeft = innerLeft + equipW + midGap
    const bagTop = innerTop + Math.floor((innerH - bagH) / 2)

    this.equipHeader.setPosition(innerLeft, equipTop - 16)
    this.bagHeader.setPosition(bagLeft, bagTop - 16)

    // Coins/hover label live in the footer area.
    const footerY = Math.floor(cy + ph / 2 - 42)
    this.hoverText.setPosition(innerLeft, footerY - 22)
    this.coinsKeys.setPosition(innerLeft, footerY)

    const placeEquip = (slotId: EquipmentSlot, x: number, y: number) => {
      const v = this.equipSlots[slotId]
      v.bg.setPosition(x, y).setSize(equipSlot, equipSlot)
      v.icon.setPosition(x, y)
      v.qty.setPosition(x + equipSlot / 2 - 6, y + equipSlot / 2 - 4)
      if (v.label) v.label.setPosition(x - equipSlot / 2 + 6, y - equipSlot / 2 + 4)
    }

    const x0 = innerLeft + equipSlot / 2
    const x1 = x0 + equipSlot + colGap
    const y0 = equipTop + equipSlot / 2
    const y1 = y0 + equipSlot + rowGap
    const y2 = y1 + equipSlot + rowGap

    // Left column: helmet, gloves, sword.
    // Right column: body armor, boots, shield.
    placeEquip('helmet', x0, y0)
    placeEquip('chest', x1, y0)
    placeEquip('gloves', x0, y1)
    placeEquip('boots', x1, y1)
    placeEquip('weapon', x0, y2)
    placeEquip('shield', x1, y2)

    // Backpack rectangle (single panel, items laid out on an implicit grid).
    this.bagPanel.setSize(bagW, bagH)
    this.bagPanel.setPosition(bagLeft + bagW / 2, bagTop + bagH / 2)

    // Tooltip/details panel to the right of the stash, if there's enough horizontal slack.
    // (Bag sizing is often height-limited, leaving extra space on wider desktop layouts.)
    const detailsGap = Math.max(16, Math.floor(equipSlot * 0.28))
    const detailsLeft = Math.floor(bagLeft + bagW + detailsGap)
    const detailsW = Math.floor(innerRight - detailsLeft)
    const detailsH = bagH
    const showDetails = detailsW >= 160
    if (showDetails) {
      this.detailsRegion = { left: detailsLeft, top: bagTop, w: detailsW, h: detailsH }
      this.detailsHeader.setPosition(detailsLeft, bagTop - 16)
      this.detailsPanel.setSize(detailsW, detailsH)
      this.detailsPanel.setPosition(detailsLeft + detailsW / 2, bagTop + detailsH / 2)
    } else {
      this.detailsRegion = null
    }

    const gridLeft = bagLeft + bagPad
    const gridTop = bagTop + bagPad
    this.bagGrid = { left: gridLeft, top: gridTop, slot: bagCell, gap: bagGap, cols, rows }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const v = this.bagSlots[idx]
        const x = gridLeft + c * (bagCell + bagGap) + bagCell / 2
        const y = gridTop + r * (bagCell + bagGap) + bagCell / 2
        v.bg.setPosition(x, y).setSize(bagCell, bagCell)
        v.icon.setPosition(x, y)
        v.qty.setPosition(x + bagCell / 2 - 6, y + bagCell / 2 - 4)
      }
    }

    this.updateHoverUI()
  }
}
