/**
 * Public exports:
 * - launchApp
 * - launchPackagedApp
 * - packagedExecutable
 * - startHostileServer
 *
 * Launch options types: ElectronLaunchOptions, LaunchedElectronApp.
 * Hostile-server types: HostileHandler, HostileRequest, HostileResponse, HostileServer.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { onTestFinished } from 'vitest'
import { builtMainEntry, distDir, root } from './paths'

const LAUNCH_TIMEOUT_MS = 60_000
const BODY_LIMIT_BYTES = 1024 * 1024

export interface ElectronLaunchOptions {
  /** Extra arguments, placed after `--no-sandbox`. */
  args?: readonly string[]
  /**
   * Merged on top of `process.env`. `DISPLAY` defaults to `:1` when unset.
   * `ELECTRON_RENDERER_URL` is removed unless this object sets it.
   */
  env?: Readonly<Record<string, string>>
  /** Passed to Playwright. Defaults to 60s. */
  timeout?: number
  /**
   * Wait for the first window. Defaults to true.
   * Set false when the process is expected to exit, or to never open a window.
   */
  waitForWindow?: boolean
}

export interface LaunchedElectronApp {
  /** Playwright handle. `app.evaluate` runs in the Electron main process. */
  app: ElectronApplication
  /** Present when `waitForWindow` is not false. */
  window?: Page
  /** Bytes captured after Playwright reports the process as launched. */
  readonly stdout: string
  readonly stderr: string
  /** Resolves when the OS process exits. Does not reject. */
  readonly exited: Promise<number | null>
  close(): Promise<void>
}

export interface HostileRequest {
  method: string
  /** Path and query, as Node received them. */
  url: string
  headers: IncomingMessage['headers']
  /** Capped at 1 MiB. */
  body: Buffer
  truncated: boolean
}

export interface HostileResponse {
  status?: number
  headers?: Record<string, string | readonly string[]>
  body?: string | Uint8Array
}

export type HostileHandler = (request: HostileRequest) => HostileResponse | Promise<HostileResponse>

export interface HostileServer {
  /** `http://127.0.0.1:<port>`. Use this, not `localhost` (which may be IPv6). */
  origin: string
  port: number
  /** Live log, in arrival order. */
  requests: HostileRequest[]
  close(): Promise<void>
}

/** Unpacked electron-builder binary for this platform. */
export function packagedExecutable(): string {
  switch (process.platform) {
    case 'linux':
      return resolve(distDir, 'linux-unpacked/agenteque')
    case 'darwin':
      return resolve(distDir, `mac-${process.arch}/agenteque.app/Contents/MacOS/agenteque`)
    case 'win32':
      return resolve(distDir, 'win-unpacked/agenteque.exe')
    default:
      throw new Error(`No packaged executable path for platform ${process.platform}`)
  }
}

/**
 * Launch `out/main/index.js` with the repo's Electron binary.
 * Playwright injects its loader, `--inspect=0`, and `--remote-debugging-port=0`.
 * The loader removes those flags from `process.argv`; the ports stay open.
 * Playwright also deletes `NODE_OPTIONS` before spawn, so that variable never
 * reaches the process.
 */
export async function launchApp(options?: ElectronLaunchOptions): Promise<LaunchedElectronApp> {
  if (!existsSync(builtMainEntry)) {
    throw new Error(`${builtMainEntry} is missing. The adversarial globalSetup builds it.`)
  }
  return launchElectron(undefined, [builtMainEntry], options)
}

/**
 * Launch the unpacked package (`dist/linux-unpacked/agenteque` on Linux).
 * Playwright does not inject its loader when `executablePath` is set, so
 * `--inspect=0` and `--remote-debugging-port=0` remain in `process.argv`.
 * `NODE_OPTIONS` is still deleted by Playwright.
 */
export async function launchPackagedApp(
  options?: ElectronLaunchOptions,
): Promise<LaunchedElectronApp> {
  const executable = packagedExecutable()
  if (!existsSync(executable)) {
    throw new Error(`${executable} is missing. The adversarial globalSetup packs it.`)
  }
  return launchElectron(executable, [], options)
}

/**
 * Local HTTP server for a hostile origin. The default handler returns a short HTML page.
 * Closed automatically when the calling test finishes.
 */
export async function startHostileServer(handler?: HostileHandler): Promise<HostileServer> {
  const respond = handler ?? defaultHostileHandler
  const requests: HostileRequest[] = []
  const sockets = new Set<Socket>()

  const server = createServer((incoming, outgoing) => {
    void handleRequest(incoming, outgoing, respond, requests)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  await new Promise<void>((listenReady, listenFailed) => {
    server.once('error', listenFailed)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', listenFailed)
      listenReady()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Hostile server did not bind a TCP port')
  }

  let closed = false
  const close = (): Promise<void> => {
    if (closed) return Promise.resolve()
    closed = true
    for (const socket of sockets) socket.destroy()
    return new Promise((done, fail) => {
      server.close((error) => (error ? fail(error) : done()))
    })
  }
  registerCleanup(close)

  return {
    origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
    port: address.port,
    requests,
    close,
  }
}

async function launchElectron(
  executablePath: string | undefined,
  entryArgs: string[],
  options: ElectronLaunchOptions | undefined,
): Promise<LaunchedElectronApp> {
  const timeout = options?.timeout ?? LAUNCH_TIMEOUT_MS
  const app = await electron.launch({
    executablePath,
    cwd: root,
    timeout,
    chromiumSandbox: false,
    args: ['--no-sandbox', ...(options?.args ?? []), ...entryArgs],
    env: electronEnv(options?.env),
  })

  const stdout = collectStream(app.process().stdout)
  const stderr = collectStream(app.process().stderr)
  const exited = new Promise<number | null>((resolveExit) => {
    const child = app.process()
    if (child.exitCode !== null) {
      resolveExit(child.exitCode)
      return
    }
    child.once('exit', (code) => resolveExit(code))
  })

  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    try {
      await app.close()
    } catch {
      const child = app.process()
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }

  try {
    const window = options?.waitForWindow === false ? undefined : await app.firstWindow({ timeout })
    const launched: LaunchedElectronApp = {
      app,
      window,
      get stdout() {
        return stdout()
      },
      get stderr() {
        return stderr()
      },
      exited,
      close,
    }
    registerCleanup(close)
    return launched
  } catch (error) {
    await close()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\n--- stdout ---\n${stdout()}\n--- stderr ---\n${stderr()}`, {
      cause: error,
    })
  }
}

function electronEnv(
  overrides: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  if (overrides) Object.assign(env, overrides)
  env.DISPLAY = overrides?.DISPLAY ?? env.DISPLAY ?? ':1'
  if (!overrides || !Object.hasOwn(overrides, 'ELECTRON_RENDERER_URL')) {
    delete env.ELECTRON_RENDERER_URL
  }
  return env
}

function collectStream(stream: NodeJS.ReadableStream | null): () => string {
  let text = ''
  if (!stream) return () => text
  stream.on('data', (chunk: string | Buffer) => {
    text += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  })
  return () => text
}

function defaultHostileHandler(): HostileResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><title>hostile</title><p>hostile</p>',
  }
}

async function handleRequest(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  handler: HostileHandler,
  requests: HostileRequest[],
): Promise<void> {
  const request = await readRequest(incoming)
  requests.push(request)
  try {
    const response = await handler(request)
    const body = response.body === undefined ? '' : response.body
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      headers[name] = typeof value === 'string' ? value : [...value]
    }
    if (
      !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type') &&
      typeof body === 'string'
    ) {
      headers['content-type'] = 'text/plain; charset=utf-8'
    }
    outgoing.writeHead(response.status ?? 200, headers)
    outgoing.end(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    outgoing.end(message)
  }
}

function readRequest(incoming: IncomingMessage): Promise<HostileRequest> {
  return new Promise((resolveRequest, rejectRequest) => {
    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    incoming.on('data', (chunk: Buffer) => {
      if (truncated) return
      if (size + chunk.length > BODY_LIMIT_BYTES) {
        chunks.push(chunk.subarray(0, BODY_LIMIT_BYTES - size))
        size = BODY_LIMIT_BYTES
        truncated = true
        incoming.resume()
        return
      }
      chunks.push(chunk)
      size += chunk.length
    })
    incoming.on('end', () => {
      resolveRequest({
        method: incoming.method ?? 'GET',
        url: incoming.url ?? '/',
        headers: incoming.headers,
        body: Buffer.concat(chunks),
        truncated,
      })
    })
    incoming.on('error', rejectRequest)
  })
}

function registerCleanup(cleanup: () => Promise<void>): void {
  try {
    onTestFinished(cleanup)
  } catch {
    // The helper was called outside a test. The caller closes the resource.
  }
}
