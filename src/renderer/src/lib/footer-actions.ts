export const FOOTER_ACTION_IDS = ['home', 'folder', 'settings', 'terminal', 'browser'] as const

export type FooterActionId = (typeof FOOTER_ACTION_IDS)[number]

export const DEFAULT_FOOTER_ACTION_ORDER: FooterActionId[] = [...FOOTER_ACTION_IDS]

export type FooterActionIntent = FooterActionId | 'idle'

export function footerActionIntent(id: FooterActionId): FooterActionIntent {
  return id
}

export function runFooterAction(
  id: FooterActionId,
  actions: {
    home: () => void
    folder: () => void
    terminal: () => void
    browser: () => void
  },
): void {
  switch (footerActionIntent(id)) {
    case 'home':
      actions.home()
      return
    case 'folder':
      actions.folder()
      return
    case 'terminal':
      actions.terminal()
      return
    case 'browser':
      actions.browser()
      return
    case 'idle':
    case 'settings':
      return
  }
}
