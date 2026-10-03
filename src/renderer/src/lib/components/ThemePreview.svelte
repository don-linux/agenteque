<script lang="ts">
  import { markdown } from '@codemirror/lang-markdown'
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { editorHighlight } from '$lib/editor-theme'
  import { settingsEditor } from '$lib/settings-editor.svelte'
  import {
    THEME_PREVIEW_DIR,
    THEME_PREVIEW_FILES,
    THEME_PREVIEW_MARKDOWN,
    THEME_PREVIEW_ROOT,
    THEME_PREVIEW_STATUS,
    previewLanes,
  } from '$lib/theme-preview'

  // El tema ya está aplicado al documento, así que la tira lee las variables
  // del grafo. Del id solo se saca cuántos carriles trae este tema.
  let lanes = $derived(previewLanes(settingsEditor.uiTheme))

  function attachPreview(node: HTMLElement): () => void {
    const editor = new EditorView({
      state: EditorState.create({
        doc: THEME_PREVIEW_MARKDOWN,
        extensions: [
          basicSetup,
          markdown(),
          editorHighlight(),
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
      parent: node,
    })

    return () => editor.destroy()
  }
</script>

<div class="preview" aria-label="Vista previa de agenteque">
  <div class="ide">
    <div class="body">
      <aside>
        <header>
          <span class="root">{THEME_PREVIEW_ROOT}</span>
        </header>
        <nav>
          <span class="dir">{THEME_PREVIEW_DIR}</span>
          {#each THEME_PREVIEW_FILES as file (file.name)}
            <span class={['file', { selected: file.selected }]}>{file.name}</span>
          {/each}
        </nav>
      </aside>
      <section>
        <header>
          {#each THEME_PREVIEW_FILES as file (file.name)}
            <span class={['tab', { active: file.selected }]}>{file.name}</span>
          {/each}
          <span class="status">{THEME_PREVIEW_STATUS}</span>
        </header>
        <div class="editor" {@attach attachPreview}></div>
      </section>
    </div>
    <footer>
      <span class="brand">agenteque</span>
      <ul class="lanes" aria-label="Colores de los carriles del tema">
        {#each lanes as entry (entry.label)}
          <li class="lane" class:current={entry.current} style:--lane={entry.lane}>
            <span class="dot" aria-hidden="true"></span>
            <span class="tag">{entry.label}</span>
          </li>
        {/each}
      </ul>
    </footer>
  </div>
</div>

<style>
  .preview {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: 0 10px 28px var(--shadow);
  }

  .ide {
    display: flex;
    flex-direction: column;
    height: 22rem;
  }

  .body {
    display: grid;
    grid-template-columns: 10.5rem 1fr;
    flex: 1;
    min-height: 0;
  }

  aside {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  aside header,
  section header {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    min-height: 2.1rem;
    border-bottom: 1px solid var(--border);
  }

  .root {
    overflow: hidden;
    padding: 0.55rem 0.7rem;
    color: var(--text-muted);
    font-size: 0.72rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem;
  }

  .dir,
  .file,
  .tab,
  .status,
  .brand {
    font-size: 0.75rem;
  }

  .dir {
    padding: 0.2rem 0.4rem;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }

  .file {
    padding: 0.28rem 0.4rem;
    border-radius: 4px;
    color: var(--text);
  }

  .file.selected {
    background: var(--accent-soft);
    color: var(--accent);
  }

  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg);
  }

  .tab {
    display: flex;
    align-items: center;
    padding: 0 0.8rem;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
  }

  .tab.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .status {
    display: flex;
    margin-left: auto;
    align-items: center;
    padding-right: 0.85rem;
    color: var(--text-faint);
  }

  .editor {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .editor :global(.cm-editor) {
    height: 100%;
    background: var(--bg);
    color: var(--text);
  }

  .editor :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .editor :global(.cm-scroller) {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .editor :global(.cm-content) {
    padding: 0.75rem 0;
    caret-color: var(--accent);
  }

  .editor :global(.cm-gutters) {
    background: var(--surface);
    color: var(--text-faint);
    border-right: 1px solid var(--border);
  }

  .editor :global(.cm-activeLine) {
    background: var(--surface-hover);
  }

  .editor :global(.cm-activeLineGutter) {
    background: var(--surface-hover);
  }

  .editor :global(.cm-cursor),
  .editor :global(.cm-cursor-primary) {
    border-left-color: var(--accent);
  }

  .editor :global(.cm-selectionBackground),
  .editor :global(.cm-editor.cm-focused .cm-selectionBackground),
  .editor :global(.cm-content ::selection) {
    background: var(--accent-soft);
  }

  footer {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.7rem;
    height: 2.1rem;
    padding: 0 0.7rem;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .brand {
    flex-shrink: 0;
    color: var(--text-faint);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: lowercase;
  }

  /* Un carril por color del tema: cuántos hay ya es parte de la paleta. */
  .lanes {
    display: flex;
    min-width: 0;
    margin: 0 0 0 auto;
    padding: 0;
    align-items: center;
    gap: 0.45rem;
    overflow: hidden;
    list-style: none;
  }

  .lane {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.22rem;
  }

  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--lane);
  }

  /* La rama actual va hueca, igual que el nodo de HEAD en el grafo real. */
  .lane.current .dot {
    background: var(--bg);
    box-shadow: inset 0 0 0 1.5px var(--lane);
  }

  .tag {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 0.62rem;
  }
</style>
