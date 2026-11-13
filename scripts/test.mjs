// Unit tests for modules that do not need Electron: bundle each src/**/*.test.ts with esbuild (which also resolves
// the @shared alias from tsconfig) and run the bundles with Node's built-in test runner.
import { spawnSync } from 'node:child_process'
import { globSync, rmSync } from 'node:fs'
import { basename } from 'node:path'
import { build } from 'esbuild'

// Not under node_modules: node --test skips node_modules when matching its arguments.
const outdir = '.test-build'
const entryPoints = globSync('src/**/*.test.ts').map((p) => p.replaceAll('\\', '/'))

if (entryPoints.length === 0) {
  console.log('Tidak ada file tes.')
  process.exit(0)
}

rmSync(outdir, { recursive: true, force: true })
await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  outbase: 'src',
  outExtension: { '.js': '.mjs' },
  tsconfig: 'tsconfig.node.json',
  external: ['electron', 'better-sqlite3'],
  logLevel: 'warning'
})

// node --test treats its arguments as glob patterns, where a backslash is an escape, so pass forward slashes.
const outFiles = globSync(`${outdir.replaceAll('\\', '/')}/**/*.test.mjs`).map((f) => f.replaceAll('\\', '/'))
console.log(`Menjalankan ${outFiles.length} file tes: ${outFiles.map((f) => basename(f)).join(', ')}`)
const run = spawnSync(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' })
process.exit(run.status ?? 1)
