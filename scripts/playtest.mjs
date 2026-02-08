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

  // Combat sanity: enemy exists and can be damaged with Space.
  const enemies0 = await getEnemies(page)
  if (!Array.isArray(enemies0) || enemies0.length < 1) errors.push(`expected at least 1 enemy; got ${JSON.stringify(enemies0)}`)
  else {
    const e0 = enemies0[0]
    await teleportPlayer(page, e0.x - 42, e0.y)
    await page.waitForTimeout(100)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    const enemies1 = await getEnemies(page)
    const hp0 = e0.hp
    const hp1 = Array.isArray(enemies1) && enemies1.length ? enemies1[0].hp : null
    if (!(typeof hp0 === 'number' && typeof hp1 === 'number'))
      errors.push(`expected numeric enemy hp; before=${JSON.stringify(enemies0)} after=${JSON.stringify(enemies1)}`)
    else if (hp1 >= hp0) errors.push(`expected enemy hp to drop; before=${hp0} after=${hp1}`)
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
