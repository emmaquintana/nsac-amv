import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const frontend = resolve(root, 'frontend')
const backend = resolve(root, 'backend')
const vite = resolve(frontend, 'node_modules/vite/bin/vite.js')

if (!existsSync(vite)) {
  console.error('No se encontraron las dependencias del frontend. Ejecuta: cd frontend && npm install')
  process.exit(1)
}

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
const processes = [
  spawn(python, ['-m', 'uvicorn', 'api.api:app', '--reload'], { cwd: backend, stdio: 'inherit' }),
  spawn(process.execPath, [vite, '--host', '0.0.0.0'], { cwd: frontend, stdio: 'inherit' }),
]
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM')
  process.exitCode = code
}

for (const child of processes) {
  child.on('error', (error) => { console.error(error.message); stop(1) })
  child.on('exit', (code) => { if (!stopping) stop(code || 0) })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
