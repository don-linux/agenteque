<script lang="ts">
  import type { ComboItem } from '$lib/combobox'
  import SearchableCombobox from '$lib/components/SearchableCombobox.svelte'
  import ThemePreview from '$lib/components/ThemePreview.svelte'
  import { shortcutLabel } from '$lib/platform'
  import { settingsEditor } from '$lib/settings-editor.svelte'
  import { DEFAULT_UI_THEME_ID, UI_THEMES } from '$lib/ui-theme'

  const items: ComboItem[] = UI_THEMES.map((theme) => ({ value: theme.id, label: theme.label }))

  function onSelect(value: string | null): void {
    settingsEditor.setUiTheme(value ?? DEFAULT_UI_THEME_ID)
  }
</script>

<section class="section" aria-labelledby="themes-heading">
  <h2 id="themes-heading">Temas</h2>
  <p class="lead">
    Color de la interfaz. Se aplica en esta página al elegir uno; se guarda con el botón o
    {shortcutLabel('Ctrl+S')}.
  </p>

  <div class="field">
    <label for="ui-theme">Tema</label>
    <SearchableCombobox id="ui-theme" {items} value={settingsEditor.uiTheme} {onSelect} />
  </div>

  <ThemePreview />
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
    padding: 2rem 2rem 3rem;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .lead {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
</style>
