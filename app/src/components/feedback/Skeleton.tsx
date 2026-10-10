export interface SkeletonProps {
  /** Size and shape, e.g. "h-2.5 w-3/4" or "h-[18px] w-16 rounded-full". */
  className?: string
}

/**
 * Shimmering placeholder block. Hidden from assistive tech: the loading container announces
 * itself instead (aria-busy plus a "Loading…" label). Shimmer stops under reduced motion.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton rounded-sm ${className ?? ''}`} />
}
