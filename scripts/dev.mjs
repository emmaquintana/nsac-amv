import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { createTranslator, systemLanguage } from './i18n.mjs'

export function startDevelopment({ spawnProcess = spawn, runtime = process } = {}) {
  const language = systemLanguage({ env: runtime.env })
  const t = createTranslator(language)
  const root = runtime.cwd()
  const frontend = resolve(root, 'frontend')
  const backend = resolve(root, 'backend')
  const vite = resolve(frontend, 'node_modules/vite/bin/vite.js')

  if (!existsSync(vite)) {
    console.error(t('dev.dependencies'))
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

  function launch(command, args, cwd, onSuccess, options = {}) {
    const child = spawnProcess(command, args, {
      cwd, stdio: 'inherit', ...options,
      env: { ...runtime.env, ...options.env, NSAC_LANGUAGE: language, PYTHONIOENCODING: 'utf-8' },
    })
    processes.push(child)
    child.on('error', (error) => { console.error(t('dev.launch_error', { command, error: error.message })); stop(1) })
    child.on('exit', (code) => {
      if (stopping) return
      if (code === 0 && onSuccess) onSuccess()
      else stop(code ?? 1)
    })
    return child
  }

  runtime.on('SIGINT', () => stop())
  runtime.on('SIGTERM', () => stop())
  console.info(t('dev.preparing'))
  launch(python, ['-m', 'app.prepare'], backend, () => {
    const api = launch(python, ['-m', 'uvicorn', 'api.api:app', '--reload'], backend,
      undefined, {
        stdio: ['inherit', 'inherit', 'pipe'],
        // Los logs redirigidos de Python también deben conservar los acentos en Windows.
        env: { ...runtime.env, PYTHONIOENCODING: 'utf-8' },
      })
    let frontendStarted = false
    const logs = createInterface({ input: api.stderr })
    logs.on('line', (line) => {
      runtime.stderr.write(`${line}\n`)
      if (!stopping && !frontendStarted &&
          /^INFO:\s+Application startup complete\.$/.test(stripVTControlCharacters(line))) {
        frontendStarted = true
        launch(runtime.execPath, [vite, '--host', '0.0.0.0', '--clearScreen', 'false'], frontend)
      }
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevelopment()
}
