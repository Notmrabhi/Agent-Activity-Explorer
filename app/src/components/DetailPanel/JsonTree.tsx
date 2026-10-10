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
  /** Any JSON value. Objects and arrays become a tree; a primitive is shown on its own. */
  value: unknown
  /** What the value is, e.g. "Arguments". Names the tree and its scroll region. */
  label: string
  /**
   * Containers at level ≤ openDepth start open (top-level keys are level 1). Only read on mount:
   * the parent remounts the tree (new `key`) for "Expand all" / "Collapse all".
   */
  openDepth: number
}

const TREEITEM = '[role="treeitem"]'
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])

// The treeitem <li> holds its whole subtree, so a ring on the <li> would frame every child.
// The ring and the "you are here" tint go on its own row (direct child) instead.
const ITEM =
  'outline-none [&:focus>[data-row]]:bg-selected [&:focus-visible>[data-row]]:outline-2 [&:focus-visible>[data-row]]:-outline-offset-2 [&:focus-visible>[data-row]]:outline-accent'
const ROW = 'flex items-start gap-1 rounded-sm px-1 py-0.5'
// Chevron centre is at 12px (4px row padding + half of 16px), so the guide line sits under it.
const GROUP = 'ml-3 border-l border-border pl-1.5'
const SPACER = <span aria-hidden="true" className="size-4 shrink-0" />

// SECURITY: every value below is rendered as a React text child, never via innerHTML, so a
// payload like `<script>alert("xss")</script>` or `<img onerror=…>` is shown as inert text.

/**
 * A string, number, boolean or null. Long strings are cut at 500 characters with a "show all"
 * link. The full string streams in a block per frame (ProgressiveText): as one text node, an
 * 850 KB string is a single 100-200 ms layout task.
 * The owning row keeps the "full" state, so Enter on the treeitem can toggle it too.
 */
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
        {/* pre-wrap keeps the line breaks of logs and file contents readable. */}
        <span className="whitespace-pre-wrap text-fg">
          "{full && cut ? <ProgressiveText text={value} /> : shown}
          {cut && !full ? '…' : ''}"
        </span>
        {cut && (
          <>
            {' '}
            <Button
              variant="link"
              // Inside the tree the row is the keyboard target (Enter toggles), so the link is
              // not an extra Tab stop; it stays a real button for pointer and touch screen readers.
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
  /** The tree's single Tab stop until focus moves (roving tabindex). */
  first: boolean
}

/**
 * One key/value. Memoised: when a parent reveals 100 more children, or a sibling toggles,
 * the rows already on screen do not re-render.
 */
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

  // Pointer toggles also move focus to this row, so keyboard use can continue from here and a
  // focused descendant is never unmounted by a collapse (which would drop focus to <body>).
  const toggleOpen = () => {
    setOpen((wasOpen) => !wasOpen)
    itemRef.current?.focus()
  }
  const toggleFull = () => {
    setFull((wasFull) => !wasFull)
    itemRef.current?.focus()
  }

  // WAI-ARIA tree pattern, per item. Up/Down/Home/End are handled once on the tree root.
  // Key events bubble through ancestor items, so each item only handles its own.
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
      // Name the item by its own row only; by default it would include the whole subtree.
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
            // Empty containers have nothing to open: show the literal, no toggle.
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

/**
 * The children of one container: the first 100, then a "Show 100 more" item. Children of a
 * collapsed node are never mounted, so a 1,536-item array costs nothing until it is opened.
 */
function TreeLevel({ value, level, openDepth, ...listProps }: TreeLevelProps) {
  const total = useMemo(() => childCount(value), [value])
  const [visible, setVisible] = useState(CHUNK_SIZE)
  const entries = useMemo(() => sliceEntries(value, visible), [value, visible])
  const remaining = total - entries.length
  const listRef = useRef<HTMLUListElement>(null)
  const focusIndex = useRef<number | null>(null)

  // After "Show more", focus the first revealed item: the button itself may be gone, and
  // focus must not fall back to <body>. Layout effect, so it happens before paint.
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
        // An item, not a nested button: everything inside a tree is reached with the arrow
        // keys, and Enter/Space activate it like any other item.
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

/**
 * Read-only JSON tree (WAI-ARIA tree pattern): one Tab stop, ↑/↓ move, → opens or enters,
 * ← closes or goes to the parent, Home/End, Enter/Space toggle. Rendering is lazy: closed
 * nodes have no DOM, big containers render 100 children at a time, long strings are cut.
 */
export function JsonTree({ value, label, openDepth }: JsonTreeProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)
  const [full, setFull] = useState(false)
  const isTree = isContainer(value) && childCount(value) > 0

  // The box only joins the Tab order when it actually scrolls (e.g. an expanded 850 KB string
  // taller than the box, which arrow keys between items cannot scroll through).
  useEffect(() => {
    const box = boxRef.current
    if (box === null || typeof ResizeObserver === 'undefined') return
    const check = () => {
      setScrollable(box.scrollHeight > box.clientHeight + 1)
    }
    const observer = new ResizeObserver(check)
    observer.observe(box)
    // The content grows when nodes open; the box itself stops at max-h-96.
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    return () => observer.disconnect()
  }, [isTree])

  // Roving tabindex, kept in the DOM rather than in state: moving focus then re-renders
  // nothing, which matters with 2,000 rows mounted. Whatever item takes focus (arrow keys,
  // click, "Show more") becomes the one Tab stop.
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

  // Closed nodes are not in the DOM, so document order of the mounted items is exactly the
  // visible order: no separate model of the tree is needed for ↑/↓/Home/End.
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
      // A focusable element needs a role and a name; only then is it a region.
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? `${label} JSON` : undefined}
      tabIndex={scrollable ? 0 : undefined}
      className="max-h-96 overflow-auto rounded-md border border-border bg-code p-2 font-mono text-xs"
    >
      {content}
    </div>
  )
}
