export function addTab(tabs: readonly string[], path: string): string[] {
  if (tabs.includes(path)) return [...tabs]
  return [...tabs, path]
}

export function removeTab(tabs: readonly string[], path: string): string[] {
  return tabs.filter((tab) => tab !== path)
}

export function nextActiveAfterClose(
  tabs: readonly string[],
  closedPath: string,
  currentPath: string | null,
): string | null {
  const index = tabs.indexOf(closedPath)
  if (index < 0) return currentPath

  const remaining = removeTab(tabs, closedPath)
  if (remaining.length === 0) return null
  if (currentPath !== closedPath) return currentPath

  return remaining[index] ?? remaining[index - 1] ?? null
}

export function tabBasename(path: string): string {
  const sep = path.lastIndexOf('/')
  if (sep < 0) return path
  return path.slice(sep + 1) || path
}
