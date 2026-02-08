import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'

const outDir = path.resolve('public/sprites')
fs.mkdirSync(outDir, { recursive: true })

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
    for (let xx = x; xx < x + w; xx++) setPixel(png, xx, yy, color)
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
      if (cx !== 0 || cy !== 0) inside = cx * cx + cy * cy <= r * r
      if (inside) setPixel(png, xx, yy, color)
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
      const coverage = clamp01((r + 0.5 - d) / 1.0)
      if (coverage <= 0) continue
      const a = Math.round((color.a ?? 255) * coverage)
      setPixel(png, x, y, packRGBA(color.r, color.g, color.b, a))
    }
  }
}

function strokeRoundedRect(png, x, y, w, h, radius, thickness, color) {
  fillRoundedRect(png, x, y, w, h, radius, color)
  fillRoundedRect(png, x + thickness, y + thickness, w - thickness * 2, h - thickness * 2, Math.max(0, radius - thickness), packRGBA(0, 0, 0, 0))
}

function genSlime() {
  const W = 44
  const H = 34
  const FRAMES = 3
  const png = new PNG({ width: W * FRAMES, height: H })

  const outline = packRGBA(18, 20, 24, 220)
  const bodyA = packRGBA(66, 211, 109, 255)
  const bodyB = packRGBA(49, 182, 90, 255)
  const shadow = packRGBA(0, 0, 0, 50)
  const eye = packRGBA(10, 12, 15, 240)

  for (let i = 0; i < FRAMES; i++) {
    const ox = i * W
    const squash = i === 1 ? 2 : 0
    const stretch = i === 1 ? -2 : 0
    fillRect(png, ox, 0, W, H, packRGBA(0, 0, 0, 0))

    fillEllipseAA(png, ox + W / 2, H - 6, 16, 5, shadow)

    const x = ox + 2
    const y = 2 + squash
    const w = W - 4
    const h = H - 8 + stretch
    fillRoundedRect(png, x, y, w, h, 16, bodyA)

    // Belly shading.
    fillEllipseAA(png, ox + W / 2, y + h - 6, 16, 6, packRGBA(bodyB.r, bodyB.g, bodyB.b, 190))

    // Eyes.
    fillCircleAA(png, ox + 16, y + 13, 2.2, eye)
    fillCircleAA(png, ox + 28, y + 13, 2.2, eye)
    fillCircleAA(png, ox + 15, y + 12, 0.9, packRGBA(255, 255, 255, 90))
    fillCircleAA(png, ox + 27, y + 12, 0.9, packRGBA(255, 255, 255, 90))

    // Outline.
    strokeRoundedRect(png, x, y, w, h, 16, 2, outline)
  }

  png.pack().pipe(fs.createWriteStream(path.join(outDir, 'slime.png')))
}

function genBat() {
  const W = 64
  const H = 48
  const FRAMES = 3
  const png = new PNG({ width: W * FRAMES, height: H })

  const outline = packRGBA(18, 20, 24, 220)
  const wing = packRGBA(118, 75, 255, 255)
  const wingDark = packRGBA(79, 44, 176, 255)
  const body = packRGBA(90, 48, 170, 255)
  const eye = packRGBA(10, 12, 15, 240)
  const shadow = packRGBA(0, 0, 0, 40)

  for (let i = 0; i < FRAMES; i++) {
    const ox = i * W
    fillRect(png, ox, 0, W, H, packRGBA(0, 0, 0, 0))

    const flap = i === 0 ? -6 : i === 2 ? 6 : 0
    fillEllipseAA(png, ox + W / 2, H - 8, 18, 6, shadow)

    // Wings.
    const wy = 18 + (i === 1 ? 0 : 1)
    fillEllipseAA(png, ox + 16, wy + flap * 0.2, 18, 10, wing)
    fillEllipseAA(png, ox + 48, wy - flap * 0.2, 18, 10, wing)
    fillEllipseAA(png, ox + 16, wy + flap * 0.2 + 3, 15, 7, packRGBA(wingDark.r, wingDark.g, wingDark.b, 210))
    fillEllipseAA(png, ox + 48, wy - flap * 0.2 + 3, 15, 7, packRGBA(wingDark.r, wingDark.g, wingDark.b, 210))

    // Body.
    fillEllipseAA(png, ox + W / 2, 24, 12, 9, body)
    fillEllipseAA(png, ox + W / 2, 28, 10, 6, packRGBA(255, 255, 255, 20))

    // Ears.
    fillRoundedRect(png, ox + 28, 12, 4, 7, 2, wingDark)
    fillRoundedRect(png, ox + 32, 12, 4, 7, 2, wingDark)

    // Eyes.
    fillCircleAA(png, ox + 30, 23, 2.0, eye)
    fillCircleAA(png, ox + 34, 23, 2.0, eye)
    fillCircleAA(png, ox + 29, 22, 0.9, packRGBA(255, 255, 255, 85))
    fillCircleAA(png, ox + 33, 22, 0.9, packRGBA(255, 255, 255, 85))

    // Outline cues.
    fillEllipseAA(png, ox + 16, wy + flap * 0.2, 18.6, 10.6, outline)
    fillEllipseAA(png, ox + 16, wy + flap * 0.2, 16.5, 8.8, packRGBA(0, 0, 0, 0))
    fillEllipseAA(png, ox + 48, wy - flap * 0.2, 18.6, 10.6, outline)
    fillEllipseAA(png, ox + 48, wy - flap * 0.2, 16.5, 8.8, packRGBA(0, 0, 0, 0))
    fillEllipseAA(png, ox + W / 2, 24, 12.8, 9.8, outline)
    fillEllipseAA(png, ox + W / 2, 24, 11.1, 8.3, packRGBA(0, 0, 0, 0))
  }

  png.pack().pipe(fs.createWriteStream(path.join(outDir, 'bat.png')))
}

genSlime()
genBat()

