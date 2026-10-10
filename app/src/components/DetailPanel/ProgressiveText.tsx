import { useEffect, useMemo, useState } from 'react'
import { splitTextBlocks } from '../../lib/json'

export interface ProgressiveTextProps {
  text: string
  /** About 15 ms of line breaking per block, so one fits in a frame. */
  blockSize?: number
}

/** One block per frame: 850 KB as one text node is a single 300+ ms task that freezes the panel. */
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
        // oxlint-disable-next-line react/no-array-index-key
        <span key={index} className={index === 0 ? undefined : 'block'}>
          {block}
        </span>
      ))}
    </>
  )
}
