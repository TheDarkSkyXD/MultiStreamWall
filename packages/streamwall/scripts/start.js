// Start script for Streamwall development.
// Uses electron-forge to build main + preload bundles, then starts
// our own Vite dev server and spawns Electron manually.
// (Works around Forge spawn issues on Node 24 where Forge exits
// and kills the Vite dev server before Electron can connect.)
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const path = require('path')

const cwd = path.resolve(__dirname, '..')
const userArgs = process.argv.slice(2)
console.log('[start] userArgs:', JSON.stringify(userArgs))

// Phase 1: Use electron-forge to build main + preloads.
// Forge also starts a Vite dev server, but that dies when Forge exits.
console.log('[start] Building with electron-forge...')
const forge = spawn('npx', ['electron-forge', 'start', ...userArgs], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
  shell: true,
  cwd,
})

forge.stdout.on('data', (data) => {
  process.stdout.write(data.toString())
})

forge.on('exit', (code) => {
  console.log('\n[start] Forge exited (code ' + code + '). Starting Vite dev server...')

  // Phase 2: Start our own Vite dev server for the renderer.
  const vite = spawn(
    'npx',
    ['vite', '--config', 'vite.renderer.config.ts', '--port', '5173'],
    {
      shell: true,
      stdio: 'pipe',
      cwd,
    },
  )

  vite.stderr.on('data', (d) => process.stderr.write(d))

  vite.stdout.on('data', (d) => {
    const s = d.toString()
    process.stdout.write(s)

    // Phase 3: Once Vite is ready, launch Electron.
    // Strip ANSI escape codes before matching (Vite output has formatting).
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '')
    if (plain.includes('Local:')) {
      console.log('\n[start] Vite dev server ready. Launching Electron...')

      const electronPath = require('electron')
      const electron = spawn(
        electronPath,
        ['.', '--remote-debugging-port=9222', ...userArgs],
        {
          stdio: 'inherit',
          cwd,
          env: process.env,
        },
      )

      electron.on('exit', (exitCode) => {
        vite.kill()
        process.exit(exitCode || 0)
      })
    }
  })

  vite.on('exit', (viteCode) => {
    console.error('[start] Vite dev server exited unexpectedly (code ' + viteCode + ')')
    process.exit(1)
  })
})

process.on('SIGINT', () => {
  forge.kill()
  process.exit(0)
})
