/**
 * El renderer se sirve desde `file://` en producción, así que la History API no
 * vale: cada ruta es un fragmento y los enlaces se escriben con `#` delante.
 */
export const ROUTES = {
  home: '#/',
  workspace: '#/workspace',
  settings: '#/configuracion',
} as const

export function settingsBackHref(hasWorkspace: boolean): string {
  return hasWorkspace ? ROUTES.workspace : ROUTES.home
}
