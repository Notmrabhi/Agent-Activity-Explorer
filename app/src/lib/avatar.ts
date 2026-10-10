// Agent avatars: initials on a tint picked by a stable hash of the name (docs/DESIGN.md).
// The same agent always gets the same colour, in every session and for every viewer.

/** "billing-assistant" → "BA", "devops" → "DE", "" → "?". Splits on - _ . and spaces. */
export function agentInitials(name: string): string {
  const parts = name.split(/[-_.\s]+/).filter((part) => part.length > 0)
  const first = parts[0]
  if (first === undefined) return '?'
  const second = parts[1]
  // One-word names use their first two letters so every avatar has two characters.
  const initials =
    second === undefined ? first.slice(0, 2) : `${first.charAt(0)}${second.charAt(0)}`
  return initials.toUpperCase()
}

/** Stable index 0..7 into AVATAR_CLASSES. Same hash as the design canvas, so colours match it. */
export function agentAvatarIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % AVATAR_CLASSES.length
}

/**
 * Full class strings, written out so Tailwind's source scan finds them.
 * Never build these dynamically (`bg-avatar-${i}`): the class would not be generated.
 */
export const AVATAR_CLASSES = [
  'bg-avatar-1-bg text-avatar-1',
  'bg-avatar-2-bg text-avatar-2',
  'bg-avatar-3-bg text-avatar-3',
  'bg-avatar-4-bg text-avatar-4',
  'bg-avatar-5-bg text-avatar-5',
  'bg-avatar-6-bg text-avatar-6',
  'bg-avatar-7-bg text-avatar-7',
  'bg-avatar-8-bg text-avatar-8',
] as const

/** Tint + text classes for an agent's avatar. */
export function agentAvatarClass(name: string): string {
  return AVATAR_CLASSES[agentAvatarIndex(name)] ?? AVATAR_CLASSES[0]
}
