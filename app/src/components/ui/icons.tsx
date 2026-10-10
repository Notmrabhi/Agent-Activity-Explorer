// Inline stroke icons (24×24 grid, currentColor), so they inherit text colour and need no
// network request. Icons are always decorative: the accessible name comes from visible text
// or the parent control's label, never from the SVG.
import type { ReactNode } from 'react'

export interface IconProps {
  /** Rendered width and height in px. Default 16. */
  size?: number
  /** Default 2. The design uses 2.4 for 14px status icons and 1.6 for 40px state icons. */
  strokeWidth?: number
  className?: string
}

function Svg({
  size = 16,
  strokeWidth = 2,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  )
}

/** Magnifier with a minus: "no results". Used by EmptyState. */
export function SearchOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M8.5 11h5" />
    </Svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  )
}

/** Collapsed-section marker; rotate 90° (`rotate-90`) for expanded. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  )
}

/** Status "OK". */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </Svg>
  )
}

/** Status "Blocked": circle with a slash. */
export function BlockedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.7 5.7 12.6 12.6" />
    </Svg>
  )
}

/** Status "Error" and failed-load states. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  )
}

/** Slow-request notice. */
export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  )
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </Svg>
  )
}

/** Counter-clockwise arrow for "Try again" / "Retry". */
export function RetryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  )
}

/** "Expand panel": arrows pointing out to the corners. */
export function MaximizeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </Svg>
  )
}

/** "Restore panel width": arrows pointing back in. */
export function MinimizeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
    </Svg>
  )
}

/** Policy rules that fired for an event. */
export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3z" />
    </Svg>
  )
}

/**
 * Brand mark from the header mockup: a rounded square with an activity trace.
 * Drawn on its own 28-unit grid. Colour is currentColor; defaults to the accent.
 */
export function LogoMark({ size = 28, className = 'text-accent' }: Omit<IconProps, 'strokeWidth'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect x="1" y="1" width="26" height="26" rx="7" />
      <path d="M7 15h4l2-5 3 9 2-4h3" />
    </svg>
  )
}
