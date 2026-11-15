import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { startDevelopment } from './dev.mjs'

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'nsac-dev-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const vite = join(root, 'frontend/node_modules/vite/bin/vite.js')
  mkdirSync(join(root, 'frontend/node_modules/vite/bin'), { recursive: true })
  writeFileSync(vite, '')
  const runtime = Object.assign(new EventEmitter(), {
    cwd: () => root, env: { PYTHON: 'test-python' }, execPath: 'test-node', platform: 'win32',
  })
  const calls = []
  function spawnProcess(command, args, options) {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      killed: false,
      kill() { this.killed = true },
      finish(code) { this.exitCode = code; this.emit('exit', code) },
    })
    calls.push({ command, args, options, child })
    return child
  }
  startDevelopment({ spawnProcess, runtime })
  return { calls, runtime }
}

test('API y Vite esperan descargas y todas las cachés de FIRMS', (t) => {
  const { calls, runtime } = setup(t)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'test-python')
  assert.deepEqual(calls[0].args, ['-m', 'app.prepare'])
  calls[0].child.finish(0)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[1].args, ['-m', 'uvicorn', 'api.api:app', '--reload'])
  assert.equal(calls[2].command, 'test-node')
  runtime.emit('SIGINT')
  assert.ok(calls[1].child.killed)
  assert.ok(calls[2].child.killed)
  assert.equal(runtime.exitCode, 0)
})

test('un fallo de descarga o preparación de cachés impide iniciar API y Vite', (t) => {
  const { calls, runtime } = setup(t)
  calls[0].child.finish(1)
  assert.equal(calls.length, 1)
  assert.equal(runtime.exitCode, 1)
})

test('Ctrl+C durante la preparación no inicia servidores posteriormente', (t) => {
  const { calls, runtime } = setup(t)
  runtime.emit('SIGINT')
  assert.ok(calls[0].child.killed)
  calls[0].child.finish(0)
  assert.equal(calls.length, 1)
})

test('un intérprete inexistente impide iniciar servidores', (t) => {
  const { calls, runtime } = setup(t)
  calls[0].child.emit('error', new Error('Intérprete inexistente (prueba)'))
  assert.equal(calls.length, 1)
  assert.equal(runtime.exitCode, 1)
})
