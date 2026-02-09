import http from 'node:http'
import net from 'node:net'
import { chromium } from 'playwright'
import { createServer } from 'vite'

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : null
      server.close(() => resolve(port))
    })
  })
}

const PORT = process.env.PORT ? Number(process.env.PORT) : await getFreePort()
const URL = `http://127.0.0.1:${PORT}/`

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForServerReady(timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(URL, (res) => {
          res.resume()
          if ((res.statusCode ?? 0) >= 200) resolve()
          else reject(new Error(`bad status: ${res.statusCode}`))
        })
        req.on('error', reject)
        req.setTimeout(2000, () => req.destroy(new Error('timeout')))
      })
      return
    } catch {
      await wait(250)
    }
  }
  throw new Error(`Dev server did not become ready at ${URL} within ${timeoutMs}ms`)
}

async function getPlayerPos(page) {
  return await page.evaluate(() => {
    const p = globalThis.__dbg?.player
    return p ? { x: p.x, y: p.y } : null
  })
}

async function getMapKey(page) {
  return await page.evaluate(() => globalThis.__dbg?.mapKey ?? null)
}

async function getDepths(page) {
  return await page.evaluate(() => globalThis.__dbg?.depths ?? null)
}

async function getEnemies(page) {
  return await page.evaluate(() => (typeof globalThis.__dbg?.getEnemies === 'function' ? globalThis.__dbg.getEnemies() : null))
}

async function getEnemyDebug(page) {
  return await page.evaluate(() => ({ enemyCount: globalThis.__dbg?.enemyCount ?? null, enemyActives: globalThis.__dbg?.enemyActives ?? null }))
}

async function getLastAttack(page) {
  return await page.evaluate(() => (typeof globalThis.__dbg?.getLastAttack === 'function' ? globalThis.__dbg.getLastAttack() : globalThis.__dbg?.lastAttack ?? null))
}

async function getPlayerHp(page) {
  return await page.evaluate(() =>
    typeof globalThis.__dbg?.getPlayerHp === 'function' ? globalThis.__dbg.getPlayerHp() : globalThis.__dbg?.playerHp ?? null,
  )
}

async function getPlayerMaxHp(page) {
  return await page.evaluate(() =>
    typeof globalThis.__dbg?.getPlayerMaxHp === 'function' ? globalThis.__dbg.getPlayerMaxHp() : globalThis.__dbg?.playerMaxHp ?? null,
  )
}

async function getGameState(page) {
  return await page.evaluate(() => (typeof globalThis.__dbg?.getGameState === 'function' ? globalThis.__dbg.getGameState() : null))
}

async function togglePause(page) {
  await page.evaluate(() => globalThis.__dbg?.togglePause?.())
}

async function respawn(page) {
  await page.evaluate(() => globalThis.__dbg?.respawn?.())
}

async function setPlayerHp(page, hp) {
  await page.evaluate(({ hp }) => globalThis.__dbg?.setPlayerHp?.(hp), { hp })
}

async function getInventory(page) {
  return await page.evaluate(() => (typeof globalThis.__dbg?.getInventory === 'function' ? globalThis.__dbg.getInventory() : null))
}

async function getDialogue(page) {
  return await page.evaluate(() => (typeof globalThis.__dbg?.getDialogue === 'function' ? globalThis.__dbg.getDialogue() : null))
}

async function tryInteract(page) {
  await page.evaluate(() => globalThis.__dbg?.tryInteract?.())
}

async function equipWeapon(page, weaponId) {
  await page.evaluate(({ weaponId }) => globalThis.__dbg?.equipWeapon?.(weaponId), { weaponId })
}

async function pushIntoEnemyAndMeasureDrift(page, enemyKind, enemyX, enemyY) {
  // Freeze the enemy so any measured drift is due to player pushing, not AI wander.
  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    target.__testPrevSpeed = target.stats?.moveSpeed
    if (target.stats) target.stats.moveSpeed = 0
    if (typeof target.setVelocity === 'function') target.setVelocity(0, 0)
  }, { kind: enemyKind })

  // Push right into the enemy for a bit; enemy should not get shoved across the map.
  await teleportPlayer(page, enemyX - 90, enemyY)
  await page.waitForTimeout(120)
  await page.keyboard.down('d')
  await page.waitForTimeout(650)
  await page.keyboard.up('d')
  await page.waitForTimeout(120)

  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    const prev = target.__testPrevSpeed
    if (typeof prev === 'number' && target.stats) target.stats.moveSpeed = prev
    delete target.__testPrevSpeed
  }, { kind: enemyKind })

  const enemies = await getEnemies(page)
  if (!Array.isArray(enemies) || enemies.length < 1) return null
  const e = enemies.find((e) => e.kind === enemyKind) ?? enemies[0]
  return { x: e.x, y: e.y }
}

async function slashEnemyAndGetHpDelta(page, kind) {
  const nowEnemies = await getEnemies(page)
  const nowEnemy = Array.isArray(nowEnemies) ? nowEnemies.find((e) => e.kind === kind) : null
  if (!nowEnemy) return { hp0: null, hp1: null, before: nowEnemies, after: nowEnemies, atk0: null, atk1: null }

  const tx = typeof nowEnemy.bx === 'number' ? nowEnemy.bx : nowEnemy.x
  const ty = typeof nowEnemy.by === 'number' ? nowEnemy.by : nowEnemy.y

  // Freeze the target briefly so fast enemies (like bats) don't dodge the one-frame slash hitbox.
  // Also freeze *other* enemies to avoid accidental collateral hits causing flakes (e.g. slime wandering into a bat slash).
  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    for (const e of kids) {
      if (!e?.stats) continue
      // Record original speed once per enemy so restore works even if multiple tests touch the same enemy.
      if (typeof e.__testPrevSpeed !== 'number') e.__testPrevSpeed = e.stats.moveSpeed
      e.stats.moveSpeed = 0
      if (typeof e.setVelocity === 'function') e.setVelocity(0, 0)
    }
  }, { kind })

  await teleportPlayer(page, tx - 42, ty)
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    const p = globalThis.__dbg?.player
    if (!p) return
    if (typeof globalThis.__dbg?.setFacing === 'function') globalThis.__dbg.setFacing('right')
    if (typeof p.setVelocity === 'function') p.setVelocity(0, 0)
  })
  await page.waitForTimeout(40)

  const before = await getEnemies(page)
  const beforeEnemy = Array.isArray(before) ? before.find((e) => e.kind === kind) : null
  const hp0 = beforeEnemy?.hp

  const atk0 = await getLastAttack(page)
  await page.evaluate(() => {
    globalThis.__dbg?.tryAttack?.()
  })
  // Wait long enough for the strike (windup) to occur even for slower weapons.
  await page.waitForTimeout(140)
  const atk1 = await getLastAttack(page)
  // Wait long enough for the full weapon cooldown window to pass so subsequent tests
  // don't accidentally enqueue an attack while still locked (greatsword total is ~390ms).
  await page.waitForTimeout(360)

  const after = await getEnemies(page)
  const afterEnemy = Array.isArray(after) ? after.find((e) => e.kind === kind) : null
  const hp1 = afterEnemy?.hp

  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    for (const e of kids) {
      if (!e?.stats) continue
      const prev = e.__testPrevSpeed
      if (typeof prev === 'number') e.stats.moveSpeed = prev
      delete e.__testPrevSpeed
    }
  }, { kind })

  return { hp0, hp1, before, after, atk0, atk1 }
}

async function killEnemy(page, kind, maxSwings = 10) {
  // Freeze the target so the kill is deterministic.
  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    target.__testPrevSpeed = target.stats?.moveSpeed
    if (target.stats) target.stats.moveSpeed = 0
    if (typeof target.setVelocity === 'function') target.setVelocity(0, 0)
  }, { kind })

  let killed = false
  for (let i = 0; i < maxSwings; i++) {
    const enemies = await getEnemies(page)
    const e = Array.isArray(enemies) ? enemies.find((x) => x.kind === kind) : null
    if (!e) {
      killed = true
      break
    }

    const tx = typeof e.bx === 'number' ? e.bx : e.x
    const ty = typeof e.by === 'number' ? e.by : e.y

    await teleportPlayer(page, tx - 42, ty)
    await page.waitForTimeout(80)
    await page.evaluate(() => {
      const p = globalThis.__dbg?.player
      if (!p) return
      if (typeof globalThis.__dbg?.setFacing === 'function') globalThis.__dbg.setFacing('right')
      if (typeof p.setVelocity === 'function') p.setVelocity(0, 0)
    })
    await page.waitForTimeout(40)
    await page.evaluate(() => globalThis.__dbg?.tryAttack?.())
    // Give enough time for attack lock + enemy invuln.
    await page.waitForTimeout(330)
  }

  await page.evaluate(({ kind }) => {
    const scene = globalThis.__dbg?.player?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const target = kids.find((e) => e?.kind === kind)
    if (!target) return
    const prev = target.__testPrevSpeed
    if (typeof prev === 'number' && target.stats) target.stats.moveSpeed = prev
    delete target.__testPrevSpeed
  }, { kind })

  if (killed) return true

  const enemiesEnd = await getEnemies(page)
  const stillThere = Array.isArray(enemiesEnd) ? enemiesEnd.some((x) => x.kind === kind) : false
  return !stillThere
}

async function waitForEnemyMove(page, kind, minDist, timeoutMs = 2500) {
  const start = Date.now()
  const enemies0 = await getEnemies(page)
  const e0 = Array.isArray(enemies0) ? enemies0.find((e) => e.kind === kind) : null
  if (!e0) throw new Error(`enemy kind=${kind} not found; mapKey=${await getMapKey(page)}; enemies0=${JSON.stringify(enemies0)}`)
  const x0 = e0.x
  const y0 = e0.y

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(200)
    const enemies1 = await getEnemies(page)
    const e1 = Array.isArray(enemies1) ? enemies1.find((e) => e.kind === kind) : null
    if (!e1) return
    const d = Math.hypot(e1.x - x0, e1.y - y0)
    if (d >= minDist) return
  }

  throw new Error(`enemy kind=${kind} did not move >=${minDist}px within ${timeoutMs}ms`)
}

async function waitForMapKey(page, expected, timeoutMs = 2500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const key = await getMapKey(page)
    if (key === expected) return
    await page.waitForTimeout(100)
  }
  throw new Error(`timed out waiting for mapKey=${expected}; last=${await getMapKey(page)}`)
}

async function teleportPlayer(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const p = globalThis.__dbg?.player
      if (!p) return
      const body = p.body
      if (body && typeof body.reset === 'function') body.reset(x, y)
      else p.setPosition(x, y)
    },
    { x, y },
  )
}

async function teleportEnemy(page, kind, x, y) {
  await page.evaluate(
    ({ kind, x, y }) => {
      const scene = globalThis.__dbg?.player?.scene
      const group = scene?.mapRuntime?.enemies
      const kids = group?.getChildren?.() ?? []
      const e = kids.find((k) => k?.active && k?.kind === kind)
      if (!e) return
      const body = e.body
      if (body && typeof body.reset === 'function') body.reset(x, y)
      else if (typeof e.setPosition === 'function') e.setPosition(x, y)
      if (typeof e.setVelocity === 'function') e.setVelocity(0, 0)
    },
    { kind, x, y },
  )
}

async function getEnemiesInBlockedTiles(page) {
  return await page.evaluate(() => {
    const scene = globalThis.__dbg?.player?.scene
    const rt = scene?.mapRuntime
    const group = rt?.enemies
    const kids = group?.getChildren?.() ?? []
    const out = []

    for (const e of kids) {
      if (!e?.active) continue
      const body = e.body
      const cx = body?.center?.x ?? e.x
      const cy = body?.center?.y ?? e.y
      const blocked = typeof rt?.isWorldBlocked === 'function' ? rt.isWorldBlocked(cx, cy) : false
      if (blocked) out.push({ kind: e?.kind ?? null, x: e.x, y: e.y, cx, cy })
    }

    return out
  })
}

async function findWallTileSample(page) {
  // Find a blocked tile run (wall segment) that has open tiles immediately to its left and right.
  // This makes tests robust against map edits and tile-size changes.
  return await page.evaluate(() => {
    const scene = globalThis.__dbg?.player?.scene
    const rt = scene?.mapRuntime
    const map = rt?.state?.map
    const w = map?.width ?? 0
    const h = map?.height ?? 0
    const tile = map?.tileWidth ?? 0
    if (!(w > 0 && h > 0 && tile > 0)) return null

    // Avoid edges so follow-up tests can offset around the wall without leaving the world bounds.
    const margin = 6
    const isBlocked = (tx, ty) => (typeof rt?.isTileBlocked === 'function' ? rt.isTileBlocked(tx, ty) : false)

    for (let ty = margin; ty < h - margin; ty++) {
      let tx = margin
      while (tx < w - margin) {
        if (!isBlocked(tx, ty)) {
          tx++
          continue
        }

        const startTx = tx
        while (tx < w - margin && isBlocked(tx, ty)) tx++
        const endTx = tx - 1

        const openL = !isBlocked(startTx - 1, ty)
        const openR = !isBlocked(endTx + 1, ty)
        if (!openL || !openR) continue

        const wallLeft = startTx * tile
        const wallRight = (endTx + 1) * tile
        const y = ty * tile + tile / 2
        return { startTx, endTx, ty, tile, wallLeft, wallRight, y }
      }
    }

    return null
  })
}

async function findOpenTileSample(page, radius = 2) {
  return await page.evaluate(
    ({ radius }) => {
      const scene = globalThis.__dbg?.player?.scene
      const rt = scene?.mapRuntime
      const map = rt?.state?.map
      const w = map?.width ?? 0
      const h = map?.height ?? 0
      const tile = map?.tileWidth ?? 0
      if (!(w > 0 && h > 0 && tile > 0)) return null

      const isBlocked = (tx, ty) => (typeof rt?.isTileBlocked === 'function' ? rt.isTileBlocked(tx, ty) : true)

      for (let ty = radius; ty < h - radius; ty++) {
        for (let tx = radius; tx < w - radius; tx++) {
          let ok = true
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (isBlocked(tx + dx, ty + dy)) {
                ok = false
                break
              }
            }
            if (!ok) break
          }
          if (!ok) continue
          const x = tx * tile + tile / 2
          const y = ty * tile + tile / 2
          return { tx, ty, x, y, tile }
        }
      }

      return null
    },
    { radius },
  )
}

async function isPlayerOverlappingEnemy(page, kind) {
  return await page.evaluate(({ kind }) => {
    const p = globalThis.__dbg?.player
    const pb = p?.body
    const scene = p?.scene
    const group = scene?.mapRuntime?.enemies
    const kids = group?.getChildren?.() ?? []
    const e = kids.find((k) => k?.active && k?.kind === kind)
    const eb = e?.body
    if (!pb || !eb) return false
    const pad = 2
    const pLeft = pb.left - pad
    const pRight = pb.right + pad
    const pTop = pb.top - pad
    const pBottom = pb.bottom + pad
    const eLeft = eb.left - pad
    const eRight = eb.right + pad
    const eTop = eb.top - pad
    const eBottom = eb.bottom + pad
    return pLeft <= eRight && pRight >= eLeft && pTop <= eBottom && pBottom >= eTop
  }, { kind })
}

const server = await createServer({
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  clearScreen: false,
  logLevel: 'warn',
})

try {
  await server.listen()
  await waitForServerReady()

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err?.stack ?? err}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 10000 })
  await page.click('canvas')
  await page.waitForTimeout(500)

  // Start at the main menu. Use "N" to force a new game (deterministic).
  await page.waitForFunction(() => typeof globalThis.__dbg?.getGameState === 'function', null, { timeout: 10000 })
  await page.keyboard.down('n')
  await page.waitForTimeout(80)
  await page.keyboard.up('n')
  await waitForMapKey(page, 'overworld', 5000)

  const start = await getPlayerPos(page)
  if (!start) errors.push('debug player not found on window.__dbg.player')

  // Teleport away from the starter rocks so movement checks are reliable.
  await teleportPlayer(page, 100, 900)
  await page.waitForTimeout(50)

  const startRight = await getPlayerPos(page)
  if (!startRight) errors.push('could not read player pos after teleport (right)')

  // Move right for 5 seconds. If world bounds were still 960px wide,
  // we would get stuck around x ~= 960.
  await page.keyboard.down('d')
  await page.waitForTimeout(5000)
  await page.keyboard.up('d')

  const afterRight = await getPlayerPos(page)
  if (!afterRight) errors.push('could not read player pos after moving right')

  // Teleport to a clear area near the top-left, then move down.
  await teleportPlayer(page, 100, 100)
  await page.waitForTimeout(50)

  const startDown = await getPlayerPos(page)
  if (!startDown) errors.push('could not read player pos after teleport (down)')

  // Move down for 4 seconds. If world bounds were still 600px tall,
  // we would get stuck around y ~= 600.
  await page.keyboard.down('s')
  await page.waitForTimeout(4000)
  await page.keyboard.up('s')

  const afterDown = await getPlayerPos(page)
  if (!afterDown) errors.push('could not read player pos after moving down')

  // Assertions.
  if (startRight && afterRight && afterRight.x <= startRight.x + 200)
    errors.push(`expected to move right; startRight.x=${startRight.x}, afterRight.x=${afterRight.x}`)
  if (afterRight && afterRight.x <= 1100) errors.push(`expected to be past x=1100 (no invisible wall at 960); afterRight.x=${afterRight.x}`)
  if (startDown && afterDown && afterDown.y <= startDown.y + 200)
    errors.push(`expected to move down; startDown.y=${startDown.y}, afterDown.y=${afterDown.y}`)
  if (afterDown && afterDown.y <= 800) errors.push(`expected to be past y=800 (no invisible wall at 600); afterDown.y=${afterDown.y}`)

  // Quick collision sanity: try to walk into a known rock at grid (5,4) => (352,288).
  await teleportPlayer(page, 280, 288)
  await page.waitForTimeout(50)
  await page.keyboard.down('d')
  await page.waitForTimeout(1500)
  await page.keyboard.up('d')
  const afterRockPush = await getPlayerPos(page)
  if (afterRockPush && afterRockPush.x > 420) errors.push(`expected rock collision to block; afterRockPush.x=${afterRockPush.x}`)

  // Warp sanity: overworld -> cave -> overworld
  const initialMapKey = await getMapKey(page)
  if (initialMapKey !== 'overworld') errors.push(`expected initial mapKey=overworld; got ${initialMapKey}`)

  // Systems sanity: pickups + inventory + interactables.
  try {
    const inv0 = await getInventory(page)
    if (!(inv0 && typeof inv0.coins === 'number' && typeof inv0.keys === 'number')) throw new Error(`bad inventory snapshot: ${JSON.stringify(inv0)}`)

    // Equipment/backpack sanity: starter gear should be equipped.
    if (!inv0.equipment || typeof inv0.equipment !== 'object') throw new Error(`expected equipment state; inv0=${JSON.stringify(inv0)}`)
    if (inv0.equipment.weapon !== 'sword') throw new Error(`expected starter weapon=sword; got ${String(inv0.equipment.weapon)}`)
    if (inv0.equipment.shield !== 'shield_basic') throw new Error(`expected starter shield equipped; got ${String(inv0.equipment.shield)}`)
    if (inv0.equipment.helmet !== 'helmet_basic') throw new Error(`expected starter helmet equipped; got ${String(inv0.equipment.helmet)}`)
    if (inv0.equipment.chest !== 'chest_basic') throw new Error(`expected starter chest equipped; got ${String(inv0.equipment.chest)}`)
    if (inv0.equipment.gloves !== 'gloves_basic') throw new Error(`expected starter gloves equipped; got ${String(inv0.equipment.gloves)}`)
    if (inv0.equipment.boots !== 'boots_basic') throw new Error(`expected starter boots equipped; got ${String(inv0.equipment.boots)}`)
    if (!Array.isArray(inv0.bag) || inv0.bag.length !== 25)
      throw new Error(`expected stash bag size=25 (5x5); inv0.bag.length=${Array.isArray(inv0.bag) ? inv0.bag.length : 'not-array'}`)
    const hasLongSword = inv0.bag.some((s) => s?.id === 'greatsword')
    if (!hasLongSword) throw new Error(`expected starter bag to include greatsword; bag=${JSON.stringify(inv0.bag)}`)

    // 2H weapon rule: equipping greatsword should unequip shield, and shield should not be equippable while 2H is active.
    await equipWeapon(page, 'greatsword')
    await page.waitForTimeout(80)
    const inv2h = await getInventory(page)
    if (!inv2h?.equipment) throw new Error(`missing equipment after equipping greatsword; inv=${JSON.stringify(inv2h)}`)
    if (inv2h.equipment.weapon !== 'greatsword') throw new Error(`expected weapon=greatsword; got ${String(inv2h.equipment.weapon)}`)
    if (inv2h.equipment.shield !== null) throw new Error(`expected shield to be unequipped with 2H; got ${String(inv2h.equipment.shield)}`)
    const shieldIdx = Array.isArray(inv2h.bag) ? inv2h.bag.findIndex((s) => s?.id === 'shield_basic') : -1
    if (shieldIdx < 0) throw new Error(`expected shield to be moved into bag; bag=${JSON.stringify(inv2h.bag)}`)
    const moveShieldFail = await page.evaluate(({ shieldIdx }) => globalThis.__dbg?.moveInvItem?.({ type: 'bag', index: shieldIdx }, { type: 'equip', slot: 'shield' }), {
      shieldIdx,
    })
    if (moveShieldFail?.ok) throw new Error(`expected equipping shield while 2H to fail; res=${JSON.stringify(moveShieldFail)}`)

    // Switch back to sword, then re-equip shield.
    await equipWeapon(page, 'sword')
    await page.waitForTimeout(80)
    const inv1h = await getInventory(page)
    if (inv1h?.equipment?.weapon !== 'sword') throw new Error(`expected weapon=sword; got ${String(inv1h?.equipment?.weapon)}`)
    const shieldIdx2 = Array.isArray(inv1h?.bag) ? inv1h.bag.findIndex((s) => s?.id === 'shield_basic') : -1
    if (shieldIdx2 < 0) throw new Error(`expected shield in bag after switching back; bag=${JSON.stringify(inv1h?.bag)}`)
    const moveShieldOk = await page.evaluate(({ shieldIdx2 }) => globalThis.__dbg?.moveInvItem?.({ type: 'bag', index: shieldIdx2 }, { type: 'equip', slot: 'shield' }), {
      shieldIdx2,
    })
    if (!moveShieldOk?.ok) throw new Error(`expected shield to be equippable with sword; res=${JSON.stringify(moveShieldOk)}`)
    const invShielded = await getInventory(page)
    if (invShielded?.equipment?.shield !== 'shield_basic')
      throw new Error(`expected shield equipped after move; got ${String(invShielded?.equipment?.shield)} inv=${JSON.stringify(invShielded)}`)

    // Slot rules: moving chest to bag should work, but should not be placeable into the helmet slot.
    const emptyIdx = Array.isArray(invShielded?.bag) ? invShielded.bag.findIndex((s) => !s) : -1
    if (emptyIdx < 0) throw new Error(`expected at least one empty bag slot; bag=${JSON.stringify(invShielded?.bag)}`)
    const moveChestOk = await page.evaluate(({ emptyIdx }) => globalThis.__dbg?.moveInvItem?.({ type: 'equip', slot: 'chest' }, { type: 'bag', index: emptyIdx }), {
      emptyIdx,
    })
    if (!moveChestOk?.ok) throw new Error(`expected to unequip chest into bag; res=${JSON.stringify(moveChestOk)}`)
    const invChestOff = await getInventory(page)
    if (invChestOff?.equipment?.chest !== null) throw new Error(`expected chest slot to be empty after unequip; inv=${JSON.stringify(invChestOff)}`)
    const wrongSlotFail = await page.evaluate(({ emptyIdx }) => globalThis.__dbg?.moveInvItem?.({ type: 'bag', index: emptyIdx }, { type: 'equip', slot: 'helmet' }), {
      emptyIdx,
    })
    if (wrongSlotFail?.ok) throw new Error(`expected placing chest into helmet to fail; res=${JSON.stringify(wrongSlotFail)}`)
    const moveChestBack = await page.evaluate(({ emptyIdx }) => globalThis.__dbg?.moveInvItem?.({ type: 'bag', index: emptyIdx }, { type: 'equip', slot: 'chest' }), {
      emptyIdx,
    })
    if (!moveChestBack?.ok) throw new Error(`expected re-equipping chest to succeed; res=${JSON.stringify(moveChestBack)}`)

    // Inventory UI drag/drop sanity: unequip + re-equip chest using the actual overlay.
    // This catches hover/targeting bugs where an item can't be re-equipped after dragging.
    await page.keyboard.down('i')
    await page.waitForTimeout(120)
    await page.keyboard.up('i')
    await page.waitForTimeout(160)

    const uiPts = await page.evaluate(({ emptyIdx }) => {
      const scene = globalThis.__dbg?.player?.scene
      const ui = scene?.inventoryUI
      const chest = ui?.equipSlots?.chest?.bg
      const bag = ui?.bagSlots?.[emptyIdx]?.bg
      const canvas = document.querySelector('canvas')
      const rect = canvas?.getBoundingClientRect?.()
      if (!chest || !bag || !rect) return null

      // Phaser pointer coordinates are in game space (960x600), but Playwright mouse coordinates
      // are in page space. Convert via the canvas DOM rect.
      const sx = rect.width / 960
      const sy = rect.height / 600
      const toPage = (p) => ({ x: rect.left + p.x * sx, y: rect.top + p.y * sy })

      return { chest: toPage({ x: chest.x, y: chest.y }), bag: toPage({ x: bag.x, y: bag.y }) }
    }, { emptyIdx })
    if (!uiPts) throw new Error('could not read inventory UI slot positions')

    // Drag chest equip -> stash cell.
    await page.mouse.move(uiPts.chest.x, uiPts.chest.y)
    await page.mouse.down()
    await page.mouse.move(uiPts.bag.x, uiPts.bag.y, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(160)

    const invUi0 = await getInventory(page)
    if (invUi0?.equipment?.chest !== null) throw new Error(`expected chest to be unequipped via UI; inv=${JSON.stringify(invUi0)}`)
    if (invUi0?.bag?.[emptyIdx]?.id !== 'chest_basic') throw new Error(`expected chest to land in stash cell via UI; inv=${JSON.stringify(invUi0)}`)

    // Drag chest stash -> chest equip.
    await page.mouse.move(uiPts.bag.x, uiPts.bag.y)
    await page.mouse.down()
    await page.mouse.move(uiPts.chest.x, uiPts.chest.y, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(160)

    const invUi1 = await getInventory(page)
    if (invUi1?.equipment?.chest !== 'chest_basic') throw new Error(`expected chest to be re-equipped via UI; inv=${JSON.stringify(invUi1)}`)
    if (invUi1?.bag?.[emptyIdx]) throw new Error(`expected stash cell to be empty after re-equip via UI; inv=${JSON.stringify(invUi1)}`)

    // Close inventory overlay.
    await page.keyboard.down('i')
    await page.waitForTimeout(120)
    await page.keyboard.up('i')
    await page.waitForTimeout(120)

    // Locked door should not warp without a key.
    await teleportPlayer(page, 480, 352)
    await page.waitForTimeout(120)
    await tryInteract(page)
    await page.waitForTimeout(80)
    const dlg0 = await getDialogue(page)
    if (!dlg0?.open) throw new Error(`expected dialogue open when interacting with locked door; dlg=${JSON.stringify(dlg0)}`)
    if (!String(dlg0.text ?? '').toLowerCase().includes('locked')) throw new Error(`expected locked-door dialogue; dlg=${JSON.stringify(dlg0)}`)
    await tryInteract(page) // close
    await page.waitForTimeout(80)
    const dlg0b = await getDialogue(page)
    if (dlg0b?.open) throw new Error(`expected dialogue to close; dlg=${JSON.stringify(dlg0b)}`)
    const mk0 = await getMapKey(page)
    if (mk0 !== 'overworld') throw new Error(`expected to remain in overworld without key; mapKey=${mk0}`)

    // Sign should display a message (data-driven via defId).
    await teleportPlayer(page, 416, 352)
    await page.waitForTimeout(120)
    await tryInteract(page)
    await page.waitForTimeout(80)
    const dlgSign = await getDialogue(page)
    if (!dlgSign?.open) throw new Error(`expected dialogue open for sign; dlg=${JSON.stringify(dlgSign)}`)
    if (!String(dlgSign.text ?? '').toLowerCase().includes('welcome')) throw new Error(`expected welcome text for sign; dlg=${JSON.stringify(dlgSign)}`)
    await tryInteract(page) // close
    await page.waitForTimeout(60)

    // Chest should grant 1 key.
    await teleportPlayer(page, 352, 416)
    await page.waitForTimeout(120)
    await tryInteract(page)
    await page.waitForTimeout(80)
    const inv1 = await getInventory(page)
    if (!(inv1 && typeof inv1.keys === 'number')) throw new Error(`bad inventory snapshot after chest: ${JSON.stringify(inv1)}`)
    if (inv1.keys !== inv0.keys + 1) throw new Error(`expected +1 key after chest; keys0=${inv0.keys} keys1=${inv1.keys}`)
    const dlg1 = await getDialogue(page)
    if (!dlg1?.open) throw new Error(`expected dialogue open after chest; dlg=${JSON.stringify(dlg1)}`)
    await tryInteract(page) // close
    await page.waitForTimeout(60)

    // Coin pickup should increase coin count.
    await teleportPlayer(page, 224, 352)
    await page.waitForTimeout(220)
    const inv2 = await getInventory(page)
    if (!(inv2 && typeof inv2.coins === 'number')) throw new Error(`bad inventory snapshot after coin: ${JSON.stringify(inv2)}`)
    if (inv2.coins !== inv0.coins + 1) throw new Error(`expected +1 coin from pickup; coins0=${inv0.coins} coins2=${inv2.coins}`)

    // Heart pickup should heal (only consumed if you are missing hp).
    const max = await getPlayerMaxHp(page)
    if (typeof max === 'number') await setPlayerHp(page, Math.max(0, max - 1))
    await page.waitForTimeout(60)
    await teleportPlayer(page, 288, 416)
    await page.waitForTimeout(220)
    const hp1 = await getPlayerHp(page)
    const max2 = await getPlayerMaxHp(page)
    if (!(typeof hp1 === 'number' && typeof max2 === 'number')) throw new Error(`hp/max not numeric after heart; hp=${hp1} max=${max2}`)
    if (hp1 !== max2) throw new Error(`expected heart pickup to heal to max; hp=${hp1} max=${max2}`)

    // Inventory overlay should be togglable via I (pauses physics).
    await page.keyboard.down('i')
    await page.waitForTimeout(120)
    await page.keyboard.up('i')
    await page.waitForTimeout(80)
    const stInv = await getGameState(page)
    if (!stInv?.paused || stInv?.pauseMode !== 'inventory') throw new Error(`expected inventory pause; state=${JSON.stringify(stInv)}`)
    await page.keyboard.down('i')
    await page.waitForTimeout(120)
    await page.keyboard.up('i')
    await page.waitForTimeout(80)
    const stInv2 = await getGameState(page)
    if (stInv2?.paused) throw new Error(`expected inventory close; state=${JSON.stringify(stInv2)}`)

    // Map overlay should be togglable via M (pauses physics).
    await teleportPlayer(page, 200, 200)
    await page.waitForTimeout(80)
    const pMap0 = await getPlayerPos(page)
    await page.keyboard.down('m')
    await page.waitForTimeout(120)
    await page.keyboard.up('m')
    await page.waitForTimeout(100)
    const stMap = await getGameState(page)
    if (!stMap?.paused || stMap?.pauseMode !== 'map') throw new Error(`expected map overlay pause; state=${JSON.stringify(stMap)}`)
    await page.keyboard.down('d')
    await page.waitForTimeout(550)
    await page.keyboard.up('d')
    await page.waitForTimeout(80)
    const pMap1 = await getPlayerPos(page)
    if (pMap0 && pMap1) {
      const dx = Math.abs(pMap1.x - pMap0.x)
      const dy = Math.abs(pMap1.y - pMap0.y)
      if (dx > 1.5 || dy > 1.5) throw new Error(`expected no movement while map overlay open; dx=${dx} dy=${dy}`)
    }
    await page.keyboard.down('m')
    await page.waitForTimeout(120)
    await page.keyboard.up('m')
    await page.waitForTimeout(100)
    const stMap2 = await getGameState(page)
    if (stMap2?.paused) throw new Error(`expected map overlay close; state=${JSON.stringify(stMap2)}`)

    // Locked door should warp and consume a key when you have one.
    const invBeforeDoor = await getInventory(page)
    if (!(invBeforeDoor && typeof invBeforeDoor.keys === 'number')) throw new Error(`bad inventory snapshot before door: ${JSON.stringify(invBeforeDoor)}`)
    await teleportPlayer(page, 480, 352)
    await page.waitForTimeout(120)
    await tryInteract(page)
    await page.waitForTimeout(200)
    await waitForMapKey(page, 'cave', 3000)
    const invAfterDoor = await getInventory(page)
    if (!(invAfterDoor && typeof invAfterDoor.keys === 'number')) throw new Error(`bad inventory snapshot after door: ${JSON.stringify(invAfterDoor)}`)
    if (invAfterDoor.keys !== invBeforeDoor.keys - 1) throw new Error(`expected key consumption on locked warp; before=${invBeforeDoor.keys} after=${invAfterDoor.keys}`)

    // Return to overworld so the remaining warp tests are deterministic.
    await teleportPlayer(page, 1312, 800)
    await page.waitForTimeout(220)
    await waitForMapKey(page, 'overworld', 3000)
  } catch (e) {
    errors.push(`expected pickups/inventory/interactables; ${String(e?.message ?? e)}`)
  }

  // Pause sanity: while paused, movement should not change position.
  try {
    await teleportPlayer(page, 200, 200)
    await page.waitForTimeout(80)
    const p0 = await getPlayerPos(page)
    await togglePause(page)
    await page.waitForTimeout(60)
    await page.keyboard.down('d')
    await page.waitForTimeout(800)
    await page.keyboard.up('d')
    await page.waitForTimeout(60)
    const p1 = await getPlayerPos(page)
    const st = await getGameState(page)
    if (!st?.paused) throw new Error(`expected paused=true; state=${JSON.stringify(st)}`)
    if (p0 && p1) {
      const dx = Math.abs(p1.x - p0.x)
      const dy = Math.abs(p1.y - p0.y)
      if (dx > 1.5 || dy > 1.5) throw new Error(`expected no movement while paused; dx=${dx} dy=${dy}`)
    }
    await togglePause(page)
    await page.waitForTimeout(60)
    const st2 = await getGameState(page)
    if (st2?.paused) throw new Error(`expected paused=false; state=${JSON.stringify(st2)}`)
  } catch (e) {
    errors.push(`expected pause behavior; ${String(e?.message ?? e)}`)
  }

  const depths = await getDepths(page)
  if (!depths) errors.push('expected window.__dbg.depths to exist')
  else if (!(typeof depths.player === 'number' && typeof depths.ground === 'number'))
    errors.push(`expected numeric depths; got ${JSON.stringify(depths)}`)
  else if (depths.player <= depths.ground) errors.push(`expected player above ground; playerDepth=${depths.player} groundDepth=${depths.ground}`)

  // Health UI sanity.
  const maxHp = await getPlayerMaxHp(page)
  const hpStart = await getPlayerHp(page)
  if (typeof maxHp !== 'number' || typeof hpStart !== 'number') errors.push(`expected numeric player hp; hp=${hpStart} max=${maxHp}`)
  else if (hpStart > maxHp) errors.push(`expected hp <= maxHp; hp=${hpStart} max=${maxHp}`)

  // Combat sanity: enemy exists and can be damaged with Space.
  const enemies0 = await getEnemies(page)
  if (!Array.isArray(enemies0) || enemies0.length < 2) {
    const dbg = await getEnemyDebug(page)
    errors.push(`expected at least 2 enemies; got ${JSON.stringify(enemies0)}; dbg=${JSON.stringify(dbg)}`)
  }
  else {
    const slime = enemies0.find((e) => e.kind === 'slime')
    const bat = enemies0.find((e) => e.kind === 'bat')
    if (!slime || !bat) errors.push(`expected both slime and bat; got ${JSON.stringify(enemies0)}`)

    // Stabilize HP so combat checks don't flake due to accidental deaths mid-suite.
    try {
      const st0 = await getGameState(page)
      if (st0?.gameOver) {
        await respawn(page)
        await page.waitForTimeout(350)
      }
      const max = await getPlayerMaxHp(page)
      if (typeof max === 'number') await setPlayerHp(page, max)
      await page.waitForTimeout(80)
    } catch {
      // ignore
    }

    const first = enemies0[0]
	    const driftPos = await pushIntoEnemyAndMeasureDrift(page, first.kind, typeof first.bx === 'number' ? first.bx : first.x, typeof first.by === 'number' ? first.by : first.y)
	    if (driftPos) {
	      const drift = Math.hypot(driftPos.x - first.x, driftPos.y - first.y)
	      if (drift > 8) errors.push(`enemy drifted too much from player collision push; drift=${drift.toFixed(2)}px`)
	    }

	    // Attack lock sanity: while attacking, movement input should not move the player.
	    try {
	      await teleportPlayer(page, 100, 900)
	      await page.waitForTimeout(120)
	      await page.keyboard.down('d')
	      await page.waitForTimeout(140)

	      const p0 = await page.evaluate(() => {
	        const p = globalThis.__dbg?.player
	        if (!p) return null
	        globalThis.__dbg?.tryAttack?.()
	        return { x: p.x, y: p.y }
	      })
	      await page.waitForTimeout(170)
	      const p1 = await getPlayerPos(page)
	      if (p0 && p1) {
	        const dx = Math.abs(p1.x - p0.x)
	        const dy = Math.abs(p1.y - p0.y)
	        if (dx > 9 || dy > 9) throw new Error(`expected minimal movement during attack; dx=${dx} dy=${dy}`)
	      }

	      // After recovery ends, movement should resume while the key is still held.
	      await page.waitForTimeout(260)
	      const p2 = await getPlayerPos(page)
	      if (p1 && p2) {
	        const dx = Math.abs(p2.x - p1.x)
	        if (dx < 8) throw new Error(`expected movement to resume after attack; dx=${dx}`)
	      }
	    } catch (e) {
	      errors.push(`expected attack movement lock; ${String(e?.message ?? e)}`)
	    } finally {
	      await page.keyboard.up('d')
	    }

	    // AI sanity: slime should wander even if player is far away.
	    try {
	      await teleportPlayer(page, 100, 100)
	      await waitForEnemyMove(page, 'slime', 6, 3000)
    } catch (e) {
      errors.push(`expected slime to move (AI); ${String(e?.message ?? e)}`)
    }

    // AI sanity: bat should chase when player is within aggro radius.
	    if (bat) {
	      try {
        const enemiesBefore = await getEnemies(page)
        const b0 = Array.isArray(enemiesBefore) ? enemiesBefore.find((e) => e.kind === 'bat') : null
        if (!b0) throw new Error(`bat not found; mapKey=${await getMapKey(page)}; enemiesBefore=${JSON.stringify(enemiesBefore)}`)

        const open = await findOpenTileSample(page, 2)
        if (open) {
          const spacing = Math.max(120, open.tile * 6)
          await teleportPlayer(page, open.x - spacing, open.y)
          await teleportEnemy(page, 'bat', open.x + spacing, open.y)
          await page.waitForTimeout(120)
        } else {
          await teleportPlayer(page, b0.x - 120, b0.y)
          await page.waitForTimeout(120)
        }

        const p0 = await getPlayerPos(page)
        const enemiesPos0 = await getEnemies(page)
        const b0p = Array.isArray(enemiesPos0) ? enemiesPos0.find((e) => e.kind === 'bat') : null
        if (!p0 || !b0p) throw new Error(`bat/player missing after setup; p0=${JSON.stringify(p0)} b0=${JSON.stringify(b0p)}`)
        const d0 = Math.hypot(b0p.x - p0.x, b0p.y - p0.y)
        await page.waitForTimeout(900)
        const enemiesAfter = await getEnemies(page)
        const b1 = Array.isArray(enemiesAfter) ? enemiesAfter.find((e) => e.kind === 'bat') : null
        if (!b1) throw new Error(`bat disappeared; mapKey=${await getMapKey(page)}; enemiesAfter=${JSON.stringify(enemiesAfter)}`)
        const d1 = Math.hypot(b1.x - p0.x, b1.y - p0.y)
        if (!(d1 < d0)) throw new Error(`expected bat distance to player to decrease; d0=${d0} d1=${d1}`)

        let overlapped = false
        const touchStart = Date.now()
        while (Date.now() - touchStart < 1500) {
          if (await isPlayerOverlappingEnemy(page, 'bat')) {
            overlapped = true
            break
          }
          await page.waitForTimeout(80)
        }
        if (!overlapped) throw new Error('expected bat to reach player (overlap) while chasing')

        // Contact behavior: if we force a touch, bat should retreat briefly (distance increases).
        await teleportPlayer(page, b1.x, b1.y)
        await page.waitForTimeout(120)
        const enemiesTouch0 = await getEnemies(page)
        const bt0 = Array.isArray(enemiesTouch0) ? enemiesTouch0.find((e) => e.kind === 'bat') : null
        if (!bt0) throw new Error('bat missing after touch setup')
        const dist0 = Math.hypot(bt0.x - b1.x, bt0.y - b1.y)
        await page.waitForTimeout(380)
        const enemiesTouch1 = await getEnemies(page)
        const bt1 = Array.isArray(enemiesTouch1) ? enemiesTouch1.find((e) => e.kind === 'bat') : null
        if (!bt1) throw new Error('bat missing after touch')
        const dist1 = Math.hypot(bt1.x - b1.x, bt1.y - b1.y)
        if (!(dist1 > dist0 + 8)) throw new Error(`expected bat to retreat after touch; dist0=${dist0} dist1=${dist1}`)
	      } catch (e) {
	        errors.push(`expected bat chase behavior (AI); ${String(e?.message ?? e)}`)
	      }
	    }

    // Enemy collision sanity: enemies should never end up inside blocked tiles.
    // Stress this by forcing the bat to chase into an internal wall for a bit.
    if (bat) {
      try {
        const wall = await findWallTileSample(page)
        if (!wall) throw new Error('could not find a suitable blocked wall tile for collision test')
        const wallLeft = wall.wallLeft
        const wallRight = wall.wallRight
        const y = wall.y

        await teleportPlayer(page, wallLeft - 150, y)
        await teleportEnemy(page, 'bat', wallRight + 90, y)
        await page.waitForTimeout(120)

        // Increase bat speed slightly to amplify any collision edge cases.
        await page.evaluate(() => {
          const scene = globalThis.__dbg?.player?.scene
          const group = scene?.mapRuntime?.enemies
          const kids = group?.getChildren?.() ?? []
          const b = kids.find((e) => e?.active && e?.kind === 'bat')
          if (!b?.stats) return
          if (typeof b.__testPrevSpeed !== 'number') b.__testPrevSpeed = b.stats.moveSpeed
          b.stats.moveSpeed = Math.max(220, b.stats.moveSpeed)
        })

        const started = Date.now()
        while (Date.now() - started < 2200) {
          const bad = await getEnemiesInBlockedTiles(page)
          if (Array.isArray(bad) && bad.length > 0) {
            throw new Error(`enemies in blocked tiles: ${JSON.stringify(bad)}`)
          }
          await page.waitForTimeout(120)
        }
      } catch (e) {
        errors.push(`expected enemies to stay out of blocked tiles; ${String(e?.message ?? e)}`)
      } finally {
        await page.evaluate(() => {
          const scene = globalThis.__dbg?.player?.scene
          const group = scene?.mapRuntime?.enemies
          const kids = group?.getChildren?.() ?? []
          const b = kids.find((e) => e?.active && e?.kind === 'bat')
          if (!b?.stats) return
          const prev = b.__testPrevSpeed
          if (typeof prev === 'number') b.stats.moveSpeed = prev
          delete b.__testPrevSpeed
        })
      }
    }

	    // Touch damage sanity: colliding with an enemy should reduce player hp with invuln.
	    if (slime) {
	      try {
	        // Freeze all enemies so we don't accidentally re-trigger touch damage while waiting
        // for invulnerability to expire.
        await page.evaluate(() => {
          const scene = globalThis.__dbg?.player?.scene
          const group = scene?.mapRuntime?.enemies
          const kids = group?.getChildren?.() ?? []
          for (const e of kids) {
            if (!e?.stats) continue
            if (typeof e.__testPrevSpeed !== 'number') e.__testPrevSpeed = e.stats.moveSpeed
            e.stats.moveSpeed = 0
            if (typeof e.setVelocity === 'function') e.setVelocity(0, 0)
          }
        })

        const enemiesNow0 = await getEnemies(page)
        const s0 = Array.isArray(enemiesNow0) ? enemiesNow0.find((e) => e.kind === 'slime') : null
        if (!s0) throw new Error(`slime not found for touch test; enemies=${JSON.stringify(enemiesNow0)}`)

        // Ensure we aren't still invulnerable from earlier enemy contact tests.
        await teleportPlayer(page, 100, 900)
        await page.waitForTimeout(80)
        const max = await getPlayerMaxHp(page)
        if (typeof max === 'number') await setPlayerHp(page, max)
        // touchInvulnMs is currently 800ms; wait longer than that for determinism.
        await page.waitForTimeout(1100)

        const hp0 = await getPlayerHp(page)
        await teleportPlayer(page, typeof s0.bx === 'number' ? s0.bx : s0.x, typeof s0.by === 'number' ? s0.by : s0.y)
        await page.waitForTimeout(320)
        const hp1 = await getPlayerHp(page)
        if (!(typeof hp0 === 'number' && typeof hp1 === 'number')) throw new Error(`hp not numeric; hp0=${hp0} hp1=${hp1}`)
        if (!(hp1 === hp0 - 2)) throw new Error(`expected hp drop by 2 on contact; hp0=${hp0} hp1=${hp1}`)

        // Immediately collide again; should not drop again due to invuln.
        const enemiesNow1 = await getEnemies(page)
        const s1 = Array.isArray(enemiesNow1) ? enemiesNow1.find((e) => e.kind === 'slime') : null
        if (!s1) throw new Error(`slime not found for invuln test; enemies=${JSON.stringify(enemiesNow1)}`)
        await teleportPlayer(page, typeof s1.bx === 'number' ? s1.bx : s1.x, typeof s1.by === 'number' ? s1.by : s1.y)
        await page.waitForTimeout(250)
        const hp2 = await getPlayerHp(page)
        if (typeof hp2 !== 'number') throw new Error(`hp2 not numeric; hp2=${hp2}`)
        if (hp2 < hp1) throw new Error(`expected invuln to prevent rapid drain; hp1=${hp1} hp2=${hp2}`)
      } catch (e) {
        errors.push(`expected touch damage + invuln; ${String(e?.message ?? e)}`)
      } finally {
        await page.evaluate(() => {
          const scene = globalThis.__dbg?.player?.scene
          const group = scene?.mapRuntime?.enemies
          const kids = group?.getChildren?.() ?? []
          for (const e of kids) {
            if (!e?.stats) continue
            const prev = e.__testPrevSpeed
            if (typeof prev === 'number') e.stats.moveSpeed = prev
            delete e.__testPrevSpeed
          }
        })
      }
    }

		    // Attack timing sanity: strikes should not apply damage immediately (windup), then should apply damage.
		    if (slime) {
		      try {
		        await equipWeapon(page, 'sword')
	        const nowEnemies = await getEnemies(page)
	        const s0 = Array.isArray(nowEnemies) ? nowEnemies.find((e) => e.kind === 'slime') : null
	        if (!s0) throw new Error(`slime missing for attack timing test; enemies=${JSON.stringify(nowEnemies)}`)

	        // Freeze all enemies so collision + timing is deterministic.
	        await page.evaluate(() => {
	          const scene = globalThis.__dbg?.player?.scene
	          const group = scene?.mapRuntime?.enemies
	          const kids = group?.getChildren?.() ?? []
	          for (const e of kids) {
	            if (!e?.stats) continue
	            if (typeof e.__testPrevSpeed !== 'number') e.__testPrevSpeed = e.stats.moveSpeed
	            e.stats.moveSpeed = 0
	            if (typeof e.setVelocity === 'function') e.setVelocity(0, 0)
	          }
	        })

	        const tx = typeof s0.bx === 'number' ? s0.bx : s0.x
	        const ty = typeof s0.by === 'number' ? s0.by : s0.y
	        await teleportPlayer(page, tx - 42, ty)
	        await page.waitForTimeout(80)
	        await page.evaluate(() => {
	          if (typeof globalThis.__dbg?.setFacing === 'function') globalThis.__dbg.setFacing('right')
	        })
	        await page.waitForTimeout(60)

	        const before = await getEnemies(page)
	        const beforeEnemy = Array.isArray(before) ? before.find((e) => e.kind === 'slime') : null
	        const hp0 = beforeEnemy?.hp
	        if (typeof hp0 !== 'number') throw new Error(`expected numeric slime hp; hp0=${hp0}`)

	        await page.evaluate(() => globalThis.__dbg?.tryAttack?.())
	        await page.waitForTimeout(35)
	        const mid = await getEnemies(page)
	        const midEnemy = Array.isArray(mid) ? mid.find((e) => e.kind === 'slime') : null
	        if (!midEnemy) throw new Error(`slime missing mid-swing; enemies=${JSON.stringify(mid)}`)
	        if (midEnemy.hp !== hp0) throw new Error(`expected no damage during windup; hp0=${hp0} mid=${midEnemy.hp}`)

	        await page.waitForTimeout(120)
	        const after = await getEnemies(page)
	        const afterEnemy = Array.isArray(after) ? after.find((e) => e.kind === 'slime') : null
	        if (!afterEnemy) throw new Error(`slime missing after swing; enemies=${JSON.stringify(after)}`)
	        if (afterEnemy.hp !== hp0 - 1) throw new Error(`expected damage after windup; hp0=${hp0} hp1=${afterEnemy.hp}`)
	      } catch (e) {
	        errors.push(`expected attack timing (windup); ${String(e?.message ?? e)}`)
		      } finally {
		        await page.evaluate(() => {
		          const scene = globalThis.__dbg?.player?.scene
		          const group = scene?.mapRuntime?.enemies
		          const kids = group?.getChildren?.() ?? []
		          for (const e of kids) {
		            if (!e?.stats) continue
		            const prev = e.__testPrevSpeed
		            if (typeof prev === 'number') e.stats.moveSpeed = prev
		            delete e.__testPrevSpeed
		          }
		        })
		      }
		    }

        // Reset enemy spawns so weapon damage assertions are deterministic (fresh HP, no invuln carry-over).
        // Overworld fast warp loop: overworld -> cave -> overworld.
        await teleportPlayer(page, 100, 100)
        await page.waitForTimeout(120)
        await page.waitForTimeout(650)
        await teleportPlayer(page, 288, 352)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'cave', 3000)
        await teleportPlayer(page, 352, 288)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'overworld', 3000)
	
		    // Weapon stats sanity: swapping weapons should change damage output.
		    try {
		      await equipWeapon(page, 'sword')
	      const { hp0, hp1, before, after } = await slashEnemyAndGetHpDelta(page, 'slime')
      if (!(typeof hp0 === 'number' && typeof hp1 === 'number'))
        throw new Error(`expected numeric slime hp for sword test; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      if (hp1 !== hp0 - 1) throw new Error(`expected sword damage=1; before=${hp0} after=${hp1}`)
    } catch (e) {
      errors.push(`expected sword weapon stats; ${String(e?.message ?? e)}`)
    }

    try {
      // Earlier sword slashes can sometimes hit/kill the bat as collateral if enemies wander too close.
      // If the bat is missing, reload overworld enemies via a quick overworld -> cave -> overworld warp loop.
      let enemiesStart = await getEnemies(page)
      let hasBat = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'bat') : false
      if (!hasBat) {
        await teleportPlayer(page, 100, 100)
        await page.waitForTimeout(120)
        await page.waitForTimeout(650)

        // Overworld fast warp loop: overworld -> cave -> overworld.
        await teleportPlayer(page, 288, 352)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'cave', 3000)
        await teleportPlayer(page, 352, 288)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'overworld', 3000)

        enemiesStart = await getEnemies(page)
        hasBat = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'bat') : false
      }
      if (!hasBat) throw new Error(`bat not found for greatsword test; enemies=${JSON.stringify(enemiesStart)}`)

      await equipWeapon(page, 'greatsword')
      const { hp0, hp1, before, after, atk0, atk1 } = await slashEnemyAndGetHpDelta(page, 'bat')
      if (!(typeof hp0 === 'number'))
        throw new Error(`expected numeric bat hp for greatsword test; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      if (typeof hp1 === 'number') {
        const expected = Math.max(0, hp0 - 2)
        if (hp1 !== expected)
          throw new Error(
            `expected greatsword damage=2; before=${hp0} after=${hp1} expected=${expected}; atk0=${JSON.stringify(atk0)} atk1=${JSON.stringify(atk1)} beforeEnemies=${JSON.stringify(before)} afterEnemies=${JSON.stringify(after)}`,
          )
      } else {
        // If the bat was killed and removed, that's fine as long as it wasn't a higher HP enemy.
        if (hp0 > 2) throw new Error(`expected bat to survive or report hp after hit; beforeHp=${hp0} after=${JSON.stringify(after)}`)
      }
    } catch (e) {
      errors.push(`expected greatsword weapon stats; ${String(e?.message ?? e)}`)
    } finally {
      await equipWeapon(page, 'sword')
    }

    // Wall occlusion sanity: attacks should not damage enemies through blocked tiles.
    try {
      // Ensure the bat exists (previous suites can legitimately kill it).
      let enemiesStart = await getEnemies(page)
      let hasBat = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'bat') : false
      if (!hasBat) {
        // Overworld fast warp loop: overworld -> cave -> overworld.
        await teleportPlayer(page, 100, 100)
        await page.waitForTimeout(120)
        await page.waitForTimeout(650)
        await teleportPlayer(page, 288, 352)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'cave', 3000)
        await teleportPlayer(page, 352, 288)
        await page.waitForTimeout(220)
        await waitForMapKey(page, 'overworld', 3000)
        enemiesStart = await getEnemies(page)
        hasBat = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'bat') : false
      }
      if (!hasBat) throw new Error(`bat not found for wall occlusion test; enemies=${JSON.stringify(enemiesStart)}`)

      await equipWeapon(page, 'greatsword')

      // Freeze enemies so positions are deterministic.
      await page.evaluate(() => {
        const scene = globalThis.__dbg?.player?.scene
        const group = scene?.mapRuntime?.enemies
        const kids = group?.getChildren?.() ?? []
        for (const e of kids) {
          if (!e?.stats) continue
          if (typeof e.__testPrevSpeed !== 'number') e.__testPrevSpeed = e.stats.moveSpeed
          e.stats.moveSpeed = 0
          if (typeof e.setVelocity === 'function') e.setVelocity(0, 0)
        }
      })

      // Place the hero and bat on opposite sides of a blocked tile.
      const wall = await findWallTileSample(page)
      if (!wall) throw new Error('could not find a suitable blocked wall tile for occlusion test')
      const wallLeft = wall.wallLeft
      const wallRight = wall.wallRight
      const y = wall.y

      // Place player so their body is flush with the left side of the wall.
      await teleportPlayer(page, wallLeft - 14, y)
      await page.waitForTimeout(60)
      await page.evaluate(() => {
        if (typeof globalThis.__dbg?.setFacing === 'function') globalThis.__dbg.setFacing('right')
      })

      // Place bat so its body is flush with the right side of the wall.
      await teleportEnemy(page, 'bat', wallRight + 17, y)
      await page.waitForTimeout(80)

      const before = await getEnemies(page)
      const b0 = Array.isArray(before) ? before.find((e) => e.kind === 'bat') : null
      const hp0 = b0?.hp
      if (typeof hp0 !== 'number') throw new Error(`expected numeric bat hp before wall test; enemies=${JSON.stringify(before)}`)

      await page.evaluate(() => globalThis.__dbg?.tryAttack?.())
      await page.waitForTimeout(260)

      const after = await getEnemies(page)
      const b1 = Array.isArray(after) ? after.find((e) => e.kind === 'bat') : null
      const hp1 = b1?.hp
      if (typeof hp1 !== 'number') throw new Error(`expected numeric bat hp after wall test; enemies=${JSON.stringify(after)}`)
      if (hp1 !== hp0) throw new Error(`expected wall to block attack; hp0=${hp0} hp1=${hp1}`)
    } catch (e) {
      errors.push(`expected attacks to be blocked by walls; ${String(e?.message ?? e)}`)
    } finally {
      await equipWeapon(page, 'sword')
      await page.evaluate(() => {
        const scene = globalThis.__dbg?.player?.scene
        const group = scene?.mapRuntime?.enemies
        const kids = group?.getChildren?.() ?? []
        for (const e of kids) {
          if (!e?.stats) continue
          const prev = e.__testPrevSpeed
          if (typeof prev === 'number') e.stats.moveSpeed = prev
          delete e.__testPrevSpeed
        }
      })
    }

    // Stabilize before loot check: the earlier combat suite may have caused a death.
    try {
      const st0 = await getGameState(page)
      if (st0?.gameOver) {
        await respawn(page)
        await page.waitForTimeout(350)
      }
      const max = await getPlayerMaxHp(page)
      if (typeof max === 'number') await setPlayerHp(page, max)
      await page.waitForTimeout(80)
    } catch {
      // ignore
    }

	    // Loot sanity: killing an enemy should drop coins that auto-collect.
	    try {
	      const inv0 = await getInventory(page)
	      if (!(inv0 && typeof inv0.coins === 'number')) throw new Error(`bad inventory snapshot before loot: ${JSON.stringify(inv0)}`)
	      let enemiesStart = await getEnemies(page)
	      let hasSlime = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'slime') : false
	      if (!hasSlime) {
	        // Earlier suites may legitimately kill both overworld enemies (bat greatsword test can kill the bat,
	        // and if the slime wanders too close it can get hit as collateral). Reload the map enemies so this
	        // test always validates loot drops deterministically.
	        await teleportPlayer(page, 100, 100)
	        await page.waitForTimeout(120)
	        await page.waitForTimeout(650)

	        // Overworld fast warp loop: overworld -> cave -> overworld.
	        await teleportPlayer(page, 288, 352)
	        await page.waitForTimeout(220)
	        await waitForMapKey(page, 'cave', 3000)
	        await teleportPlayer(page, 352, 288)
	        await page.waitForTimeout(220)
	        await waitForMapKey(page, 'overworld', 3000)

	        enemiesStart = await getEnemies(page)
	        hasSlime = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'slime') : false
	      }
	      if (!hasSlime) throw new Error(`slime not found for loot test; enemies=${JSON.stringify(enemiesStart)}`)
	      const ok = await killEnemy(page, 'slime', 10)
	      if (!ok) throw new Error('failed to kill slime for loot test')
	      await page.waitForTimeout(250)
	      const inv1 = await getInventory(page)
	      if (!(inv1 && typeof inv1.coins === 'number')) throw new Error(`bad inventory snapshot after loot: ${JSON.stringify(inv1)}`)
      if (inv1.coins < inv0.coins + 1) {
        const dbg = await page.evaluate(() => {
          const scene = globalThis.__dbg?.player?.scene
          const ps = scene?.pickups
          const group = ps?.group
          const kids = group?.getChildren?.() ?? []
          const activeKids = kids.filter((k) => k?.active)
          const p = globalThis.__dbg?.player
          const px = typeof p?.x === 'number' ? p.x : null
          const py = typeof p?.y === 'number' ? p.y : null
          return {
            mapKey: globalThis.__dbg?.mapKey ?? null,
            gameState: typeof globalThis.__dbg?.getGameState === 'function' ? globalThis.__dbg.getGameState() : null,
            player: { x: px, y: py },
            autoPickupRadius: ps?.autoPickupRadius ?? null,
            pickupMapKey: ps?.mapKey ?? null,
            pickupCount: kids.length,
            pickupActives: activeKids.map((k) => {
              const x = typeof k?.x === 'number' ? k.x : null
              const y = typeof k?.y === 'number' ? k.y : null
              const d = typeof x === 'number' && typeof y === 'number' && typeof px === 'number' && typeof py === 'number' ? Math.hypot(x - px, y - py) : null
              return { x, y, d, meta: k?.__pickup ?? null }
            }),
            enemies: typeof globalThis.__dbg?.getEnemies === 'function' ? globalThis.__dbg.getEnemies() : null,
            lastAttack: typeof globalThis.__dbg?.getLastAttack === 'function' ? globalThis.__dbg.getLastAttack() : null,
          }
        })
        throw new Error(`expected coin loot on enemy death; coins0=${inv0.coins} coins1=${inv1.coins}; dbg=${JSON.stringify(dbg)}`)
      }
    } catch (e) {
      errors.push(`expected loot drops; ${String(e?.message ?? e)}`)
    }

    // Exercise death + delayed timers (spam attacks).
    await teleportPlayer(page, 100, 100)
    await page.waitForTimeout(80)
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        globalThis.__dbg?.tryAttack?.()
      })
      await page.waitForTimeout(260)
    }
    const lastAttack = await getLastAttack(page)
    if (!lastAttack || typeof lastAttack.hits !== 'number') errors.push(`expected __dbg.lastAttack.hits; got ${JSON.stringify(lastAttack)}`)
  }

  // Warp zones are 64x64 at x=1280..1344, y=768..832 in both maps (see map JSON).
  // Stabilize before warping: ensure we aren't paused or in game-over (which pauses physics),
  // and reset HP so we don't unexpectedly die during map transition checks.
  try {
    const st0 = await getGameState(page)
    if (st0?.paused) await togglePause(page)
    if (st0?.gameOver) {
      await respawn(page)
      await page.waitForTimeout(400)
    }
    const max = await getPlayerMaxHp(page)
    if (typeof max === 'number') await setPlayerHp(page, max)
    await page.waitForTimeout(450)
  } catch {
    // ignore; these are only for test stability
  }

  // Ensure we're starting from overworld (some earlier tests may warp).
  try {
    const mk = await getMapKey(page)
    if (mk !== 'overworld') {
      await teleportPlayer(page, 1312, 800)
      await page.waitForTimeout(200)
      await waitForMapKey(page, 'overworld', 3000)
    }
  } catch (e) {
    errors.push(`expected to stabilize to overworld; ${String(e?.message ?? e)}`)
  }

  await teleportPlayer(page, 1312, 800)
  await page.waitForTimeout(200)
  try {
    await waitForMapKey(page, 'cave', 3000)
  } catch (e) {
    errors.push(`expected warp to cave; ${String(e?.message ?? e)}`)
  }

  // Cave should have enemies too (tilemap-driven content).
  const caveEnemies0 = await getEnemies(page)
  if (!Array.isArray(caveEnemies0) || caveEnemies0.length < 2) errors.push(`expected cave enemies; got ${JSON.stringify(caveEnemies0)}`)
  else {
    const hasSlime = caveEnemies0.some((e) => e.kind === 'slime')
    const hasBat = caveEnemies0.some((e) => e.kind === 'bat')
    if (!hasSlime || !hasBat) errors.push(`expected slime+bat in cave; got ${JSON.stringify(caveEnemies0)}`)
  }

  // Cave bat has touchDamage=2 override (see cave.json).
  try {
    // Stabilize before forcing touch: ensure any invuln from overworld combat has expired,
    // and make sure we're not accidentally overlapping an enemy while waiting.
    await teleportPlayer(page, 288, 224)
    await page.waitForTimeout(900)
    const max = await getPlayerMaxHp(page)
    if (typeof max === 'number') await setPlayerHp(page, max)
    await page.waitForTimeout(80)

    const enemiesNow = await getEnemies(page)
    const bat = Array.isArray(enemiesNow) ? enemiesNow.find((e) => e.kind === 'bat') : null
    if (!bat) throw new Error('bat not found in cave for touchDamage override')
    const hp0 = await getPlayerHp(page)
    if (typeof hp0 !== 'number') throw new Error(`hp0 not numeric; hp0=${hp0}`)
    await teleportPlayer(page, typeof bat.bx === 'number' ? bat.bx : bat.x, typeof bat.by === 'number' ? bat.by : bat.y)
    await page.waitForTimeout(260)
    const hp1 = await getPlayerHp(page)
    if (typeof hp1 !== 'number') throw new Error(`hp1 not numeric; hp1=${hp1}`)
    const expected = Math.max(0, hp0 - 2)
    if (hp1 !== expected) throw new Error(`expected bat touchDamage=2; hp0=${hp0} hp1=${hp1} expected=${expected}`)
  } catch (e) {
    errors.push(`expected touchDamage override; ${String(e?.message ?? e)}`)
  }

  // Stabilize after forced touch tests: ensure invuln has expired and we are not still colliding.
  // (Otherwise game-over tests can fail when the player is still invulnerable.)
  await teleportPlayer(page, 288, 224)
  await page.waitForTimeout(900)

  // Game over + respawn: drop to 0 hp then respawn at checkpoint.
  try {
    const enemiesNow = await getEnemies(page)
    const bat = Array.isArray(enemiesNow) ? enemiesNow.find((e) => e.kind === 'bat') : null
    if (!bat) throw new Error('bat not found for game-over test')

    await setPlayerHp(page, 2)
    await page.waitForTimeout(50)
    await teleportPlayer(page, typeof bat.bx === 'number' ? bat.bx : bat.x, typeof bat.by === 'number' ? bat.by : bat.y)
    await page.waitForTimeout(400)
    const st = await getGameState(page)
    if (!st?.gameOver) throw new Error(`expected gameOver=true; state=${JSON.stringify(st)}`)

    await respawn(page)
    await page.waitForTimeout(350)
    const st2 = await getGameState(page)
    if (st2?.gameOver) throw new Error(`expected gameOver=false after respawn; state=${JSON.stringify(st2)}`)
    const hp = await getPlayerHp(page)
    const max = await getPlayerMaxHp(page)
    if (!(typeof hp === 'number' && typeof max === 'number')) throw new Error(`hp/max not numeric after respawn; hp=${hp} max=${max}`)
    if (hp !== max) throw new Error(`expected hp reset to max after respawn; hp=${hp} max=${max}`)
  } catch (e) {
    errors.push(`expected game over + respawn; ${String(e?.message ?? e)}`)
  }

  await teleportPlayer(page, 1312, 800)
  await page.waitForTimeout(200)
  try {
    await waitForMapKey(page, 'overworld', 3000)
  } catch (e) {
    errors.push(`expected warp back to overworld; ${String(e?.message ?? e)}`)
  }

  // New fast warp (near overworld spawn): x=256..320, y=320..384.
  await teleportPlayer(page, 288, 352)
  await page.waitForTimeout(200)
  try {
    await waitForMapKey(page, 'cave', 3000)
  } catch (e) {
    errors.push(`expected fast warp to cave; ${String(e?.message ?? e)}`)
  }

  // Fast return warp in cave: x=320..384,y=256..320.
  await teleportPlayer(page, 352, 288)
  await page.waitForTimeout(200)
  try {
    await waitForMapKey(page, 'overworld', 3000)
  } catch (e) {
    errors.push(`expected fast warp back to overworld; ${String(e?.message ?? e)}`)
  }

  // Save/Load sanity: force-save, reload the page, continue, and verify state persists.
  try {
    // Move to cave so checkpoint persistence is testable.
    await teleportPlayer(page, 288, 352)
    await page.waitForTimeout(200)
    await waitForMapKey(page, 'cave', 3000)

    // Make a deterministic change right before saving.
    await equipWeapon(page, 'greatsword')
    await page.waitForTimeout(80)

    const invSavedRaw = await getInventory(page)
    if (!(invSavedRaw && typeof invSavedRaw.coins === 'number' && typeof invSavedRaw.keys === 'number')) {
      throw new Error(`bad inventory snapshot before save: ${JSON.stringify(invSavedRaw)}`)
    }
    const invSaved = { ...invSavedRaw, ownedWeapons: [...(invSavedRaw.ownedWeapons ?? [])].slice().sort() }

    const savedOk = await page.evaluate(() => globalThis.__dbg?.saveNow?.())
    if (!savedOk) throw new Error(`saveNow returned ${String(savedOk)}`)

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('canvas', { timeout: 10000 })
    await page.click('canvas')
    await page.waitForFunction(() => typeof globalThis.__dbg?.getGameState === 'function', null, { timeout: 10000 })

    // Wait until the menu has finished checking for a save, then continue.
    const started = Date.now()
    while (Date.now() - started < 6000) {
      const st = await getGameState(page)
      if (st?.startMenu && !st?.startLoading) break
      await page.waitForTimeout(100)
    }
    const st = await getGameState(page)
    if (!st?.startMenu) throw new Error(`expected startMenu after reload; state=${JSON.stringify(st)}`)
    if (st?.startLoading) throw new Error(`expected start menu ready after reload; state=${JSON.stringify(st)}`)
    if (!st?.startCanContinue) throw new Error(`expected startCanContinue=true after reload; state=${JSON.stringify(st)}`)

    await page.keyboard.down('Enter')
    await page.waitForTimeout(80)
    await page.keyboard.up('Enter')
    await waitForMapKey(page, 'cave', 5000)

    const invAfterRaw = await getInventory(page)
    if (!(invAfterRaw && typeof invAfterRaw.coins === 'number' && typeof invAfterRaw.keys === 'number')) {
      throw new Error(`bad inventory snapshot after load: ${JSON.stringify(invAfterRaw)}`)
    }
    const invAfter = { ...invAfterRaw, ownedWeapons: [...(invAfterRaw.ownedWeapons ?? [])].slice().sort() }

    if (JSON.stringify(invAfter) !== JSON.stringify(invSaved)) {
      throw new Error(`expected inventory to persist; before=${JSON.stringify(invSaved)} after=${JSON.stringify(invAfter)}`)
    }

    // Chest should remain opened (no extra key reward).
    await teleportPlayer(page, 352, 288)
    await page.waitForTimeout(200)
    await waitForMapKey(page, 'overworld', 3000)
    await teleportPlayer(page, 352, 416)
    await page.waitForTimeout(120)
    const keysBefore = invAfter.keys
    await tryInteract(page)
    await page.waitForTimeout(120)
    const invChest = await getInventory(page)
    if (!(invChest && typeof invChest.keys === 'number')) throw new Error(`bad inventory after chest check: ${JSON.stringify(invChest)}`)
    if (invChest.keys !== keysBefore) throw new Error(`expected chest to stay empty after load; keysBefore=${keysBefore} keysAfter=${invChest.keys}`)
    const dlg = await getDialogue(page)
    if (!dlg?.open) throw new Error(`expected dialogue open for chest; dlg=${JSON.stringify(dlg)}`)
    if (!String(dlg.text ?? '').toLowerCase().includes('empty')) throw new Error(`expected empty-chest text after load; dlg=${JSON.stringify(dlg)}`)
    await tryInteract(page) // close
    await page.waitForTimeout(80)
  } catch (e) {
    errors.push(`expected save/load persistence; ${String(e?.message ?? e)}`)
  }

  const canvasCount = await page.locator('canvas').count()
  if (canvasCount < 1) errors.push('no canvas element found')

  await browser.close()

  if (errors.length) {
    throw new Error(`Playtest failed:\n${errors.join('\n')}`)
  }

  console.log(`OK: ${URL}`)
} catch (err) {
  console.error(String(err?.stack ?? err))
  process.exitCode = 1
} finally {
  await server.close()
}
