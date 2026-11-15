import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTranslator, systemLanguage } from './i18n.mjs'

const dataDirectory = fileURLToPath(new URL('../backend/app/data/', import.meta.url))

export async function cleanData(directory, { dryRun = false, log = console.log, language = systemLanguage() } = {}) {
  const t = createTranslator(language)
  const requestedRoot = resolve(directory)
  const info = await lstat(requestedRoot).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!info) {
    log(t('clean.missing', { path: requestedRoot }))
    return { count: 0, bytes: 0 }
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(t('clean.directory'))
  }
  const root = await realpath(requestedRoot)
  const files = []

  async function collect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      // No seguir enlaces ni junctions a datos que estén fuera de data/.
      if (entry.isSymbolicLink()) continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) await collect(path)
      else if (entry.isFile() && ['.csv', '.zip'].includes(extname(entry.name).toLowerCase())) {
        const target = await realpath(path)
        const withinRoot = relative(root, target)
        if (isAbsolute(withinRoot) || withinRoot === '..' || withinRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
          throw new Error(t('clean.outside', { path: target }))
        }
        files.push({ path: target, bytes: (await lstat(target)).size })
      }
    }
  }

  await collect(root)
  let bytes = 0
  for (const file of files) {
    if (!dryRun) await unlink(file.path)
    bytes += file.bytes
    log(t(dryRun ? 'clean.preview_file' : 'clean.deleted_file', { path: file.path }))
  }
  log(t(dryRun ? 'clean.preview_total' : 'clean.deleted_total', {
    count: files.length,
    size: (bytes / 1024 ** 3).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }))
  return { count: files.length, bytes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t = createTranslator()
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--dry-run')) {
    console.error(t('clean.usage'))
    process.exitCode = 1
  } else {
    await cleanData(dataDirectory, { dryRun: args.includes('--dry-run') }).catch((error) => {
      console.error(t('clean.error', { error: error.message }))
      process.exitCode = 1
    })
  }
}
