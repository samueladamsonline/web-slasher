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
const QUERY = process.env.QUERY ? String(process.env.QUERY) : ''
const URL = `http://127.0.0.1:${PORT}/${QUERY ? (QUERY.startsWith('?') ? QUERY : `?${QUERY}`) : ''}`

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

const server = await createServer({
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  clearScreen: false,
  // Reduce noise in CI output, but keep errors visible.
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
  process.exitCode = 1
} finally {
  await server.close()
}
