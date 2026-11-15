import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { cleanData } from './clean-data.mjs'

async function setup(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'nsac-clean-data-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'data')
  const folder = join(root, 'DL_FIRE_M-C61_848778')
  await mkdir(folder, { recursive: true })
  const dataFiles = [join(root, 'legacy.csv'), join(root, 'download.ZIP'), join(folder, 'fire_archive.csv')]
  const preserved = [join(root, '__init__.py'), join(root, 'ArmMV_FRP_por_par.py'), join(folder, 'Readme.txt')]
  for (const file of [...dataFiles, ...preserved]) await writeFile(file, 'contenido')
  return { temporary, root, dataFiles, preserved }
}

test('borra CSV y ZIP recursivamente y conserva código y documentación', async (t) => {
  const { root, dataFiles, preserved } = await setup(t)
  const result = await cleanData(root, { log() {} })
  assert.equal(result.count, 3)
  for (const file of dataFiles) await assert.rejects(readFile(file), { code: 'ENOENT' })
  for (const file of preserved) assert.equal(await readFile(file, 'utf8'), 'contenido')
  assert.equal((await cleanData(root, { log() {} })).count, 0)
})

test('--dry-run informa archivos sin borrarlos', async (t) => {
  const { root, dataFiles } = await setup(t)
  const messages = []
  const result = await cleanData(root, { dryRun: true, log: (message) => messages.push(message) })
  assert.equal(result.count, 3)
  assert.equal(result.bytes, 27)
  assert.ok(messages.at(-1).includes('Se borrarían 3 archivos'))
  for (const file of dataFiles) assert.equal(await readFile(file, 'utf8'), 'contenido')
})

test('no sigue enlaces a carpetas externas', async (t) => {
  const { temporary, root } = await setup(t)
  const outside = join(temporary, 'outside')
  await mkdir(outside)
  const file = join(outside, 'keep.csv')
  await writeFile(file, 'preservar')
  await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await cleanData(root, { log() {} })
  assert.equal(await readFile(file, 'utf8'), 'preservar')
})
