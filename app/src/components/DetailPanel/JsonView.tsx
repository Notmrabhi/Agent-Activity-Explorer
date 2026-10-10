import { useMemo, useState, type ReactNode } from 'react'
import { formatBytes } from '../../lib/format'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'

export interface JsonViewProps {
  /** Any JSON value from the API (`args`, `result`). `undefined` renders "No value". */
  value: unknown
  /** What the value is, e.g. "Arguments". Names the code region and the copy button. */
  label: string
  /**
   * Leave out the built-in "Copy JSON" row, for callers that put the copy button in their own
   * header (the detail panel puts it on the section title row, as in the mockup).
   */
  hideCopy?: boolean
  className?: string
}

/** The API says `args` "can be large": beyond this many characters we render a prefix first. */
const PREVIEW_CHARS = 20_000

/**
 * Highlighting creates a few spans per line. Past this size (only reachable via "Show all")
 * we render plain text: a multi-megabyte payload would otherwise mean hundreds of thousands of
 * DOM nodes and a frozen tab.
 */
const HIGHLIGHT_LIMIT = 200_000

// One pass over the pretty-printed text. Alternatives, in order: a string (plus a following
// colon, which makes it a key), a number, a literal, punctuation. Whitespace falls between
// matches. Strings stop at a newline so a string cut in half by the preview limit stays plain.
const TOKEN =
  /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const [whole, string, colon, number, literal, punctuation] = match
    const start = match.index
    if (start > last) nodes.push(text.slice(last, start))
    const key = start
    if (string !== undefined && colon !== undefined) {
      nodes.push(
        <span key={key} className="text-accent-text">
          {string}
        </span>,
        <span key={`${key}:`} className="text-subtle">
          {colon}
        </span>,
      )
    } else if (string !== undefined) {
      nodes.push(
        <span key={key} className="text-fg">
          {string}
        </span>,
      )
    } else if (number !== undefined || literal !== undefined) {
      nodes.push(
        <span key={key} className="font-medium text-muted">
          {whole}
        </span>,
      )
    } else if (punctuation !== undefined) {
      nodes.push(
        <span key={key} className="text-subtle">
          {punctuation}
        </span>,
      )
    }
    last = start + whole.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function stringify(value: unknown): string | undefined {
  if (value === undefined) return undefined
  try {
    // JSON.stringify returns undefined for functions/symbols; the API never sends those.
    return JSON.stringify(value, null, 2) ?? undefined
  } catch {
    // Circular structures or BigInt. Cannot come from a JSON response, but never crash the panel.
    return String(value)
  }
}

/**
 * Read-only, syntax-highlighted JSON. Large payloads show the first 20 KB with a "Show all"
 * link; "Copy JSON" always copies the full text.
 */
export function JsonView({ value, label, hideCopy = false, className }: JsonViewProps) {
  const text = useMemo(() => stringify(value), [value])

  // Remember *which* text was expanded rather than a boolean, so moving to another event
  // (a new value) collapses again without an effect to reset state.
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const isLarge = text !== undefined && text.length > PREVIEW_CHARS
  const showAll = isLarge && expandedText === text
  const shown = text === undefined ? '' : isLarge && !showAll ? text.slice(0, PREVIEW_CHARS) : text

  const content = useMemo(
    () => (shown.length > HIGHLIGHT_LIMIT ? shown : highlight(shown)),
    [shown],
  )

  if (text === undefined) {
    return <p className={`text-sm text-muted ${className ?? ''}`}>No value</p>
  }

  return (
    <div className={className}>
      {!hideCopy && (
        <div className="mb-2 flex justify-end">
          <CopyButton value={text} label={`Copy ${label} JSON`}>
            Copy JSON
          </CopyButton>
        </div>
      )}
      {/* Focusable so keyboard users can scroll it; a region so the focus stop has a name. */}
      <pre
        role="region"
        aria-label={`${label} JSON`}
        tabIndex={0}
        className="max-h-96 overflow-auto rounded-md border border-border bg-code p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg"
      >
        {content}
      </pre>
      {isLarge && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          {showAll
            ? `Showing all ${formatBytes(text.length)}`
            : `Showing first 20 KB of ${formatBytes(text.length)}`}
          <Button
            variant="link"
            aria-expanded={showAll}
            onClick={() => setExpandedText(showAll ? null : text)}
          >
            {showAll ? 'Show less' : 'Show all'}
          </Button>
        </p>
      )}
    </div>
  )
}
