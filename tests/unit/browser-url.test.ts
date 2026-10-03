import { describe, expect, it } from 'vitest'
import { displayUrl, normalizeUrlInput } from '$lib/browser-url'

describe('normalizeUrlInput', () => {
  it('returns null for empty or whitespace', () => {
    expect(normalizeUrlInput('')).toBeNull()
    expect(normalizeUrlInput('   ')).toBeNull()
  })

  it('keeps a value that already has a scheme', () => {
    expect(normalizeUrlInput('https://example.com')).toBe('https://example.com')
    expect(normalizeUrlInput('http://localhost:8080/x')).toBe('http://localhost:8080/x')
    expect(normalizeUrlInput('about:blank')).toBe('about:blank')
    expect(normalizeUrlInput('about:')).toBe('about:')
    expect(normalizeUrlInput('file:///tmp/a.md')).toBe('file:///tmp/a.md')
    expect(normalizeUrlInput('mailto:dev@example.com')).toBe('mailto:dev@example.com')
    expect(normalizeUrlInput('data:text/plain,hi')).toBe('data:text/plain,hi')
    expect(normalizeUrlInput('blob:http://example.com/id')).toBe('blob:http://example.com/id')
  })

  it('prepends https:// to localhost, IPv4, and dotted hosts', () => {
    expect(normalizeUrlInput('localhost')).toBe('https://localhost')
    expect(normalizeUrlInput('localhost:3000/app')).toBe('https://localhost:3000/app')
    expect(normalizeUrlInput('127.0.0.1')).toBe('https://127.0.0.1')
    expect(normalizeUrlInput('192.168.1.10:8080')).toBe('https://192.168.1.10:8080')
    expect(normalizeUrlInput('example.com')).toBe('https://example.com')
    expect(normalizeUrlInput('sub.example.com/path?q=1')).toBe('https://sub.example.com/path?q=1')
  })

  it('does not invent a search for a bare word or a phrase with spaces', () => {
    expect(normalizeUrlInput('idioteque')).toBeNull()
    expect(normalizeUrlInput('hello world')).toBeNull()
    expect(normalizeUrlInput('example.com has spaces')).toBeNull()
  })

  it('rejects javascript: so the address bar cannot execute in CEF', () => {
    const inputs = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'JavaScript:alert(document.domain)',
      'javascript:example.com',
      'javascript://example.com/%0aalert(1)',
      'javascript://[::1]/%0aalert(1)',
      'javascript:',
      '  javascript:void(0)  ',
    ]
    for (const input of inputs) {
      const out = normalizeUrlInput(input)
      expect(out, input).toBeNull()
      expect(String(out), input).not.toMatch(/^https:\/\//i)
    }
  })

  it('prepends https:// to bracketed IPv6 and keeps port, path, query and hash', () => {
    expect(normalizeUrlInput('[::1]')).toBe('https://[::1]')
    expect(normalizeUrlInput('[::1]:8080')).toBe('https://[::1]:8080')
    expect(normalizeUrlInput('[::1]:8080/app')).toBe('https://[::1]:8080/app')
    expect(normalizeUrlInput('[::1]/app?q=1#h')).toBe('https://[::1]/app?q=1#h')
    expect(normalizeUrlInput('[2001:db8::1]')).toBe('https://[2001:db8::1]')
    expect(normalizeUrlInput('[::ffff:192.0.2.1]')).toBe('https://[::ffff:192.0.2.1]')
    expect(normalizeUrlInput('[0:0:0:0:0:0:0:1]:443')).toBe('https://[0:0:0:0:0:0:0:1]:443')
  })

  it('wraps a bare IPv6 literal in brackets before adding https://', () => {
    expect(normalizeUrlInput('::1')).toBe('https://[::1]')
    expect(normalizeUrlInput('::')).toBe('https://[::]')
    expect(normalizeUrlInput('2001:db8::1')).toBe('https://[2001:db8::1]')
    expect(normalizeUrlInput('::ffff:192.0.2.1')).toBe('https://[::ffff:192.0.2.1]')
    expect(normalizeUrlInput('::1/status')).toBe('https://[::1]/status')
  })

  it('does not invent a URL from a broken IPv6 literal or a dotted fake bracket', () => {
    expect(normalizeUrlInput('[::1')).toBeNull()
    expect(normalizeUrlInput('[]')).toBeNull()
    expect(normalizeUrlInput('[::1]:')).toBeNull()
    expect(normalizeUrlInput('[:::1]')).toBeNull()
    expect(normalizeUrlInput('[not-ipv6]')).toBeNull()
    expect(normalizeUrlInput('[foo.bar]')).toBeNull()
    expect(normalizeUrlInput('1:2')).toBeNull()
  })

  it('keeps an already-schemed IPv6 URL, including uppercase HTTPS', () => {
    expect(normalizeUrlInput('https://[::1]/')).toBe('https://[::1]/')
    expect(normalizeUrlInput('http://[2001:db8::1]:8080/x')).toBe('http://[2001:db8::1]:8080/x')
    expect(normalizeUrlInput('HTTPS://[::1]')).toBe('HTTPS://[::1]')
    expect(normalizeUrlInput('HTTPS://example.com/x')).toBe('HTTPS://example.com/x')
  })
})

describe('displayUrl', () => {
  it('shows about:blank as an empty bar', () => {
    expect(displayUrl('about:blank')).toBe('')
    expect(displayUrl('about:')).toBe('')
  })

  it('hides the https:// prefix and a trailing slash', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com')
    expect(displayUrl('https://example.com/foo/')).toBe('example.com/foo')
    expect(displayUrl('https://localhost:3000')).toBe('localhost:3000')
  })

  it('leaves other schemes intact', () => {
    expect(displayUrl('http://example.com/')).toBe('http://example.com')
    expect(displayUrl('file:///tmp/a.md')).toBe('file:///tmp/a.md')
  })

  it('hides https:// on IPv6 literals without eating the brackets', () => {
    expect(displayUrl('https://[::1]')).toBe('[::1]')
    expect(displayUrl('https://[::1]/')).toBe('[::1]')
    expect(displayUrl('https://[::1]:8080/')).toBe('[::1]:8080')
    expect(displayUrl('https://[2001:db8::1]/app/')).toBe('[2001:db8::1]/app')
    expect(displayUrl('HTTPS://[::1]/')).toBe('[::1]')
    expect(displayUrl('http://[::1]/')).toBe('http://[::1]')
  })

  it('treats ABOUT:BLANK like about:blank in the bar', () => {
    expect(displayUrl('ABOUT:BLANK')).toBe('')
    expect(displayUrl('About:')).toBe('')
    expect(normalizeUrlInput('ABOUT:BLANK')).toBe('ABOUT:BLANK')
  })
})
