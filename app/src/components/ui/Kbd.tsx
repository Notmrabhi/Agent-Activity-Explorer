import type { ReactNode } from 'react'

export interface KbdProps {
  /** The key, e.g. "/", "Esc", "J". */
  children: ReactNode
  /** 'md' (22px, shortcuts dialog) or 'sm' (18px, inline hints in inputs and buttons). Default 'md'. */
  size?: 'md' | 'sm'
  className?: string
}

const SIZES = {
  md: 'h-[22px] min-w-[22px] px-1.5',
  sm: 'h-[18px] min-w-[18px] px-1',
} as const

/** Keycap. Uses the native <kbd> element so assistive tech knows it is a key. */
export function Kbd({ children, size = 'md', className }: KbdProps) {
  return (
    <kbd
      className={`inline-grid shrink-0 place-items-center rounded-sm border border-b-2 border-control bg-code font-mono text-xs leading-none text-fg ${SIZES[size]} ${className ?? ''}`}
    >
      {children}
    </kbd>
  )
}
