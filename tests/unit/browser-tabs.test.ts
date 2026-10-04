import { describe, expect, it } from 'vitest'
import { planTabClose, reloadIgnoresCache, tabLabel, toolbarReloadClick } from '$lib/browser-tabs'

const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('planTabClose', () => {
  it('returns null for a tab that is not open', () => {
    expect(planTabClose(tabs, 'missing', 'b')).toBeNull()
  })

  it('keeps the active tab when closing another one', () => {
    expect(planTabClose(tabs, 'a', 'b')).toEqual({ closeId: 'a', activeId: 'b', replace: false })
  })

  it('activates the neighbor on the right, then the one on the left', () => {
    expect(planTabClose(tabs, 'b', 'b')).toEqual({ closeId: 'b', activeId: 'c', replace: false })
    expect(planTabClose(tabs, 'c', 'c')).toEqual({ closeId: 'c', activeId: 'b', replace: false })
    expect(planTabClose([{ id: 'a' }, { id: 'b' }], 'a', 'a')).toEqual({
      closeId: 'a',
      activeId: 'b',
      replace: false,
    })
  })

  it('replaces the last tab instead of shutting the engine down', () => {
    expect(planTabClose([{ id: 'only' }], 'only', 'only')).toEqual({
      closeId: 'only',
      activeId: null,
      replace: true,
    })
  })
})

describe('tabLabel', () => {
  it('prefers a trimmed title, then the host, then a placeholder', () => {
    expect(tabLabel('  Google  ', 'https://www.google.com/')).toBe('Google')
    expect(tabLabel('', 'https://www.google.com/')).toBe('www.google.com')
    expect(tabLabel('   ', 'http://127.0.0.1:9/hit')).toBe('127.0.0.1:9')
    expect(tabLabel('', 'about:blank')).toBe('Nueva pestaña')
    expect(tabLabel('', 'not a url')).toBe('Nueva pestaña')
  })
})

describe('toolbarReloadClick', () => {
  it('stops while the page is loading', () => {
    expect(toolbarReloadClick(true, 'normal')).toEqual({ cmd: 'stop' })
    expect(toolbarReloadClick(true, 'nocache')).toEqual({ cmd: 'stop' })
  })

  it('sends ignoreCache from the saved reload mode', () => {
    expect(reloadIgnoresCache('normal')).toBe(false)
    expect(reloadIgnoresCache('nocache')).toBe(true)
    expect(toolbarReloadClick(false, 'normal')).toEqual({ cmd: 'reload', ignoreCache: false })
    expect(toolbarReloadClick(false, 'nocache')).toEqual({ cmd: 'reload', ignoreCache: true })
  })
})
