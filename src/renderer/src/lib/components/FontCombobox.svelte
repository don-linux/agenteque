<script lang="ts">
  import SearchableCombobox from '$lib/components/SearchableCombobox.svelte'
  import type { ComboItem } from '$lib/combobox'
  import { DEFAULT_FONT_LABEL, type SystemFont } from '$lib/terminal-font'

  let {
    fonts,
    value,
    onSelect,
    disabled = false,
    id = 'terminal-font',
  }: {
    fonts: SystemFont[]
    value: string | null
    onSelect: (family: string | null) => void
    disabled?: boolean
    id?: string
  } = $props()

  let items = $derived.by((): ComboItem[] => [
    {
      value: null,
      label: DEFAULT_FONT_LABEL,
      previewFamily: 'ui-monospace, monospace',
    },
    ...fonts.map((font) => ({
      value: font.family,
      label: font.family,
      previewFamily: font.family,
    })),
  ])
</script>

<SearchableCombobox
  {id}
  {items}
  {value}
  {disabled}
  {onSelect}
  emptyLabel="No hay fuentes que coincidan."
/>
