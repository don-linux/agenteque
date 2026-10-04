import { describe, expect, it } from 'vitest'
import { resolveShell } from '../../src/shared/shell'

function lookup(
  platform: string,
  env: Record<string, string | undefined>,
  files: readonly string[],
) {
  return {
    platform,
    env,
    isExecutable: (file: string) => files.includes(file),
  }
}

describe('resolveShell', () => {
  it('uses an absolute SHELL on Linux and macOS', () => {
    expect(
      resolveShell(lookup('linux', { SHELL: '/bin/zsh' }, ['/bin/zsh', '/bin/bash', '/bin/sh'])),
    ).toBe('/bin/zsh')
    expect(resolveShell(lookup('darwin', { SHELL: '/bin/bash' }, ['/bin/bash', '/bin/zsh']))).toBe(
      '/bin/bash',
    )
  })

  it('ignores a relative SHELL and falls back', () => {
    expect(resolveShell(lookup('linux', { SHELL: 'zsh' }, ['/bin/bash', '/bin/sh']))).toBe(
      '/bin/bash',
    )
    expect(resolveShell(lookup('darwin', { SHELL: 'zsh' }, ['/bin/zsh']))).toBe('/bin/zsh')
  })

  it('returns null when no Unix shell exists', () => {
    expect(resolveShell(lookup('linux', { SHELL: '/missing' }, []))).toBeNull()
  })

  it('prefers PowerShell 7, then Windows PowerShell, and never cmd', () => {
    expect(
      resolveShell(
        lookup(
          'win32',
          { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows', PATH: 'C:\\Tools' },
          [
            'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          ],
        ),
      ),
    ).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')

    expect(
      resolveShell(
        lookup('win32', { SystemRoot: 'C:\\Windows', PATH: '.\\repo;C:\\Tools' }, [
          'C:\\Tools\\pwsh.exe',
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ]),
      ),
    ).toBe('C:\\Tools\\pwsh.exe')

    expect(
      resolveShell(
        lookup('win32', { SystemRoot: 'C:\\Windows', PATH: '' }, [
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          'C:\\Windows\\System32\\cmd.exe',
        ]),
      ),
    ).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

    expect(resolveShell(lookup('win32', { SystemRoot: 'C:\\Windows', PATH: '' }, []))).toBeNull()
  })
})
