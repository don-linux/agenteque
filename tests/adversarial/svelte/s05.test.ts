import { expect, it } from 'vitest'
import Counter from '../../../src/renderer/src/lib/Counter.svelte'
import { mountComponent, type MountedComponent } from '../helpers/svelte'

const CLICKS = 100_000

/**
 * `detail` values a forged click might carry. The counter must add 1, never `detail`.
 * 0 and negatives are included so a handler cannot treat 0 as "skip" or a negative as a decrement.
 */
const HOSTILE_DETAILS = [0, 1, -1, 2_147_483_647, Number.MAX_SAFE_INTEGER] as const

const IGNORED_KEYS = [
  'a',
  'A',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'ArrowDown',
  'F5',
  'Unidentified',
  'Spacebar',
  'Enter\n',
  '<img src=x onerror=alert(1)>',
] as const

it('counts one per click across 100000 hostile synthetic clicks', async () => {
  const mounted = await mountComponent(Counter)
  const button = requireButton(mounted)
  expect(readCount(button)).toBe(0)

  const view = mounted.window
  for (let index = 0; index < CLICKS; index++) {
    const detail = HOSTILE_DETAILS[index % HOSTILE_DETAILS.length] ?? 1
    button.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
        button: 0,
        ctrlKey: detail < 0,
        metaKey: detail === 0,
        shiftKey: detail > 1,
        altKey: true,
      }),
    )
  }

  mounted.flush()
  expect(button.textContent).toBe(`count is ${CLICKS}`)
  expect(button.querySelector('*')).toBeNull()
  expect(button.innerHTML).not.toContain('<')
  expect(readCount(button)).toBe(CLICKS)
  expect(Number.isSafeInteger(readCount(button))).toBe(true)

  button.click()
  mounted.flush()
  expect(readCount(button)).toBe(CLICKS + 1)

  await mounted.unmount()

  const remounted = await mountComponent(Counter)
  const fresh = requireButton(remounted)
  expect(readCount(fresh)).toBe(0)
  fresh.click()
  remounted.flush()
  expect(readCount(fresh)).toBe(1)
  await remounted.unmount()
})

it('limits hostile synthetic events to one increment and ignores non-clicks', async () => {
  const mounted = await mountComponent(Counter)
  const button = requireButton(mounted)
  const view = mounted.window
  const marker = 'adv-s05-xss-marker'

  const inflated = new view.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 1_000_000,
    button: 2,
    buttons: 2,
    ctrlKey: true,
    metaKey: true,
    shiftKey: true,
    altKey: true,
  })
  button.dispatchEvent(inflated)
  button.dispatchEvent(inflated)
  mounted.flush()
  expect(readCount(button)).toBe(2)

  button.dispatchEvent(
    new view.PointerEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: 0,
      pointerType: 'touch',
      pressure: 1,
    }),
  )

  const payload = {
    toString() {
      return `<img src=x onerror=${marker}>`
    },
    valueOf() {
      return 100_000
    },
  }
  button.dispatchEvent(
    new view.CustomEvent('click', { bubbles: true, cancelable: true, detail: payload }),
  )
  button.dispatchEvent(new view.Event('click', { bubbles: true, cancelable: true }))
  mounted.flush()
  expect(readCount(button)).toBe(5)
  expect(view.document.body.innerHTML).not.toContain(marker)
  expect(view.document.body.innerHTML).not.toContain('<img')
  expect(view.document.body.innerHTML).not.toContain('onerror')

  const beforeIgnored = readCount(button)
  const ignoredTypes = [
    'dblclick',
    'auxclick',
    'contextmenu',
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'mouseover',
    'dragstart',
  ]
  for (const type of ignoredTypes) {
    button.dispatchEvent(
      new view.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 50,
      }),
    )
  }

  const sibling = view.document.createElement('span')
  sibling.textContent = 'sibling'
  mounted.target.appendChild(sibling)
  for (const target of [
    sibling,
    mounted.target,
    view.document.body,
    view.document.documentElement,
  ]) {
    target.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 40,
      }),
    )
  }

  mounted.flush()
  expect(readCount(button)).toBe(beforeIgnored)
  expect(button.textContent).toBe(`count is ${beforeIgnored}`)
  await mounted.unmount()
})

it('activates from Enter and Space once and ignores other keyboard input', async () => {
  const mounted = await mountComponent(Counter)
  const button = requireButton(mounted)
  const view = mounted.window

  // Native button semantics are what make Enter and Space activate the control.
  // happy-dom does not run that user-agent step, so activation below dispatches
  // the click a browser would fire, and only if the key event was not cancelled.
  expect(button.tagName).toBe('BUTTON')
  expect(button.disabled).toBe(false)
  expect(button.tabIndex).toBe(0)
  button.focus()
  expect(view.document.activeElement).toBe(button)

  for (const key of IGNORED_KEYS) {
    dispatchKey(button, view, 'keydown', key)
    dispatchKey(button, view, 'keyup', key)
    dispatchKey(button, view, 'keypress', key)
  }
  for (let index = 0; index < 1_000; index++) {
    dispatchKey(button, view, 'keydown', 'x', { repeat: true })
  }
  view.document.dispatchEvent(
    new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
  view.dispatchEvent(
    new view.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
  )
  mounted.flush()
  expect(readCount(button)).toBe(0)
  expect(button.textContent).toBe('count is 0')
  expect(view.document.body.innerHTML).not.toContain('onerror')

  const enterDown = dispatchKey(button, view, 'keydown', 'Enter')
  dispatchKey(button, view, 'keyup', 'Enter')
  if (!enterDown) fireClick(button, view)
  mounted.flush()
  expect(readCount(button)).toBe(1)

  const spaceBefore = readCount(button)
  const spaceDown = dispatchKey(button, view, 'keydown', ' ')
  mounted.flush()
  expect(readCount(button)).toBe(spaceBefore)
  const spaceUp = dispatchKey(button, view, 'keyup', ' ')
  if (!spaceDown && !spaceUp) fireClick(button, view)
  mounted.flush()
  expect(readCount(button)).toBe(spaceBefore + 1)

  for (let index = 0; index < 3; index++) {
    const prevented = dispatchKey(button, view, 'keydown', 'Enter', {
      repeat: true,
      ctrlKey: index === 1,
      metaKey: index === 2,
    })
    if (!prevented) fireClick(button, view)
  }
  mounted.flush()
  expect(readCount(button)).toBe(spaceBefore + 1 + 3)
  expect(button.textContent).toBe(`count is ${spaceBefore + 1 + 3}`)
  await mounted.unmount()
})

// Default button type is submit, so Enter inside an ancestor form submits it.
// happy-dom does not synthesize the click; fireClick is the user-agent click.
it('ADV-S05 keyboard activation does not submit an ancestor form', async () => {
  const mounted = await mountComponent(Counter)
  const button = requireButton(mounted)
  const view = mounted.window
  const form = view.document.createElement('form')
  form.setAttribute('action', 'https://evil.example/counter')
  form.setAttribute('method', 'get')
  let submitted = 0
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    submitted += 1
  })
  view.document.body.appendChild(form)
  form.appendChild(mounted.target)
  if (button.form !== form)
    throw new Error('ancestor form was not associated with the counter button')

  button.focus()
  const prevented = dispatchKey(button, view, 'keydown', 'Enter')
  if (!prevented) fireClick(button, view)
  mounted.flush()

  expect(submitted).toBe(0)
  expect(button.type).toBe('button')
  expect(button.textContent).toBe('count is 1')
  await mounted.unmount()
})

function requireButton(mounted: MountedComponent): CounterButton {
  const button = mounted.target.querySelector('button')
  if (button === null) throw new Error('counter button missing')
  return button as CounterButton
}

function readCount(button: CounterButton): number {
  const text = button.textContent ?? ''
  const match = /^count is (\d+)$/.exec(text)
  if (!match?.[1]) throw new Error(`unexpected counter text: ${JSON.stringify(text)}`)
  return Number(match[1])
}

function fireClick(button: CounterButton, view: MountedComponent['window']): void {
  button.dispatchEvent(
    new view.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: 1,
    }),
  )
}

function dispatchKey(
  button: CounterButton,
  view: MountedComponent['window'],
  type: string,
  key: string,
  init?: { repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): boolean {
  const event = new view.KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    repeat: init?.repeat ?? false,
    ctrlKey: init?.ctrlKey ?? false,
    metaKey: init?.metaKey ?? false,
  })
  button.dispatchEvent(event)
  return event.defaultPrevented
}

interface CounterButton {
  tagName: string
  textContent: string | null
  innerHTML: string
  disabled: boolean
  tabIndex: number
  type: string
  form: unknown
  focus(): void
  click(): void
  dispatchEvent(event: { defaultPrevented?: boolean }): boolean
  querySelector(selector: string): unknown
}
