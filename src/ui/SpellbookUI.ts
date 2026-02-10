import * as Phaser from 'phaser'
import { SPELLS, resolveSpellLevel, type SpellDef, type SpellGrant } from '../content/spells'
import { DEPTH_UI } from '../game/constants'
import type { InventorySystem } from '../systems/InventorySystem'

type SpellSlotView = {
  spell: SpellGrant
  bg: Phaser.GameObjects.Rectangle
  icon: Phaser.GameObjects.Image
  level: Phaser.GameObjects.Text
  hotkey: Phaser.GameObjects.Text
}

function sameSpell(a: SpellGrant | null, b: SpellGrant | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.id === b.id && a.level === b.level
}

export class SpellbookUI {
  private scene: Phaser.Scene
  private inventory: InventorySystem

  private container: Phaser.GameObjects.Container
  private dim: Phaser.GameObjects.Rectangle
  private frame: Phaser.GameObjects.Rectangle
  private panel: Phaser.GameObjects.Rectangle
  private header: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text

  private detailsHeader: Phaser.GameObjects.Text
  private detailsPanel: Phaser.GameObjects.Rectangle
  private detailsIcon: Phaser.GameObjects.Image
  private detailsTitle: Phaser.GameObjects.Text
  private detailsBody: Phaser.GameObjects.Text

  // Exposed for tests (TS-private only).
  private spellSlots: SpellSlotView[] = []

  private hovered: SpellGrant | null = null
  private detailsRegion: { left: number; top: number; w: number; h: number } | null = null
  private inputEnabled = false

  constructor(scene: Phaser.Scene, inventory: InventorySystem) {
    this.scene = scene
    this.inventory = inventory

    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.42).setOrigin(0, 0)
    this.frame = scene.add.rectangle(0, 0, 10, 10, 0x5a4522, 0.98).setOrigin(0.5, 0.5)
    this.frame.setStrokeStyle(4, 0xf3e2b0, 0.08)
    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x171a1f, 0.98).setOrigin(0.5, 0.5)
    this.panel.setStrokeStyle(2, 0xe0c68a, 0.18)

    this.header = scene.add
      .text(0, 0, 'SPELLBOOK', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#f1e6c8',
      })
      .setOrigin(0, 0.5)

    this.hint = scene.add
      .text(0, 0, 'Hover a spell, then press 1-5 to bind. Press F to close.', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: '#d7d3c8',
      })
      .setOrigin(0, 0.5)

    this.detailsHeader = scene.add
      .text(0, 0, 'DETAILS', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#e0c68a',
      })
      .setOrigin(0, 0.5)

    this.detailsPanel = scene.add.rectangle(0, 0, 10, 10, 0x0b111a, 0.68).setOrigin(0.5, 0.5)
    this.detailsPanel.setStrokeStyle(2, 0xe0c68a, 0.22)

    this.detailsIcon = scene.add.image(0, 0, 'spell-icon-none').setOrigin(0.5, 0.5)
    this.detailsTitle = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#f1e6c8',
        wordWrap: { width: 220, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)

    this.detailsBody = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: '#d7d3c8',
        wordWrap: { width: 220, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setOrigin(0, 0)

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.frame,
      this.panel,
      this.header,
      this.hint,
      this.detailsPanel,
      this.detailsHeader,
      this.detailsIcon,
      this.detailsTitle,
      this.detailsBody,
    ])
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)
    this.container.setVisible(false)

    scene.scale.on('resize', this.layout, this)
    scene.input.on('pointermove', this.onPointerMove, this)

    this.layout()
    this.refresh()
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.scene.input.off('pointermove', this.onPointerMove, this)
    this.clearSlots()
    this.container.destroy(true)
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
  }

  refresh() {
    const spells = this.inventory.getPlayerStats().spells
    const prev = this.spellSlots.map((s) => s.spell.id).join(',')
    const next = spells.map((s) => s.id).join(',')
    if (prev !== next) {
      this.clearSlots()
      this.buildSlots(spells)
      this.layout()
    } else {
      // Update level + hotkey indicators.
      for (const v of this.spellSlots) {
        const fresh = spells.find((s) => s.id === v.spell.id) ?? null
        if (fresh && !sameSpell(fresh, v.spell)) v.spell = { id: fresh.id, level: fresh.level }
      }
      this.updateSlotIndicators()
    }

    // Ensure hovered spell is still valid.
    if (this.hovered) {
      const still = spells.find((s) => s.id === this.hovered!.id) ?? null
      if (!still) this.setHovered(null)
      else if (!sameSpell(still, this.hovered)) this.setHovered(still)
    }

    this.updateDetailsUI()
  }

  onHotkeyPressed(slotIndex: number) {
    if (!this.container.visible) return false
    if (!this.inputEnabled) return false
    if (!this.hovered) return false
    const id = this.hovered.id
    const ok = this.inventory.assignSpellHotkey(slotIndex, id)
    if (ok) this.inventory.selectSpell(id)
    this.updateSlotIndicators()
    this.updateDetailsUI()
    return ok
  }

  private enableInput(enabled: boolean) {
    this.inputEnabled = enabled
  }

  private clearSlots() {
    for (const v of this.spellSlots) {
      v.bg.destroy()
      v.icon.destroy()
      v.level.destroy()
      v.hotkey.destroy()
    }
    this.spellSlots = []
  }

  private buildSlots(spells: SpellGrant[]) {
    for (const s of spells) {
      const bg = this.scene.add.rectangle(0, 0, 10, 10, 0x0b111a, 0.88).setOrigin(0.5, 0.5)
      bg.setStrokeStyle(3, 0xe0c68a, 0.28)

      const def = SPELLS[s.id]
      const icon = this.scene.add.image(0, 0, def?.iconTexture ?? 'spell-icon-none').setOrigin(0.5, 0.5)
      icon.setScale(1.1)

      const level = this.scene.add
        .text(0, 0, `Lv ${s.level}`, {
          fontFamily: 'Georgia, serif',
          fontSize: '11px',
          color: '#d7d3c8',
        })
        .setOrigin(0, 1)
        .setAlpha(0.85)

      const hotkey = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'Georgia, serif',
          fontSize: '12px',
          color: '#f1e6c8',
        })
        .setOrigin(1, 0)
        .setStroke('#0a0d12', 3)
        .setVisible(false)

      const view: SpellSlotView = { spell: { id: s.id, level: s.level }, bg, icon, level, hotkey }
      this.spellSlots.push(view)
      this.container.add([bg, icon, level, hotkey])
    }

    this.updateSlotIndicators()
  }

  private setHovered(spell: SpellGrant | null) {
    if (sameSpell(this.hovered, spell)) return
    this.hovered = spell ? { id: spell.id, level: spell.level } : null
    this.updateHoverUI()
    this.updateDetailsUI()
  }

  private updateSlotIndicators() {
    const hotkeys = this.inventory.getSpellHotkeys()
    for (const v of this.spellSlots) {
      const slotNum = hotkeys.findIndex((id) => id === v.spell.id)
      if (slotNum >= 0) {
        v.hotkey.setText(String(slotNum + 1)).setVisible(true)
      } else {
        v.hotkey.setText('').setVisible(false)
      }
    }
  }

  private updateHoverUI() {
    for (const v of this.spellSlots) {
      const hovered = !!this.hovered && this.hovered.id === v.spell.id
      if (hovered) v.bg.setStrokeStyle(3, 0xf4f2ec, 0.45)
      else v.bg.setStrokeStyle(3, 0xe0c68a, 0.28)
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.container.visible) return
    if (!this.inputEnabled) return
    this.setHovered(this.getSpellAt(pointer.x, pointer.y))
  }

  private getSpellAt(x: number, y: number): SpellGrant | null {
    for (const v of this.spellSlots) {
      const w = typeof v.bg.displayWidth === 'number' && v.bg.displayWidth > 0 ? v.bg.displayWidth : v.bg.width
      const h = typeof v.bg.displayHeight === 'number' && v.bg.displayHeight > 0 ? v.bg.displayHeight : v.bg.height
      const left = v.bg.x - w / 2
      const right = v.bg.x + w / 2
      const top = v.bg.y - h / 2
      const bottom = v.bg.y + h / 2
      if (x >= left && x <= right && y >= top && y <= bottom) return { id: v.spell.id, level: v.spell.level }
    }
    return null
  }

  private updateDetailsUI() {
    const region = this.detailsRegion
    if (!region) return

    const pad = 12
    const left = region.left + pad
    const top = region.top + pad
    const innerW = Math.max(100, region.w - pad * 2)
    this.detailsTitle.setWordWrapWidth(innerW)
    this.detailsBody.setWordWrapWidth(innerW)

    const spell = this.hovered
    if (!spell) {
      this.detailsIcon.setVisible(false)
      this.detailsTitle.setText('Hover a spell').setPosition(left, top).setVisible(true)
      const any = this.inventory.getPlayerStats().spells.length > 0
      this.detailsBody
        .setText(any ? 'Press 1-5 to bind the hovered spell to a hotkey slot.' : 'No spells available from equipped gear.')
        .setPosition(left, top + 26)
        .setVisible(true)
      return
    }

    const def = SPELLS[spell.id]
    this.detailsIcon.setTexture(def?.iconTexture ?? 'spell-icon-none')
    this.detailsIcon.setPosition(left + 16, top + 16)
    this.detailsIcon.setScale(1.05)
    this.detailsIcon.setVisible(true)

    const title = `${def?.name ?? String(spell.id)} (Lv ${spell.level})`
    this.detailsTitle.setText(title).setPosition(left + 40, top + 2).setVisible(true)

    const lines: string[] = []
    if (def?.kind === 'projectile') {
      const resolved = resolveSpellLevel(def as SpellDef, spell.level)
      const cfg = resolved?.cfg ?? null
      if (cfg) {
        lines.push('Type: Projectile')
        lines.push(`Damage: ${Math.max(0, Math.floor(cfg.damage))}`)
        lines.push(`Speed: ${Math.max(0, Math.floor(cfg.speedTilesPerSec))} tiles/s`)
        lines.push(`Cooldown: ${Math.max(0, Math.floor(cfg.cooldownMs))} ms`)
      }
    }

    const hotkeys = this.inventory.getSpellHotkeys()
    const slotNum = hotkeys.findIndex((id) => id === spell.id)
    if (slotNum >= 0) lines.push(`Hotkey: ${slotNum + 1}`)

    this.detailsBody.setText(lines.join('\n')).setPosition(left, top + 36).setVisible(true)
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    this.dim.setSize(w, h)

    // Sidebar-ish overlay: roughly ~30% screen area on typical layouts.
    const pw = Math.min(w - 24, Math.max(360, Math.floor(w * 0.42)))
    const ph = Math.min(h - 24, Math.max(280, Math.floor(h * 0.66)))
    const cx = Math.floor(w - pw / 2 - 18)
    const cy = Math.floor(h / 2)

    this.frame.setSize(pw + 14, ph + 14)
    this.frame.setPosition(cx, cy)
    this.panel.setSize(pw, ph)
    this.panel.setPosition(cx, cy)

    const top = Math.floor(cy - ph / 2)
    const left = Math.floor(cx - pw / 2)

    this.header.setPosition(left + 18, top + 24)
    this.hint.setPosition(left + 18, top + ph - 22)

    const innerTop = top + 52
    const innerBottom = top + ph - 46
    const innerH = Math.max(1, innerBottom - innerTop)

    const innerLeft = left + 18
    const innerRight = left + pw - 18

    // Left: spell grid. Right: details.
    const slot = Math.max(44, Math.min(62, Math.floor(innerH / 4.2)))
    const gap = 12
    const cols = 2
    const gridW = cols * slot + (cols - 1) * gap
    const detailsGap = 18
    const detailsLeft = innerLeft + gridW + detailsGap
    const detailsW = Math.floor(innerRight - detailsLeft)
    const showDetails = detailsW >= 140

    if (showDetails) {
      this.detailsRegion = { left: detailsLeft, top: innerTop, w: detailsW, h: innerH }
      this.detailsHeader.setPosition(detailsLeft, innerTop - 16).setVisible(true)
      this.detailsPanel.setPosition(detailsLeft + detailsW / 2, innerTop + innerH / 2).setSize(detailsW, innerH).setVisible(true)
    } else {
      this.detailsRegion = null
      this.detailsHeader.setVisible(false)
      this.detailsPanel.setVisible(false)
      this.detailsIcon.setVisible(false)
      this.detailsTitle.setVisible(false)
      this.detailsBody.setVisible(false)
    }

    const maxRows = Math.max(1, Math.floor((innerH + gap) / (slot + gap)))

    for (let i = 0; i < this.spellSlots.length; i++) {
      const v = this.spellSlots[i]
      const row = Math.floor(i / cols)
      const col = i % cols
      const yRow = Math.min(row, maxRows - 1)
      const x = innerLeft + col * (slot + gap) + slot / 2
      const y = innerTop + yRow * (slot + gap) + slot / 2
      v.bg.setPosition(x, y).setSize(slot, slot)
      v.icon.setPosition(x, y).setScale(Math.max(0.9, Math.min(1.35, slot / 52)))
      v.level.setPosition(x - slot / 2 + 6, y + slot / 2 - 6)
      v.hotkey.setPosition(x + slot / 2 - 6, y - slot / 2 + 6)
    }

    this.updateHoverUI()
    this.updateDetailsUI()
  }
}
