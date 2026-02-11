import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const ROOT = process.cwd()
const TILE = 16

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.floor(n)))
}

function makePng(w, h, bg = [0, 0, 0, 0]) {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) setPixel(png, x, y, ...bg)
  }
  return png
}

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const i = (png.width * y + x) * 4
  png.data[i + 0] = clampByte(r)
  png.data[i + 1] = clampByte(g)
  png.data[i + 2] = clampByte(b)
  png.data[i + 3] = clampByte(a)
}

function fillRect(png, x, y, w, h, r, g, b, a = 255) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(png, xx, yy, r, g, b, a)
  }
}

function drawCircle(png, cx, cy, r, color) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) setPixel(png, x, y, ...color)
    }
  }
}

function hash2(x, y, seed = 1) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)
  h = (h >>> 0) & 0xffffffff
  return h / 0xffffffff
}

function drawNoiseTile(png, ox, oy, base, accent, seed = 1) {
  fillRect(png, ox, oy, TILE, TILE, ...base)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(ox + x, oy + y, seed)
      if (n > 0.82) setPixel(png, ox + x, oy + y, ...accent)
      else if (n < 0.08) {
        setPixel(png, ox + x, oy + y, base[0] - 12, base[1] - 12, base[2] - 12, 255)
      }
    }
  }
}

function drawBrickTile(png, ox, oy, base, mortar) {
  fillRect(png, ox, oy, TILE, TILE, ...base)
  for (let y = oy; y < oy + TILE; y += 4) fillRect(png, ox, y, TILE, 1, ...mortar)
  for (let row = 0; row < 4; row++) {
    const yy = oy + row * 4
    const shift = row % 2 === 0 ? 0 : 4
    for (let x = ox + shift; x < ox + TILE; x += 8) fillRect(png, x, yy, 1, 4, ...mortar)
  }
}

function tileOrigin(id, cols) {
  return { x: (id % cols) * TILE, y: Math.floor(id / cols) * TILE }
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, PNG.sync.write(png))
}

function generateTileset() {
  const cols = 6
  const rows = 4
  const png = makePng(cols * TILE, rows * TILE)

  // Palette inspired by the provided texture sheet: grass, lava, brick, columns, stone.
  const defs = [
    { kind: 'noise', base: [72, 122, 62], accent: [96, 156, 82], seed: 11 }, // 1 grass
    { kind: 'noise', base: [118, 94, 62], accent: [148, 120, 82], seed: 23 }, // 2 dirt
    { kind: 'noise', base: [84, 88, 96], accent: [112, 116, 124], seed: 31 }, // 3 rough stone
    { kind: 'brick', base: [88, 72, 62], mortar: [60, 50, 44] }, // 4 brown brick
    { kind: 'noise', base: [120, 116, 106], accent: [148, 142, 132], seed: 41 }, // 5 column stone
    { kind: 'noise', base: [58, 100, 132], accent: [86, 130, 166], seed: 53 }, // 6 water
    { kind: 'noise', base: [182, 86, 28], accent: [240, 146, 36], seed: 61 }, // 7 lava
    { kind: 'noise', base: [78, 112, 74], accent: [112, 146, 96], seed: 71 }, // 8 moss
    { kind: 'noise', base: [64, 66, 78], accent: [92, 94, 108], seed: 79 }, // 9 cave floor
    { kind: 'noise', base: [166, 146, 96], accent: [198, 176, 120], seed: 83 }, // 10 sand
    { kind: 'brick', base: [72, 74, 86], mortar: [46, 48, 58] }, // 11 ruin stone brick
    { kind: 'noise', base: [104, 84, 74], accent: [132, 108, 94], seed: 97 }, // 12 cracked earth
    { kind: 'noise', base: [136, 126, 108], accent: [168, 156, 136], seed: 101 }, // 13 pillar cap
    { kind: 'noise', base: [124, 110, 90], accent: [150, 132, 110], seed: 109 }, // 14 pillar shaft
    { kind: 'brick', base: [56, 58, 66], mortar: [34, 36, 44] }, // 15 iron grate-like
    { kind: 'noise', base: [44, 40, 54], accent: [66, 62, 82], seed: 113 }, // 16 obsidian
    { kind: 'noise', base: [74, 104, 82], accent: [96, 132, 106], seed: 127 }, // 17 swamp
    { kind: 'noise', base: [92, 96, 84], accent: [120, 124, 108], seed: 131 }, // 18 pale ruins
    { kind: 'noise', base: [84, 66, 62], accent: [108, 84, 78], seed: 137 }, // 19 ash
    { kind: 'noise', base: [104, 78, 128], accent: [134, 108, 162], seed: 139 }, // 20 crystal
    { kind: 'noise', base: [116, 108, 96], accent: [146, 136, 120], seed: 149 }, // 21 bone floor
    { kind: 'noise', base: [86, 110, 128], accent: [114, 142, 168], seed: 151 }, // 22 frost
    { kind: 'noise', base: [146, 90, 58], accent: [188, 120, 74], seed: 157 }, // 23 ember
    { kind: 'noise', base: [40, 44, 52], accent: [56, 64, 78], seed: 163 }, // 24 void
  ]

  defs.forEach((def, i) => {
    const { x, y } = tileOrigin(i, cols)
    if (def.kind === 'noise') drawNoiseTile(png, x, y, def.base, def.accent, def.seed)
    else drawBrickTile(png, x, y, def.base, def.mortar)
  })

  writePng(path.join(ROOT, 'public/tilesets/overworld.png'), png)
}

function drawEnemySprite(filePath, opts) {
  const { w, h, body, accent, eye, shape } = opts
  const png = makePng(w, h, [0, 0, 0, 0])

  if (shape === 'spider') {
    drawCircle(png, w / 2, h * 0.52, 9, body)
    drawCircle(png, w / 2, h * 0.36, 6, accent)
    for (let i = 0; i < 8; i++) {
      const lx = i < 4 ? 6 : w - 6
      const ly = 10 + (i % 4) * 5
      fillRect(png, Math.min(lx, w / 2), ly, Math.abs(w / 2 - lx), 1, ...accent)
    }
    drawCircle(png, w / 2 - 3, h * 0.34, 1.3, eye)
    drawCircle(png, w / 2 + 3, h * 0.34, 1.3, eye)
  } else if (shape === 'skeleton') {
    drawCircle(png, w / 2, h * 0.26, 7, body)
    fillRect(png, w / 2 - 6, h * 0.36, 12, 12, ...accent)
    fillRect(png, w / 2 - 10, h * 0.42, 4, 10, ...body)
    fillRect(png, w / 2 + 6, h * 0.42, 4, 10, ...body)
    fillRect(png, w / 2 - 6, h * 0.70, 4, 9, ...body)
    fillRect(png, w / 2 + 2, h * 0.70, 4, 9, ...body)
    drawCircle(png, w / 2 - 2.5, h * 0.25, 1.2, eye)
    drawCircle(png, w / 2 + 2.5, h * 0.25, 1.2, eye)
  } else if (shape === 'wisp') {
    drawCircle(png, w / 2, h * 0.5, 10, body)
    drawCircle(png, w / 2, h * 0.36, 6, accent)
    drawCircle(png, w / 2, h * 0.24, 3, eye)
    fillRect(png, w / 2 - 2, h * 0.64, 4, 9, accent[0], accent[1], accent[2], 170)
  } else if (shape === 'imp') {
    drawCircle(png, w / 2, h * 0.5, 9, body)
    fillRect(png, w / 2 - 5, h * 0.35, 10, 9, ...accent)
    fillRect(png, 3, h * 0.42, 7, 6, accent[0], accent[1], accent[2], 210)
    fillRect(png, w - 10, h * 0.42, 7, 6, accent[0], accent[1], accent[2], 210)
    drawCircle(png, w / 2 - 2.5, h * 0.44, 1.1, eye)
    drawCircle(png, w / 2 + 2.5, h * 0.44, 1.1, eye)
  } else if (shape === 'golem') {
    fillRect(png, w / 2 - 9, h * 0.30, 18, 10, ...body)
    fillRect(png, w / 2 - 12, h * 0.42, 24, 14, ...accent)
    fillRect(png, w / 2 - 6, h * 0.66, 12, 10, ...body)
    drawCircle(png, w / 2 - 3.5, h * 0.38, 1.3, eye)
    drawCircle(png, w / 2 + 3.5, h * 0.38, 1.3, eye)
  } else if (shape === 'bone_lord') {
    drawCircle(png, w / 2, h * 0.24, 10, body)
    fillRect(png, w / 2 - 16, h * 0.34, 32, 22, ...accent)
    fillRect(png, w / 2 - 22, h * 0.42, 8, 16, ...body)
    fillRect(png, w / 2 + 14, h * 0.42, 8, 16, ...body)
    fillRect(png, w / 2 - 10, h * 0.66, 8, 14, ...body)
    fillRect(png, w / 2 + 2, h * 0.66, 8, 14, ...body)
    drawCircle(png, w / 2 - 4, h * 0.23, 2, eye)
    drawCircle(png, w / 2 + 4, h * 0.23, 2, eye)
  }

  // Outline pass.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (w * y + x) * 4
      const a = png.data[i + 3]
      if (!a) continue
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const j = (w * (y + dy) + (x + dx)) * 4
        if (png.data[j + 3] === 0) setPixel(png, x + dx, y + dy, 10, 12, 20, 220)
      }
    }
  }

  writePng(path.join(ROOT, filePath), png)
}

function writeEnemySprites() {
  drawEnemySprite('public/sprites/spider.png', {
    w: 36,
    h: 28,
    body: [38, 40, 52, 255],
    accent: [64, 66, 82, 255],
    eye: [236, 86, 74, 255],
    shape: 'spider',
  })
  drawEnemySprite('public/sprites/skeleton.png', {
    w: 40,
    h: 34,
    body: [218, 216, 198, 255],
    accent: [146, 136, 120, 255],
    eye: [48, 52, 66, 255],
    shape: 'skeleton',
  })
  drawEnemySprite('public/sprites/wisp.png', {
    w: 34,
    h: 34,
    body: [80, 180, 222, 220],
    accent: [138, 230, 255, 210],
    eye: [250, 255, 255, 220],
    shape: 'wisp',
  })
  drawEnemySprite('public/sprites/imp.png', {
    w: 38,
    h: 34,
    body: [130, 52, 58, 255],
    accent: [186, 80, 72, 255],
    eye: [248, 210, 110, 255],
    shape: 'imp',
  })
  drawEnemySprite('public/sprites/golem.png', {
    w: 44,
    h: 38,
    body: [98, 88, 84, 255],
    accent: [124, 108, 96, 255],
    eye: [110, 220, 176, 255],
    shape: 'golem',
  })
  drawEnemySprite('public/sprites/bone_lord.png', {
    w: 64,
    h: 64,
    body: [182, 178, 164, 255],
    accent: [84, 64, 96, 255],
    eye: [124, 230, 255, 255],
    shape: 'bone_lord',
  })
}

function propVal(name, value, type) {
  return { name, type, value }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function getLayer(map, name) {
  const layer = map.layers.find((l) => l.name === name)
  if (!layer) throw new Error(`layer not found: ${name}`)
  return layer
}

function resizeMap(baseMap, newW, newH, fillGroundFn) {
  const map = clone(baseMap)
  const oldW = map.width
  const oldH = map.height
  map.width = newW
  map.height = newH

  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer') continue
    const old = layer.data.slice()
    const next = new Array(newW * newH).fill(0)

    for (let y = 0; y < newH; y++) {
      for (let x = 0; x < newW; x++) {
        const ni = y * newW + x
        if (x < oldW && y < oldH) {
          next[ni] = old[y * oldW + x]
        } else if (layer.name === 'Ground') {
          next[ni] = fillGroundFn(x, y)
        } else {
          next[ni] = 0
        }
      }
    }

    layer.width = newW
    layer.height = newH
    layer.data = next
  }

  const collisions = getLayer(map, 'Collision').data

  // World bounds wall.
  for (let x = 0; x < newW; x++) {
    collisions[0 * newW + x] = 3
    collisions[(newH - 1) * newW + x] = 3
  }
  for (let y = 0; y < newH; y++) {
    collisions[y * newW + 0] = 3
    collisions[y * newW + (newW - 1)] = 3
  }

  return map
}

function carveRect(layerData, w, x0, y0, x1, y1, tile) {
  const xa = Math.max(0, Math.min(x0, x1))
  const xb = Math.max(0, Math.max(x0, x1))
  const ya = Math.max(0, Math.min(y0, y1))
  const yb = Math.max(0, Math.max(y0, y1))
  const h = Math.floor(layerData.length / w)
  for (let y = ya; y <= Math.min(yb, h - 1); y++) {
    for (let x = xa; x <= Math.min(xb, w - 1); x++) {
      layerData[y * w + x] = tile
    }
  }
}

function addObject(layer, idCounter, obj) {
  const next = { id: idCounter.value++, rotation: 0, visible: true, ...obj }
  layer.objects.push(next)
  return next
}

function sortedObjects(layer) {
  layer.objects.sort((a, b) => a.id - b.id)
}

function removeNamedObjects(layer, names) {
  const drop = new Set(names)
  layer.objects = (layer.objects || []).filter((o) => !drop.has(o.name))
}

function updateMapMetadata(map) {
  let maxObj = 0
  let maxLayer = 0
  for (const layer of map.layers) {
    if (typeof layer.id === 'number') maxLayer = Math.max(maxLayer, layer.id)
    if (layer.type === 'objectgroup') {
      for (const o of layer.objects || []) {
        if (typeof o.id === 'number') maxObj = Math.max(maxObj, o.id)
      }
    }
  }
  map.nextlayerid = Math.max(map.nextlayerid || 0, maxLayer + 1)
  map.nextobjectid = Math.max(map.nextobjectid || 0, maxObj + 1)

  map.tilesets = [
    {
      firstgid: 1,
      name: 'overworld',
      tilewidth: 16,
      tileheight: 16,
      tilecount: 24,
      columns: 6,
      image: '../tilesets/overworld.png',
      imagewidth: 96,
      imageheight: 64,
      margin: 0,
      spacing: 0,
      tiles: [
        { id: 2, properties: [propVal('collides', true, 'bool')] },
        { id: 3, properties: [propVal('collides', true, 'bool')] },
        { id: 4, properties: [propVal('collides', true, 'bool')] },
        { id: 15, properties: [propVal('collides', true, 'bool')] },
      ],
    },
  ]
}

function buildOverworld(base) {
  const map = resizeMap(base, 140, 90, (x, y) => {
    const n = hash2(x, y, 301)
    if (n > 0.88) return 8
    if (n > 0.52) return 1
    return 2
  })

  const ground = getLayer(map, 'Ground').data
  const collision = getLayer(map, 'Collision').data
  const w = map.width

  // Marsh biome in east.
  carveRect(ground, w, 102, 8, 138, 34, 17)
  carveRect(ground, w, 108, 12, 134, 30, 6)
  carveRect(collision, w, 108, 12, 134, 30, 3)
  carveRect(ground, w, 114, 16, 128, 26, 16)
  carveRect(collision, w, 114, 16, 128, 26, 0)

  // Ruins biome in southeast.
  carveRect(ground, w, 104, 48, 138, 88, 11)
  carveRect(ground, w, 110, 54, 134, 84, 18)
  carveRect(collision, w, 110, 54, 134, 84, 0)
  for (let y = 56; y <= 82; y += 6) {
    carveRect(collision, w, 112, y, 132, y, 4)
    carveRect(collision, w, 112, y + 1, 112, y + 4, 4)
    carveRect(collision, w, 132, y + 1, 132, y + 4, 4)
  }

  const objects = getLayer(map, 'Objects')
  const enemies = getLayer(map, 'Enemies')
  removeNamedObjects(objects, [
    'from_marsh',
    'warp_to_marsh',
    'warp_to_marsh_near',
    'from_ruins',
    'warp_to_ruins',
    'warp_to_ruins_near',
    'pickup_helmet_storm',
    'pickup_chest_venom',
    'pickup_boots_rift',
  ])
  removeNamedObjects(enemies, ['spider_marsh_1', 'wisp_marsh_1', 'golem_ruins_1', 'imp_ruins_1'])
  const idCounter = { value: map.nextobjectid || 100 }

  addObject(objects, idCounter, {
    name: 'from_marsh',
    type: 'spawn',
    x: 1808,
    y: 352,
    width: 0,
    height: 0,
  })
  addObject(objects, idCounter, {
    name: 'warp_to_marsh',
    type: 'warp',
    x: 1840,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'marsh', 'string'), propVal('toSpawn', 'from_overworld', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_marsh_near',
    type: 'warp',
    x: 544,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'marsh', 'string'), propVal('toSpawn', 'from_overworld', 'string')],
  })

  addObject(objects, idCounter, {
    name: 'from_ruins',
    type: 'spawn',
    x: 2000,
    y: 864,
    width: 0,
    height: 0,
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins',
    type: 'warp',
    x: 2032,
    y: 832,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_overworld', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins_near',
    type: 'warp',
    x: 640,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_overworld', 'string')],
  })

  addObject(objects, idCounter, {
    name: 'pickup_helmet_storm',
    type: 'pickup',
    x: 1888,
    y: 352,
    width: 0,
    height: 0,
    properties: [propVal('itemId', 'helmet_storm', 'string'), propVal('amount', 1, 'int')],
  })
  addObject(objects, idCounter, {
    name: 'pickup_chest_venom',
    type: 'pickup',
    x: 2064,
    y: 880,
    width: 0,
    height: 0,
    properties: [propVal('itemId', 'chest_venom', 'string'), propVal('amount', 1, 'int')],
  })
  addObject(objects, idCounter, {
    name: 'pickup_boots_rift',
    type: 'pickup',
    x: 2080,
    y: 944,
    width: 0,
    height: 0,
    properties: [propVal('itemId', 'boots_rift', 'string'), propVal('amount', 1, 'int')],
  })

  addObject(enemies, idCounter, {
    name: 'spider_marsh_1',
    type: 'enemy',
    x: 1760,
    y: 288,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'spider', 'string'), propVal('hp', 4, 'int')],
  })
  addObject(enemies, idCounter, {
    name: 'wisp_marsh_1',
    type: 'enemy',
    x: 1920,
    y: 448,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'wisp', 'string'), propVal('aggroRadius', 340, 'int')],
  })
  addObject(enemies, idCounter, {
    name: 'golem_ruins_1',
    type: 'enemy',
    x: 2064,
    y: 1008,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'golem', 'string'), propVal('hp', 10, 'int')],
  })
  addObject(enemies, idCounter, {
    name: 'imp_ruins_1',
    type: 'enemy',
    x: 2176,
    y: 960,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'imp', 'string'), propVal('speed', 140, 'int')],
  })

  sortedObjects(objects)
  sortedObjects(enemies)
  updateMapMetadata(map)
  return map
}

function buildCave(base) {
  const map = resizeMap(base, 140, 90, (x, y) => {
    const n = hash2(x, y, 401)
    if (n > 0.86) return 12
    if (n > 0.5) return 9
    return 2
  })

  const ground = getLayer(map, 'Ground').data
  const collision = getLayer(map, 'Collision').data
  const w = map.width

  // Deep chamber extension for citadel gate.
  carveRect(ground, w, 104, 52, 138, 88, 23)
  carveRect(ground, w, 112, 60, 134, 84, 20)
  carveRect(collision, w, 112, 60, 134, 84, 0)
  carveRect(collision, w, 114, 62, 132, 62, 4)
  carveRect(collision, w, 114, 82, 132, 82, 4)

  const objects = getLayer(map, 'Objects')
  const enemies = getLayer(map, 'Enemies')
  removeNamedObjects(objects, ['from_citadel', 'warp_to_citadel', 'warp_to_citadel_near'])
  removeNamedObjects(enemies, ['skeleton_cave_1', 'spider_cave_1'])
  const idCounter = { value: map.nextobjectid || 100 }

  addObject(objects, idCounter, {
    name: 'from_citadel',
    type: 'spawn',
    x: 1776,
    y: 1088,
    width: 0,
    height: 0,
  })
  addObject(objects, idCounter, {
    name: 'warp_to_citadel',
    type: 'warp',
    x: 1792,
    y: 1024,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'citadel', 'string'), propVal('toSpawn', 'from_cave', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_citadel_near',
    type: 'warp',
    x: 384,
    y: 224,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'citadel', 'string'), propVal('toSpawn', 'from_cave', 'string')],
  })

  addObject(enemies, idCounter, {
    name: 'skeleton_cave_1',
    type: 'enemy',
    x: 1712,
    y: 992,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'skeleton', 'string')],
  })
  addObject(enemies, idCounter, {
    name: 'spider_cave_1',
    type: 'enemy',
    x: 1856,
    y: 944,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'spider', 'string')],
  })

  sortedObjects(objects)
  sortedObjects(enemies)
  updateMapMetadata(map)
  return map
}

function makeBlankMap({ width, height }) {
  const ground = new Array(width * height).fill(1)
  const collision = new Array(width * height).fill(0)

  for (let x = 0; x < width; x++) {
    collision[x] = 3
    collision[(height - 1) * width + x] = 3
  }
  for (let y = 0; y < height; y++) {
    collision[y * width] = 3
    collision[y * width + (width - 1)] = 3
  }

  return {
    compressionlevel: -1,
    height,
    width,
    infinite: false,
    nextlayerid: 5,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    layers: [
      {
        id: 1,
        name: 'Ground',
        type: 'tilelayer',
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        data: ground,
      },
      {
        id: 2,
        name: 'Collision',
        type: 'tilelayer',
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        data: collision,
      },
      {
        id: 3,
        name: 'Objects',
        type: 'objectgroup',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: [],
      },
      {
        id: 4,
        name: 'Enemies',
        type: 'objectgroup',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: [],
      },
    ],
    tilesets: [],
  }
}

function fillGroundWithTheme(map, seed, palette) {
  const ground = getLayer(map, 'Ground').data
  const w = map.width
  const h = map.height
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash2(x, y, seed)
      if (n > 0.84) ground[y * w + x] = palette[2]
      else if (n > 0.42) ground[y * w + x] = palette[0]
      else ground[y * w + x] = palette[1]
    }
  }
}

function buildMarsh() {
  const map = makeBlankMap({ width: 120, height: 80 })
  fillGroundWithTheme(map, 501, [17, 8, 6])

  const ground = getLayer(map, 'Ground').data
  const collision = getLayer(map, 'Collision').data
  const w = map.width
  carveRect(ground, w, 18, 16, 84, 56, 6)
  carveRect(collision, w, 18, 16, 84, 56, 3)
  carveRect(ground, w, 28, 24, 74, 48, 17)
  carveRect(collision, w, 28, 24, 74, 48, 0)

  const objects = getLayer(map, 'Objects')
  const enemies = getLayer(map, 'Enemies')
  const idCounter = { value: 1 }

  addObject(objects, idCounter, { name: 'player_spawn', type: 'spawn', x: 480, y: 432, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_overworld', type: 'spawn', x: 480, y: 432, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_ruins', type: 'spawn', x: 1600, y: 352, width: 0, height: 0 })
  addObject(objects, idCounter, {
    name: 'warp_to_overworld',
    type: 'warp',
    x: 288,
    y: 288,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'overworld', 'string'), propVal('toSpawn', 'from_marsh', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_overworld_near',
    type: 'warp',
    x: 512,
    y: 432,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'overworld', 'string'), propVal('toSpawn', 'from_marsh', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins',
    type: 'warp',
    x: 1568,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_marsh', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins_near',
    type: 'warp',
    x: 576,
    y: 432,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_marsh', 'string')],
  })

  addObject(enemies, idCounter, { name: 'spider_1', type: 'enemy', x: 640, y: 448, width: 0, height: 0, properties: [propVal('kind', 'spider', 'string')] })
  addObject(enemies, idCounter, { name: 'spider_2', type: 'enemy', x: 896, y: 512, width: 0, height: 0, properties: [propVal('kind', 'spider', 'string')] })
  addObject(enemies, idCounter, {
    name: 'wisp_1',
    type: 'enemy',
    x: 1152,
    y: 608,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'wisp', 'string'), propVal('aggroRadius', 340, 'int')],
  })
  addObject(enemies, idCounter, { name: 'imp_1', type: 'enemy', x: 1312, y: 704, width: 0, height: 0, properties: [propVal('kind', 'imp', 'string')] })

  updateMapMetadata(map)
  return map
}

function buildRuins() {
  const map = makeBlankMap({ width: 128, height: 88 })
  fillGroundWithTheme(map, 601, [11, 18, 2])

  const ground = getLayer(map, 'Ground').data
  const collision = getLayer(map, 'Collision').data
  const w = map.width

  for (let y = 16; y <= 72; y += 8) {
    carveRect(collision, w, 20, y, 108, y, 4)
    carveRect(collision, w, 20, y, 20, Math.min(86, y + 3), 4)
    carveRect(collision, w, 108, y, 108, Math.min(86, y + 3), 4)
  }
  carveRect(ground, w, 24, 20, 104, 68, 13)

  const objects = getLayer(map, 'Objects')
  const enemies = getLayer(map, 'Enemies')
  const idCounter = { value: 1 }

  addObject(objects, idCounter, { name: 'player_spawn', type: 'spawn', x: 320, y: 320, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_overworld', type: 'spawn', x: 320, y: 320, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_marsh', type: 'spawn', x: 1600, y: 352, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_citadel', type: 'spawn', x: 1824, y: 1056, width: 0, height: 0 })
  addObject(objects, idCounter, {
    name: 'warp_to_overworld',
    type: 'warp',
    x: 288,
    y: 288,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'overworld', 'string'), propVal('toSpawn', 'from_ruins', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_marsh',
    type: 'warp',
    x: 1568,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'marsh', 'string'), propVal('toSpawn', 'from_ruins', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_citadel',
    type: 'warp',
    x: 1792,
    y: 1024,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'citadel', 'string'), propVal('toSpawn', 'from_ruins', 'string')],
  })

  addObject(enemies, idCounter, { name: 'skeleton_1', type: 'enemy', x: 704, y: 576, width: 0, height: 0, properties: [propVal('kind', 'skeleton', 'string')] })
  addObject(enemies, idCounter, { name: 'skeleton_2', type: 'enemy', x: 848, y: 640, width: 0, height: 0, properties: [propVal('kind', 'skeleton', 'string')] })
  addObject(enemies, idCounter, { name: 'golem_1', type: 'enemy', x: 1056, y: 736, width: 0, height: 0, properties: [propVal('kind', 'golem', 'string')] })
  addObject(enemies, idCounter, { name: 'wisp_1', type: 'enemy', x: 1184, y: 512, width: 0, height: 0, properties: [propVal('kind', 'wisp', 'string')] })

  updateMapMetadata(map)
  return map
}

function buildCitadel() {
  const map = makeBlankMap({ width: 96, height: 96 })
  fillGroundWithTheme(map, 701, [23, 16, 20])

  const ground = getLayer(map, 'Ground').data
  const collision = getLayer(map, 'Collision').data
  const w = map.width
  carveRect(ground, w, 18, 18, 78, 78, 15)
  carveRect(collision, w, 18, 18, 78, 18, 4)
  carveRect(collision, w, 18, 78, 78, 78, 4)
  carveRect(collision, w, 18, 18, 18, 78, 4)
  carveRect(collision, w, 78, 18, 78, 78, 4)
  carveRect(ground, w, 24, 24, 72, 72, 19)

  const objects = getLayer(map, 'Objects')
  const enemies = getLayer(map, 'Enemies')
  const idCounter = { value: 1 }

  addObject(objects, idCounter, { name: 'player_spawn', type: 'spawn', x: 320, y: 320, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_cave', type: 'spawn', x: 320, y: 320, width: 0, height: 0 })
  addObject(objects, idCounter, { name: 'from_ruins', type: 'spawn', x: 352, y: 320, width: 0, height: 0 })
  addObject(objects, idCounter, {
    name: 'warp_to_cave',
    type: 'warp',
    x: 288,
    y: 288,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'cave', 'string'), propVal('toSpawn', 'from_citadel', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_cave_near',
    type: 'warp',
    x: 448,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'cave', 'string'), propVal('toSpawn', 'from_citadel', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins',
    type: 'warp',
    x: 352,
    y: 288,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_citadel', 'string')],
  })
  addObject(objects, idCounter, {
    name: 'warp_to_ruins_near',
    type: 'warp',
    x: 512,
    y: 320,
    width: 64,
    height: 64,
    properties: [propVal('toMap', 'ruins', 'string'), propVal('toSpawn', 'from_citadel', 'string')],
  })

  addObject(enemies, idCounter, { name: 'imp_guard_1', type: 'enemy', x: 960, y: 960, width: 0, height: 0, properties: [propVal('kind', 'imp', 'string')] })
  addObject(enemies, idCounter, { name: 'wisp_guard_1', type: 'enemy', x: 1120, y: 960, width: 0, height: 0, properties: [propVal('kind', 'wisp', 'string')] })
  addObject(enemies, idCounter, {
    name: 'bone_lord_boss',
    type: 'enemy',
    x: 1248,
    y: 1184,
    width: 0,
    height: 0,
    properties: [propVal('kind', 'bone_lord', 'string'), propVal('hp', 36, 'int'), propVal('aggroRadius', 460, 'int')],
  })

  updateMapMetadata(map)
  return map
}

function writeMap(fileName, map) {
  updateMapMetadata(map)
  fs.writeFileSync(path.join(ROOT, 'public/maps', fileName), JSON.stringify(map, null, 2) + '\n', 'utf8')
}

function main() {
  generateTileset()
  writeEnemySprites()

  const overworldBase = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/maps/overworld.json'), 'utf8'))
  const caveBase = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/maps/cave.json'), 'utf8'))

  const overworld = buildOverworld(overworldBase)
  const cave = buildCave(caveBase)
  const marsh = buildMarsh()
  const ruins = buildRuins()
  const citadel = buildCitadel()

  writeMap('overworld.json', overworld)
  writeMap('cave.json', cave)
  writeMap('marsh.json', marsh)
  writeMap('ruins.json', ruins)
  writeMap('citadel.json', citadel)

  console.log('Generated tileset, enemy sprites, and maps.')
}

main()
