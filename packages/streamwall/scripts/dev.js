// Dev script that starts Vite dev server and Electron with remote debugging.
// Usage: node scripts/dev.js
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const electronPath = require('electron')
const path = require('path')

const cwd = path.resolve(__dirname, '..')

// Start vite dev server
const vite = spawn('npx', ['vite', '--config', 'vite.renderer.config.ts'], {
  shell: true,
  stdio: 'pipe',
  cwd,
})

let viteReady = false

vite.stdout.on('data', (d) => {
  const s = d.toString()
  process.stdout.write(s)
  if (viteReady || !s.includes('Local:')) {
    return
  }
  viteReady = true
  const match = s.match(/localhost:(\d+)/)
  const port = match ? match[1] : '5173'
  console.log('\n[dev] Vite ready on port', port)
  console.log('[dev] Building main process...')

  // Build main + preloads, then launch electron
  const buildMain = spawn(
    'npx',
    ['vite', 'build', '--config', 'vite.main.config.ts', '--mode', 'development'],
    { shell: true, stdio: 'inherit', cwd },
  )
  buildMain.on('exit', () => {
    console.log('[dev] Starting Electron...')
    const electron = spawn(
      electronPath,
      ['.', '--remote-debugging-port=9222'],
      {
        stdio: 'inherit',
        cwd,
        env: {
          ...process.env,
          ELECTRON_FORGE_VD_MAIN: 'http://localhost:' + port,
        },
      },
    )
    electron.on('exit', (code) => {
      console.log('[dev] Electron exited with code', code)
      vite.kill()
      process.exit(code || 0)
    })
  })
})

vite.stderr.on('data', (d) => process.stderr.write(d))

process.on('SIGINT', () => {
  vite.kill()
  process.exit(0)
})
