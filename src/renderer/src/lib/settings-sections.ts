import { ROUTES } from '$lib/app-routes'

export const SETTINGS_SECTIONS = [
  { id: 'terminal', label: 'Terminal', href: `${ROUTES.settings}/terminal` },
  { id: 'temas', label: 'Temas', href: `${ROUTES.settings}/temas` },
  { id: 'navegador', label: 'Navegador', href: `${ROUTES.settings}/navegador` },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
export type SettingsSectionId = SettingsSection['id']

/** Acepta la ruta con o sin `#`, que es la forma en que la escriben los enlaces. */
export function settingsSectionFromPath(pathname: string): SettingsSection | null {
  const needle = pathname.startsWith('#') ? pathname : `#${pathname}`
  return SETTINGS_SECTIONS.find((section) => section.href === needle) ?? null
}
