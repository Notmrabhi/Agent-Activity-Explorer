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
  /** The committed search (URL `q`). */
  value: string
  /** Write the search to the URL. `replace` is true for later commits of the same typing burst. */
  onCommit: (q: string, options: { replace: boolean }) => void
  ref?: Ref<HTMLInputElement>
  className?: string
}

const COMMIT_DELAY_MS = 300
/** A typing burst ends this long after its last commit. */
const BURST_END_MS = 1000

// The URL drops a blank q, so "   " and "" must compare equal.
const normalize = (q: string) => (q.trim() === '' ? '' : q)

/**
 * Local text (the one exception to the URL rule), committed after 300 ms. A typing burst makes one
 * history entry, so typing "stripe" is one Back step, not six.
 */
export function SearchInput({ value, onCommit, ref, className }: SearchInputProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)

  /** Tells our own URL echoes apart from outside changes. */
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
    if (next === lastCommitted.current) return
    lastCommitted.current = next
    onCommit(next, { replace: inBurst.current })
    inBurst.current = true
    window.clearTimeout(burstTimer.current)
    burstTimer.current = window.setTimeout(endBurst, BURST_END_MS)
  }

  const debouncedCommit = useDebouncedCallback(commit, COMMIT_DELAY_MS)

  // Adopt outside changes (Back, Clear filters) without clobbering our own typing.
  useEffect(() => {
    const external = normalize(value)
    if (external === lastCommitted.current) return
    lastCommitted.current = external
    debouncedCommit.cancel()
    endBurst()
    setText(value)
  }, [value, debouncedCommit, endBurst])

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
        // Stop Esc so it doesn't also close the panel.
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
        className="h-(--control-height) w-full appearance-none rounded-md border border-control bg-surface pr-10 pl-9 text-base text-fg placeholder:text-subtle [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text !== '' ? (
        <IconButton
          label="Clear search"
          variant="ghost"
          size="sm"
          // No blur: it would commit the half-typed text as its own history entry.
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClearClick}
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
        >
          <CloseIcon size={14} />
        </IconButton>
      ) : (
        !focused && (
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
