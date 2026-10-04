/**
 * Copies the node-pty runtime into `out/main/node_modules/node-pty`.
 *
 * The packaged app may only contain `out/**` and `package.json`. `require('node-pty')`
 * from `out/main/index.js` then resolves this copy. Source, tests, sourcemaps and
 * `node-addon-api` stay out: they fail the packaged-payload checks.
 */
const {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.dirname(require.resolve('node-pty/package.json'))
const dest = path.join(root, 'out/main/node_modules/node-pty')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'))
writeFileSync(
  path.join(dest, 'package.json'),
  `${JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main }, null, 2)}\n`,
)

copyJavaScript(path.join(source, 'lib'), path.join(dest, 'lib'))
copyRelease(path.join(source, 'build/Release'), path.join(dest, 'build/Release'))

function copyJavaScript(from, to) {
  if (!statExists(from)) return
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name)
    const targetPath = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyJavaScript(sourcePath, targetPath)
      continue
    }
    if (!entry.name.endsWith('.js') || entry.name.includes('.test.')) continue
    const text = readFileSync(sourcePath, 'utf8').replaceAll(/^\/\/# sourceMappingURL=.*$/gm, '')
    writeFileSync(targetPath, text)
  }
}

function copyRelease(from, to) {
  if (!statExists(from)) return
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      entry.name === 'obj.target' ||
      entry.name.includes('node-addon-api')
    ) {
      continue
    }
    const sourcePath = path.join(from, entry.name)
    const targetPath = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyRelease(sourcePath, targetPath)
      continue
    }
    if (entry.name.endsWith('.pdb') || entry.name.endsWith('.map')) continue
    copyFileSync(sourcePath, targetPath)
    if (isNative(entry.name)) chmodSync(targetPath, 0o755)
  }
}

function isNative(name) {
  return (
    name.endsWith('.node') ||
    name.endsWith('.dll') ||
    name.endsWith('.exe') ||
    name === 'spawn-helper'
  )
}

function statExists(file) {
  try {
    statSync(file)
    return true
  } catch {
    return false
  }
}
