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

  await teleportPlayer(page, tx - 42, ty)
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    const scene = globalThis.__dbg?.player?.scene
    const p = globalThis.__dbg?.player
    if (!scene || !p) return
    scene.facing = 'right'
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
  await page.waitForTimeout(80)
  const atk1 = await getLastAttack(page)
  await page.waitForTimeout(170)

  const after = await getEnemies(page)
  const afterEnemy = Array.isArray(after) ? after.find((e) => e.kind === kind) : null
  const hp1 = afterEnemy?.hp

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
      const scene = globalThis.__dbg?.player?.scene
      const p = globalThis.__dbg?.player
      if (!scene || !p) return
      scene.facing = 'right'
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
        await teleportPlayer(page, b0.x - 120, b0.y)
        await page.waitForTimeout(120)
        const d0 = Math.hypot(b0.x - (b0.x - 120), b0.y - b0.y)
        await page.waitForTimeout(900)
        const enemiesAfter = await getEnemies(page)
        const b1 = Array.isArray(enemiesAfter) ? enemiesAfter.find((e) => e.kind === 'bat') : null
        if (!b1) throw new Error(`bat disappeared; mapKey=${await getMapKey(page)}; enemiesAfter=${JSON.stringify(enemiesAfter)}`)
        const d1 = Math.hypot(b1.x - (b0.x - 120), b1.y - b0.y)
        if (!(d1 < d0)) throw new Error(`expected bat distance to player to decrease; d0=${d0} d1=${d1}`)

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

    // Touch damage sanity: colliding with an enemy should reduce player hp with invuln.
    if (slime) {
      try {
        const enemiesNow0 = await getEnemies(page)
        const s0 = Array.isArray(enemiesNow0) ? enemiesNow0.find((e) => e.kind === 'slime') : null
        if (!s0) throw new Error(`slime not found for touch test; enemies=${JSON.stringify(enemiesNow0)}`)

        // Ensure we aren't still invulnerable from earlier enemy contact tests.
        const max = await getPlayerMaxHp(page)
        if (typeof max === 'number') await setPlayerHp(page, max)
        await page.waitForTimeout(650)

        const hp0 = await getPlayerHp(page)
        await teleportPlayer(page, typeof s0.bx === 'number' ? s0.bx : s0.x, typeof s0.by === 'number' ? s0.by : s0.y)
        await page.waitForTimeout(320)
        const hp1 = await getPlayerHp(page)
        if (!(typeof hp0 === 'number' && typeof hp1 === 'number')) throw new Error(`hp not numeric; hp0=${hp0} hp1=${hp1}`)
        if (!(hp1 === hp0 - 1)) throw new Error(`expected hp drop by 1 on contact; hp0=${hp0} hp1=${hp1}`)

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
      }
    }

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
      await equipWeapon(page, 'greatsword')
      const { hp0, hp1, before, after } = await slashEnemyAndGetHpDelta(page, 'bat')
      if (!(typeof hp0 === 'number')) throw new Error(`expected numeric bat hp for greatsword test; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      if (typeof hp1 === 'number') {
        const expected = Math.max(0, hp0 - 2)
        if (hp1 !== expected) throw new Error(`expected greatsword damage=2; before=${hp0} after=${hp1} expected=${expected}`)
      } else {
        // If the bat was killed and removed, that's fine as long as it wasn't a higher HP enemy.
        if (hp0 > 2) throw new Error(`expected bat to survive or report hp after hit; beforeHp=${hp0} after=${JSON.stringify(after)}`)
      }
    } catch (e) {
      errors.push(`expected greatsword weapon stats; ${String(e?.message ?? e)}`)
    } finally {
      await equipWeapon(page, 'sword')
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
      const enemiesStart = await getEnemies(page)
      const hasSlime = Array.isArray(enemiesStart) ? enemiesStart.some((e) => e.kind === 'slime') : false
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
