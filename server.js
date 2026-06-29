// Entry point for deployment platforms that require an explicit server.js.
// The .next build directory is committed to the repository and COPY'd into
// the container image — no build step runs at container startup.

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')

const port = parseInt(process.env.PORT ?? '3000', 10)

const buildDir = path.join(__dirname, '.next')
if (!fs.existsSync(buildDir)) {
  console.error('[autol10n] .next directory not found.')
  console.error('[autol10n] Run `npm run build` locally and ensure .next/ is committed before deploying.')
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
