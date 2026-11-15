import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function startDevelopment({ spawnProcess = spawn, runtime = process } = {}) {
  const root = runtime.cwd()
  const frontend = resolve(root, 'frontend')
  const backend = resolve(root, 'backend')
  const vite = resolve(frontend, 'node_modules/vite/bin/vite.js')

  if (!existsSync(vite)) {
    console.error('No se encontraron las dependencias del frontend. Ejecuta: cd frontend && npm install')
    runtime.exitCode = 1
    return
  }

  const python = runtime.env.PYTHON || (runtime.platform === 'win32' ? 'python' : 'python3')
  const processes = []
  let stopping = false

  function stop(code = 0) {
    if (stopping) return
    stopping = true
    for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM')
    runtime.exitCode = code
  }

  function launch(command, args, cwd, onSuccess) {
    const child = spawnProcess(command, args, { cwd, stdio: 'inherit' })
    processes.push(child)
    child.on('error', (error) => { console.error(error.message); stop(1) })
    child.on('exit', (code) => {
      if (stopping) return
      if (code === 0 && onSuccess) onSuccess()
      else stop(code ?? 1)
    })
  }

  runtime.on('SIGINT', () => stop())
  runtime.on('SIGTERM', () => stop())
  console.info('Preparando descargas, catálogo, mapa y totales diarios antes de iniciar la API y el frontend…')
  launch(python, ['-m', 'app.prepare'], backend, () => {
    launch(python, ['-m', 'uvicorn', 'api.api:app', '--reload'], backend)
    if (!stopping) launch(runtime.execPath, [vite, '--host', '0.0.0.0'], frontend)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevelopment()
}
