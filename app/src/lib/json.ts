// Pure helpers for the detail panel's JSON viewer (components/DetailPanel/JsonTree.tsx).
// Everything here is cheap on purpose: `args` can be 850 KB, so walks stop early at a limit
// instead of visiting (or stringifying) the whole value.
import { formatCount } from './format'

export type JsonObject = { readonly [key: string]: unknown }
/** An object or array: something the tree can open. */
export type JsonContainer = readonly unknown[] | JsonObject

/** Children rendered per batch; the rest sit behind "Show 100 more". */
export const CHUNK_SIZE = 100

/** Strings longer than this are cut, with a "show all n chars" link. */
export const STRING_PREVIEW_CHARS = 500

/** "Expand all" opens everything only up to this many nodes; beyond it, it stops at depth 3. */
export const EXPAND_ALL_NODE_LIMIT = 2_000

/** Deepest level "Expand all" opens on a payload over the node limit. */
export const LARGE_EXPAND_DEPTH = 3

/**
 * Upper bound on tree rows we are willing to mount in one go. Chunking caps each level at 100,
 * but 3 levels of 100 is still a million rows, so depth is lowered until the estimate fits.
 */
export const ROW_BUDGET = 2_000

export function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null
}

/** Array.isArray does not narrow a `readonly` array out of a union; this guard does. */
export function isJsonArray(value: JsonContainer): value is readonly unknown[] {
  return Array.isArray(value)
}

/** Number of direct children. */
export function childCount(value: JsonContainer): number {
  return isJsonArray(value) ? value.length : Object.keys(value).length
}

/** `{3 keys}`, `{1 key}`, `[1,536 items]`. */
export function summarize(value: JsonContainer): string {
  const count = childCount(value)
  if (isJsonArray(value)) return `[${formatCount(count)} ${count === 1 ? 'item' : 'items'}]`
  return `{${formatCount(count)} ${count === 1 ? 'key' : 'keys'}}`
}

/** One child: its object key or array index, and its value. */
export interface JsonEntry {
  key: string | number
  value: unknown
}

/** The first `end` children of a container, in order. */
export function sliceEntries(value: JsonContainer, end: number): JsonEntry[] {
  if (isJsonArray(value)) {
    return value.slice(0, end).map((child, index) => ({ key: index, value: child }))
  }
  return Object.keys(value)
    .slice(0, end)
    .map((key) => ({ key, value: value[key] }))
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * How a key is shown: array indices and identifier-like keys bare (`path`, `3`), anything else
 * quoted and escaped like JSON (`"content-type"`, `""`, `"a\nb"`), so odd keys stay unambiguous.
 */
export function formatKey(key: string | number): string {
  if (typeof key === 'number' || IDENTIFIER.test(key)) return String(key)
  return JSON.stringify(key)
}

/**
 * The first `max` characters of a string, without splitting a surrogate pair (an emoji cut in
 * half would render as a replacement character).
 */
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
    // JSON.stringify returns undefined for functions/symbols; the API never sends those.
    return JSON.stringify(value, null, 2) ?? undefined
  } catch {
    // Circular structures or BigInt. Cannot come from a JSON response, but never crash the panel.
    return String(value)
  }
}

/**
 * Cuts long text into consecutive blocks of at most `size` characters, for progressive
 * rendering (components/DetailPanel/ProgressiveText.tsx). A block ends at the last line break
 * inside it, and that break is dropped because each block renders as its own line, so pretty
 * JSON splits between lines. Only a single line longer than `size` (an 850 KB string value) is
 * cut mid-line, never inside a surrogate pair. One forward pass: the next line break is carried
 * between blocks instead of searched again.
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

/**
 * Calls `visit` for each child of `value`, stopping as soon as it returns false.
 * `for…in` instead of Object.keys: no key array is allocated, so stopping early is really
 * cheap even for an object with 100k keys. JSON.parse output has no inherited enumerable keys.
 */
function forEachChild(value: JsonContainer, visit: (child: unknown) => boolean): void {
  if (isJsonArray(value)) {
    for (const child of value) if (!visit(child)) return
    return
  }
  for (const key in value) if (!visit(value[key])) return
}

/**
 * True when some direct child is a non-empty object or array, i.e. "Expand all" / "Collapse
 * all" would change anything. Stops at the first hit.
 */
export function hasNestedContainers(value: JsonContainer): boolean {
  let found = false
  forEachChild(value, (child) => {
    found = isContainer(child) && childCount(child) > 0
    return !found
  })
  return found
}

/**
 * Counts every node (containers and primitives, the root excluded) with an iterative walk, so
 * deep payloads cannot overflow the stack. Stops once the count passes `limit` and returns
 * `limit + 1`: callers only need to know "small enough or not".
 */
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

/**
 * How many rows the tree would mount if every container at level ≤ `openDepth` were open
 * (top-level children are level 1), with `chunk` children per container plus one
 * "Show more" row where there are more. Stops past `limit` and returns `limit + 1`.
 */
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

/**
 * Levels opened on first view. The brief asks for the top-level keys open (their children
 * visible); when that alone would mount more than ROW_BUDGET rows (an array of 1,000 wide
 * objects), stay at the top level so the panel opens instantly.
 */
export function defaultOpenDepth(value: unknown): number {
  return countVisibleRows(value, 1, CHUNK_SIZE, ROW_BUDGET) <= ROW_BUDGET ? 1 : 0
}

export interface ExpandAllPlan {
  /** Containers at level ≤ depth are opened. Infinity = everything. */
  depth: number
  /** True when the payload was too large to open fully. */
  capped: boolean
}

/**
 * "Expand all": everything when the payload has at most EXPAND_ALL_NODE_LIMIT nodes; otherwise
 * LARGE_EXPAND_DEPTH levels, or fewer if even that would exceed ROW_BUDGET rows.
 */
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
