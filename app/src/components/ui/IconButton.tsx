import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'

export interface IconButtonProps extends Omit<
  ButtonProps,
  'variant' | 'icon' | 'iconEnd' | 'square' | 'children' | 'aria-label'
> {
  /** Accessible name and hover tooltip, e.g. "Close details (Esc)". Required: there is no text. */
  label: string
  /** Default 'secondary' (outlined). 'ghost' for low-emphasis actions like close. */
  variant?: 'secondary' | 'ghost'
  /** The icon, e.g. <CloseIcon />. */
  children: ReactNode
}

/** Square, icon-only button. The label doubles as the native tooltip for mouse users. */
export function IconButton({
  label,
  variant = 'secondary',
  title,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <Button {...rest} variant={variant} square aria-label={label} title={title ?? label}>
      {children}
    </Button>
  )
}
