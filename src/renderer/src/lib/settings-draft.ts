export interface SettingsDraft {
  fontFamily: string | null
  fontSize: number
  theme: string
  uiTheme: string
}

export function normalizeFontFamily(family: string | null | undefined): string | null {
  const trimmed = family?.trim()
  return trimmed ? trimmed : null
}

export function isSettingsDirty(draft: SettingsDraft, saved: SettingsDraft): boolean {
  return (
    draft.fontFamily !== saved.fontFamily ||
    draft.fontSize !== saved.fontSize ||
    draft.theme !== saved.theme ||
    draft.uiTheme !== saved.uiTheme
  )
}
