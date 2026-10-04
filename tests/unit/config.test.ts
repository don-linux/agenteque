import { describe, expect, it } from 'vitest'
import {
  clampFontSize,
  CONFIG_VERSION,
  defaultAppConfig,
  MAX_RECENT_FOLDERS,
  sanitizeConfig,
  withoutRecent,
  withRecent,
  withWorkspaceView,
} from '../../src/shared/config'

describe('defaultAppConfig', () => {
  it('matches the defaults the renderer assumes', () => {
    expect(defaultAppConfig()).toEqual({
      version: CONFIG_VERSION,
      recents: [],
      terminal: { fontFamily: null, fontSize: 13, theme: 'tokyo-night' },
      appearance: { theme: 'idioteque-dark' },
      layout: {
        treeWidth: 260,
        treeVisible: true,
        terminalBottom: 280,
        terminalRight: 380,
        terminalDock: 'bottom',
      },
      workspaceViews: [],
      browser: { devtoolsDock: 'right', reload: 'normal' },
    })
  })
})

describe('sanitizeConfig', () => {
  it('falls back for anything that is not an object', () => {
    for (const value of [null, undefined, 42, 'x', []]) {
      expect(sanitizeConfig(value)).toEqual(defaultAppConfig())
    }
  })

  it('drops unknown theme ids instead of writing them back', () => {
    const config = sanitizeConfig({
      terminal: { theme: 'no-existe', fontSize: 13, fontFamily: null },
      appearance: { theme: '../../etc/passwd' },
    })

    expect(config.terminal.theme).toBe('tokyo-night')
    expect(config.appearance.theme).toBe('idioteque-dark')
  })

  it('clamps the font size and normalizes an empty family', () => {
    expect(sanitizeConfig({ terminal: { fontSize: 999 } }).terminal.fontSize).toBe(24)
    expect(sanitizeConfig({ terminal: { fontSize: 1 } }).terminal.fontSize).toBe(10)
    expect(sanitizeConfig({ terminal: { fontSize: 'x' } }).terminal.fontSize).toBe(13)
    expect(sanitizeConfig({ terminal: { fontFamily: '   ' } }).terminal.fontFamily).toBeNull()
    expect(sanitizeConfig({ terminal: { fontFamily: ' Hack ' } }).terminal.fontFamily).toBe('Hack')
  })

  it('keeps only the two docks the panel understands', () => {
    expect(sanitizeConfig({ layout: { terminalDock: 'right' } }).layout.terminalDock).toBe('right')
    expect(sanitizeConfig({ layout: { terminalDock: 'top' } }).layout.terminalDock).toBe('bottom')
  })

  it('refuses non-positive panel sizes', () => {
    const layout = sanitizeConfig({ layout: { treeWidth: -10, terminalBottom: 0 } }).layout

    expect(layout.treeWidth).toBe(260)
    expect(layout.terminalBottom).toBe(280)
  })

  it('discards recents without a usable path and de-duplicates', () => {
    const config = sanitizeConfig({
      recents: [
        { path: '/a', openedAt: '2026-01-01T00:00:00.000Z', exists: true },
        { path: '/a', openedAt: '2026-01-02T00:00:00.000Z', exists: true },
        { path: '', openedAt: 'x' },
        { path: 42 },
        'nope',
      ],
    })

    expect(config.recents.map((entry) => entry.path)).toEqual(['/a'])
  })

  it('discards workspace views without a path and non-string folders', () => {
    const config = sanitizeConfig({
      workspaceViews: [
        { path: '/a', visibleFolders: ['docs', 7, null, 'notas'] },
        { visibleFolders: ['docs'] },
        { path: '/b' },
      ],
    })

    expect(config.workspaceViews).toEqual([
      { path: '/a', visibleFolders: ['docs', 'notas'] },
      { path: '/b', visibleFolders: [] },
    ])
  })

  it('always writes the current version, whatever was on disk', () => {
    expect(sanitizeConfig({ version: 99 }).version).toBe(CONFIG_VERSION)
    expect(CONFIG_VERSION).toBe(1)
  })

  it('fills browser defaults and keeps only the docks and reload modes we store', () => {
    expect(sanitizeConfig({}).browser).toEqual({ devtoolsDock: 'right', reload: 'normal' })
    expect(sanitizeConfig({ browser: { devtoolsDock: 'detach', reload: 'hard' } }).browser).toEqual(
      {
        devtoolsDock: 'right',
        reload: 'normal',
      },
    )
    expect(
      sanitizeConfig({ browser: { devtoolsDock: 'left', reload: 'nocache' } }).browser,
    ).toEqual({ devtoolsDock: 'left', reload: 'nocache' })
    expect(sanitizeConfig({ browser: { devtoolsDock: 'bottom' } }).browser.devtoolsDock).toBe(
      'bottom',
    )
    expect(sanitizeConfig({ browser: { devtoolsDock: 'undocked' } }).browser.devtoolsDock).toBe(
      'undocked',
    )
    expect(
      sanitizeConfig({ browser: { devtoolsDock: 'right', reload: 'normal' } }).browser,
    ).toEqual({
      devtoolsDock: 'right',
      reload: 'normal',
    })
  })
})

describe('clampFontSize', () => {
  it('rounds and keeps the size inside the allowed range', () => {
    expect(clampFontSize(12.4)).toBe(12)
    expect(clampFontSize(Number.NaN)).toBe(13)
    expect(clampFontSize(Number.POSITIVE_INFINITY)).toBe(13)
  })
})

describe('withRecent', () => {
  it('moves an existing folder to the front without duplicating it', () => {
    const base = sanitizeConfig({
      recents: [
        { path: '/a', openedAt: '2026-01-01T00:00:00.000Z', exists: true },
        { path: '/b', openedAt: '2026-01-01T00:00:00.000Z', exists: true },
      ],
    })

    expect(withRecent(base, '/b').recents.map((entry) => entry.path)).toEqual(['/b', '/a'])
  })

  it('ignores an empty path', () => {
    const base = defaultAppConfig()
    expect(withRecent(base, '   ')).toBe(base)
  })

  it('caps the history', () => {
    let config = defaultAppConfig()
    for (let index = 0; index < MAX_RECENT_FOLDERS + 5; index += 1) {
      config = withRecent(config, `/folder-${index}`)
    }

    expect(config.recents).toHaveLength(MAX_RECENT_FOLDERS)
    expect(config.recents[0]?.path).toBe(`/folder-${MAX_RECENT_FOLDERS + 4}`)
  })
})

describe('withoutRecent', () => {
  it('removes just the matching entry', () => {
    const config = withoutRecent(withRecent(withRecent(defaultAppConfig(), '/a'), '/b'), '/a')
    expect(config.recents.map((entry) => entry.path)).toEqual(['/b'])
  })
})

describe('withWorkspaceView', () => {
  it('replaces the view of a folder instead of appending a second one', () => {
    const first = withWorkspaceView(defaultAppConfig(), { path: '/a', visibleFolders: ['docs'] })
    const second = withWorkspaceView(first, { path: '/a', visibleFolders: [] })

    expect(second.workspaceViews).toEqual([{ path: '/a', visibleFolders: [] }])
  })

  it('ignores a view the sanitizer would drop anyway', () => {
    const base = defaultAppConfig()
    expect(withWorkspaceView(base, { path: '', visibleFolders: [] })).toBe(base)
  })
})
