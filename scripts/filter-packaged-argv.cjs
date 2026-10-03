const {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readSync,
  renameSync,
} = require('node:fs')
const path = require('node:path')

/**
 * Linux packages ship a shell entry point that filters argv, then execs the
 * real Electron binary. Fuses and `commandLine.removeSwitch` run too late:
 * Node has already opened `--inspect`, and the main isolate has already
 * applied `--js-flags`.
 *
 * electron-builder flips `electronFuses` after `afterPack`. Renaming the ELF
 * in this hook would make that flip look at the shell script and miss the
 * fuse sentinel. When fuses are configured, install the filter after the flip.
 *
 * @param {{ electronPlatformName?: string, appOutDir?: string, packager?: { executableName?: string, config?: { electronFuses?: object }, addElectronFuses?: Function } }} context
 */
module.exports = function filterPackagedArgv(context) {
  if (context.electronPlatformName !== 'linux') return

  const packager = context.packager
  if (
    packager &&
    packager.config?.electronFuses &&
    typeof packager.addElectronFuses === 'function'
  ) {
    deferUntilAfterFuses(packager)
    return
  }

  installLinuxArgvFilter(context)
}

function deferUntilAfterFuses(packager) {
  if (packager.agentequeArgvFilterWrapped) return
  const original = packager.addElectronFuses.bind(packager)
  packager.agentequeArgvFilterWrapped = true
  packager.addElectronFuses = async function (ctx, fuseConfig) {
    if (linuxFilterAlreadyInstalled(ctx)) return
    const result = await original(ctx, fuseConfig)
    installLinuxArgvFilter(ctx)
    return result
  }
}

function linuxFilterAlreadyInstalled(context) {
  const executableName = context.packager?.executableName
  const appOutDir = context.appOutDir
  if (typeof executableName !== 'string' || executableName.length === 0 || !appOutDir) return false
  const executable = path.join(appOutDir, executableName)
  const runtime = path.join(appOutDir, `${executableName}.bin`)
  return existsSync(executable) && !isElf(executable) && existsSync(runtime)
}

function installLinuxArgvFilter(context) {
  const executableName = context.packager?.executableName
  const appOutDir = context.appOutDir
  if (typeof executableName !== 'string' || executableName.length === 0 || !appOutDir) {
    throw new Error('filter-packaged-argv: linux pack context is missing the executable path')
  }

  const executable = path.join(appOutDir, executableName)
  const runtime = path.join(appOutDir, `${executableName}.bin`)
  if (!existsSync(executable)) {
    throw new Error(`filter-packaged-argv: missing packaged executable ${executable}`)
  }

  // afterPack can see the same directory again. The ELF was already renamed.
  if (!isElf(executable)) {
    if (existsSync(runtime)) return
    throw new Error(`filter-packaged-argv: ${executable} is not an ELF executable`)
  }
  if (existsSync(runtime)) {
    throw new Error(`filter-packaged-argv: runtime path already exists ${runtime}`)
  }

  renameSync(executable, runtime)
  copyFileSync(path.join(__dirname, 'linux-argv-filter.sh'), executable)
  chmodSync(executable, 0o755)
  chmodSync(runtime, 0o755)
}

function isElf(file) {
  const fd = openSync(file, 'r')
  try {
    const header = Buffer.alloc(4)
    const bytes = readSync(fd, header, 0, 4, 0)
    return bytes === 4 && header[0] === 0x7f && header.toString('ascii', 1, 4) === 'ELF'
  } finally {
    closeSync(fd)
  }
}
