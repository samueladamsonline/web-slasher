import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'

const HERO_W = 48
const HERO_H = 72

const COLS = 3
const ROWS = 4

const outDir = path.resolve('public/sprites')
const outFile = path.join(outDir, 'hero.png')

/** @typedef {'down'|'up'|'left'|'right'} Facing */
/** @type {Facing[]} */
const FACINGS = ['down', 'up', 'left', 'right']

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function packRGBA(r, g, b, a) {
  return { r, g, b, a }
}

function blend(dst, src) {
  const sa = src.a / 255
  const da = dst.a / 255
  const oa = sa + da * (1 - sa)
  if (oa <= 1e-6) return packRGBA(0, 0, 0, 0)
  const r = (src.r * sa + dst.r * da * (1 - sa)) / oa
  const g = (src.g * sa + dst.g * da * (1 - sa)) / oa
  const b = (src.b * sa + dst.b * da * (1 - sa)) / oa
  return packRGBA(Math.round(r), Math.round(g), Math.round(b), Math.round(oa * 255))
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const idx = (png.width * y + x) << 2
  const dst = packRGBA(png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3])
  const out = blend(dst, color)
  png.data[idx] = out.r
  png.data[idx + 1] = out.g
  png.data[idx + 2] = out.b
  png.data[idx + 3] = out.a
}

function fillRect(png, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(png, xx, yy, color)
    }
  }
}

function fillRoundedRect(png, x, y, w, h, radius, color) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      let inside = true

      const lx = xx - x
      const ly = yy - y
      const rx = x + w - 1 - xx
      const ry = y + h - 1 - yy

      const cx = lx < r ? r - lx : rx < r ? r - rx : 0
      const cy = ly < r ? r - ly : ry < r ? r - ry : 0

      if (cx !== 0 || cy !== 0) {
        inside = cx * cx + cy * cy <= r * r
      }

      if (inside) setPixel(png, xx, yy, color)
    }
  }
}

function fillCircleAA(png, cx, cy, radius, color) {
  const r = radius
  const x0 = Math.floor(cx - r - 1)
  const x1 = Math.ceil(cx + r + 1)
  const y0 = Math.floor(cy - r - 1)
  const y1 = Math.ceil(cy + r + 1)

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)

      // 1px soft edge.
      const coverage = clamp01((r + 0.5 - d) / 1.0)
      if (coverage <= 0) continue
      const a = Math.round((color.a ?? 255) * coverage)
      setPixel(png, x, y, packRGBA(color.r, color.g, color.b, a))
    }
  }
}

function fillEllipseAA(png, cx, cy, rx, ry, color) {
  const x0 = Math.floor(cx - rx - 1)
  const x1 = Math.ceil(cx + rx + 1)
  const y0 = Math.floor(cy - ry - 1)
  const y1 = Math.ceil(cy + ry + 1)

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      const coverage = clamp01((1.0 + 0.1 - d) / 0.25)
      if (coverage <= 0) continue
      const a = Math.round((color.a ?? 255) * coverage)
      setPixel(png, x, y, packRGBA(color.r, color.g, color.b, a))
    }
  }
}

function strokeRoundedRect(png, x, y, w, h, radius, thickness, color) {
  // Simple stroke: draw two rounded rect fills and subtract by overwriting alpha.
  // Good enough for placeholder art.
  fillRoundedRect(png, x, y, w, h, radius, color)
  const inner = packRGBA(0, 0, 0, 0)
  fillRoundedRect(png, x + thickness, y + thickness, w - thickness * 2, h - thickness * 2, Math.max(0, radius - thickness), inner)
}

function drawHeroFrame(png, ox, oy, facing, step) {
  // Clear the frame (fully transparent).
  fillRect(png, ox, oy, HERO_W, HERO_H, packRGBA(0, 0, 0, 0))

  // Palette.
  const outline = packRGBA(27, 27, 27, 230)
  const tunic = packRGBA(75, 123, 255, 255)
  const tunicDark = packRGBA(47, 88, 204, 190)
  const skin = packRGBA(242, 201, 160, 255)
  const hair = packRGBA(42, 27, 15, 255)
  const leg = packRGBA(43, 43, 43, 255)

  // Shadow.
  fillEllipseAA(png, ox + HERO_W / 2, oy + HERO_H - 10, 14, 5, packRGBA(0, 0, 0, 45))

  // Walk cycle.
  const stride = step === 1 ? 3 : 0
  const legA = step === 2 ? 2 : 0
  const legB = step === 0 ? 2 : 0

  // Legs.
  const legY = oy + HERO_H - 26
  if (facing === 'left' || facing === 'right') {
    fillRoundedRect(png, ox + 16 + stride, legY + legA, 8, 16, 4, leg)
    fillRoundedRect(png, ox + 24 - stride, legY + legB, 8, 16, 4, leg)
  } else {
    fillRoundedRect(png, ox + 16, legY + stride + legA, 8, 16, 4, leg)
    fillRoundedRect(png, ox + 24, legY - stride + legB, 8, 16, 4, leg)
  }

  // Body.
  const bodyX = ox + 10
  const bodyY = oy + 26
  const bodyW = 28
  const bodyH = 34
  fillRoundedRect(png, bodyX, bodyY, bodyW, bodyH, 12, tunic)
  if (facing === 'up') {
    fillRoundedRect(png, bodyX + 2, bodyY + 2, bodyW - 4, 14, 10, tunicDark)
  }

  // Arms.
  if (facing === 'left') {
    fillRoundedRect(png, ox + 6, oy + 34, 10, 12, 6, skin)
    fillRoundedRect(png, ox + 28, oy + 34, 10, 10, 6, skin)
  } else if (facing === 'right') {
    fillRoundedRect(png, ox + 10, oy + 34, 10, 10, 6, skin)
    fillRoundedRect(png, ox + 32, oy + 34, 10, 12, 6, skin)
  } else {
    fillRoundedRect(png, ox + 6, oy + 34, 10, 12, 6, skin)
    fillRoundedRect(png, ox + 32, oy + 34, 10, 12, 6, skin)
  }

  // Head.
  const headY = oy + 16 + (step === 1 ? 1 : 0)
  fillCircleAA(png, ox + HERO_W / 2, headY, 12, skin)

  // Hair.
  fillCircleAA(png, ox + HERO_W / 2, headY - 4, 12, hair)
  fillCircleAA(png, ox + HERO_W / 2, headY + 1, 11, skin)

  // Face cue.
  if (facing === 'down') {
    fillCircleAA(png, ox + HERO_W / 2 - 4, headY - 1, 1.6, packRGBA(27, 27, 27, 240))
    fillCircleAA(png, ox + HERO_W / 2 + 4, headY - 1, 1.6, packRGBA(27, 27, 27, 240))
    fillRoundedRect(png, ox + HERO_W / 2 - 5, headY + 6, 10, 2, 1, packRGBA(27, 27, 27, 200))
  } else if (facing === 'left') {
    fillCircleAA(png, ox + HERO_W / 2 - 6, headY - 1, 1.6, packRGBA(27, 27, 27, 240))
    fillRoundedRect(png, ox + HERO_W / 2 - 6, headY + 6, 8, 2, 1, packRGBA(27, 27, 27, 200))
  } else if (facing === 'right') {
    fillCircleAA(png, ox + HERO_W / 2 + 6, headY - 1, 1.6, packRGBA(27, 27, 27, 240))
    fillRoundedRect(png, ox + HERO_W / 2 - 2, headY + 6, 8, 2, 1, packRGBA(27, 27, 27, 200))
  } else {
    fillCircleAA(png, ox + HERO_W / 2, headY + 2, 10, packRGBA(27, 27, 27, 30))
  }

  // Outline.
  strokeRoundedRect(png, bodyX, bodyY, bodyW, bodyH, 12, 2, outline)
  // Head outline: draw two circles (outer dark, inner transparent).
  fillCircleAA(png, ox + HERO_W / 2, headY, 12.5, outline)
  fillCircleAA(png, ox + HERO_W / 2, headY, 10.8, packRGBA(0, 0, 0, 0))
}

fs.mkdirSync(outDir, { recursive: true })

const png = new PNG({ width: HERO_W * COLS, height: HERO_H * ROWS })

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const facing = FACINGS[row]
    drawHeroFrame(png, col * HERO_W, row * HERO_H, facing, col)
  }
}

png.pack().pipe(fs.createWriteStream(outFile))
