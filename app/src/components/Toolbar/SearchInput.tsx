import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback'
import { IconButton } from '../ui/IconButton'
import { CloseIcon, SearchIcon } from '../ui/icons'
import { Kbd } from '../ui/Kbd'

export interface SearchInputProps {
  /** The committed search (URL `q`). Changes from outside (Back, Clear filters) are adopted. */
  value: string
  /** Write the search to the URL. `replace` is true for later commits of the same typing burst. */
  onCommit: (q: string, options: { replace: boolean }) => void
  /** Forwarded to the <input>, so the page can focus it on "/". */
  ref?: Ref<HTMLInputElement>
  className?: string
}

/** Pause after the last keystroke before the search hits the URL (and the API). */
const COMMIT_DELAY_MS = 300
/** A typing burst ends this long after its last commit. */
const BURST_END_MS = 1000

// The URL drops a blank q, so "   " and "" are the same committed value. Comparing normalised
// values keeps a blank commit from looking like an "external" change that wipes the box.
const normalize = (q: string) => (q.trim() === '' ? '' : q)

/**
 * Search box. The text is local state so typing is instant (the one allowed exception to "the
 * URL is the source of truth"); it is committed to the URL after a 300 ms pause.
 *
 * History: the first commit of a typing burst pushes an entry and later commits in the same
 * burst replace it. So typing "stripe" leaves one Back step (to the previous search), not six,
 * while two separate searches a few seconds apart are still two Back steps. A burst ends 1 s
 * after the last commit, on blur, or when the box is cleared.
 */
export function SearchInput({ value, onCommit, ref, className }: SearchInputProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)

  /** What this component last wrote to the URL; tells our own echoes apart from outside changes. */
  const lastCommitted = useRef(normalize(value))
  const inBurst = useRef(false)
  const burstTimer = useRef<number | undefined>(undefined)

  const endBurst = useCallback(() => {
    window.clearTimeout(burstTimer.current)
    burstTimer.current = undefined
    inBurst.current = false
  }, [])

  useEffect(() => () => window.clearTimeout(burstTimer.current), [])

  const commit = (q: string) => {
    const next = normalize(q)
    // Typing "a" then deleting it must not add a history entry for an unchanged URL.
    if (next === lastCommitted.current) return
    lastCommitted.current = next
    onCommit(next, { replace: inBurst.current })
    inBurst.current = true
    window.clearTimeout(burstTimer.current)
    burstTimer.current = window.setTimeout(endBurst, BURST_END_MS)
  }

  const debouncedCommit = useDebouncedCallback(commit, COMMIT_DELAY_MS)

  // Adopt outside changes (Back/Forward, Clear filters, a pasted link) but never clobber typing:
  // our own commits come back through `value` too, and those match lastCommitted.
  useEffect(() => {
    const external = normalize(value)
    if (external === lastCommitted.current) return
    lastCommitted.current = external
    debouncedCommit.cancel()
    endBurst()
    setText(value)
  }, [value, debouncedCommit, endBurst])

  // React 19 ref-as-prop: keep our own handle (for focus after clearing) and forward the node.
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      const cleanup = typeof ref === 'function' ? ref(node) : undefined
      if (ref && typeof ref === 'object') ref.current = node
      return () => {
        inputRef.current = null
        if (typeof ref === 'function') {
          if (typeof cleanup === 'function') cleanup()
          else ref(null)
        } else if (ref) {
          ref.current = null
        }
      }
    },
    [ref],
  )

  /** Clearing is a deliberate step, so it gets its own history entry, pushed right away. */
  const clear = () => {
    setText('')
    debouncedCommit.cancel()
    endBurst()
    commit('')
    endBurst()
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value)
    debouncedCommit(event.target.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      debouncedCommit.flush()
    } else if (event.key === 'Escape') {
      if (text !== '') {
        // Esc clears first. Stop it here so the page's Esc doesn't also close the detail panel,
        // and prevent the browser's own clear-on-Esc for type="search".
        event.preventDefault()
        event.stopPropagation()
        clear()
      } else {
        inputRef.current?.blur()
      }
    }
  }

  const handleBlur = () => {
    setFocused(false)
    // Leaving the box means the user is done: make the URL match what they see.
    debouncedCommit.flush()
    endBurst()
  }

  const handleClearClick = () => {
    clear()
    inputRef.current?.focus()
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <label htmlFor={inputId} className="sr-only">
        Search events
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
      <input
        ref={setInputRef}
        id={inputId}
        type="search"
        value={text}
        placeholder="Search agent, tool or arguments"
        autoComplete="off"
        spellCheck={false}
        aria-keyshortcuts="/"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        // The native cancel "×" is hidden: our clear button is styled, labelled and history-aware.
        className="h-(--control-height) w-full appearance-none rounded-md border border-control bg-surface pr-10 pl-9 text-base text-fg placeholder:text-subtle [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text !== '' ? (
        <IconButton
          label="Clear search"
          variant="ghost"
          size="sm"
          // Keep focus in the input on mouse clicks: a blur would flush the half-typed text
          // into its own history entry right before the clear.
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClearClick}
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
        >
          <CloseIcon size={14} />
        </IconButton>
      ) : (
        !focused && (
          // Decorative hint; aria-keyshortcuts on the input carries the same information.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2"
          >
            <Kbd size="sm">/</Kbd>
          </span>
        )
      )}
    </div>
  )
}
