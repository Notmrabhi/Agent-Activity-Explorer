import { describe, expect, it } from 'vitest'
import { splitTextBlocks } from './json'

describe('splitTextBlocks', () => {
  it('splits between lines and drops the break the block boundary replaces', () => {
    expect(splitTextBlocks('abc\ndef\nghi', 5)).toEqual(['abc', 'def', 'ghi'])
  })

  it('keeps several lines in one block while they fit', () => {
    expect(splitTextBlocks('ab\ncd\nef', 6)).toEqual(['ab\ncd', 'ef'])
  })

  it('cuts a line longer than a block mid-line', () => {
    expect(splitTextBlocks('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('never splits a surrogate pair', () => {
    const blocks = splitTextBlocks('ab\u{1F600}cd', 3)
    expect(blocks).toEqual(['ab', '\u{1F600}c', 'd'])
  })

  it('returns no blocks for empty text', () => {
    expect(splitTextBlocks('', 4)).toEqual([])
  })

  it('round-trips a large pretty-printed payload', () => {
    const text = JSON.stringify({ a: 1, content: 'x'.repeat(100_000), b: [1, 2] }, null, 2)
    const blocks = splitTextBlocks(text, 32_000)
    expect(Math.max(...blocks.map((block) => block.length))).toBeLessThanOrEqual(32_000)
    // Blocks either end at a dropped line break or mid-line; rebuild by checking both joins.
    let rebuilt = blocks[0] ?? ''
    for (const block of blocks.slice(1)) {
      rebuilt += text.startsWith(`${rebuilt}\n`) ? `\n${block}` : block
    }
    expect(rebuilt).toBe(text)
  })
})
