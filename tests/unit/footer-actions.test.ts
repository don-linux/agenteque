import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOOTER_ACTION_ORDER,
  footerActionIntent,
  runFooterAction,
} from '$lib/footer-actions'

describe('DEFAULT_FOOTER_ACTION_ORDER', () => {
  it('is the fixed code-defined order', () => {
    expect(DEFAULT_FOOTER_ACTION_ORDER).toEqual([
      'home',
      'folder',
      'settings',
      'terminal',
      'browser',
    ])
  })
})

describe('footerActionIntent', () => {
  it('keeps home, folder, settings, terminal, and browser as real actions', () => {
    expect(footerActionIntent('home')).toBe('home')
    expect(footerActionIntent('folder')).toBe('folder')
    expect(footerActionIntent('settings')).toBe('settings')
    expect(footerActionIntent('terminal')).toBe('terminal')
    expect(footerActionIntent('browser')).toBe('browser')
    expect(footerActionIntent('browser')).not.toBe('idle')
    expect(footerActionIntent('browser')).not.toBe('terminal')
  })

  it('routes browser like the other live icons', () => {
    const calls: string[] = []
    const actions = {
      home: () => calls.push('home'),
      folder: () => calls.push('folder'),
      terminal: () => calls.push('terminal'),
      browser: () => calls.push('browser'),
    }

    runFooterAction('home', actions)
    runFooterAction('folder', actions)
    runFooterAction('terminal', actions)
    runFooterAction('browser', actions)
    runFooterAction('settings', actions)

    expect(calls).toEqual(['home', 'folder', 'terminal', 'browser'])
  })

  it('invokes only browser when the icon is browser', () => {
    const actions = {
      home: (): void => {
        throw new Error('home')
      },
      folder: (): void => {
        throw new Error('folder')
      },
      terminal: (): void => {
        throw new Error('terminal')
      },
      browser: (): void => undefined,
    }

    expect(() => runFooterAction('browser', actions)).not.toThrow()
  })

  it('does nothing for settings, which is a plain link', () => {
    const actions = {
      home: (): void => {
        throw new Error('home')
      },
      folder: (): void => {
        throw new Error('folder')
      },
      terminal: (): void => {
        throw new Error('terminal')
      },
      browser: (): void => {
        throw new Error('browser')
      },
    }

    expect(() => runFooterAction('settings', actions)).not.toThrow()
  })
})
