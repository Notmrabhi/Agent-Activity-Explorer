export interface SpinnerProps {
  /** Width and height in px. Default 14. */
  size?: number
  className?: string
}

/**
 * Rotating arc. Decorative: pair it with visible text ("Loading more events…") or a live region.
 * Spins only when motion is allowed; under reduced motion it is a static arc.
 */
export function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 motion-safe:animate-spin ${className ?? ''}`}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </svg>
  )
}
