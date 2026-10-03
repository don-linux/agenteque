export const TERMINAL_PREVIEW_ROWS = 8
export const TERMINAL_PREVIEW_LINE_HEIGHT = 1.35
export const TERMINAL_PREVIEW_PADDING_Y = 10
export const TERMINAL_PREVIEW_UNAVAILABLE =
  'No se pudo abrir la shell. La preview solo funciona en la app.'

export function terminalPreviewHostHeight(fontSize: number): number {
  return (
    Math.ceil(fontSize * TERMINAL_PREVIEW_LINE_HEIGHT * TERMINAL_PREVIEW_ROWS) +
    TERMINAL_PREVIEW_PADDING_Y
  )
}

export function fitTerminalPreview(
  xterm: { rows: number; cols: number; resize: (cols: number, rows: number) => void },
  fitAddon: { fit: () => void },
  node: { clientWidth: number; clientHeight: number },
): void {
  if (node.clientWidth < 2 || node.clientHeight < 2) return

  try {
    fitAddon.fit()
  } catch {
    return
  }

  if (xterm.rows !== TERMINAL_PREVIEW_ROWS) {
    xterm.resize(xterm.cols, TERMINAL_PREVIEW_ROWS)
  }
}
