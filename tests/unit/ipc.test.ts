import { describe, expect, it } from 'vitest'
import { IpcChannel } from '../../src/shared/ipc'

describe('IpcChannel', () => {
  it('uses unique, namespaced channel names', () => {
    const channels = Object.values(IpcChannel)
    expect(new Set(channels).size).toBe(channels.length)
    for (const channel of channels) expect(channel).toMatch(/^(app|config):[a-zA-Z-]+$/)
  })

  it('keeps one channel per configuration command', () => {
    expect(Object.values(IpcChannel).filter((channel) => channel.startsWith('config:'))).toEqual([
      'config:load',
      'config:saveTerminal',
      'config:saveAppearance',
      'config:saveLayout',
      'config:saveWorkspaceView',
      'config:recordRecent',
      'config:removeRecent',
    ])
  })
})
