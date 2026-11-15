import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dataDirectory = fileURLToPath(new URL('../backend/app/data/', import.meta.url))

export async function cleanData(directory, { dryRun = false, log = console.log } = {}) {
  const requestedRoot = resolve(directory)
  const info = await lstat(requestedRoot).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!info) {
    log(`No existe la carpeta de datos: ${requestedRoot}`)
    return { count: 0, bytes: 0 }
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('La carpeta de datos debe ser un directorio real, sin enlaces simbólicos.')
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
          throw new Error(`Se rechazó una ruta fuera de la carpeta de datos: ${target}`)
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
    log(`${dryRun ? 'Se borraría' : 'Borrado'}: ${file.path}`)
  }
  log(`${dryRun ? 'Se borrarían' : 'Se borraron'} ${files.length} archivos CSV/ZIP (${(bytes / 1024 ** 3).toFixed(2)} GiB).`)
  return { count: files.length, bytes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--dry-run')) {
    console.error('Uso: node scripts/clean-data.mjs [--dry-run]')
    process.exitCode = 1
  } else {
    await cleanData(dataDirectory, { dryRun: args.includes('--dry-run') }).catch((error) => {
      console.error(`No se pudo limpiar data/: ${error.message}`)
      process.exitCode = 1
    })
  }
}
