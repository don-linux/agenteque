import type { ITerminalOptions, ITheme } from '@xterm/xterm'

export const DEFAULT_TERMINAL_THEME_ID = 'tokyo-night' as const

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

export type TerminalThemeId = (typeof TERMINAL_THEME_IDS)[number]

export const TERMINAL_ANSI_SLOTS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

export type TerminalAnsiSlot = (typeof TERMINAL_ANSI_SLOTS)[number]

export interface TerminalThemeDefinition {
  id: TerminalThemeId
  label: string
  theme: ITheme
}

/** App palette from ui-theme.ts Idioteque Dark tokens and graph. */
const IDIOTEQUE_DARK: ITheme = {
  background: '#1c1e22',
  foreground: '#d2d5db',
  cursor: '#d2d5db',
  cursorAccent: '#1c1e22',
  selectionBackground: '#2c3038',
  selectionForeground: '#d2d5db',
  black: '#1c1e22',
  red: '#e08b99',
  green: '#9ec48b',
  yellow: '#c4a882',
  blue: '#7b9ee8',
  magenta: '#b79ee8',
  cyan: '#8ec4c4',
  white: '#d2d5db',
  brightBlack: '#6a7080',
  brightRed: '#e08b99',
  brightGreen: '#9ec48b',
  brightYellow: '#e8b17b',
  brightBlue: '#8eb0ee',
  brightMagenta: '#c48bb7',
  brightCyan: '#8ec4c4',
  brightWhite: '#d2d5db',
}

/** App palette from ui-theme.ts Idioteque Night tokens and graph. */
const IDIOTEQUE_NIGHT: ITheme = {
  background: '#14161a',
  foreground: '#e4e6ea',
  cursor: '#e4e6ea',
  cursorAccent: '#14161a',
  selectionBackground: '#22262d',
  selectionForeground: '#e4e6ea',
  black: '#14161a',
  red: '#f7768e',
  green: '#e0af68',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#41a6b5',
  white: '#e4e6ea',
  brightBlack: '#666d79',
  brightRed: '#f7768e',
  brightGreen: '#e0af68',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#41a6b5',
  brightWhite: '#e4e6ea',
}

/** App palette from ui-theme.ts Idioteque Light tokens and graph. */
const IDIOTEQUE_LIGHT: ITheme = {
  background: '#f2f3f5',
  foreground: '#2c3038',
  cursor: '#2c3038',
  cursorAccent: '#f2f3f5',
  selectionBackground: '#e8eaee',
  selectionForeground: '#2c3038',
  black: '#2c3038',
  red: '#c94b61',
  green: '#4a7a3d',
  yellow: '#7a5c2e',
  blue: '#3d6ec9',
  magenta: '#7a4ec9',
  cyan: '#2a7d8c',
  white: '#d5d8de',
  brightBlack: '#8a909a',
  brightRed: '#c94b61',
  brightGreen: '#4a7a3d',
  brightYellow: '#a3611e',
  brightBlue: '#3d6ec9',
  brightMagenta: '#b02f8a',
  brightCyan: '#2a7d8c',
  brightWhite: '#f7f8fa',
}

/**
 * Platzi Theme Green Mode from platzi/platzi-theme
 * themes/Platzi Theme-color-theme.json tokenColors.
 */
const PLATZI: ITheme = {
  background: '#03091e',
  foreground: '#eeffff',
  cursor: '#eeffff',
  cursorAccent: '#03091e',
  selectionBackground: '#0c1633',
  selectionForeground: '#eeffff',
  black: '#03091e',
  red: '#ff5370',
  green: '#c3e88d',
  yellow: '#ffcb6b',
  blue: '#82aaff',
  magenta: '#c792ea',
  cyan: '#89ddff',
  white: '#eeffff',
  brightBlack: '#546e7a',
  brightRed: '#f07178',
  brightGreen: '#adeb42',
  brightYellow: '#ffcb6b',
  brightBlue: '#82aaff',
  brightMagenta: '#c792ea',
  brightCyan: '#89ddff',
  brightWhite: '#eeffff',
}

/**
 * Tokyo Night Night from folke/tokyonight.nvim extras (Alacritty/WezTerm/Ghostty).
 */
const TOKYO_NIGHT: ITheme = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#283457',
  selectionForeground: '#c0caf5',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#ff899d',
  brightGreen: '#9fe044',
  brightYellow: '#faba4a',
  brightBlue: '#8db0ff',
  brightMagenta: '#c7a9ff',
  brightCyan: '#a4daff',
  brightWhite: '#c0caf5',
}

/** Dracula Syntax Highlighting Specification §1.2 */
const DRACULA: ITheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
}

/**
 * Nord official palette (nord0–nord15) mapped the terminal way:
 * bg nord0, fg nord4, selection nord2, ANSI aurora/frost.
 * https://www.nordtheme.com/docs/colors-and-palettes
 */
const NORD: ITheme = {
  background: '#2e3440',
  foreground: '#d8dee9',
  cursor: '#d8dee9',
  cursorAccent: '#2e3440',
  selectionBackground: '#434c5e',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
}

/**
 * Everforest Dark Medium from sainnhe/everforest palette.md, mapped the
 * terminal way: bg bg0, fg, ANSI from palette2 accents.
 * https://github.com/sainnhe/everforest/blob/master/palette.md
 */
const EVERFOREST_DARK: ITheme = {
  background: '#2d353b',
  foreground: '#d3c6aa',
  cursor: '#d3c6aa',
  cursorAccent: '#2d353b',
  selectionBackground: '#543a48',
  selectionForeground: '#d3c6aa',
  black: '#343f44',
  red: '#e67e80',
  green: '#a7c080',
  yellow: '#dbbc7f',
  blue: '#7fbbb3',
  magenta: '#d699b6',
  cyan: '#83c092',
  white: '#d3c6aa',
  brightBlack: '#7a8478',
  brightRed: '#e67e80',
  brightGreen: '#a7c080',
  brightYellow: '#dbbc7f',
  brightBlue: '#7fbbb3',
  brightMagenta: '#d699b6',
  brightCyan: '#83c092',
  brightWhite: '#d3c6aa',
}

/** morhetz/gruvbox dark0 + neutral/bright ANSI */
const GRUVBOX_DARK: ITheme = {
  background: '#282828',
  foreground: '#ebdbb2',
  cursor: '#ebdbb2',
  cursorAccent: '#282828',
  selectionBackground: '#504945',
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
}

/** catppuccin/ghostty themes/catppuccin-mocha.conf */
const CATPPUCCIN_MOCHA: ITheme = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#11111b',
  selectionBackground: '#353749',
  selectionForeground: '#cdd6f4',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#a6adc8',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#bac2de',
}

/**
 * Atom One Dark Syntax colors.less. Background is the syntax editor #282c34,
 * same as UI --bg.
 * https://github.com/atom/atom/blob/master/packages/one-dark-syntax/styles/colors.less
 */
const ONE_DARK: ITheme = {
  background: '#282c34',
  foreground: '#abb2bf',
  cursor: '#abb2bf',
  cursorAccent: '#282c34',
  selectionBackground: '#3e4451',
  selectionForeground: '#abb2bf',
  black: '#282c34',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#abb2bf',
}

/** One Half Dark. purple → magenta. */
const ONE_HALF_DARK: ITheme = {
  background: '#282c34',
  foreground: '#dcdfe4',
  cursor: '#ffffff',
  cursorAccent: '#282c34',
  black: '#282c34',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#dcdfe4',
  brightBlack: '#5a6374',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#dcdfe4',
}

/**
 * Binaryify/OneDark-Pro themes/OneDark-Pro.json terminal.ansi*.
 * https://github.com/Binaryify/OneDark-Pro
 */
const ONE_DARK_PRO: ITheme = {
  background: '#282c34',
  foreground: '#abb2bf',
  cursor: '#528bff',
  cursorAccent: '#282c34',
  selectionBackground: '#2c313c',
  black: '#3f4451',
  red: '#e05561',
  green: '#8cc265',
  yellow: '#d18f52',
  blue: '#4aa5f0',
  magenta: '#c162de',
  cyan: '#42b3c2',
  white: '#d7dae0',
  brightBlack: '#4f5666',
  brightRed: '#ff616e',
  brightGreen: '#a5e075',
  brightYellow: '#f0a45d',
  brightBlue: '#4dc4ff',
  brightMagenta: '#de73ff',
  brightCyan: '#4cd1e0',
  brightWhite: '#e6e6e6',
}

/** Solarized Dark. purple → magenta. */
const SOLARIZED_DARK: ITheme = {
  background: '#002b36',
  foreground: '#839496',
  cursor: '#ffffff',
  cursorAccent: '#002b36',
  black: '#002b36',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#073642',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
}

/** Campbell. purple → magenta. */
const CAMPBELL: ITheme = {
  background: '#0c0c0c',
  foreground: '#cccccc',
  cursor: '#ffffff',
  cursorAccent: '#0c0c0c',
  black: '#0c0c0c',
  red: '#c50f1f',
  green: '#13a10e',
  yellow: '#c19c00',
  blue: '#0037da',
  magenta: '#881798',
  cyan: '#3a96dd',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#e74856',
  brightGreen: '#16c60c',
  brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff',
  brightMagenta: '#b4009e',
  brightCyan: '#61d6d6',
  brightWhite: '#f2f2f2',
}

export const TERMINAL_THEMES: readonly TerminalThemeDefinition[] = [
  { id: 'idioteque-dark', label: 'Idioteque Dark', theme: IDIOTEQUE_DARK },
  { id: 'idioteque-night', label: 'Idioteque Night', theme: IDIOTEQUE_NIGHT },
  { id: 'idioteque-light', label: 'Idioteque Light', theme: IDIOTEQUE_LIGHT },
  { id: 'platzi', label: 'Platzi', theme: PLATZI },
  { id: 'tokyo-night', label: 'Tokyo Night', theme: TOKYO_NIGHT },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', theme: CATPPUCCIN_MOCHA },
  { id: 'nord', label: 'Nord', theme: NORD },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', theme: GRUVBOX_DARK },
  { id: 'everforest-dark', label: 'Everforest Dark', theme: EVERFOREST_DARK },
  { id: 'one-dark', label: 'One Dark', theme: ONE_DARK },
  { id: 'one-half-dark', label: 'One Half Dark', theme: ONE_HALF_DARK },
  { id: 'one-dark-pro', label: 'One Dark Pro', theme: ONE_DARK_PRO },
  { id: 'solarized-dark', label: 'Solarized Dark', theme: SOLARIZED_DARK },
  { id: 'dracula', label: 'Dracula', theme: DRACULA },
  { id: 'campbell', label: 'Campbell', theme: CAMPBELL },
]

const THEME_BY_ID = new Map<TerminalThemeId, TerminalThemeDefinition>(
  TERMINAL_THEMES.map((entry) => [entry.id, entry]),
)

export function isTerminalThemeId(id: string): id is TerminalThemeId {
  return THEME_BY_ID.has(id as TerminalThemeId)
}

export function resolveTerminalThemeId(id: string | null | undefined): TerminalThemeId {
  const trimmed = id?.trim()
  if (trimmed && isTerminalThemeId(trimmed)) return trimmed
  return DEFAULT_TERMINAL_THEME_ID
}

export function resolveTerminalTheme(id: string | null | undefined): ITheme {
  return THEME_BY_ID.get(resolveTerminalThemeId(id))?.theme ?? TOKYO_NIGHT
}

export function terminalThemeLabel(id: string | null | undefined): string {
  return THEME_BY_ID.get(resolveTerminalThemeId(id))?.label ?? 'Tokyo Night'
}

/** Default Night palette. Not the old idioteque chrome hybrid. */
export const TERMINAL_THEME = TOKYO_NIGHT

export const TERMINAL_XTERM_OPTIONS = {
  cursorBlink: true,
  customGlyphs: true,
  drawBoldTextInBrightColors: true,
  minimumContrastRatio: 1,
} as const satisfies Partial<ITerminalOptions>
