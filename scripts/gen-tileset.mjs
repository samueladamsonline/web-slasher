import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'

const TILE = 64
const COLS = 3
const ROWS = 1

const outDir = path.resolve('public/tilesets')
const outFile = path.join(outDir, 'overworld.png')

function set(png, x, y, r, g, b, a = 255) {
  const idx = (png.width * y + x) << 2
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

function fill(png, ox, oy, w, h, r, g, b, a = 255) {
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      set(png, x, y, r, g, b, a)
    }
  }
}

function noise2(x, y, seed) {
  // cheap deterministic hash
  let n = x * 374761393 + y * 668265263 + seed * 1442695041
  n = (n ^ (n >> 13)) * 1274126177
  n ^= n >> 16
  return (n >>> 0) / 0xffffffff
}

function drawGrass(png, ox) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise2(x, y, 1)
      const base = 60 + Math.floor(n * 30)
      set(png, ox + x, y, 40, base + 90, 55)
    }
  }
  // subtle blades
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(noise2(i, i * 3, 2) * TILE)
    const y = Math.floor(noise2(i * 7, i, 3) * TILE)
    const h = 4 + Math.floor(noise2(i, y, 4) * 10)
    for (let k = 0; k < h; k++) {
      const yy = Math.min(TILE - 1, y + k)
      set(png, ox + x, yy, 25, 150, 55, 220)
    }
  }
}

function drawDirt(png, ox) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise2(x, y, 5)
      const c = 110 + Math.floor(n * 25)
      set(png, ox + x, y, c, 90, 60)
    }
  }
  // pebbles
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(noise2(i, 1, 6) * TILE)
    const y = Math.floor(noise2(i, 2, 7) * TILE)
    const c = 155 + Math.floor(noise2(i, 3, 8) * 50)
    set(png, ox + x, y, c, c - 10, c - 30)
  }
}

function drawRock(png, ox) {
  fill(png, ox, 0, TILE, TILE, 40, 40, 40)
  // rocky shading
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise2(x, y, 9)
      const c = 55 + Math.floor(n * 70)
      set(png, ox + x, y, c, c, c)
    }
  }
  // cracks
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(noise2(i, 10, 10) * TILE)
    const sy = Math.floor(noise2(i, 11, 11) * TILE)
    const len = 18 + Math.floor(noise2(i, 12, 12) * 22)
    for (let k = 0; k < len; k++) {
      const x = Math.min(TILE - 2, Math.max(1, sx + k - (len >> 1)))
      const y = Math.min(TILE - 2, Math.max(1, sy + Math.floor(Math.sin((k / len) * Math.PI) * 4)))
      set(png, ox + x, y, 20, 20, 20, 220)
    }
  }
  // border
  for (let x = 0; x < TILE; x++) {
    set(png, ox + x, 0, 15, 15, 15)
    set(png, ox + x, TILE - 1, 15, 15, 15)
  }
  for (let y = 0; y < TILE; y++) {
    set(png, ox, y, 15, 15, 15)
    set(png, ox + TILE - 1, y, 15, 15, 15)
  }
}

fs.mkdirSync(outDir, { recursive: true })

const png = new PNG({ width: TILE * COLS, height: TILE * ROWS })

drawGrass(png, 0)
drawDirt(png, TILE)
drawRock(png, TILE * 2)

png.pack().pipe(fs.createWriteStream(outFile))
