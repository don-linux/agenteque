import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AppConfig, defaultAppConfig, sanitizeConfig } from '../shared/config'

const CONFIG_FILE = 'config.json'
const MAX_CONFIG_BYTES = 1_000_000

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * `config.json` en `userData`, no en `~/.agenteque`: la app se publica también
 * para Windows y macOS, donde ese directorio no es el sitio correcto.
 */
export class ConfigStore {
  #file: string
  #dir: string
  #cache: AppConfig | null = null

  constructor(userDataDir: string) {
    this.#dir = userDataDir
    this.#file = join(userDataDir, CONFIG_FILE)
  }

  load(): AppConfig {
    if (this.#cache) return this.#cache

    const config = this.#read()
    const recents = config.recents.map((entry) => ({
      ...entry,
      exists: directoryExists(entry.path),
    }))
    const changed = recents.some((entry, index) => entry.exists !== config.recents[index]?.exists)
    const next = { ...config, recents }
    if (!changed) {
      this.#cache = next
      return next
    }
    return this.save(next)
  }

  #read(): AppConfig {
    let raw: string
    try {
      raw = readFileSync(this.#file, 'utf8')
    } catch {
      return defaultAppConfig()
    }

    if (raw.length > MAX_CONFIG_BYTES) return defaultAppConfig()

    try {
      return sanitizeConfig(JSON.parse(raw))
    } catch {
      return defaultAppConfig()
    }
  }

  /** Escritura atómica: fichero temporal en el mismo directorio y `rename`. */
  save(next: AppConfig): AppConfig {
    const config = sanitizeConfig(next)
    this.#cache = config

    const temp = `${this.#file}.${randomUUID()}.tmp`
    try {
      mkdirSync(this.#dir, { recursive: true })
      writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, this.#file)
    } catch {
      rmSync(temp, { force: true })
    }

    return config
  }

  update(change: (config: AppConfig) => AppConfig): AppConfig {
    return this.save(change(this.load()))
  }
}
