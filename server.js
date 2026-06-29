// Entry point for deployment platforms that require an explicit server.js.
// Must be run AFTER `npm run build` — this starts the pre-built Next.js app.

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')

const port = parseInt(process.env.PORT ?? '3000', 10)

// Bail early with a clear message if the app hasn't been built yet.
const buildDir = path.join(__dirname, '.next')
if (!fs.existsSync(buildDir)) {
  console.error('[autol10n] ERROR: .next build directory not found.')
  console.error('[autol10n] Run `npm run build` before starting the server.')
  process.exit(1)
}

const app = next({ dev: false, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(port, '0.0.0.0', () => {
    console.log(`> AutoL10n ready on http://0.0.0.0:${port}`)
  })
}).catch((err) => {
  console.error('[autol10n] Failed to start:', err)
  process.exit(1)
})
