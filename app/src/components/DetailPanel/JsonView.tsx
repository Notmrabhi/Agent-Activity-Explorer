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
  value: unknown
  label: string
}

type ViewMode = 'tree' | 'raw'

const VIEW_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'raw', label: 'Raw' },
]

/** Raw view: past this, plain text only (thousands of highlight spans freeze the tab). */
const RAW_PREVIEW_CHARS = 20_000

// The radio is visually hidden, so its focus ring goes on the label.
const SEGMENT =
  'flex h-7 cursor-pointer items-center rounded-sm px-2.5 text-sm font-medium text-muted select-none hover:text-fg has-checked:bg-surface has-checked:text-fg has-checked:shadow-segment has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent'

// String (a key when a colon follows), number, literal, punctuation.
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
  value: unknown
  /** null = the default (top-level keys open). 0 = "Collapse all". */
  openDepth: number | null
  capped: boolean
  generation: number
}

/** Tree (lazy, keyboard) or Raw (highlighted up to 20 KB). Copy builds the full text on click. */
export function JsonView({ value, label }: JsonViewProps) {
  const radioName = useId()
  const [view, setView] = useState<ViewMode>('tree')
  const [expansion, setExpansion] = useState<Expansion>({
    value,
    openDepth: null,
    capped: false,
    generation: 0,
  })
  // New event: reset during render so the stale tree never paints.
  if (expansion.value !== value) {
    setExpansion({
      value,
      openDepth: null,
      capped: false,
      generation: expansion.generation + 1,
    })
  }

  const defaultDepth = useMemo(() => defaultOpenDepth(value), [value])
  const shape = useMemo(() => {
    if (!isContainer(value) || childCount(value) === 0) return { hasTree: false, nested: false }
    return { hasTree: true, nested: hasNestedContainers(value) }
  }, [value])
  const openDepth = expansion.openDepth ?? defaultDepth

  const text = useMemo(() => (view === 'raw' ? toPrettyJson(value) : undefined), [view, value])
  // Which text was expanded, not a boolean: a new event collapses again by itself.
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const isLarge = text !== undefined && text.length > RAW_PREVIEW_CHARS
  const showAll = isLarge && expandedText === text
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
          <p role="status" className={noteVisible ? 'mb-2 text-xs text-muted' : 'sr-only'}>
            {expandNote}
          </p>
          <JsonTree key={expansion.generation} value={value} label={label} openDepth={openDepth} />
        </>
      ) : (
        <>
          {/* Text only, never innerHTML, so `<script>` in a payload stays inert. */}
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
