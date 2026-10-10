import { useEffect, useMemo, useState } from 'react'
import { splitTextBlocks } from '../../lib/json'

export interface ProgressiveTextProps {
  /** Plain text, possibly very long (the Raw view's "Show all" on an 850 KB payload). */
  text: string
  /** Characters per block. About 15 ms of line breaking each, so one block fits in a frame. */
  blockSize?: number
}

/**
 * Long plain text rendered as a run of block lines, one more block per animation frame.
 * The first block stays inline, so the text can follow a label on the same line (a tree row's
 * `content: "…`); the next blocks each start a new line.
 *
 * Mounting 850 KB as one text node makes the browser line-break all of it before the next
 * paint: a single 300+ ms main-thread task that freezes the panel (and the J/K keys). Appending
 * a block per frame keeps every task short, and the start of the text is readable at once while
 * the rest streams in below it. Blocks are split at line breaks (see splitTextBlocks), so only a
 * line longer than a block gets one extra wrap point; "Copy JSON" still copies the exact text.
 *
 * Text children only, never innerHTML, so markup inside a payload stays inert.
 */
export function ProgressiveText({ text, blockSize = 32_000 }: ProgressiveTextProps) {
  const blocks = useMemo(() => splitTextBlocks(text, blockSize), [text, blockSize])
  const [shown, setShown] = useState(1)

  useEffect(() => {
    if (shown >= blocks.length) return
    const frame = requestAnimationFrame(() => setShown((count) => count + 1))
    return () => cancelAnimationFrame(frame)
  }, [shown, blocks.length])

  return (
    <>
      {blocks.slice(0, shown).map((block, index) => (
        // Append-only list of text slices: the position is the identity.
        // oxlint-disable-next-line react/no-array-index-key
        <span key={index} className={index === 0 ? undefined : 'block'}>
          {block}
        </span>
      ))}
    </>
  )
}
