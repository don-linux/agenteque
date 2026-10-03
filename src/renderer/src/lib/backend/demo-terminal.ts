import type { TerminalBackend, TerminalSpawn } from '$lib/backend/types'

const CSI = '\u001b['
const RESET = `${CSI}0m`
const ACCENT = `${CSI}38;5;111m`
const MUTED = `${CSI}38;5;245m`

interface DemoSession {
  cwd: string
  cols: number
  rows: number
  line: string
  onData: (chunk: string) => void
  onExit: (code: number) => void
}

function prompt(cwd: string): string {
  return `${ACCENT}${cwd}${RESET} ${MUTED}$${RESET} `
}

function banner(cwd: string, cols: number, rows: number): string {
  return [
    `${MUTED}agenteque · terminal de demostración${RESET}`,
    `${MUTED}sin PTY: lo que escribas vuelve como eco local${RESET}`,
    `${MUTED}${cols}x${rows} · ${cwd}${RESET}`,
    '',
  ].join('\r\n')
}

/**
 * Sesión simulada con eco local. Mantiene los identificadores de `pty.ts` para
 * que cambiarla por un PTY real no toque ni el estado ni los componentes.
 */
class DemoTerminal implements TerminalBackend {
  #sessions = new Map<string, DemoSession>()

  async spawn(options: TerminalSpawn): Promise<void> {
    const session: DemoSession = {
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
      line: '',
      onData: options.onData,
      onExit: options.onExit,
    }
    this.#sessions.set(options.id, session)
    session.onData(`${banner(options.cwd, options.cols, options.rows)}\r\n${prompt(options.cwd)}`)
  }

  async write(id: string, data: string): Promise<void> {
    const session = this.#sessions.get(id)
    if (!session) return

    for (const char of data) {
      if (char === '\r' || char === '\n') {
        session.onData('\r\n')
        this.#run(id, session)
        continue
      }

      if (char === '\u007f' || char === '\b') {
        if (session.line.length === 0) continue
        session.line = session.line.slice(0, -1)
        session.onData('\b \b')
        continue
      }

      // Los controles que no interpretamos no se pintan: ensuciarían la línea.
      if (char < ' ') continue

      session.line += char
      session.onData(char)
    }
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    const session = this.#sessions.get(id)
    if (!session) return
    session.cols = cols
    session.rows = rows
  }

  async kill(id: string): Promise<void> {
    const session = this.#sessions.get(id)
    if (!session) return
    this.#sessions.delete(id)
    session.onExit(0)
  }

  async killAll(): Promise<void> {
    for (const id of Array.from(this.#sessions.keys())) await this.kill(id)
  }

  #run(id: string, session: DemoSession): void {
    const command = session.line.trim()
    session.line = ''

    if (command === 'exit') {
      this.#sessions.delete(id)
      session.onExit(0)
      return
    }

    const output = this.#output(command, session)
    if (output !== '') session.onData(`${output}\r\n`)
    session.onData(prompt(session.cwd))
  }

  #output(command: string, session: DemoSession): string {
    if (command === '') return ''
    if (command === 'pwd') return session.cwd
    if (command === 'clear') return `${CSI}2J${CSI}H`
    if (command === 'help') {
      return [
        'Comandos de la demo: help, pwd, size, ls, clear, exit.',
        'Cualquier otra cosa se devuelve tal cual.',
      ].join('\r\n')
    }
    if (command === 'size') return `${session.cols}x${session.rows}`
    if (command === 'ls') return ['README.md', 'docs', 'notas'].join('  ')
    return command
  }
}

export const demoTerminal = new DemoTerminal()
