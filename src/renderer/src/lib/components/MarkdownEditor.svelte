<script lang="ts">
  import { onMount } from 'svelte'
  import { markdown } from '@codemirror/lang-markdown'
  import { languages } from '@codemirror/language-data'
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { editorKeymap } from '$lib/editor-keymap'
  import { editorHighlight } from '$lib/editor-theme'
  import { editorSession } from '$lib/editor-session.svelte'
  import { externalDocumentSpec } from '$lib/editor-sync'

  let {
    path,
    content,
    contentReady,
    onChange,
  }: {
    path: string
    content: string
    contentReady: boolean
    onChange: (contents: string) => void
  } = $props()

  let host: HTMLDivElement | undefined
  let view: EditorView | undefined
  let ready = $state(false)
  let applying = false
  let activePath = ''

  function extensions() {
    return [
      basicSetup,
      editorKeymap(),
      markdown({ codeLanguages: languages }),
      editorHighlight(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        editorSession.sync(update.state)
        if (!update.docChanged || applying) return
        onChange(update.state.doc.toString())
      }),
    ]
  }

  function createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: extensions(),
    })
  }

  onMount(() => {
    if (!host) return

    const editor = new EditorView({
      state: createState(contentReady ? content : ''),
      parent: host,
    })

    view = editor
    activePath = path
    editorSession.attach(editor)
    ready = true

    return () => {
      if (activePath) editorSession.saveState(activePath, editor.state)
      editorSession.detach()
      ready = false
      view = undefined
      editor.destroy()
    }
  })

  $effect(() => {
    const nextPath = path
    const nextContent = content
    const readyContent = contentReady
    if (!ready || !view) return

    if (nextPath !== activePath) {
      if (activePath) editorSession.saveState(activePath, view.state)

      const saved = editorSession.takeState(nextPath)
      applying = true
      view.setState(saved ?? createState(readyContent ? nextContent : ''))
      applying = false
      activePath = nextPath
      editorSession.sync(view.state)
    }

    if (!readyContent || view.state.doc.toString() === nextContent) return

    const scroll = view.scrollDOM.scrollTop

    applying = true
    view.dispatch(externalDocumentSpec(view.state, nextContent))
    view.scrollDOM.scrollTop = scroll
    applying = false
    editorSession.sync(view.state)
  })
</script>

<div class="editor" bind:this={host}></div>

<style>
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
    font-size: 0.9rem;
    line-height: 1.65;
  }

  .editor :global(.cm-content) {
    padding: 1.25rem 0;
    caret-color: var(--accent);
    -webkit-user-select: text;
    user-select: text;
  }

  .editor :global(.cm-line) {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .editor :global(.cm-gutters) {
    background: var(--surface);
    color: var(--text-faint);
    border-right: 1px solid var(--border);
  }

  .editor :global(.cm-activeLine) {
    background: color-mix(in srgb, var(--surface-hover) 55%, transparent);
  }

  .editor :global(.cm-activeLineGutter) {
    background: var(--surface-hover);
  }

  .editor :global(.cm-cursor),
  .editor :global(.cm-cursor-primary) {
    border-left-color: var(--accent);
  }

  .editor :global(.cm-selectionLayer),
  .editor :global(.cm-selectionLayer .cm-selectionBackground) {
    pointer-events: none;
  }

  .editor :global(.cm-selectionLayer) {
    z-index: 1 !important;
  }

  .editor :global(.cm-selectionBackground),
  .editor :global(.cm-editor.cm-focused .cm-selectionBackground) {
    background: var(--accent-soft);
    background: color-mix(in srgb, var(--accent) 38%, transparent);
  }
</style>
