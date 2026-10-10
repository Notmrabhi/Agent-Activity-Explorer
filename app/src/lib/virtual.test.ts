import { describe, expect, it } from 'vitest'
import { computeVirtualRange, scrollTopToReveal, shouldLoadMore } from './virtual'

const range = (scrollTop: number, count = 1000) =>
  computeVirtualRange({ scrollTop, viewportHeight: 400, rowHeight: 40, count, overscan: 5 })

describe('computeVirtualRange', () => {
  it('renders the visible rows plus overscan below at the top', () => {
    // 400 / 40 = 10 visible, +1 for a partly visible row, +5 overscan.
    expect(range(0)).toEqual({ start: 0, end: 16, totalHeight: 40_000 })
  })

  it('adds overscan on both sides in the middle', () => {
    expect(range(4000)).toEqual({ start: 95, end: 116, totalHeight: 40_000 })
  })

  it('stops at the last row', () => {
    expect(range(39_600).end).toBe(1000)
  })

  it('clamps a negative or too-large scrollTop', () => {
    expect(range(-100).start).toBe(0)
    expect(range(1_000_000)).toEqual(range(39_600))
  })

  it('renders nothing for an empty list', () => {
    expect(range(0, 0)).toEqual({ start: 0, end: 0, totalHeight: 0 })
  })

  it('renders every row of a short list', () => {
    expect(range(0, 3)).toEqual({ start: 0, end: 3, totalHeight: 120 })
  })
})

describe('scrollTopToReveal', () => {
  it('returns null when the row is already fully visible', () => {
    expect(scrollTopToReveal(5, 0, 400, 40)).toBeNull()
  })

  it('scrolls up so a row above sits at the top', () => {
    expect(scrollTopToReveal(2, 200, 400, 40)).toBe(80)
  })

  it('scrolls down so a row below sits at the bottom', () => {
    expect(scrollTopToReveal(20, 0, 400, 40)).toBe(440)
  })
})

describe('shouldLoadMore', () => {
  it('is true once the window is within the threshold of the end', () => {
    expect(shouldLoadMore(70, 100, 30)).toBe(true)
    expect(shouldLoadMore(69, 100, 30)).toBe(false)
  })

  it('is false for an empty list', () => {
    expect(shouldLoadMore(0, 0, 30)).toBe(false)
  })
})
