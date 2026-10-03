/**
 * ADV-E19. The packaged binary must ignore ELECTRON_RUN_AS_NODE=1,
 * NODE_OPTIONS=--require, and an attacker-supplied --inspect.
 *
 * Spawned with node:child_process. launchPackagedApp deletes NODE_OPTIONS
 * before spawn and always appends --inspect=0 plus --remote-debugging-port=0,
 * so it cannot prove the NODE_OPTIONS or attacker --inspect cases. Playwright's
 * own --inspect=0 is not the vulnerability under test.
 *
 * The Node payload path is the first argument so that, if the binary really
 * runs as Node, the script executes. --no-sandbox before the script would be
 * a bad Node option and the payload would never run.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { packagedExecutable } from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E19 = { id: 'ADV-E19' } as const
const PROCESS_BOUND_MS = 45_000
const RUN_AS_NODE_TOKEN = 'ADV-E19-RUN-AS-NODE'
const NODE_OPTIONS_TOKEN = 'ADV-E19-NODE-OPTIONS'

interface BoundedProcess {
  code: number | null
  signal: NodeJS.Signals | null
  output: string
  timedOut: boolean
}

function packagedEnv(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.NODE_EXTRA_CA_CERTS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  env.DISPLAY = process.env.DISPLAY ?? ':1'
  for (const [key, value] of Object.entries(extra)) env[key] = value
  return env
}

function runPackaged(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<BoundedProcess> {
  const executable = packagedExecutable()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      env: packagedEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let settled = false
    let timedOut = false

    const killGroup = (): void => {
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          // Already exited.
        }
      }
    }

    const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      resolve({ code, signal, output, timedOut })
    }

    const watchdog = setTimeout(() => {
      timedOut = true
      killGroup()
    }, PROCESS_BOUND_MS)

    const append = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      killGroup()
      settle(code, signal)
    })
  })
}

function createPayload(token: string): { marker: string; script: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'adv-e19-'))
  const marker = join(dir, 'marker')
  const script = join(dir, 'payload.cjs')
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(token)})\nconsole.log(${JSON.stringify(token)})\n`,
  )
  return {
    marker,
    script,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function payloadRan(marker: string, token: string, output: string): boolean {
  return output.includes(token) || existsSync(marker)
}

function smokeOk(result: BoundedProcess): boolean {
  return (
    result.code === 0 &&
    !result.timedOut &&
    result.output.includes('[smoke] OK') &&
    !result.output.includes('[smoke] FAIL')
  )
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('could not reserve a loopback port'))
        return
      }
      const { port } = address
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false
    const finish = (open: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(300)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function portOpenedDuring(port: number, done: Promise<unknown>): Promise<boolean> {
  let opened = false
  const stop = done.then(
    () => 'done' as const,
    () => 'done' as const,
  )
  while (true) {
    const probe = portOpen(port).then((open) => (open ? ('open' as const) : ('closed' as const)))
    const step = await Promise.race([stop, probe])
    if (step === 'open') opened = true
    if (step === 'done') break
    const next = await Promise.race([stop, delay(100).then(() => 'tick' as const)])
    if (next === 'done') break
  }
  return opened
}

it.fails(
  'ADV-E19 packaged binary does not execute as Node when ELECTRON_RUN_AS_NODE=1',
  { meta: ADV_E19 },
  async () => {
    const payload = createPayload(RUN_AS_NODE_TOKEN)
    try {
      const result = await runPackaged([payload.script, '--no-sandbox', '--smoke-test'], {
        ELECTRON_RUN_AS_NODE: '1',
      })
      expect({
        executedAsNode: payloadRan(payload.marker, RUN_AS_NODE_TOKEN, result.output),
        smokeOk: smokeOk(result),
      }).toEqual({ executedAsNode: false, smokeOk: true })
    } finally {
      payload.cleanup()
    }
  },
)

it(
  'ADV-E19 packaged binary does not load a module from NODE_OPTIONS=--require',
  { meta: ADV_E19 },
  async () => {
    const payload = createPayload(NODE_OPTIONS_TOKEN)
    try {
      const result = await runPackaged(['--no-sandbox', '--smoke-test'], {
        NODE_OPTIONS: `--require ${payload.script}`,
      })
      expect({
        loadedAttackerModule: payloadRan(payload.marker, NODE_OPTIONS_TOKEN, result.output),
        smokeOk: smokeOk(result),
      }).toEqual({ loadedAttackerModule: false, smokeOk: true })
    } finally {
      payload.cleanup()
    }
  },
)

it(
  'ADV-E19 packaged binary does not open an attacker --inspect debugger',
  { meta: ADV_E19 },
  async () => {
    const port = await reserveLoopbackPort()
    const resultPromise = runPackaged(['--no-sandbox', `--inspect=${port}`, '--smoke-test'], {})
    const attackerPortOpen = await portOpenedDuring(port, resultPromise)
    const result = await resultPromise
    expect({
      debuggerListening: /Debugger listening on ws:\/\//.test(result.output),
      attackerPortOpen,
      smokeOk: smokeOk(result),
    }).toEqual({
      debuggerListening: false,
      attackerPortOpen: false,
      smokeOk: true,
    })
  },
)
