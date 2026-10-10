// JSON viewer helpers. `args` can be 850 KB, so walks stop early at a limit.
import { formatCount } from './format'

export type JsonObject = { readonly [key: string]: unknown }
export type JsonContainer = readonly unknown[] | JsonObject

/** Children rendered per batch; the rest sit behind "Show 100 more". */
export const CHUNK_SIZE = 100

/** Strings longer than this are cut, with a "show all n chars" link. */
export const STRING_PREVIEW_CHARS = 500

/** "Expand all" opens everything only up to this many nodes; beyond it, it stops at depth 3. */
export const EXPAND_ALL_NODE_LIMIT = 2_000

/** Deepest level "Expand all" opens on a payload over the node limit. */
export const LARGE_EXPAND_DEPTH = 3

/** Max tree rows mounted at once (3 levels of 100 would already be a million). */
export const ROW_BUDGET = 2_000

export function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null
}

/** Array.isArray does not narrow a `readonly` array out of a union; this guard does. */
export function isJsonArray(value: JsonContainer): value is readonly unknown[] {
  return Array.isArray(value)
}

export function childCount(value: JsonContainer): number {
  return isJsonArray(value) ? value.length : Object.keys(value).length
}

/** `{3 keys}`, `{1 key}`, `[1,536 items]`. */
export function summarize(value: JsonContainer): string {
  const count = childCount(value)
  if (isJsonArray(value)) return `[${formatCount(count)} ${count === 1 ? 'item' : 'items'}]`
  return `{${formatCount(count)} ${count === 1 ? 'key' : 'keys'}}`
}

export interface JsonEntry {
  key: string | number
  value: unknown
}

export function sliceEntries(value: JsonContainer, end: number): JsonEntry[] {
  if (isJsonArray(value)) {
    return value.slice(0, end).map((child, index) => ({ key: index, value: child }))
  }
  return Object.keys(value)
    .slice(0, end)
    .map((key) => ({ key, value: value[key] }))
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** Identifier-like keys bare, anything else quoted like JSON so odd keys stay unambiguous. */
export function formatKey(key: string | number): string {
  if (typeof key === 'number' || IDENTIFIER.test(key)) return String(key)
  return JSON.stringify(key)
}

/** First `max` characters, never splitting a surrogate pair (half an emoji renders as �). */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  const code = text.charCodeAt(max - 1)
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max
  return text.slice(0, end)
}

/** Pretty JSON (2-space indent), or undefined for `undefined`. Never throws. */
export function toPrettyJson(value: unknown): string | undefined {
  if (value === undefined) return undefined
  try {
    return JSON.stringify(value, null, 2) ?? undefined
  } catch {
    return String(value)
  }
}

/**
 * Blocks of at most `size` characters for progressive rendering. Splits at line breaks (dropped,
 * as each block is its own line); only a longer single line is cut mid-line.
 */
export function splitTextBlocks(text: string, size: number): string[] {
  const blocks: string[] = []
  let start = 0
  let nextBreak = text.indexOf('\n')
  while (start < text.length) {
    const limit = start + size
    if (limit >= text.length) {
      blocks.push(text.slice(start))
      break
    }
    let cut = -1
    while (nextBreak !== -1 && nextBreak < limit) {
      cut = nextBreak
      nextBreak = text.indexOf('\n', nextBreak + 1)
    }
    if (cut !== -1) {
      blocks.push(text.slice(start, cut))
      start = cut + 1
    } else {
      const piece = truncateText(text.slice(start, limit + 1), size)
      blocks.push(piece)
      start += piece.length
    }
  }
  return blocks
}

/** Stops when `visit` returns false. for…in allocates no key array, so stopping early is cheap. */
function forEachChild(value: JsonContainer, visit: (child: unknown) => boolean): void {
  if (isJsonArray(value)) {
    for (const child of value) if (!visit(child)) return
    return
  }
  for (const key in value) if (!visit(value[key])) return
}

/** True when "Expand all" would change anything. */
export function hasNestedContainers(value: JsonContainer): boolean {
  let found = false
  forEachChild(value, (child) => {
    found = isContainer(child) && childCount(child) > 0
    return !found
  })
  return found
}

/** Iterative (no stack overflow on deep payloads); returns `limit + 1` once past the limit. */
export function countNodes(value: unknown, limit: number): number {
  let count = 0
  const stack: unknown[] = [value]
  const visit = (child: unknown): boolean => {
    count += 1
    if (isContainer(child)) stack.push(child)
    return count <= limit
  }
  while (stack.length > 0 && count <= limit) {
    const next = stack.pop()
    if (isContainer(next)) forEachChild(next, visit)
  }
  return Math.min(count, limit + 1)
}

/** Rows mounted with every container up to `openDepth` open; `limit + 1` once past the limit. */
export function countVisibleRows(
  value: unknown,
  openDepth: number,
  chunk: number,
  limit: number,
): number {
  if (!isContainer(value)) return 0
  let rows = 0
  const stack: { value: JsonContainer; level: number }[] = [{ value, level: 1 }]
  while (stack.length > 0 && rows <= limit) {
    const next = stack.pop()
    if (next === undefined) break
    let seen = 0
    forEachChild(next.value, (child) => {
      seen += 1
      if (seen > chunk) {
        rows += 1 // the "Show more" row; the remaining children stay unmounted
        return false
      }
      rows += 1
      if (isContainer(child) && next.level <= openDepth) {
        stack.push({ value: child, level: next.level + 1 })
      }
      return rows <= limit
    })
  }
  return Math.min(rows, limit + 1)
}

/** Top-level keys open on first view, unless that alone would exceed ROW_BUDGET. */
export function defaultOpenDepth(value: unknown): number {
  return countVisibleRows(value, 1, CHUNK_SIZE, ROW_BUDGET) <= ROW_BUDGET ? 1 : 0
}

export interface ExpandAllPlan {
  /** Containers at level ≤ depth are opened. Infinity = everything. */
  depth: number
  /** True when the payload was too large to open fully. */
  capped: boolean
}

/** Everything for small payloads; otherwise LARGE_EXPAND_DEPTH levels, fewer if over ROW_BUDGET. */
export function planExpandAll(value: unknown): ExpandAllPlan {
  if (countNodes(value, EXPAND_ALL_NODE_LIMIT) <= EXPAND_ALL_NODE_LIMIT) {
    return { depth: Infinity, capped: false }
  }
  let depth = LARGE_EXPAND_DEPTH
  while (depth > 1 && countVisibleRows(value, depth, CHUNK_SIZE, ROW_BUDGET) > ROW_BUDGET) {
    depth -= 1
  }
  return { depth, capped: true }
}
