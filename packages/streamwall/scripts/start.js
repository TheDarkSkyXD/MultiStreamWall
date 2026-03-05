// Electron apps cannot start when ELECTRON_RUN_AS_NODE=1 is set
// (e.g. when launched from VS Code's integrated terminal).
// This script removes it before spawning electron-forge.
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const child = spawn('npx', ['electron-forge', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})
child.on('exit', (code) => process.exit(code ?? 0))
