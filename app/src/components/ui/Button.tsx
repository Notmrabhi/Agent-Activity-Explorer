import type { ComponentPropsWithRef, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'md' | 'sm'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** 'primary' for at most one action per view. */
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconEnd?: ReactNode
  square?: boolean
}

// aria-disabled looks disabled but keeps focus (a disabled button drops focus to <body>).
const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-control bg-surface text-fg hover:bg-hover',
  ghost: 'bg-transparent text-muted hover:bg-hover hover:text-fg',
  link: 'rounded-sm bg-transparent text-accent-text underline-offset-2 hover:underline',
}

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
