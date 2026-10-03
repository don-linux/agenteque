export interface FolderVisibilityRequest {
  rootName: string
  dirs: string[]
  selected: string[]
}

class FolderVisibility {
  open = $state(false)
  rootName = $state('')
  dirs = $state<string[]>([])
  selected = $state<string[]>([])
  #pending: Promise<string[] | null> | null = null
  #resolve: ((value: string[] | null) => void) | null = null

  request(input: FolderVisibilityRequest): Promise<string[] | null> {
    if (this.#pending) return this.#pending

    this.rootName = input.rootName
    this.dirs = input.dirs
    this.selected = [...input.selected]
    this.open = true
    this.#pending = new Promise((resolve) => {
      this.#resolve = resolve
    })

    return this.#pending
  }

  isSelected(name: string): boolean {
    return this.selected.includes(name)
  }

  toggle(name: string): void {
    if (this.selected.includes(name)) {
      this.selected = this.selected.filter((item) => item !== name)
      return
    }

    this.selected = [...this.selected, name]
  }

  selectAll = (): void => {
    this.selected = [...this.dirs]
  }

  selectNone = (): void => {
    this.selected = []
  }

  confirm = (): void => {
    this.#settle([...this.selected])
  }

  cancel = (): void => {
    this.#settle(null)
  }

  #settle(value: string[] | null): void {
    const resolve = this.#resolve
    this.open = false
    this.#pending = null
    this.#resolve = null
    resolve?.(value)
  }
}

export const folderVisibility = new FolderVisibility()
