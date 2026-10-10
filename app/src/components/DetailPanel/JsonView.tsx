import { useId, useMemo, useState, type ReactNode } from 'react'
import { formatBytes } from '../../lib/format'
import {
  childCount,
  defaultOpenDepth,
  hasNestedContainers,
  isContainer,
  planExpandAll,
  toPrettyJson,
} from '../../lib/json'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { JsonTree } from './JsonTree'
import { ProgressiveText } from './ProgressiveText'

export interface JsonViewProps {
  /** Any JSON value from the API (`args`, `result`). `undefined` renders "No value". */
  value: unknown
  /** What the value is, e.g. "Arguments". Names the view toggle, the code region and Copy. */
  label: string
}

type ViewMode = 'tree' | 'raw'

const VIEW_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'raw', label: 'Raw' },
]

/** Raw view: beyond this many characters show a plain-text prefix first, and never highlight. */
const RAW_PREVIEW_CHARS = 20_000

// Segmented control (as in the design's status control): a sunken track, the checked option
// lifted onto the surface. The radio is visually hidden, so its focus ring goes on the label.
const SEGMENT =
  'flex h-7 cursor-pointer items-center rounded-sm px-2.5 text-sm font-medium text-muted select-none hover:text-fg has-checked:bg-surface has-checked:text-fg has-checked:shadow-segment has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent'

// One pass over the pretty-printed text. Alternatives, in order: a string (plus a following
// colon, which makes it a key), a number, a literal, punctuation. Whitespace falls between
// matches. Strings stop at a newline so a string cut in half by a prefix stays plain.
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

interface Expansion {
  /** The value this state belongs to; a new event resets it. */
  value: unknown
  /** null = the default (top-level keys open). 0 = "Collapse all". */
  openDepth: number | null
  /** "Expand all" stopped early on a large payload. */
  capped: boolean
  /** Remount key for the tree: each change rebuilds its open/closed state from openDepth. */
  generation: number
}

/**
 * Read-only JSON with two views. Tree (default): a lazy, keyboard-navigable tree that stays
 * fast on 850 KB payloads. Raw: pretty-printed text, highlighted up to 20 KB, plain beyond.
 * "Copy JSON" always copies the full text, built only when clicked.
 */
export function JsonView({ value, label }: JsonViewProps) {
  const radioName = useId()
  // Tree or Raw is a reading preference, so it is kept while stepping through events.
  const [view, setView] = useState<ViewMode>('tree')
  const [expansion, setExpansion] = useState<Expansion>({
    value,
    openDepth: null,
    capped: false,
    generation: 0,
  })
  // A different event: back to the default expansion. Set during render (React's pattern for
  // state derived from a changed prop) so the stale tree never paints; the new generation
  // remounts it.
  if (expansion.value !== value) {
    setExpansion({
      value,
      openDepth: null,
      capped: false,
      generation: expansion.generation + 1,
    })
  }

  const defaultDepth = useMemo(() => defaultOpenDepth(value), [value])
  // Only a non-empty object or array has a tree worth toggling, and Expand/Collapse all only
  // matter when something in it is nested (not for a flat `{ bytesWritten }`).
  const shape = useMemo(() => {
    if (!isContainer(value) || childCount(value) === 0) return { hasTree: false, nested: false }
    return { hasTree: true, nested: hasNestedContainers(value) }
  }, [value])
  const openDepth = expansion.openDepth ?? defaultDepth

  // Raw text is built only while the Raw view is shown; the tree never needs it.
  const text = useMemo(() => (view === 'raw' ? toPrettyJson(value) : undefined), [view, value])
  // Remember *which* text was expanded rather than a boolean, so a new event (new text)
  // collapses again without an effect to reset state.
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const isLarge = text !== undefined && text.length > RAW_PREVIEW_CHARS
  const showAll = isLarge && expandedText === text
  // Highlighting costs a few spans per line. Small text only: past 20 KB we render plain text,
  // where thousands of spans would freeze the tab. "Show all" lays it out a block per frame
  // (see ProgressiveText): as one text node, 850 KB is a single 300+ ms layout task.
  const rawContent = useMemo(() => {
    if (text === undefined) return null
    if (!isLarge) return highlight(text)
    return showAll ? <ProgressiveText text={text} /> : text.slice(0, RAW_PREVIEW_CHARS)
  }, [text, isLarge, showAll])

  if (value === undefined) {
    return <p className="text-sm text-muted">No value</p>
  }

  const { hasTree, nested } = shape
  const mode: ViewMode = hasTree ? view : 'tree'

  const expandAll = () => {
    const plan = planExpandAll(value)
    setExpansion({
      value,
      openDepth: plan.depth,
      capped: plan.capped,
      generation: expansion.generation + 1,
    })
  }
  const collapseAll = () => {
    setExpansion({ value, openDepth: 0, capped: false, generation: expansion.generation + 1 })
  }

  // Shown for a capped "Expand all"; the other results are obvious on screen but not to a
  // screen reader, so they are announced only.
  let expandNote = ''
  let noteVisible = false
  if (expansion.capped) {
    expandNote = `Large payload: expanded ${openDepth} ${openDepth === 1 ? 'level' : 'levels'}`
    noteVisible = true
  } else if (expansion.openDepth === 0) {
    expandNote = 'Collapsed to top-level keys'
  } else if (expansion.openDepth !== null) {
    expandNote = 'All levels expanded'
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {hasTree && (
          <fieldset className="inline-flex rounded-md bg-sunken p-0.5">
            <legend className="sr-only">{label} view</legend>
            {VIEW_OPTIONS.map((option) => (
              <label key={option.value} className={SEGMENT}>
                <input
                  type="radio"
                  name={radioName}
                  value={option.value}
                  checked={view === option.value}
                  onChange={() => setView(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}
        {mode === 'tree' && nested && (
          <>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse all
            </Button>
          </>
        )}
        {/* A function, so the full JSON (up to 850 KB) is stringified on click, not per render. */}
        <CopyButton
          value={() => toPrettyJson(value) ?? ''}
          label={`Copy ${label} JSON`}
          className="ml-auto"
        >
          Copy JSON
        </CopyButton>
      </div>

      {mode === 'tree' ? (
        <>
          {/* Always mounted in tree mode: a live region only announces changes made after it
              is in the DOM. */}
          <p role="status" className={noteVisible ? 'mb-2 text-xs text-muted' : 'sr-only'}>
            {expandNote}
          </p>
          <JsonTree key={expansion.generation} value={value} label={label} openDepth={openDepth} />
        </>
      ) : (
        <>
          {/* Focusable so keyboard users can scroll it; a region so the focus stop has a name.
              Text children only (never innerHTML), so `<script>` in a payload stays inert. */}
          <pre
            role="region"
            aria-label={`${label} JSON`}
            tabIndex={0}
            className="max-h-96 overflow-auto rounded-md border border-border bg-code p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg"
          >
            {rawContent}
          </pre>
          {isLarge && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              {showAll
                ? `Showing all ${formatBytes(text.length)}, without highlighting`
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
        </>
      )}
    </div>
  )
}
