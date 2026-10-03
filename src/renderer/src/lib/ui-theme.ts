export const DEFAULT_UI_THEME_ID = 'idioteque-dark' as const

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

export type UiThemeId = (typeof UI_THEME_IDS)[number]

export const UI_THEME_TOKEN_NAMES = [
  '--bg',
  '--surface',
  '--surface-hover',
  '--border',
  '--text',
  '--text-muted',
  '--text-faint',
  '--accent',
  '--accent-soft',
  '--danger',
  '--shadow',
  '--syntax-heading',
  '--syntax-comment',
  '--syntax-link',
  '--syntax-code',
  '--syntax-keyword',
  '--syntax-string',
  '--syntax-number',
  '--syntax-function',
  '--syntax-type',
  '--syntax-variable',
  '--syntax-operator',
  '--syntax-tag',
  '--syntax-invalid',
] as const

export type UiThemeTokenName = (typeof UI_THEME_TOKEN_NAMES)[number]

export type UiThemeTokens = Record<UiThemeTokenName, string>

/**
 * Carriles del grafo de ramas Git. El carril 0 es la rama actual y sale del
 * acento del tema, así que no se escribe a mano: cada tema define solo los
 * secundarios. La paleta vive dentro del tema para que borrar un tema se lleve
 * sus colores del grafo y no quede configuración huérfana.
 *
 * El largo lo decide cada tema: una paleta oficial con muchos tonos usables da
 * siete secundarios, una estrecha da cuatro. Ese largo es parte de la firma del
 * tema, porque marca cada cuántas ramas vuelve a repetirse un color.
 */
export const MIN_GRAPH_SECONDARIES = 4

export const MAX_GRAPH_SECONDARIES = 7

/** Los secundarios de un tema, en el orden en que quiere verlos. */
export type GraphPalette = readonly string[]

/** El acento más el máximo de secundarios: no dependen del tema activo. */
export const GRAPH_LANE_VARS = [
  '--graph-lane-0',
  '--graph-lane-1',
  '--graph-lane-2',
  '--graph-lane-3',
  '--graph-lane-4',
  '--graph-lane-5',
  '--graph-lane-6',
  '--graph-lane-7',
] as const

export interface UiThemeDefinition {
  id: UiThemeId
  label: string
  scheme: 'dark' | 'light'
  tokens: UiThemeTokens
  /**
   * Colores de las ramas secundarias, de 4 a 7. La actual usa `--accent`. El
   * primero es la firma del tema en el grafo: ningún otro tema lo repite.
   */
  graph: GraphPalette
}

interface ThemeSeed {
  id: UiThemeId
  label: string
  tokens: Omit<UiThemeTokens, '--accent-soft' | '--shadow'> &
    Partial<Pick<UiThemeTokens, '--accent-soft' | '--shadow'>>
  graph: GraphPalette
}

function theme(
  scheme: 'dark' | 'light',
  softAlpha: string,
  shadow: string,
  seed: ThemeSeed,
): UiThemeDefinition {
  return {
    id: seed.id,
    label: seed.label,
    scheme,
    tokens: {
      '--accent-soft': `${seed.tokens['--accent']}${softAlpha}`,
      '--shadow': shadow,
      ...seed.tokens,
    },
    graph: seed.graph,
  }
}

function darkTheme(seed: ThemeSeed): UiThemeDefinition {
  return theme('dark', '22', '#00000055', seed)
}

function lightTheme(seed: ThemeSeed): UiThemeDefinition {
  return theme('light', '1a', '#1c1e2218', seed)
}

/**
 * Cada tema es una entrada autocontenida: chrome, sintaxis y carriles del
 * grafo en el mismo bloque. El mismo id tiene que existir en
 * `terminal-theme.ts`. Para quitar un tema se borra su bloque, su id en
 * `UI_THEME_IDS`, su cara de terminal y los ids en `KNOWN_UI_THEMES` y
 * `KNOWN_THEMES` (`src-tauri/src/app_config.rs`).
 */
export const UI_THEMES: readonly UiThemeDefinition[] = [
  /** Product default. Original lifted palette, not a third-party port. */
  darkTheme({
    id: 'idioteque-dark',
    label: 'Idioteque Dark',
    tokens: {
      '--bg': '#1c1e22',
      '--surface': '#24272d',
      '--surface-hover': '#2c3038',
      '--border': '#3a404a',
      '--text': '#d2d5db',
      '--text-muted': '#8f96a1',
      '--text-faint': '#6a7080',
      '--accent': '#7b9ee8',
      '--danger': '#e08b99',
      '--syntax-heading': '#8eb0ee',
      '--syntax-comment': '#6a7080',
      '--syntax-link': '#7b9ee8',
      '--syntax-code': '#c4a882',
      '--syntax-keyword': '#7b9ee8',
      '--syntax-string': '#c4a882',
      '--syntax-number': '#e08b99',
      '--syntax-function': '#8eb0ee',
      '--syntax-type': '#c4a882',
      '--syntax-variable': '#d2d5db',
      '--syntax-operator': '#8f96a1',
      '--syntax-tag': '#e08b99',
      '--syntax-invalid': '#e08b99',
    },
    // Misma clave apagada de la paleta original, con el azul reservado al
    // acento. Abre en teal y llega a siete: es la paleta más larga de la app.
    graph: ['#8ec4c4', '#e8b17b', '#b79ee8', '#c4a882', '#9ec48b', '#c48bb7', '#e08b99'],
  }),

  /** Previous app chrome. Original palette inspired by Tokyo Night, not a port. */
  darkTheme({
    id: 'idioteque-night',
    label: 'Idioteque Night',
    tokens: {
      '--bg': '#14161a',
      '--surface': '#191c21',
      '--surface-hover': '#22262d',
      '--border': '#2a2f37',
      '--text': '#e4e6ea',
      '--text-muted': '#9aa1ad',
      '--text-faint': '#666d79',
      '--accent': '#7aa2f7',
      '--danger': '#f7768e',
      '--syntax-heading': '#7aa2f7',
      '--syntax-comment': '#666d79',
      '--syntax-link': '#7aa2f7',
      '--syntax-code': '#e0af68',
      '--syntax-keyword': '#7aa2f7',
      '--syntax-string': '#e0af68',
      '--syntax-number': '#f7768e',
      '--syntax-function': '#7aa2f7',
      '--syntax-type': '#e0af68',
      '--syntax-variable': '#e4e6ea',
      '--syntax-operator': '#9aa1ad',
      '--syntax-tag': '#f7768e',
      '--syntax-invalid': '#f7768e',
    },
    // Cuatro, la paleta más corta: la clave de este tema es estrecha de verdad
    // (azul, ámbar, rosa) y estirarla a siete pedía tonos que no son suyos.
    // Repite cada cuatro ramas, y eso lo distingue de Tokyo Night en el grafo.
    graph: ['#f7768e', '#bb9af7', '#e0af68', '#41a6b5'],
  }),

  lightTheme({
    id: 'idioteque-light',
    label: 'Idioteque Light',
    tokens: {
      '--bg': '#f2f3f5',
      '--surface': '#f7f8fa',
      '--surface-hover': '#e8eaee',
      '--border': '#d5d8de',
      '--text': '#2c3038',
      '--text-muted': '#5c6370',
      '--text-faint': '#8a909a',
      '--accent': '#3d6ec9',
      '--danger': '#c94b61',
      '--syntax-heading': '#3d6ec9',
      '--syntax-comment': '#8a909a',
      '--syntax-link': '#3d6ec9',
      '--syntax-code': '#7a5c2e',
      '--syntax-keyword': '#3d6ec9',
      '--syntax-string': '#7a5c2e',
      '--syntax-number': '#c94b61',
      '--syntax-function': '#3d6ec9',
      '--syntax-type': '#7a5c2e',
      '--syntax-variable': '#2c3038',
      '--syntax-operator': '#5c6370',
      '--syntax-tag': '#c94b61',
      '--syntax-invalid': '#c94b61',
    },
    // Versiones oscurecidas: el grafo se lee sobre fondo claro. Cinco, porque
    // #c94b61 se acercaba al magenta y #8a7a1f al naranja.
    graph: ['#2a7d8c', '#7a4ec9', '#b02f8a', '#4a7a3d', '#a3611e'],
  }),

  /**
   * Platzi Theme Green Mode from platzi/platzi-theme
   * (marketplace codevars.platzi-theme-for-vs-code).
   * Chrome: themes/Platzi Theme-color-theme.json `colors`.
   * Syntax: the same file `tokenColors` (identical in Classic).
   */
  darkTheme({
    id: 'platzi',
    label: 'Platzi',
    tokens: {
      '--bg': '#03091E',
      '--surface': '#090f24',
      '--surface-hover': '#0C1633',
      '--border': '#121F3D',
      '--text': '#eeffff',
      '--text-muted': '#637B9D',
      '--text-faint': '#546E7A',
      '--accent': '#adeb42',
      '--danger': '#FF5370',
      '--syntax-heading': '#C3E88D',
      '--syntax-comment': '#546E7A',
      '--syntax-link': '#82AAFF',
      '--syntax-code': '#C792EA',
      '--syntax-keyword': '#C792EA',
      '--syntax-string': '#C3E88D',
      '--syntax-number': '#F78C6C',
      '--syntax-function': '#82AAFF',
      '--syntax-type': '#FFCB6B',
      '--syntax-variable': '#EEFFFF',
      '--syntax-operator': '#89DDFF',
      '--syntax-tag': '#f07178',
      '--syntax-invalid': '#FF5370',
    },
    // Seis sin el verde #C3E88D, que choca con el acento lima. Abre en azul.
    graph: ['#82AAFF', '#89DDFF', '#F78C6C', '#C792EA', '#FFCB6B', '#f07178'],
  }),

  /**
   * Tokyo Night (enkia/tokyo-night-vscode-theme)
   * themes/tokyo-night-color-theme.json
   */
  darkTheme({
    id: 'tokyo-night',
    label: 'Tokyo Night',
    tokens: {
      '--bg': '#1a1b26',
      '--surface': '#16161e',
      '--surface-hover': '#202330',
      '--border': '#363b54',
      '--text': '#c0caf5',
      '--text-muted': '#787c99',
      '--text-faint': '#545c7e',
      '--accent': '#7aa2f7',
      '--danger': '#f7768e',
      '--syntax-heading': '#7aa2f7',
      '--syntax-comment': '#51597d',
      '--syntax-link': '#7aa2f7',
      '--syntax-code': '#9ece6a',
      '--syntax-keyword': '#bb9af7',
      '--syntax-string': '#9ece6a',
      '--syntax-number': '#ff9e64',
      '--syntax-function': '#7aa2f7',
      '--syntax-type': '#0db9d7',
      '--syntax-variable': '#c0caf5',
      '--syntax-operator': '#89ddff',
      '--syntax-tag': '#f7768e',
      '--syntax-invalid': '#ff5370',
    },
    // Seis: de los dos teales publicados se queda el claro, #0db9d7, que abre
    // la paleta. #41a6b5 al lado se leía como el mismo carril.
    graph: ['#0db9d7', '#ff9e64', '#bb9af7', '#e0af68', '#9ece6a', '#f7768e'],
  }),

  /**
   * Catppuccin Mocha official palette + editor style guide.
   * https://catppuccin.com/palette/
   * https://github.com/catppuccin/catppuccin/blob/main/docs/style-guide.md
   */
  darkTheme({
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    tokens: {
      '--bg': '#1e1e2e',
      '--surface': '#181825',
      '--surface-hover': '#313244',
      '--border': '#45475a',
      '--text': '#cdd6f4',
      '--text-muted': '#a6adc8',
      '--text-faint': '#6c7086',
      '--accent': '#89b4fa',
      '--danger': '#f38ba8',
      '--syntax-heading': '#cba6f7',
      '--syntax-comment': '#9399b2',
      '--syntax-link': '#89b4fa',
      '--syntax-code': '#a6e3a1',
      '--syntax-keyword': '#cba6f7',
      '--syntax-string': '#a6e3a1',
      '--syntax-number': '#fab387',
      '--syntax-function': '#89b4fa',
      '--syntax-type': '#f9e2af',
      '--syntax-variable': '#cdd6f4',
      '--syntax-operator': '#89dceb',
      '--syntax-tag': '#f38ba8',
      '--syntax-invalid': '#f38ba8',
    },
    // Siete de los catorce nombres oficiales, abriendo en mauve. Maroon en
    // lugar de red, que es el mismo HEX que `--danger` y se leía como un error.
    graph: ['#cba6f7', '#a6e3a1', '#eba0ac', '#f9e2af', '#f5c2e7', '#94e2d5', '#fab387'],
  }),

  /**
   * Nord official palettes nord0–nord15.
   * https://www.nordtheme.com/docs/colors-and-palettes
   */
  darkTheme({
    id: 'nord',
    label: 'Nord',
    tokens: {
      '--bg': '#2e3440',
      '--surface': '#3b4252',
      '--surface-hover': '#434c5e',
      '--border': '#4c566a',
      '--text': '#eceff4',
      '--text-muted': '#d8dee9',
      '--text-faint': '#4c566a',
      '--accent': '#88c0d0',
      '--danger': '#bf616a',
      '--syntax-heading': '#88c0d0',
      '--syntax-comment': '#4c566a',
      '--syntax-link': '#88c0d0',
      '--syntax-code': '#a3be8c',
      '--syntax-keyword': '#81a1c1',
      '--syntax-string': '#a3be8c',
      '--syntax-number': '#b48ead',
      '--syntax-function': '#88c0d0',
      '--syntax-type': '#8fbcbb',
      '--syntax-variable': '#d8dee9',
      '--syntax-operator': '#81a1c1',
      '--syntax-tag': '#81a1c1',
      '--syntax-invalid': '#bf616a',
    },
    // Cinco: Aurora sin nord12, que al lado de nord11 es el mismo rojo, más
    // nord10 de frost. Nord7 y nord8 se parecen demasiado al acento.
    graph: ['#ebcb8b', '#bf616a', '#a3be8c', '#b48ead', '#5e81ac'],
  }),

  /**
   * morhetz/gruvbox dark medium (dark0 + bright accents).
   * https://github.com/morhetz/gruvbox
   */
  darkTheme({
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    tokens: {
      '--bg': '#282828',
      '--surface': '#3c3836',
      '--surface-hover': '#504945',
      '--border': '#665c54',
      '--text': '#ebdbb2',
      '--text-muted': '#a89984',
      '--text-faint': '#928374',
      '--accent': '#83a598',
      '--danger': '#fb4934',
      '--syntax-heading': '#b8bb26',
      '--syntax-comment': '#928374',
      '--syntax-link': '#83a598',
      '--syntax-code': '#b8bb26',
      '--syntax-keyword': '#fb4934',
      '--syntax-string': '#b8bb26',
      '--syntax-number': '#d3869b',
      '--syntax-function': '#b8bb26',
      '--syntax-type': '#fabd2f',
      '--syntax-variable': '#83a598',
      '--syntax-operator': '#fe8019',
      '--syntax-tag': '#fe8019',
      '--syntax-invalid': '#fb4934',
    },
    // Seis brillantes sin #fabd2f, que entre el naranja y el lima quedaba en
    // tierra de nadie. Abre en rojo, el tono más lejano al acento aqua.
    graph: ['#fb4934', '#fe8019', '#8ec07c', '#d3869b', '#b8bb26', '#b16286'],
  }),

  /**
   * Everforest Dark Medium from sainnhe/everforest palette.md.
   * https://github.com/sainnhe/everforest/blob/master/palette.md
   */
  darkTheme({
    id: 'everforest-dark',
    label: 'Everforest Dark',
    tokens: {
      '--bg': '#2D353B',
      '--surface': '#343F44',
      '--surface-hover': '#3D484D',
      '--border': '#4F585E',
      '--text': '#D3C6AA',
      '--text-muted': '#9DA9A0',
      '--text-faint': '#7A8478',
      '--accent': '#A7C080',
      '--danger': '#E67E80',
      '--syntax-heading': '#E69875',
      '--syntax-comment': '#859289',
      '--syntax-link': '#7FBBB3',
      '--syntax-code': '#A7C080',
      '--syntax-keyword': '#E67E80',
      '--syntax-string': '#A7C080',
      '--syntax-number': '#D699B6',
      '--syntax-function': '#A7C080',
      '--syntax-type': '#DBBC7F',
      '--syntax-variable': '#D3C6AA',
      '--syntax-operator': '#E69875',
      '--syntax-tag': '#E69875',
      '--syntax-invalid': '#E67E80',
    },
    // Cinco: fuera #83C092, que con el acento verde se confunde, y fuera
    // #D3C6AA, que es el color del texto. Abre en purple.
    graph: ['#D699B6', '#DBBC7F', '#E67E80', '#7FBBB3', '#E69875'],
  }),

  /**
   * Atom One Dark Syntax colors.less (HSL compiled to the published HEX).
   * https://github.com/atom/atom/blob/master/packages/one-dark-syntax/styles/colors.less
   * UI chrome @base-background-color from one-dark-ui: #21252b.
   */
  darkTheme({
    id: 'one-dark',
    label: 'One Dark',
    tokens: {
      '--bg': '#282c34',
      '--surface': '#21252b',
      '--surface-hover': '#3e4451',
      '--border': '#5c6370',
      '--text': '#abb2bf',
      '--text-muted': '#828997',
      '--text-faint': '#5c6370',
      '--accent': '#61afef',
      '--danger': '#e06c75',
      '--syntax-heading': '#e06c75',
      '--syntax-comment': '#5c6370',
      '--syntax-link': '#61afef',
      '--syntax-code': '#98c379',
      '--syntax-keyword': '#c678dd',
      '--syntax-string': '#98c379',
      '--syntax-number': '#d19a66',
      '--syntax-function': '#61afef',
      '--syntax-type': '#e5c07b',
      '--syntax-variable': '#abb2bf',
      '--syntax-operator': '#56b6c2',
      '--syntax-tag': '#e06c75',
      '--syntax-invalid': '#e06c75',
    },
    // Los siete de colors.less, abriendo en el naranja.
    graph: ['#d19a66', '#56b6c2', '#e5c07b', '#c678dd', '#e06c75', '#be5046', '#98c379'],
  }),

  /**
   * One Half Dark. Chrome and syntax from that ANSI palette. Foreground
   * #dcdfe4 is what separates it from Atom One Dark (#abb2bf).
   */
  darkTheme({
    id: 'one-half-dark',
    label: 'One Half Dark',
    tokens: {
      '--bg': '#282c34',
      '--surface': '#282c34',
      '--surface-hover': '#5a6374',
      '--border': '#5a6374',
      '--text': '#dcdfe4',
      '--text-muted': '#5a6374',
      '--text-faint': '#5a6374',
      '--accent': '#61afef',
      '--danger': '#e06c75',
      '--syntax-heading': '#e06c75',
      '--syntax-comment': '#5a6374',
      '--syntax-link': '#61afef',
      '--syntax-code': '#98c379',
      '--syntax-keyword': '#c678dd',
      '--syntax-string': '#98c379',
      '--syntax-number': '#e5c07b',
      '--syntax-function': '#61afef',
      '--syntax-type': '#e5c07b',
      '--syntax-variable': '#dcdfe4',
      '--syntax-operator': '#56b6c2',
      '--syntax-tag': '#e06c75',
      '--syntax-invalid': '#e06c75',
    },
    // Cuatro del ANSI de WT, sin el azul del acento ni el rojo de danger.
    // Abre en magenta: One Dark ya se queda el naranja.
    graph: ['#c678dd', '#e5c07b', '#98c379', '#56b6c2'],
  }),

  /**
   * Binaryify/OneDark-Pro themes/OneDark-Pro.json.
   * https://github.com/Binaryify/OneDark-Pro
   * Chrome from `colors`. Syntax from `tokenColors` scopes.
   */
  darkTheme({
    id: 'one-dark-pro',
    label: 'One Dark Pro',
    tokens: {
      '--bg': '#282c34',
      '--surface': '#21252b',
      '--surface-hover': '#2c313a',
      '--border': '#3e4452',
      '--text': '#abb2bf',
      '--text-muted': '#9da5b4',
      '--text-faint': '#495162',
      '--accent': '#4d78cc',
      '--danger': '#c24038',
      '--syntax-heading': '#e06c75',
      '--syntax-comment': '#5c6370',
      '--syntax-link': '#61afef',
      '--syntax-code': '#98c379',
      '--syntax-keyword': '#c678dd',
      '--syntax-string': '#98c379',
      '--syntax-number': '#d19a66',
      '--syntax-function': '#61afef',
      '--syntax-type': '#e5c07b',
      '--syntax-variable': '#abb2bf',
      '--syntax-operator': '#56b6c2',
      '--syntax-tag': '#e06c75',
      '--syntax-invalid': '#e06c75',
    },
    // scmGraph.foreground* del mismo JSON. Abre en el verde: el naranja
    // #d18f52 se parece al de One Dark y el magenta al de One Half Dark.
    graph: ['#8cc265', '#c162de', '#d18f52', '#42b3c2', '#4aa5f0'],
  }),

  /**
   * Solarized Dark, Ethan Schoonover.
   * https://ethanschoonover.com/solarized/
   */
  darkTheme({
    id: 'solarized-dark',
    label: 'Solarized Dark',
    tokens: {
      '--bg': '#002b36',
      '--surface': '#073642',
      '--surface-hover': '#073642',
      '--border': '#586e75',
      '--text': '#839496',
      '--text-muted': '#93a1a1',
      '--text-faint': '#586e75',
      '--accent': '#268bd2',
      '--danger': '#dc322f',
      '--syntax-heading': '#cb4b16',
      '--syntax-comment': '#586e75',
      '--syntax-link': '#268bd2',
      '--syntax-code': '#2aa198',
      '--syntax-keyword': '#859900',
      '--syntax-string': '#2aa198',
      '--syntax-number': '#d33682',
      '--syntax-function': '#268bd2',
      '--syntax-type': '#b58900',
      '--syntax-variable': '#839496',
      '--syntax-operator': '#859900',
      '--syntax-tag': '#268bd2',
      '--syntax-invalid': '#dc322f',
    },
    // Seis de los ocho accent colors publicados: fuera el azul, que es el
    // acento, y fuera el rojo, que es `--danger` y quedaba pegado al naranja.
    graph: ['#b58900', '#6c71c4', '#859900', '#cb4b16', '#2aa198', '#d33682'],
  }),

  /**
   * Dracula Classic from the official spec.
   * https://draculatheme.com/spec
   */
  darkTheme({
    id: 'dracula',
    label: 'Dracula',
    tokens: {
      '--bg': '#282A36',
      '--surface': '#21222C',
      '--surface-hover': '#44475A',
      '--border': '#6272A4',
      '--text': '#F8F8F2',
      '--text-muted': '#6272A4',
      '--text-faint': '#6272A4',
      '--accent': '#BD93F9',
      '--danger': '#FF5555',
      '--syntax-heading': '#BD93F9',
      '--syntax-comment': '#6272A4',
      '--syntax-link': '#8BE9FD',
      '--syntax-code': '#50FA7B',
      '--syntax-keyword': '#FF79C6',
      '--syntax-string': '#F1FA8C',
      '--syntax-number': '#BD93F9',
      '--syntax-function': '#50FA7B',
      '--syntax-type': '#8BE9FD',
      '--syntax-variable': '#F8F8F2',
      '--syntax-operator': '#FF79C6',
      '--syntax-tag': '#FF79C6',
      '--syntax-invalid': '#FF5555',
    },
    // Cinco de la spec, sin purple (acento) ni red (danger). Abre en lima.
    graph: ['#50FA7B', '#FF79C6', '#FFB86C', '#8BE9FD', '#F1FA8C'],
  }),

  /**
   * Campbell. Chrome and syntax from that ANSI palette. Accent is
   * brightBlue: #0037da does not hold contrast on #0c0c0c.
   */
  darkTheme({
    id: 'campbell',
    label: 'Campbell',
    tokens: {
      '--bg': '#0c0c0c',
      '--surface': '#0c0c0c',
      '--surface-hover': '#767676',
      '--border': '#767676',
      '--text': '#cccccc',
      '--text-muted': '#767676',
      '--text-faint': '#767676',
      '--accent': '#3b78ff',
      '--danger': '#e74856',
      '--syntax-heading': '#3b78ff',
      '--syntax-comment': '#767676',
      '--syntax-link': '#3a96dd',
      '--syntax-code': '#16c60c',
      '--syntax-keyword': '#b4009e',
      '--syntax-string': '#16c60c',
      '--syntax-number': '#c19c00',
      '--syntax-function': '#3b78ff',
      '--syntax-type': '#61d6d6',
      '--syntax-variable': '#cccccc',
      '--syntax-operator': '#f9f1a5',
      '--syntax-tag': '#e74856',
      '--syntax-invalid': '#e74856',
    },
    // Cuatro brights, sin el azul del acento ni el rojo de danger. Abre en
    // magenta: es el tono que ningún otro tema usa de firma.
    graph: ['#b4009e', '#16c60c', '#f9f1a5', '#61d6d6'],
  }),
]

const THEME_BY_ID = new Map<UiThemeId, UiThemeDefinition>(
  UI_THEMES.map((entry) => [entry.id, entry]),
)

export function isUiThemeId(id: string): id is UiThemeId {
  return THEME_BY_ID.has(id as UiThemeId)
}

export function resolveUiThemeId(id: string | null | undefined): UiThemeId {
  const trimmed = id?.trim()
  if (trimmed && isUiThemeId(trimmed)) return trimmed
  return DEFAULT_UI_THEME_ID
}

export function resolveUiTheme(id: string | null | undefined): UiThemeDefinition {
  return THEME_BY_ID.get(resolveUiThemeId(id)) ?? UI_THEMES[0]
}

export function uiThemeLabel(id: string | null | undefined): string {
  return resolveUiTheme(id).label
}

/** Carriles del grafo en orden: el acento primero, después los secundarios. */
export function graphLaneColors(id: string | null | undefined): readonly string[] {
  const resolved = resolveUiTheme(id)
  return [resolved.tokens['--accent'], ...resolved.graph]
}

/**
 * Cuántos secundarios trae el tema. Es lo que decide cada cuántas ramas se
 * repite un color, así que el grafo lo necesita para repartir carriles.
 */
export function graphSecondaryCount(id: string | null | undefined): number {
  return clampSecondaries(resolveUiTheme(id).graph.length)
}

/**
 * La variable CSS del carril, para pintar sin conocer el tema activo.
 *
 * El carril 0 es siempre el acento y los demás dan la vuelta entre los
 * secundarios del tema. Un índice que se pasa vuelve al primer secundario, no
 * al acento: ese lugar es de la rama actual y no se presta.
 */
export function graphLaneVar(color: number, laneCount: number): string {
  const index = Math.trunc(color)
  if (index === 0) return `var(${GRAPH_LANE_VARS[0]})`

  const secondaries = clampSecondaries(laneCount - 1)
  const lane = (((index - 1) % secondaries) + secondaries) % secondaries
  return `var(${GRAPH_LANE_VARS[lane + 1]})`
}

function clampSecondaries(count: number): number {
  const value = Math.trunc(count)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(value, MAX_GRAPH_SECONDARIES)
}

export function applyTheme(target: HTMLElement, id: string | null | undefined): UiThemeId {
  const resolved = resolveUiThemeId(id)
  const definition = resolveUiTheme(resolved)
  target.dataset.theme = resolved
  target.style.colorScheme = definition.scheme

  for (const name of UI_THEME_TOKEN_NAMES) {
    target.style.setProperty(name, definition.tokens[name])
  }

  // Las ocho variables se escriben siempre, aunque el tema traiga menos
  // secundarios: los estilos inline sobreviven al cambio de tema y una ranura
  // sin escribir se quedaría con el color del tema anterior. Las que sobran
  // repiten la paleta desde el principio.
  const lanes = graphLaneColors(resolved)
  const secondaries = lanes.length - 1
  GRAPH_LANE_VARS.forEach((name, index) => {
    const lane = index === 0 ? lanes[0] : lanes[1 + ((index - 1) % secondaries)]
    target.style.setProperty(name, lane)
  })

  return resolved
}
