import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, type ButtonSize } from './Button'
import { IconButton } from './IconButton'
import { AlertTriangleIcon, CheckIcon, CopyIcon } from './icons'

export interface CopyButtonProps {
  /** A function is called on click, for values costly to build. */
  value: string | (() => string)
  /** Must start with the visible text, so voice control users can say it. */
  label: string
  children?: ReactNode
  icon?: ReactNode
  variant?: 'secondary' | 'ghost'
  size?: ButtonSize
  className?: string
  onCopied?: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

const FEEDBACK_MS = 1500

async function writeToClipboard(text: string): Promise<void> {
  // The async API needs https or localhost.
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
  if (previousFocus instanceof HTMLElement) previousFocus.focus()
  if (!ok) throw new Error('Copy command was rejected')
}

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
          {/* Both texts share one cell, so the width doesn't jump. */}
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
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  )
}
