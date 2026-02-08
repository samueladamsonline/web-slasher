import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

// Generates a hero spritesheet (3 cols x 4 rows) compatible with our code's
// `frameFor(facing, step)` mapping. This is intentionally simple:
// we build a single composed 16x16 character tile and repeat it for all facings,
// adding a tiny vertical bob for the walk cycle.
//
// Source: Kenney "Roguelike Characters" (CC0).

const SRC = path.resolve('public/sprites/kenney_roguelikeChar_transparent.png')
const outDir = path.resolve('public/sprites')
const outFile = path.join(outDir, 'hero_kenney.png')

const TILE = 16
const SPACING = 1

const SCALE = 4 // 16px -> 64px frames
const FRAME_W = TILE * SCALE
const FRAME_H = TILE * SCALE

const COLS = 3
const ROWS = 4

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function cropTile(sheet, c, r) {
  const ox = c * (TILE + SPACING)
  const oy = r * (TILE + SPACING)
  const out = new PNG({ width: TILE, height: TILE })
  out.data.fill(0)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const si = ((sheet.width * (oy + y) + (ox + x)) << 2) >>> 0
      const di = ((TILE * y + x) << 2) >>> 0
      out.data[di] = sheet.data[si]
      out.data[di + 1] = sheet.data[si + 1]
      out.data[di + 2] = sheet.data[si + 2]
      out.data[di + 3] = sheet.data[si + 3]
    }
  }
  return out
}

function scaleNearest(src, s) {
  const out = new PNG({ width: src.width * s, height: src.height * s })
  out.data.fill(0)
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sx = Math.floor(x / s)
      const sy = Math.floor(y / s)
      const si = ((src.width * sy + sx) << 2) >>> 0
      const di = ((out.width * y + x) << 2) >>> 0
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
  return out
}

function alphaBlendOver(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = ((src.width * y + x) << 2) >>> 0
      const a = src.data[si + 3]
      if (a === 0) continue
      const di = ((dst.width * (dy + y) + (dx + x)) << 2) >>> 0
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = ((src.width * y + x) << 2) >>> 0
      const di = ((dst.width * (dy + y) + (dx + x)) << 2) >>> 0
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

fs.mkdirSync(outDir, { recursive: true })
const sheet = readPng(SRC)

// Choose a single character by composing a head + body tile.
// These coordinates are specific to Kenney's sheet and intentionally kept simple.
const head = cropTile(sheet, 0, 5)
const body = cropTile(sheet, 1, 5)

const composed = new PNG({ width: TILE, height: TILE })
composed.data.fill(0)
paste(composed, body, 0, 0)
alphaBlendOver(composed, head, 0, 0)

const base = scaleNearest(composed, SCALE)

const out = new PNG({ width: FRAME_W * COLS, height: FRAME_H * ROWS })
out.data.fill(0)

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const ox = col * FRAME_W
    const oy = row * FRAME_H
    const bob = col === 1 ? -1 : col === 2 ? 1 : 0
    paste(out, base, ox, oy + bob)
  }
}

fs.writeFileSync(outFile, PNG.sync.write(out))
console.log(`wrote ${outFile}`)

