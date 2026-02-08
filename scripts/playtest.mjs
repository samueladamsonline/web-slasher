import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'

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
      const browser = await chromium.launch()
      const page = await browser.newPage()
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 2000 })
      await browser.close()
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
  return await page.evaluate(() => globalThis.__dbg?.playerHp ?? null)
}

async function getPlayerMaxHp(page) {
  return await page.evaluate(() => globalThis.__dbg?.playerMaxHp ?? null)
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

const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  env: { ...process.env, BROWSER: 'none' },
})

let devOutput = ''
const onData = (buf) => {
  const s = buf.toString('utf8')
  devOutput += s
  if (devOutput.length > 20000) devOutput = devOutput.slice(-20000)
}

dev.stdout.on('data', onData)
dev.stderr.on('data', onData)

deV:
try {
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
  await teleportPlayer(page, 260, 288)
  await page.waitForTimeout(50)
  await page.keyboard.down('d')
  await page.waitForTimeout(1500)
  await page.keyboard.up('d')
  const afterRockPush = await getPlayerPos(page)
  if (afterRockPush && afterRockPush.x > 420) errors.push(`expected rock collision to block; afterRockPush.x=${afterRockPush.x}`)

  // Warp sanity: overworld -> cave -> overworld
  const initialMapKey = await getMapKey(page)
  if (initialMapKey !== 'overworld') errors.push(`expected initial mapKey=overworld; got ${initialMapKey}`)

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
      } catch (e) {
        errors.push(`expected bat chase behavior (AI); ${String(e?.message ?? e)}`)
      }
    }

    // Touch damage sanity: colliding with an enemy should reduce player hp with invuln.
    if (slime) {
      try {
        const hp0 = await getPlayerHp(page)
        await teleportPlayer(page, slime.x, slime.y)
        await page.waitForTimeout(250)
        const hp1 = await getPlayerHp(page)
        if (!(typeof hp0 === 'number' && typeof hp1 === 'number')) throw new Error(`hp not numeric; hp0=${hp0} hp1=${hp1}`)
        if (!(hp1 === hp0 - 1 || hp1 === hp0)) throw new Error(`expected hp drop by 1; hp0=${hp0} hp1=${hp1}`)

        // Immediately collide again; should not drop again due to invuln.
        await teleportPlayer(page, slime.x, slime.y)
        await page.waitForTimeout(250)
        const hp2 = await getPlayerHp(page)
        if (typeof hp2 !== 'number') throw new Error(`hp2 not numeric; hp2=${hp2}`)
        if (hp2 < hp1) throw new Error(`expected invuln to prevent rapid drain; hp1=${hp1} hp2=${hp2}`)
      } catch (e) {
        errors.push(`expected touch damage + invuln; ${String(e?.message ?? e)}`)
      }
    }

    if (slime) {
      const { hp0, hp1, before, after, atk0, atk1 } = await slashEnemyAndGetHpDelta(page, 'slime')
      if (!(typeof hp0 === 'number' && typeof hp1 === 'number')) errors.push(`expected numeric slime hp; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      else if (hp1 >= hp0) errors.push(`expected slime hp drop; before=${hp0} after=${hp1}; attack=${JSON.stringify({ atk0, atk1 })}`)
    }

    if (bat) {
      const { hp0, hp1, before, after, atk0, atk1 } = await slashEnemyAndGetHpDelta(page, 'bat')
      if (!(typeof hp0 === 'number' && typeof hp1 === 'number')) errors.push(`expected numeric bat hp; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      else if (hp1 >= hp0) errors.push(`expected bat hp drop; before=${hp0} after=${hp1}; attack=${JSON.stringify({ atk0, atk1 })}`)
    }

    // Exercise death + delayed timers (spam attacks).
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
  await teleportPlayer(page, 1312, 800)
  await page.waitForTimeout(200)
  try {
    await waitForMapKey(page, 'cave', 3000)
  } catch (e) {
    errors.push(`expected warp to cave; ${String(e?.message ?? e)}`)
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

  const canvasCount = await page.locator('canvas').count()
  if (canvasCount < 1) errors.push('no canvas element found')

  await browser.close()

  if (errors.length) {
    throw new Error(`Playtest failed:\n${errors.join('\n')}`)
  }

  console.log(`OK: ${URL}`)
} catch (err) {
  console.error(String(err?.stack ?? err))
  console.error('\nLast dev server output:')
  console.error(devOutput)
  process.exitCode = 1
} finally {
  dev.kill('SIGTERM')
}
