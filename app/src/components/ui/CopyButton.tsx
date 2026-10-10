import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, type ButtonSize } from './Button'
import { IconButton } from './IconButton'
import { AlertTriangleIcon, CheckIcon, CopyIcon } from './icons'

export interface CopyButtonProps {
  /** Text to copy. A function is called on click, for values that are costly to build (big JSON). */
  value: string | (() => string)
  /**
   * Accessible name, e.g. "Copy event ID". When `children` is given it should start with the
   * visible text ("Copy JSON" → "Copy JSON of arguments") so voice control users can say it.
   */
  label: string
  /** Visible text. Omit for an icon-only square button. */
  children?: ReactNode
  /** Leading icon for the text variant. Default <CopyIcon />. */
  icon?: ReactNode
  /** Default 'secondary'. */
  variant?: 'secondary' | 'ghost'
  /** Default 'sm'. */
  size?: ButtonSize
  className?: string
  /** Called after a successful copy, e.g. to show a toast. */
  onCopied?: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

/** How long the "Copied" confirmation stays visible. */
const FEEDBACK_MS = 1500

async function writeToClipboard(text: string): Promise<void> {
  // The async API needs a secure context (https or localhost); fall back for plain http.
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const previousFocus = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  // select() moved focus to the textarea; give it back to the button.
  if (previousFocus instanceof HTMLElement) previousFocus.focus()
  if (!ok) throw new Error('Copy command was rejected')
}

/**
 * Copies a value and confirms it: the icon turns into a check and the text into "Copied" for
 * 1.5 s (a warning icon and "Failed" if the browser refused). Screen readers hear "Copied" or
 * "Copy failed" through a polite live region.
 */
export function CopyButton({
  value,
  label,
  children,
  icon,
  variant = 'secondary',
  size = 'sm',
  className,
  onCopied,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const handleClick = async () => {
    window.clearTimeout(timer.current)
    try {
      await writeToClipboard(typeof value === 'function' ? value() : value)
      setState('copied')
      onCopied?.()
    } catch {
      setState('failed')
    }
    timer.current = window.setTimeout(() => setState('idle'), FEEDBACK_MS)
  }

  const announcement = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''
  // Colour the glyph, not the button, so it never fights the variant's text colour.
  const glyph =
    state === 'copied' ? (
      <CheckIcon size={14} className="text-ok" />
    ) : state === 'failed' ? (
      <AlertTriangleIcon size={14} className="text-error" />
    ) : (
      (icon ?? <CopyIcon size={14} />)
    )

  return (
    <>
      {children === undefined ? (
        <IconButton
          label={label}
          variant={variant}
          size={size}
          onClick={handleClick}
          className={className}
        >
          {glyph}
        </IconButton>
      ) : (
        <Button
          variant={variant}
          size={size}
          icon={glyph}
          aria-label={label}
          onClick={handleClick}
          className={className}
        >
          {/* Both texts share one grid cell, so the button keeps its width when the text swaps. */}
          <span className="grid">
            <span className={`col-start-1 row-start-1 ${state === 'idle' ? '' : 'invisible'}`}>
              {children}
            </span>
            <span className={`col-start-1 row-start-1 ${state === 'idle' ? 'invisible' : ''}`}>
              {state === 'failed' ? 'Failed' : 'Copied'}
            </span>
          </span>
        </Button>
      )}
      {/* Always mounted: a live region only announces changes made after it is in the DOM. */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  )
}
