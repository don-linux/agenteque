<script lang="ts">
  import { onMount } from 'svelte'
  import { appConfig } from '$lib/app-config.svelte'
  import FontCombobox from '$lib/components/FontCombobox.svelte'
  import TerminalPreview from '$lib/components/TerminalPreview.svelte'
  import { shortcutLabel } from '$lib/platform'
  import { settingsEditor } from '$lib/settings-editor.svelte'
  import { clampFontSize, MAX_TERMINAL_FONT_SIZE, MIN_TERMINAL_FONT_SIZE } from '$lib/terminal-font'
  import { resolveTerminalTheme, TERMINAL_ANSI_SLOTS, TERMINAL_THEMES } from '$lib/terminal-theme'

  let previewTheme = $derived(resolveTerminalTheme(settingsEditor.theme))

  onMount(() => {
    void appConfig.listSystemFonts()
  })

  function onSizeChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const next = clampFontSize(Number(input.value))
    input.value = String(next)
    settingsEditor.setSize(next)
  }

  function onThemeChange(event: Event): void {
    settingsEditor.setTheme((event.currentTarget as HTMLSelectElement).value)
  }
</script>

<section class="section" aria-labelledby="terminal-heading">
  <h2 id="terminal-heading">Terminal</h2>
  <p class="lead">
    Fuente, tamaño y tema del panel integrado. Se aplican al guardar o con {shortcutLabel(
      'Ctrl+S',
    )}.
  </p>

  <div class="field">
    <label for="terminal-font">Fuente</label>
    <FontCombobox
      id="terminal-font"
      fonts={appConfig.fonts}
      value={settingsEditor.fontFamily}
      disabled={!appConfig.fontsLoaded}
      onSelect={(family) => settingsEditor.setFont(family)}
    />
    <p class="hint">
      Lista curada de monoespaciadas. Si usas otra, escribe su nombre: el campo acepta texto libre.
    </p>
  </div>

  <div class="field">
    <label for="terminal-font-size">Tamaño</label>
    <div class="stepper">
      <button
        type="button"
        aria-label="Reducir tamaño"
        disabled={settingsEditor.fontSize <= MIN_TERMINAL_FONT_SIZE}
        onclick={() => settingsEditor.setSize(settingsEditor.fontSize - 1)}
      >
        −
      </button>
      <input
        id="terminal-font-size"
        type="number"
        min={MIN_TERMINAL_FONT_SIZE}
        max={MAX_TERMINAL_FONT_SIZE}
        value={settingsEditor.fontSize}
        onchange={onSizeChange}
      />
      <button
        type="button"
        aria-label="Aumentar tamaño"
        disabled={settingsEditor.fontSize >= MAX_TERMINAL_FONT_SIZE}
        onclick={() => settingsEditor.setSize(settingsEditor.fontSize + 1)}
      >
        +
      </button>
      <span class="unit">px</span>
    </div>
  </div>

  <div class="field">
    <label for="terminal-theme">Tema</label>
    <select id="terminal-theme" value={settingsEditor.theme} onchange={onThemeChange}>
      {#each TERMINAL_THEMES as entry (entry.id)}
        <option value={entry.id}>{entry.label}</option>
      {/each}
    </select>
  </div>

  <div
    class="preview"
    style:background={previewTheme.background}
    style:color={previewTheme.foreground}
  >
    <div class="swatches" aria-hidden="true">
      {#each TERMINAL_ANSI_SLOTS as slot (slot)}
        <span class="swatch" style:background={previewTheme[slot]}></span>
      {/each}
    </div>
    <TerminalPreview
      themeId={settingsEditor.theme}
      fontSize={settingsEditor.fontSize}
      fontFamily={settingsEditor.fontFamily}
    />
  </div>

  {#if appConfig.error}
    <p class="error">{appConfig.error}</p>
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
    max-width: 36rem;
    padding: 2rem 2rem 3rem;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .lead,
  .hint,
  .error {
    margin: 0;
    font-size: 0.85rem;
  }

  .lead,
  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--danger);
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

  .stepper {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .stepper input {
    box-sizing: border-box;
    width: 4.2rem;
    padding: 0.45rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    text-align: center;
  }

  .stepper input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .stepper button {
    display: inline-flex;
    box-sizing: border-box;
    width: 2.1rem;
    height: 2.1rem;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-hover);
    color: var(--text);
    font: inherit;
    font-size: 1rem;
    cursor: pointer;
  }

  .stepper button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .stepper button:disabled {
    color: var(--text-faint);
    cursor: not-allowed;
  }

  .unit {
    color: var(--text-faint);
    font-size: 0.78rem;
  }

  select {
    box-sizing: border-box;
    width: min(32rem, 100%);
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
  }

  select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .preview {
    margin: 0;
    padding: 0.75rem 0.85rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.55rem;
  }

  .swatch {
    display: block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
  }
</style>
