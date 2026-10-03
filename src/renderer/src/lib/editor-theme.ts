import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { Prec } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'

const highlightStyle = HighlightStyle.define([
  { tag: t.heading, color: 'var(--syntax-heading)', fontWeight: '700' },
  { tag: t.heading1, color: 'var(--syntax-heading)', fontWeight: '700' },
  { tag: t.heading2, color: 'var(--syntax-heading)', fontWeight: '700' },
  { tag: t.heading3, color: 'var(--syntax-heading)', fontWeight: '600' },
  { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.lineComment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.blockComment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.link, color: 'var(--syntax-link)' },
  { tag: t.url, color: 'var(--syntax-link)' },
  { tag: t.monospace, color: 'var(--syntax-code)' },
  { tag: t.keyword, color: 'var(--syntax-keyword)' },
  { tag: t.controlKeyword, color: 'var(--syntax-keyword)' },
  { tag: t.definitionKeyword, color: 'var(--syntax-keyword)' },
  { tag: t.moduleKeyword, color: 'var(--syntax-keyword)' },
  { tag: t.operatorKeyword, color: 'var(--syntax-keyword)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: t.special(t.string), color: 'var(--syntax-string)' },
  { tag: t.number, color: 'var(--syntax-number)' },
  { tag: t.integer, color: 'var(--syntax-number)' },
  { tag: t.float, color: 'var(--syntax-number)' },
  { tag: t.bool, color: 'var(--syntax-number)' },
  { tag: t.atom, color: 'var(--syntax-number)' },
  { tag: t.function(t.variableName), color: 'var(--syntax-function)' },
  { tag: t.function(t.propertyName), color: 'var(--syntax-function)' },
  { tag: t.definition(t.variableName), color: 'var(--syntax-function)' },
  { tag: t.typeName, color: 'var(--syntax-type)' },
  { tag: t.className, color: 'var(--syntax-type)' },
  { tag: t.namespace, color: 'var(--syntax-type)' },
  { tag: t.variableName, color: 'var(--syntax-variable)' },
  { tag: t.propertyName, color: 'var(--syntax-variable)' },
  { tag: t.operator, color: 'var(--syntax-operator)' },
  { tag: t.punctuation, color: 'var(--syntax-operator)' },
  { tag: t.separator, color: 'var(--syntax-operator)' },
  { tag: t.tagName, color: 'var(--syntax-tag)' },
  { tag: t.angleBracket, color: 'var(--syntax-tag)' },
  { tag: t.invalid, color: 'var(--syntax-invalid)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.meta, color: 'var(--text-muted)' },
  { tag: t.processingInstruction, color: 'var(--text-faint)' },
])

export function editorHighlight(): Extension {
  return Prec.high(syntaxHighlighting(highlightStyle))
}
