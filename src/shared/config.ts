/**
 * Forma del `config.json` que vive en `app.getPath('userData')`. El fichero lo
 * escribe el proceso main y lo consume el renderer, así que el contrato se
 * declara aquí, sin depender del alias `$lib`.
 *
 * Los ids de tema se repiten en `ui-theme.ts` y `terminal-theme.ts`, que son
 * los dueños de las paletas. `tests/unit/theme-parity.test.ts` comprueba que
 * las tres listas no se separen.
 */
export const CONFIG_VERSION = 1

export const UI_THEME_IDS = [
  'idioteque-dark',
  'idioteque-night',
  'idioteque-light',
  'platzi',
  'tokyo-night',
  'catppuccin-mocha',
  'nord',
  'gruvbox-dark',
  'everforest-dark',
  'one-dark',
  'one-half-dark',
  'one-dark-pro',
  'solarized-dark',
  'dracula',
  'campbell',
] as const

export const TERMINAL_THEME_IDS = [
  'idioteque-dark',
  'idioteque-night',
  'idioteque-light',
  'platzi',
  'tokyo-night',
  'catppuccin-mocha',
  'nord',
  'gruvbox-dark',
  'everforest-dark',
  'one-dark',
  'one-half-dark',
  'one-dark-pro',
  'solarized-dark',
  'dracula',
  'campbell',
] as const

export const DEFAULT_UI_THEME = 'idioteque-dark'
export const DEFAULT_TERMINAL_THEME = 'tokyo-night'
export const DEFAULT_TERMINAL_FONT_SIZE = 13
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24

export const DEFAULT_TREE_WIDTH = 260
export const DEFAULT_TERMINAL_BOTTOM = 280
export const DEFAULT_TERMINAL_RIGHT = 380
export const DEFAULT_TERMINAL_DOCK = 'bottom'

export const MAX_RECENT_FOLDERS = 12

export interface RecentFolder {
  path: string
  openedAt: string
  exists: boolean
}

export interface TerminalSettings {
  fontFamily: string | null
  fontSize: number
  theme: string
}

export interface AppearanceSettings {
  theme: string
}

/** Geometría de los paneles. El estado abierto/cerrado de la terminal no se guarda. */
export interface LayoutSettings {
  treeWidth: number
  treeVisible: boolean
  terminalBottom: number
  terminalRight: number
  terminalDock: string
}

export interface WorkspaceView {
  path: string
  visibleFolders: string[]
}

export interface AppConfig {
  version: number
  recents: RecentFolder[]
  terminal: TerminalSettings
  appearance: AppearanceSettings
  layout: LayoutSettings
  workspaceViews: WorkspaceView[]
}

export function defaultAppConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    recents: [],
    terminal: {
      fontFamily: null,
      fontSize: DEFAULT_TERMINAL_FONT_SIZE,
      theme: DEFAULT_TERMINAL_THEME,
    },
    appearance: { theme: DEFAULT_UI_THEME },
    layout: {
      treeWidth: DEFAULT_TREE_WIDTH,
      treeVisible: true,
      terminalBottom: DEFAULT_TERMINAL_BOTTOM,
      terminalRight: DEFAULT_TERMINAL_RIGHT,
      terminalDock: DEFAULT_TERMINAL_DOCK,
    },
    workspaceViews: [],
  }
}

export function isUiThemeId(id: unknown): boolean {
  return typeof id === 'string' && (UI_THEME_IDS as readonly string[]).includes(id)
}

export function isTerminalThemeId(id: unknown): boolean {
  return typeof id === 'string' && (TERMINAL_THEME_IDS as readonly string[]).includes(id)
}

export function clampFontSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_TERMINAL_FONT_SIZE
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(size)))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sanitizeRecents(value: unknown): RecentFolder[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const recents: RecentFolder[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const path = row?.path
    if (typeof path !== 'string' || path === '' || seen.has(path)) continue
    seen.add(path)
    recents.push({
      path,
      openedAt: typeof row?.openedAt === 'string' ? row.openedAt : new Date(0).toISOString(),
      exists: row?.exists !== false,
    })
    if (recents.length >= MAX_RECENT_FOLDERS) break
  }

  return recents
}

function sanitizeTerminal(value: unknown): TerminalSettings {
  const row = asRecord(value)
  const family = typeof row?.fontFamily === 'string' ? row.fontFamily.trim() : ''
  return {
    fontFamily: family === '' ? null : family,
    fontSize: clampFontSize(row?.fontSize),
    theme: isTerminalThemeId(row?.theme) ? (row?.theme as string) : DEFAULT_TERMINAL_THEME,
  }
}

function sanitizeAppearance(value: unknown): AppearanceSettings {
  const row = asRecord(value)
  return { theme: isUiThemeId(row?.theme) ? (row?.theme as string) : DEFAULT_UI_THEME }
}

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.round(value)
}

function sanitizeLayout(value: unknown): LayoutSettings {
  const row = asRecord(value)
  const fallback = defaultAppConfig().layout
  return {
    treeWidth: positiveInt(row?.treeWidth, fallback.treeWidth),
    treeVisible: row?.treeVisible !== false,
    terminalBottom: positiveInt(row?.terminalBottom, fallback.terminalBottom),
    terminalRight: positiveInt(row?.terminalRight, fallback.terminalRight),
    terminalDock: row?.terminalDock === 'right' ? 'right' : DEFAULT_TERMINAL_DOCK,
  }
}

function sanitizeWorkspaceViews(value: unknown): WorkspaceView[] {
  if (!Array.isArray(value)) return []

  const views: WorkspaceView[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    if (typeof row?.path !== 'string' || row.path === '') continue
    const folders = Array.isArray(row.visibleFolders)
      ? row.visibleFolders.filter((name): name is string => typeof name === 'string')
      : []
    views.push({ path: row.path, visibleFolders: folders })
  }

  return views
}

export function sanitizeConfig(value: unknown): AppConfig {
  const row = asRecord(value)
  if (!row) return defaultAppConfig()

  return {
    version: CONFIG_VERSION,
    recents: sanitizeRecents(row.recents),
    terminal: sanitizeTerminal(row.terminal),
    appearance: sanitizeAppearance(row.appearance),
    layout: sanitizeLayout(row.layout),
    workspaceViews: sanitizeWorkspaceViews(row.workspaceViews),
  }
}

export function withRecent(config: AppConfig, path: string): AppConfig {
  const trimmed = path.trim()
  if (trimmed === '') return config

  const rest = config.recents.filter((entry) => entry.path !== trimmed)
  const recents: RecentFolder[] = [
    { path: trimmed, openedAt: new Date().toISOString(), exists: true },
    ...rest,
  ].slice(0, MAX_RECENT_FOLDERS)

  return { ...config, recents }
}

export function withoutRecent(config: AppConfig, path: string): AppConfig {
  return { ...config, recents: config.recents.filter((entry) => entry.path !== path) }
}

export function withWorkspaceView(config: AppConfig, view: WorkspaceView): AppConfig {
  const [sanitized] = sanitizeWorkspaceViews([view])
  if (!sanitized) return config

  const rest = config.workspaceViews.filter((entry) => entry.path !== sanitized.path)
  return { ...config, workspaceViews: [...rest, sanitized] }
}
