import { agentAvatarClass, agentInitials } from '../../lib/avatar'

export interface AgentAvatarProps {
  /** Agent name, e.g. "billing-assistant". */
  name: string
  /** 'sm' = 22px (table rows, filter options), 'md' = 28px (panel header). Default 'sm'. */
  size?: 'sm' | 'md'
  className?: string
}

// 10px initials match the mockup; the type scale has no step that small because nothing
// else needs it.
const SIZES = {
  sm: 'size-[22px] text-[10px]',
  md: 'size-7 text-xs',
} as const

/**
 * Initials on a tint picked by a stable hash of the name. Decorative (aria-hidden): callers
 * always render the agent name next to it, and the initials keep it from relying on colour.
 */
export function AgentAvatar({ name, size = 'sm', className }: AgentAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full leading-none font-semibold tracking-[0.02em] select-none ${agentAvatarClass(name)} ${SIZES[size]} ${className ?? ''}`}
    >
      {agentInitials(name)}
    </span>
  )
}
