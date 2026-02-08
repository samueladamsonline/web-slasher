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
  await page.waitForTimeout(1500)

  const canvasCount = await page.locator('canvas').count()
  if (canvasCount < 1) errors.push('no canvas element found')

  await browser.close()

  if (errors.length) {
    throw new Error(`Smoke test failed:\n${errors.join('\n')}`)
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
