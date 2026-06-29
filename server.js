// Entry point for deployment platforms that require an explicit server.js.
// If the platform runs `npm run build` before starting, server.js boots
// the pre-built app immediately. If no build step is configured, server.js
// detects the missing .next directory and runs the build automatically.

const { createServer } = require('http')
const { parse } = require('url')
const { execSync } = require('child_process')
const next = require('next')
const path = require('path')
const fs = require('fs')

const port = parseInt(process.env.PORT ?? '3000', 10)

// Build on demand if the platform didn't run `next build` as a separate step.
const buildDir = path.join(__dirname, '.next')
if (!fs.existsSync(buildDir)) {
  console.log('[autol10n] .next not found — running build now (first deploy only)...')
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname })
  } catch (err) {
    console.error('[autol10n] Build failed:', err.message)
    process.exit(1)
  }
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
