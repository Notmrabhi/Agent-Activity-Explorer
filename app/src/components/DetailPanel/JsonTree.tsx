import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { formatCount } from '../../lib/format'
import {
  CHUNK_SIZE,
  STRING_PREVIEW_CHARS,
  childCount,
  formatKey,
  isContainer,
  isJsonArray,
  sliceEntries,
  summarize,
  truncateText,
  type JsonContainer,
} from '../../lib/json'
import { Button } from '../ui/Button'
import { ChevronDownIcon } from '../ui/icons'
import { ProgressiveText } from './ProgressiveText'

export interface JsonTreeProps {
  value: unknown
  /** e.g. "Arguments": names the tree and its scroll region. */
  label: string
  /** Read on mount only: Expand/Collapse all remount the tree with a new key. */
  openDepth: number
}

const TREEITEM = '[role="treeitem"]'
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])

// The <li> contains its subtree, so the focus ring goes on its own row instead.
const ITEM =
  'outline-none [&:focus>[data-row]]:bg-selected [&:focus-visible>[data-row]]:outline-2 [&:focus-visible>[data-row]]:-outline-offset-2 [&:focus-visible>[data-row]]:outline-accent'
const ROW = 'flex items-start gap-1 rounded-sm px-1 py-0.5'
const GROUP = 'ml-3 border-l border-border pl-1.5'
const SPACER = <span aria-hidden="true" className="size-4 shrink-0" />

// SECURITY: values render as React text, never innerHTML, so XSS payloads in args stay inert.

/** Long strings are cut; "show all" streams the rest per frame (one 850 KB text node = 100-200 ms layout). */
function JsonPrimitive({
  value,
  full,
  onToggleFull,
  inTree,
}: {
  value: unknown
  full: boolean
  onToggleFull: () => void
  inTree: boolean
}) {
  if (typeof value === 'string') {
    const cut = value.length > STRING_PREVIEW_CHARS
    const shown = cut && !full ? truncateText(value, STRING_PREVIEW_CHARS) : value
    return (
      <>
        <span className="whitespace-pre-wrap text-fg">
          "{full && cut ? <ProgressiveText text={value} /> : shown}
          {cut && !full ? '…' : ''}"
        </span>
        {cut && (
          <>
            {' '}
            <Button
              variant="link"
              // Not a Tab stop: Enter on the row toggles it.
              tabIndex={inTree ? -1 : undefined}
              aria-expanded={full}
              className="font-sans"
              onClick={onToggleFull}
            >
              {full ? 'show less' : `show all ${formatCount(value.length)} chars`}
            </Button>
          </>
        )}
      </>
    )
  }
  return <span className="font-medium text-muted">{value === null ? 'null' : String(value)}</span>
}

function isLongString(value: unknown): boolean {
  return typeof value === 'string' && value.length > STRING_PREVIEW_CHARS
}

interface TreeNodeProps {
  name: string | number
  value: unknown
  level: number
  posinset: number
  setsize: number
  openDepth: number
  first: boolean
}

const TreeNode = memo(function TreeNode({
  name,
  value,
  level,
  posinset,
  setsize,
  openDepth,
  first,
}: TreeNodeProps) {
  const info = useMemo(
    () =>
      isContainer(value)
        ? {
            count: childCount(value),
            summary: summarize(value),
            empty: isJsonArray(value) ? '[]' : '{}',
          }
        : null,
    [value],
  )
  const expandable = info !== null && info.count > 0
  const [open, setOpen] = useState(() => expandable && level <= openDepth)
  const [full, setFull] = useState(false)
  const itemRef = useRef<HTMLLIElement>(null)
  const labelId = useId()
  const keyText = formatKey(name)

  // Focus moves here so a collapse never unmounts the focused element.
  const toggleOpen = () => {
    setOpen((wasOpen) => !wasOpen)
    itemRef.current?.focus()
  }
  const toggleFull = () => {
    setFull((wasFull) => !wasFull)
    itemRef.current?.focus()
  }

  // Keys bubble through ancestor items, so each item only handles its own.
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const item = event.currentTarget
    switch (event.key) {
      case 'ArrowRight':
        if (!expandable) return
        event.preventDefault()
        if (!open) setOpen(true)
        else item.querySelector<HTMLElement>(`:scope > [role="group"] > ${TREEITEM}`)?.focus()
        return
      case 'ArrowLeft':
        event.preventDefault()
        if (expandable && open) setOpen(false)
        else item.parentElement?.closest<HTMLElement>(TREEITEM)?.focus()
        return
      case 'Enter':
      case ' ':
        if (expandable) {
          event.preventDefault()
          setOpen((wasOpen) => !wasOpen)
        } else if (isLongString(value)) {
          event.preventDefault()
          setFull((wasFull) => !wasFull)
        }
        return
      default:
    }
  }

  const keyLabel = typeof name === 'number' ? `item ${name}` : keyText

  return (
    <li
      ref={itemRef}
      role="treeitem"
      tabIndex={first ? 0 : -1}
      aria-level={level}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-expanded={expandable ? open : undefined}
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      className={ITEM}
    >
      <div data-row="" className={ROW}>
        {expandable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Toggle ${keyLabel}`}
            aria-expanded={open}
            onClick={toggleOpen}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted hover:text-fg"
          >
            <ChevronDownIcon
              size={12}
              strokeWidth={2.4}
              className={`transition-transform duration-(--duration-fast) ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : (
          SPACER
        )}
        <span id={labelId} className="min-w-0 flex-1 wrap-anywhere">
          <span className={typeof name === 'number' ? 'text-subtle' : 'text-accent-text'}>
            {keyText}
          </span>
          <span className="text-subtle">: </span>
          {info === null ? (
            <JsonPrimitive value={value} full={full} onToggleFull={toggleFull} inTree />
          ) : (
            <span className="text-muted">{info.count === 0 ? info.empty : info.summary}</span>
          )}
        </span>
      </div>
      {expandable && open && isContainer(value) && (
        <TreeLevel
          value={value}
          level={level + 1}
          openDepth={openDepth}
          role="group"
          className={GROUP}
        />
      )}
    </li>
  )
})

interface TreeLevelProps extends ComponentPropsWithoutRef<'ul'> {
  value: JsonContainer
  level: number
  openDepth: number
  role: 'tree' | 'group'
}

/** 100 children at a time; a collapsed node mounts none. */
function TreeLevel({ value, level, openDepth, ...listProps }: TreeLevelProps) {
  const total = useMemo(() => childCount(value), [value])
  const [visible, setVisible] = useState(CHUNK_SIZE)
  const entries = useMemo(() => sliceEntries(value, visible), [value, visible])
  const remaining = total - entries.length
  const listRef = useRef<HTMLUListElement>(null)
  const focusIndex = useRef<number | null>(null)

  // The button may be gone: focus the first revealed item, not <body>.
  useLayoutEffect(() => {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    const item = listRef.current?.children[index]
    if (item instanceof HTMLElement) item.focus()
  }, [visible])

  const showMore = () => {
    focusIndex.current = entries.length
    setVisible((count) => count + CHUNK_SIZE)
  }

  const handleShowMoreKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      showMore()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.currentTarget.parentElement?.closest<HTMLElement>(TREEITEM)?.focus()
    }
  }

  return (
    <ul ref={listRef} {...listProps}>
      {entries.map((entry, index) => (
        <TreeNode
          key={entry.key}
          name={entry.key}
          value={entry.value}
          level={level}
          posinset={index + 1}
          setsize={total}
          openDepth={openDepth}
          first={level === 1 && index === 0}
        />
      ))}
      {remaining > 0 && (
        // A tree item, not a button: everything in a tree is reached with the arrow keys.
        <li
          role="treeitem"
          tabIndex={-1}
          aria-level={level}
          onClick={showMore}
          onKeyDown={handleShowMoreKeyDown}
          className={`cursor-pointer ${ITEM}`}
        >
          <div data-row="" className={ROW}>
            {SPACER}
            <span className="font-sans text-accent-text underline-offset-2 hover:underline">
              Show {formatCount(Math.min(CHUNK_SIZE, remaining))} more{' '}
              <span className="text-muted">({formatCount(remaining)} remaining)</span>
            </span>
          </div>
        </li>
      )}
    </ul>
  )
}

/** WAI-ARIA tree with one Tab stop. Lazy: closed nodes have no DOM. */
export function JsonTree({ value, label, openDepth }: JsonTreeProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)
  const [full, setFull] = useState(false)
  const isTree = isContainer(value) && childCount(value) > 0

  // Tabbable only when it scrolls: arrow keys can't scroll inside a long string.
  useEffect(() => {
    const box = boxRef.current
    if (box === null || typeof ResizeObserver === 'undefined') return
    const check = () => {
      setScrollable(box.scrollHeight > box.clientHeight + 1)
    }
    const observer = new ResizeObserver(check)
    observer.observe(box)
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    return () => observer.disconnect()
  }, [isTree])

  // Roving tabindex kept in the DOM, not state: no re-render of 2,000 rows per keypress.
  const handleFocus = (event: FocusEvent<HTMLUListElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'treeitem') return
    for (const item of event.currentTarget.querySelectorAll<HTMLElement>(
      `${TREEITEM}[tabindex="0"]`,
    )) {
      if (item !== target) item.tabIndex = -1
    }
    target.tabIndex = 0
  }

  // Closed nodes aren't in the DOM, so DOM order is the visible order.
  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!NAV_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target
    if (!(target instanceof Element)) return
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(TREEITEM)]
    const current = target.closest<HTMLElement>(TREEITEM)
    const index = current === null ? -1 : items.indexOf(current)
    let next: HTMLElement | undefined
    if (event.key === 'Home') next = items[0]
    else if (event.key === 'End') next = items.at(-1)
    else if (event.key === 'ArrowDown') next = items[Math.min(index + 1, items.length - 1)]
    else next = items[Math.max(index - 1, 0)]
    event.preventDefault()
    next?.focus()
  }

  let content: ReactNode
  if (isTree && isContainer(value)) {
    content = (
      <TreeLevel
        value={value}
        level={1}
        openDepth={openDepth}
        role="tree"
        aria-label={label}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
    )
  } else if (isContainer(value)) {
    content = <div className="text-muted">{isJsonArray(value) ? '[]' : '{}'}</div>
  } else {
    content = (
      <div className="wrap-anywhere">
        <JsonPrimitive
          value={value}
          full={full}
          onToggleFull={() => setFull((wasFull) => !wasFull)}
          inTree={false}
        />
      </div>
    )
  }

  return (
    <div
      ref={boxRef}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? `${label} JSON` : undefined}
      tabIndex={scrollable ? 0 : undefined}
      className="max-h-96 overflow-auto rounded-md border border-border bg-code p-2 font-mono text-xs"
    >
      {content}
    </div>
  )
}
