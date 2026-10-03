const AUTHORITY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const SPECIAL_SCHEME = /^(about|mailto|data|blob|file):/i
const BLOCKED_SCHEME = /^javascript:/i
const LOCALHOST = /^localhost(?::\d+)?(?:[/?#].*)?$/i
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#].*)?$/
const BRACKETED_IPV6 = /^\[([^\]]+)\](?::\d+)?$/

function hostOf(value: string): string {
  return value.split(/[/?#]/, 1)[0] ?? ''
}

function hasScheme(value: string): boolean {
  return AUTHORITY_SCHEME.test(value) || SPECIAL_SCHEME.test(value)
}

function isIpv6Address(addr: string): boolean {
  try {
    // WHATWG URL accepts only real IPv6 literals inside brackets.
    void new URL(`http://[${addr}]`)
    return true
  } catch {
    return false
  }
}

/**
 * `undefined` = not IPv6-shaped, keep looking.
 * `null` = looks like `[…]` but is not a literal; do not treat the dot as a host.
 */
function tryIpv6Https(value: string): string | null | undefined {
  const hostPort = hostOf(value)
  if (hostPort.startsWith('[')) {
    const match = BRACKETED_IPV6.exec(hostPort)
    if (match && isIpv6Address(match[1])) return `https://${value}`
    return null
  }
  if (isIpv6Address(hostPort)) {
    return `https://[${hostPort}]${value.slice(hostPort.length)}`
  }
  return undefined
}

/** Trimmed URL for navigation. Empty or a search phrase → `null` (no search engine). */
export function normalizeUrlInput(input: string): string | null {
  const value = input.trim()
  if (value.length === 0) return null
  if (BLOCKED_SCHEME.test(value)) return null
  if (hasScheme(value)) return value
  if (/\s/.test(value)) return null
  const ipv6 = tryIpv6Https(value)
  if (ipv6 !== undefined) return ipv6
  if (LOCALHOST.test(value) || IPV4.test(value) || hostOf(value).includes('.')) {
    return `https://${value}`
  }
  return null
}

/**
 * Compact bar text: hide the `https://` prefix and a trailing `/`.
 * `about:blank` is an empty field.
 */
export function displayUrl(url: string): string {
  if (/^about:blank$/i.test(url) || /^about:$/i.test(url)) return ''

  let shown = url
  if (/^https:\/\//i.test(shown)) shown = shown.slice('https://'.length)
  if (shown.endsWith('/')) shown = shown.slice(0, -1)
  return shown
}
