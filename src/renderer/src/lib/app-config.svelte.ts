import { configIpc } from '$lib/backend/config-ipc'
import { visibilityFor } from '$lib/folder-visibility'
import {
  DEFAULT_TERMINAL_BOTTOM,
  DEFAULT_TERMINAL_RIGHT,
  DEFAULT_TREE_WIDTH,
} from '$lib/panel-resize'
import { clampFontSize, DEFAULT_TERMINAL_FONT_SIZE, type SystemFont } from '$lib/terminal-font'
import {
  DEFAULT_TERMINAL_THEME_ID,
  resolveTerminalThemeId,
  type TerminalThemeId,
} from '$lib/terminal-theme'
import { DEFAULT_UI_THEME_ID, resolveUiThemeId, type UiThemeId } from '$lib/ui-theme'
import type {
  AppConfig,
  AppearanceSettings,
  LayoutSettings,
  RecentFolder,
  TerminalSettings,
  WorkspaceView,
} from '../../../shared/config'

export type {
  AppConfig,
  AppearanceSettings,
  LayoutSettings,
  RecentFolder,
  TerminalSettings,
  WorkspaceView,
}

function messageFrom(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeFamily(family: string | null | undefined): string | null {
  const trimmed = family?.trim()
  return trimmed ? trimmed : null
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  treeWidth: DEFAULT_TREE_WIDTH,
  treeVisible: true,
  terminalBottom: DEFAULT_TERMINAL_BOTTOM,
  terminalRight: DEFAULT_TERMINAL_RIGHT,
  terminalDock: 'bottom',
}

/**
 * Lista curada de monoespaciadas. Electron no tiene equivalente de
 * `list_system_fonts`; `queryLocalFonts()` existe en Chromium pero exige un
 * permiso explícito desde el proceso principal, así que queda para la etapa 2.
 * El selector acepta además texto libre, así que una fuente que no esté aquí
 * se puede escribir a mano.
 */
export const CURATED_MONO_FONTS: readonly SystemFont[] = [
  { family: 'JetBrains Mono', monospace: true },
  { family: 'Cascadia Mono', monospace: true },
  { family: 'Consolas', monospace: true },
  { family: 'Courier New', monospace: true },
  { family: 'DejaVu Sans Mono', monospace: true },
  { family: 'Fira Code', monospace: true },
  { family: 'Hack', monospace: true },
  { family: 'IBM Plex Mono', monospace: true },
  { family: 'Iosevka', monospace: true },
  { family: 'Liberation Mono', monospace: true },
  { family: 'Menlo', monospace: true },
  { family: 'Monaco', monospace: true },
  { family: 'Noto Sans Mono', monospace: true },
  { family: 'Roboto Mono', monospace: true },
  { family: 'SF Mono', monospace: true },
  { family: 'Source Code Pro', monospace: true },
  { family: 'Ubuntu Mono', monospace: true },
]

class AppConfigState {
  recents = $state<RecentFolder[]>([])
  terminalFontFamily = $state<string | null>(null)
  terminalFontSize = $state(DEFAULT_TERMINAL_FONT_SIZE)
  terminalTheme = $state<TerminalThemeId>(DEFAULT_TERMINAL_THEME_ID)
  uiTheme = $state<UiThemeId>(DEFAULT_UI_THEME_ID)
  layout = $state<LayoutSettings>({ ...DEFAULT_LAYOUT })
  workspaceViews = $state<WorkspaceView[]>([])
  fonts = $state.raw<SystemFont[]>([])
  fontsLoaded = $state(false)
  loaded = $state(false)
  error = $state<string | null>(null)
  /** Descarta respuestas de carga o guardado que terminan fuera de orden. */
  #gen = 0

  apply(config: AppConfig): void {
    this.recents = config.recents
    this.terminalFontFamily = normalizeFamily(config.terminal.fontFamily)
    this.terminalFontSize = clampFontSize(config.terminal.fontSize)
    this.terminalTheme = resolveTerminalThemeId(config.terminal.theme)
    this.uiTheme = resolveUiThemeId(config.appearance.theme)
    this.layout = { ...DEFAULT_LAYOUT, ...config.layout }
    this.workspaceViews = config.workspaceViews
    this.error = null
  }

  visibilityFor(path: string): string[] | undefined {
    return visibilityFor(this.workspaceViews, path)
  }

  async load(): Promise<void> {
    const gen = ++this.#gen

    try {
      const config = await configIpc.load()
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.recents = []
      this.terminalFontFamily = null
      this.terminalFontSize = DEFAULT_TERMINAL_FONT_SIZE
      this.terminalTheme = DEFAULT_TERMINAL_THEME_ID
      this.uiTheme = DEFAULT_UI_THEME_ID
      this.layout = { ...DEFAULT_LAYOUT }
      this.workspaceViews = []
      this.error = messageFrom(error)
    } finally {
      if (gen === this.#gen) {
        this.loaded = true
      }
    }
  }

  async record(path: string): Promise<string | null> {
    const gen = ++this.#gen

    try {
      const config = await configIpc.recordRecent(path)
      const recorded = config.recents[0]?.path ?? null
      if (gen !== this.#gen) return recorded
      this.apply(config)
      return recorded
    } catch (error) {
      if (gen !== this.#gen) return null
      this.error = messageFrom(error)
      return null
    }
  }

  async remove(path: string): Promise<void> {
    const gen = ++this.#gen

    try {
      const config = await configIpc.removeRecent(path)
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.error = messageFrom(error)
    }
  }

  async saveTerminal(input: {
    fontFamily: string | null
    fontSize: number
    theme: string
  }): Promise<void> {
    const fontFamily = normalizeFamily(input.fontFamily)
    const fontSize = clampFontSize(input.fontSize)
    const theme = resolveTerminalThemeId(input.theme)
    this.terminalFontFamily = fontFamily
    this.terminalFontSize = fontSize
    this.terminalTheme = theme

    const gen = ++this.#gen

    try {
      const config = await configIpc.saveTerminal({ fontFamily, fontSize, theme })
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.error = messageFrom(error)
    }
  }

  async saveAppearance(input: { theme: string }): Promise<void> {
    const theme = resolveUiThemeId(input.theme)
    this.uiTheme = theme

    const gen = ++this.#gen

    try {
      const config = await configIpc.saveAppearance({ theme })
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.error = messageFrom(error)
    }
  }

  /** Se llama al soltar un arrastre o al alternar un panel, nunca por cada píxel. */
  async saveLayout(input: LayoutSettings): Promise<void> {
    this.layout = { ...input }

    const gen = ++this.#gen

    try {
      const config = await configIpc.saveLayout(input)
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.error = messageFrom(error)
    }
  }

  async saveVisibility(path: string, visibleFolders: string[]): Promise<void> {
    const gen = ++this.#gen

    try {
      const config = await configIpc.saveWorkspaceView({ path, visibleFolders })
      if (gen !== this.#gen) return
      this.apply(config)
    } catch (error) {
      if (gen !== this.#gen) return
      this.error = messageFrom(error)
    }
  }

  async listSystemFonts(): Promise<SystemFont[]> {
    if (this.fontsLoaded) return this.fonts

    this.fonts = [...CURATED_MONO_FONTS]
    this.fontsLoaded = true
    return this.fonts
  }
}

export const appConfig = new AppConfigState()
