import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {tags as t} from "@lezer/highlight";

// A Custom dark theme that beautifully blends with zinc-950
const zinc300 = "#d4d4d8",
      zinc400 = "#a1a1aa",
      zinc500 = "#71717a",
      zinc600 = "#52525b",
      zinc700 = "#3f3f46",
      zinc800 = "#27272a",
      zinc900 = "#18181b",
      zinc950 = "#09090b",
      white = "#ffffff",
      cyan = "#56b6c2",
      lightBlue = "#61afef",
      purple = "#c678dd",
      green = "#98c379",
      red = "#e06c75",
      orange = "#fabc3f",
      comments = "#5c6370";

export const theme = EditorView.theme({
  "&": {
    color: zinc300,
    backgroundColor: "transparent",
  },
  ".cm-content": {
    caretColor: zinc300,
    padding: "20px 0"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: zinc300
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: zinc800 + " !important"
  },
  ".cm-panels": {
    backgroundColor: zinc900,
    color: zinc300
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid " + zinc800
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid " + zinc800
  },
  ".cm-searchMatch": {
    backgroundColor: zinc700,
    outline: "1px solid " + zinc600
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: zinc600
  },
  ".cm-activeLine": {
    backgroundColor: zinc900 + "80"
  },
  ".cm-selectionMatch": {
    backgroundColor: zinc800
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: zinc600,
    border: "none",
    paddingLeft: "16px",
    paddingRight: "16px"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: zinc400
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: zinc500
  },
  ".cm-tooltip": {
    border: "1px solid " + zinc800,
    backgroundColor: zinc900
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: zinc800,
      color: white
    }
  }
}, { dark: true });

export const syntaxStyles = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword, color: purple },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: lightBlue },
  { tag: [t.function(t.variableName), t.labelName], color: lightBlue },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: orange },
  { tag: [t.definition(t.name), t.separator], color: zinc300 },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: orange },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: cyan },
  { tag: [t.meta, t.comment], color: comments, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: white, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: red },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: green },
  { tag: t.invalid, color: white }
]));

export const lightTheme = EditorView.theme({
  "&": {
    color: "#18181b",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    caretColor: "#18181b",
    padding: "20px 0"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#18181b"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "#e4e4e7 !important"
  },
  ".cm-panels": {
    backgroundColor: "#f4f4f5",
    color: "#18181b"
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid #d4d4d8"
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid #d4d4d8"
  },
  ".cm-activeLine": {
    backgroundColor: "#f4f4f580"
  },
  ".cm-selectionMatch": {
    backgroundColor: "#e4e4e7"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#a1a1aa",
    border: "none",
    paddingLeft: "16px",
    paddingRight: "16px"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#52525b"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "#71717a"
  },
  ".cm-tooltip": {
    border: "1px solid #d4d4d8",
    backgroundColor: "#ffffff"
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "#e4e4e7",
      color: "#18181b"
    }
  }
}, { dark: false });

export const lightSyntaxStyles = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword, color: "#a626a4" },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "#4078f2" },
  { tag: [t.function(t.variableName), t.labelName], color: "#4078f2" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#986801" },
  { tag: [t.definition(t.name), t.separator], color: "#383a42" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#986801" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#0184bc" },
  { tag: [t.meta, t.comment], color: "#a0a1a7", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#383a42", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#e45649" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d97706" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#50a14f" },
  { tag: t.invalid, color: "#383a42" }
]));
