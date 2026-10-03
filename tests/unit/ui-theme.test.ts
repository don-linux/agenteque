import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UI_THEME_ID,
  GRAPH_LANE_VARS,
  MAX_GRAPH_SECONDARIES,
  MIN_GRAPH_SECONDARIES,
  UI_THEME_IDS,
  UI_THEME_TOKEN_NAMES,
  UI_THEMES,
  applyTheme,
  graphLaneColors,
  graphLaneVar,
  graphSecondaryCount,
  isUiThemeId,
  resolveUiTheme,
  resolveUiThemeId,
  uiThemeLabel,
} from '$lib/ui-theme'

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ]
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  const [light, dark] = first > second ? [first, second] : [second, first]
  return (light + 0.05) / (dark + 0.05)
}

/** Distancia "redmean": aproximación barata a qué tan distintos se ven dos colores. */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = channels(a)
  const [r2, g2, b2] = channels(b)
  const mean = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db)
}

describe('UI_THEMES', () => {
  it('lists Idioteque Dark first as the default', () => {
    expect(UI_THEME_IDS[0]).toBe(DEFAULT_UI_THEME_ID)
    expect(DEFAULT_UI_THEME_ID).toBe('idioteque-dark')
    expect(UI_THEMES.map((theme) => theme.id)).toEqual([
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
    ])
  })

  it('keeps the catalog and the id list in sync', () => {
    expect(UI_THEMES.map((theme) => theme.id)).toEqual([...UI_THEME_IDS])
  })

  it('keeps unique ids and labels', () => {
    const ids = UI_THEMES.map((theme) => theme.id)
    const labels = UI_THEMES.map((theme) => theme.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('uses Title Case labels without hyphens', () => {
    expect(UI_THEMES.map((theme) => theme.label)).toEqual([
      'Idioteque Dark',
      'Idioteque Night',
      'Idioteque Light',
      'Platzi',
      'Tokyo Night',
      'Catppuccin Mocha',
      'Nord',
      'Gruvbox Dark',
      'Everforest Dark',
      'One Dark',
      'One Half Dark',
      'One Dark Pro',
      'Solarized Dark',
      'Dracula',
      'Campbell',
    ])
  })

  it('defines every token on every theme', () => {
    for (const theme of UI_THEMES) {
      for (const name of UI_THEME_TOKEN_NAMES) {
        expect(theme.tokens[name]).toMatch(/^#/)
      }
    }
  })

  it('preserves the previous chrome as Idioteque Night', () => {
    const night = resolveUiTheme('idioteque-night')
    expect(night.label).toBe('Idioteque Night')
    expect(night.tokens['--bg']).toBe('#14161a')
    expect(night.tokens['--accent']).toBe('#7aa2f7')
    expect(night.tokens['--danger']).toBe('#f7768e')
    expect(night.scheme).toBe('dark')
  })

  it('uses a lifted original palette for Idioteque Dark', () => {
    const idioteque = resolveUiTheme('idioteque-dark')
    expect(idioteque.tokens['--bg']).toBe('#1c1e22')
    expect(idioteque.tokens['--text']).toBe('#d2d5db')
    expect(idioteque.tokens['--accent']).toBe('#7b9ee8')
    expect(idioteque.scheme).toBe('dark')
  })

  it('uses soft neutrals for Idioteque Light', () => {
    const light = resolveUiTheme('idioteque-light')
    expect(light.tokens['--bg']).toBe('#f2f3f5')
    expect(light.tokens['--bg'].toLowerCase()).not.toBe('#ffffff')
    expect(light.tokens['--accent']).toBe('#3d6ec9')
    expect(light.scheme).toBe('light')
  })

  it('imports Platzi Green Mode HEX from the official VS Code JSON', () => {
    const platzi = resolveUiTheme('platzi')
    expect(platzi.label).toBe('Platzi')
    expect(platzi.tokens['--bg']).toBe('#03091E')
    expect(platzi.tokens['--surface']).toBe('#090f24')
    expect(platzi.tokens['--accent']).toBe('#adeb42')
    expect(platzi.tokens['--text']).toBe('#eeffff')
    expect(platzi.tokens['--syntax-keyword']).toBe('#C792EA')
    expect(platzi.tokens['--syntax-function']).toBe('#82AAFF')
    expect(platzi.tokens['--syntax-string']).toBe('#C3E88D')
    expect(platzi.tokens['--syntax-comment']).toBe('#546E7A')
    expect(platzi.scheme).toBe('dark')
  })

  it('keeps official HEX for imported editor palettes', () => {
    expect(resolveUiTheme('tokyo-night').tokens['--bg']).toBe('#1a1b26')
    expect(resolveUiTheme('tokyo-night').tokens['--syntax-keyword']).toBe('#bb9af7')
    expect(resolveUiTheme('catppuccin-mocha').tokens['--bg']).toBe('#1e1e2e')
    expect(resolveUiTheme('catppuccin-mocha').tokens['--syntax-keyword']).toBe('#cba6f7')
    expect(resolveUiTheme('nord').tokens['--bg']).toBe('#2e3440')
    expect(resolveUiTheme('gruvbox-dark').tokens['--bg']).toBe('#282828')
    expect(resolveUiTheme('everforest-dark').tokens['--bg']).toBe('#2D353B')
    expect(resolveUiTheme('one-dark').tokens['--bg']).toBe('#282c34')
    expect(resolveUiTheme('one-dark').tokens['--syntax-keyword']).toBe('#c678dd')
    expect(resolveUiTheme('one-half-dark').tokens['--bg']).toBe('#282c34')
    expect(resolveUiTheme('one-half-dark').tokens['--text']).toBe('#dcdfe4')
    expect(resolveUiTheme('one-dark-pro').tokens['--bg']).toBe('#282c34')
    expect(resolveUiTheme('one-dark-pro').tokens['--accent']).toBe('#4d78cc')
    expect(resolveUiTheme('one-dark-pro').tokens['--danger']).toBe('#c24038')
    expect(resolveUiTheme('dracula').tokens['--bg']).toBe('#282A36')
    expect(resolveUiTheme('dracula').tokens['--accent']).toBe('#BD93F9')
    expect(resolveUiTheme('campbell').tokens['--bg']).toBe('#0c0c0c')
    expect(resolveUiTheme('campbell').tokens['--accent']).toBe('#3b78ff')
    expect(resolveUiTheme('solarized-dark').tokens['--bg']).toBe('#002b36')
    expect(resolveUiTheme('solarized-dark').tokens['--text']).toBe('#839496')
  })
})

/**
 * Los carriles tal como acaban en CSS: el acento y después la paleta del tema
 * dando la vuelta hasta llenar la ventana. Comparar esta ventana entre dos
 * temas mide lo que de verdad ve alguien al cambiar de tema, porque mezcla el
 * orden de los colores con el largo de la paleta.
 */
function laneWindow(id: string, size = 12): string[] {
  const lanes = graphLaneColors(id)
  const secondaries = lanes.length - 1
  return Array.from({ length: size }, (_, index) =>
    index === 0 ? lanes[0] : lanes[1 + ((index - 1) % secondaries)],
  )
}

function pairs(): Array<[(typeof UI_THEMES)[number], (typeof UI_THEMES)[number]]> {
  return UI_THEMES.flatMap((theme, index) =>
    UI_THEMES.slice(index + 1).map(
      (other) => [theme, other] as [(typeof UI_THEMES)[number], (typeof UI_THEMES)[number]],
    ),
  )
}

describe('colores del grafo', () => {
  it('da a cada tema sus carriles secundarios en HEX', () => {
    for (const theme of UI_THEMES) {
      for (const color of theme.graph) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('deja que el largo de la paleta lo decida el tema', () => {
    const lengths = UI_THEMES.map((theme) => theme.graph.length)

    for (const [index, length] of lengths.entries()) {
      expect(length, UI_THEMES[index].id).toBeGreaterThanOrEqual(MIN_GRAPH_SECONDARIES)
      expect(length, UI_THEMES[index].id).toBeLessThanOrEqual(MAX_GRAPH_SECONDARIES)
      expect(graphSecondaryCount(UI_THEMES[index].id)).toBe(length)
    }

    // Si todos midieran lo mismo, el largo no estaría diciendo nada del tema.
    expect(new Set(lengths).size).toBeGreaterThan(1)
  })

  it('reserva el carril 0 al acento del tema', () => {
    for (const theme of UI_THEMES) {
      const lanes = graphLaneColors(theme.id)
      expect(lanes).toHaveLength(theme.graph.length + 1)
      expect(lanes[0]).toBe(theme.tokens['--accent'])
      expect(lanes.slice(1)).toEqual([...theme.graph])
    }
  })

  it('no repite la paleta del grafo entre dos temas', () => {
    for (const [theme, other] of pairs()) {
      const mine = laneWindow(theme.id)
      const theirs = laneWindow(other.id)
      const mean =
        mine.reduce((total, color, lane) => total + distance(color, theirs[lane]), 0) / mine.length

      expect(mean, `${theme.id} vs ${other.id}`).toBeGreaterThan(85)
    }
  })

  it('le da a cada tema un primer secundario que ningún otro usa', () => {
    // Es el color que más cae al lado de la rama actual, así que es la firma
    // del tema en el grafo: si dos temas lo comparten, se ven iguales.
    for (const [theme, other] of pairs()) {
      expect(
        distance(theme.graph[0], other.graph[0]),
        `${theme.id} vs ${other.id}`,
      ).toBeGreaterThan(90)
    }
  })

  it('no repite un color entre carriles del mismo tema', () => {
    for (const theme of UI_THEMES) {
      const lanes = graphLaneColors(theme.id).map((color) => color.toLowerCase())
      expect(new Set(lanes).size).toBe(lanes.length)
    }
  })

  it('mantiene los carriles legibles sobre el fondo del tema', () => {
    for (const theme of UI_THEMES) {
      for (const color of graphLaneColors(theme.id)) {
        expect(contrast(color, theme.tokens['--bg'])).toBeGreaterThan(2.5)
      }
    }
  })

  it('mantiene los carriles distinguibles entre sí', () => {
    for (const theme of UI_THEMES) {
      const lanes = graphLaneColors(theme.id)
      for (let i = 0; i < lanes.length; i += 1) {
        for (let j = i + 1; j < lanes.length; j += 1) {
          expect(distance(lanes[i], lanes[j])).toBeGreaterThan(45)
        }
      }
    }
  })

  it('apunta cada color a su variable CSS', () => {
    expect(GRAPH_LANE_VARS).toHaveLength(MAX_GRAPH_SECONDARIES + 1)
    expect(graphLaneVar(0, 8)).toBe('var(--graph-lane-0)')
    expect(graphLaneVar(1, 8)).toBe('var(--graph-lane-1)')
    expect(graphLaneVar(7, 8)).toBe('var(--graph-lane-7)')
  })

  it('da la vuelta entre los secundarios del tema, nunca al acento', () => {
    // Cinco carriles son cuatro secundarios: el quinto vuelve al primero.
    expect(graphLaneVar(5, 5)).toBe('var(--graph-lane-1)')
    expect(graphLaneVar(6, 5)).toBe('var(--graph-lane-2)')
    expect(graphLaneVar(8, 8)).toBe('var(--graph-lane-1)')
    expect(graphLaneVar(-1, 8)).toBe('var(--graph-lane-6)')

    for (let color = 1; color <= 20; color += 1) {
      for (const lanes of [5, 6, 7, 8]) {
        expect(graphLaneVar(color, lanes)).not.toBe('var(--graph-lane-0)')
      }
    }
  })
})

function target() {
  const written = new Map<string, string>()
  const element = {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: '',
      setProperty(name: string, value: string) {
        written.set(name, value)
      },
    },
  }
  return { element: element as unknown as HTMLElement, written }
}

describe('applyTheme', () => {
  it('escribe los tokens y los carriles del grafo del tema elegido', () => {
    const { element, written } = target()
    const applied = applyTheme(element, 'nord')
    const nord = resolveUiTheme('nord')

    expect(applied).toBe('nord')
    expect(element.dataset.theme).toBe('nord')
    for (const name of UI_THEME_TOKEN_NAMES) {
      expect(written.get(name)).toBe(nord.tokens[name])
    }
    expect(written.get('--graph-lane-0')).toBe(nord.tokens['--accent'])
    for (const [index, color] of nord.graph.entries()) {
      expect(written.get(`--graph-lane-${index + 1}`)).toBe(color)
    }
  })

  it('llena las ranuras que sobran repitiendo la paleta corta', () => {
    // Los estilos inline sobreviven al cambio de tema: una ranura sin escribir
    // se quedaría con el color del tema anterior.
    const { element, written } = target()
    const night = resolveUiTheme('idioteque-night')
    applyTheme(element, 'idioteque-night')

    expect(night.graph).toHaveLength(4)
    for (const name of GRAPH_LANE_VARS) {
      expect(written.get(name), name).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
    expect(written.get('--graph-lane-5')).toBe(night.graph[0])
    expect(written.get('--graph-lane-6')).toBe(night.graph[1])
    expect(written.get('--graph-lane-7')).toBe(night.graph[2])
  })

  it('cae al tema por defecto con un id desconocido', () => {
    const { element, written } = target()
    expect(applyTheme(element, 'no-such-theme')).toBe(DEFAULT_UI_THEME_ID)
    expect(written.get('--graph-lane-1')).toBe(resolveUiTheme(DEFAULT_UI_THEME_ID).graph[0])
  })
})

describe('resolveUiThemeId', () => {
  it('accepts known ids', () => {
    expect(isUiThemeId('idioteque-night')).toBe(true)
    expect(resolveUiThemeId('idioteque-night')).toBe('idioteque-night')
    expect(resolveUiThemeId('  idioteque-light  ')).toBe('idioteque-light')
  })

  it('does not treat the old tokyo-dark id as a theme', () => {
    expect(isUiThemeId('tokyo-dark')).toBe(false)
    expect(resolveUiThemeId('tokyo-dark')).toBe('idioteque-dark')
  })

  it('falls back to Idioteque Dark', () => {
    expect(resolveUiThemeId(null)).toBe('idioteque-dark')
    expect(resolveUiThemeId(undefined)).toBe('idioteque-dark')
    expect(resolveUiThemeId('')).toBe('idioteque-dark')
    expect(resolveUiThemeId('not-a-theme')).toBe('idioteque-dark')
    expect(uiThemeLabel('ghost')).toBe('Idioteque Dark')
  })
})

describe('uiThemeLabel', () => {
  it('returns the catalog label for a known id', () => {
    expect(uiThemeLabel('idioteque-night')).toBe('Idioteque Night')
    expect(uiThemeLabel('idioteque-light')).toBe('Idioteque Light')
    expect(uiThemeLabel('platzi')).toBe('Platzi')
    expect(uiThemeLabel('tokyo-night')).toBe('Tokyo Night')
  })
})
