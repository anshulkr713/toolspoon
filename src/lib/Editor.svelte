<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, drawSelection, highlightActiveLine, dropCursor, rectangularSelection, crosshairCursor, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
  import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
  import { json } from "@codemirror/lang-json";
  import { theme, syntaxStyles, lightTheme, lightSyntaxStyles } from "./theme";
  import { Compartment } from "@codemirror/state";
  import { settings } from "../stores/settings";

  let { 
    value = $bindable(), 
    readonly = false, 
    placeholder = "" 
  } = $props<{ 
    value: string; 
    readonly?: boolean; 
    placeholder?: string; 
  }>();

  let editorDiv: HTMLDivElement;
  let view: EditorView;

  const tabSizeConf = new Compartment();
  const wordWrapConf = new Compartment();
  const fontConf = new Compartment();
  const themeConf = new Compartment();

  // Basic setup without line wrapping and optimized for rendering performance
  const basicSetup = [
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),
    history(),
  ];

  onMount(() => {
    view = new EditorView({
      parent: editorDiv,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          themeConf.of($settings.theme === 'dark' ? [theme, syntaxStyles] : [lightTheme, lightSyntaxStyles]),
          tabSizeConf.of(EditorState.tabSize.of($settings.tabSize)),
          wordWrapConf.of($settings.wordWrap ? EditorView.lineWrapping : []),
          fontConf.of(EditorView.theme({
            ".cm-scroller": { fontFamily: `${$settings.fontFamily} !important` }
          })),
          EditorState.readOnly.of(readonly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !readonly) {
              const newValue = update.state.doc.toString();
              if (value !== newValue) {
                value = newValue;
              }
            }
          })
        ]
      })
    });
  });

  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      });
    }
  });

  $effect(() => {
    if (view) {
      view.dispatch({
        effects: [
          themeConf.reconfigure($settings.theme === 'dark' ? [theme, syntaxStyles] : [lightTheme, lightSyntaxStyles]),
          tabSizeConf.reconfigure(EditorState.tabSize.of($settings.tabSize)),
          wordWrapConf.reconfigure($settings.wordWrap ? EditorView.lineWrapping : []),
          fontConf.reconfigure(EditorView.theme({
            ".cm-scroller": { fontFamily: `${$settings.fontFamily} !important` }
          }))
        ]
      });
    }
  });

  onDestroy(() => {
    if (view) {
      view.destroy();
    }
  });
</script>

<div class="editor-container w-full h-full" bind:this={editorDiv}></div>

<style>
  .editor-container {
    height: 100%;
    width: 100%;
    overflow: hidden; /* Contains the editor so it doesn't leak out */
  }
  
  :global(.cm-editor) {
    height: 100%;
    width: 100%;
  }

  :global(.cm-scroller) {
    font-size: 13px;
    line-height: 1.6;
    overflow: auto;
  }
</style>
