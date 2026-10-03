import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AppConfig, defaultAppConfig, sanitizeConfig } from '../shared/config'

const CONFIG_FILE = 'config.json'
const MAX_CONFIG_BYTES = 1_000_000

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

    let raw: string
    try {
      raw = readFileSync(this.#file, 'utf8')
    } catch {
      this.#cache = defaultAppConfig()
      return this.#cache
    }

    if (raw.length > MAX_CONFIG_BYTES) {
      this.#cache = defaultAppConfig()
      return this.#cache
    }

    try {
      this.#cache = sanitizeConfig(JSON.parse(raw))
    } catch {
      this.#cache = defaultAppConfig()
    }

    return this.#cache
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
