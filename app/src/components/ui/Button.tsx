import type { ComponentPropsWithRef, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'md' | 'sm'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Default 'secondary'. Use 'primary' for at most one action per view. */
  variant?: ButtonVariant
  /** 'md' = control height (36px, 44px on touch), 'sm' = 32px. Ignored by 'link'. Default 'md'. */
  size?: ButtonSize
  /** Leading icon, e.g. <RetryIcon />. Decorative: the text is the label. */
  icon?: ReactNode
  /** Trailing icon, e.g. a chevron on a menu button. */
  iconEnd?: ReactNode
  /** Equal width and height with no side padding. Used by IconButton; prefer that component. */
  square?: boolean
}

// `aria-disabled` is styled like `disabled` so callers can keep a busy button focusable
// (a disabled button drops keyboard focus to <body>).
const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-control bg-surface text-fg hover:bg-hover',
  ghost: 'bg-transparent text-muted hover:bg-hover hover:text-fg',
  link: 'rounded-sm bg-transparent text-accent-text underline-offset-2 hover:underline',
}

// Icon-only buttons are quieter: the glyph is muted until hovered (panel header, mockup).
const SQUARE_VARIANTS: Record<ButtonVariant, string> = {
  ...VARIANTS,
  secondary: 'border border-control bg-surface text-muted hover:bg-hover hover:text-fg',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-(--control-height) px-3.5 text-base',
  sm: 'h-8 px-2.5 text-sm',
}

const SQUARE_SIZES: Record<ButtonSize, string> = {
  md: 'size-(--control-height)',
  sm: 'size-8',
}

/**
 * The one button. `type="button"` by default so it never submits a form by accident;
 * every native button prop (onClick, disabled, aria-*, ref…) passes through.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  square = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const variantClass = square ? SQUARE_VARIANTS[variant] : VARIANTS[variant]
  // A link-style button sits inside running text: it inherits the font size and has no box.
  const sizeClass = variant === 'link' ? '' : square ? SQUARE_SIZES[size] : SIZES[size]
  return (
    <button
      type={type}
      className={`${BASE} ${variantClass} ${sizeClass} ${className ?? ''}`}
      {...rest}
    >
      {icon}
      {children}
      {iconEnd}
    </button>
  )
}
