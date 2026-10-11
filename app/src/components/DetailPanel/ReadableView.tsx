import { useState } from 'react'
import { humanizeKey, readablePrimitive, tableColumns } from '../../lib/readable'
import { Button } from '../ui/Button'

export interface ReadableViewProps {
  value: unknown
}

const MAX_KEYS = 40
const MAX_CHIPS = 8
const MAX_ROWS = 20
const MAX_DEPTH = 4
const FOLD_CHARS = 240

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function chipText(name: string, item: unknown): string {
  const readable = readablePrimitive(name, item)
  return readable.kind === 'link' ? `${readable.site}${readable.path}` : readable.text
}

function FoldedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (text.length <= FOLD_CHARS) return <span className="break-words">{text}</span>
  return (
    <span className="break-words">
      {open ? text : `${text.slice(0, FOLD_CHARS)}…`}{' '}
      <Button variant="link" onClick={() => setOpen(!open)}>
        {open ? 'Show less' : `Show all ${text.length.toLocaleString('en-US')} characters`}
      </Button>
    </span>
  )
}

function Primitive({ name, value }: { name: string; value: unknown }) {
  const readable = readablePrimitive(name, value)
  if (readable.kind === 'link') {
    return (
      <a
        href={readable.href}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-accent-text hover:underline"
      >
        <span className="font-medium">{readable.site}</span>
        <span className="text-muted">{readable.path}</span>
      </a>
    )
  }
  return (
    <span>
      <FoldedText text={readable.text} />
      {readable.hint && <span className="ml-1.5 text-xs text-muted">({readable.hint})</span>}
    </span>
  )
}

function Value({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">None</span>
    const columns = tableColumns(value)
    if (columns) {
      const rows = value.slice(0, MAX_ROWS) as Record<string, unknown>[]
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-sunken text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-2.5 py-1.5 font-medium">
                    {humanizeKey(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((column) => (
                    <td key={column} className="px-2.5 py-1.5 align-top">
                      {column in row ? <Primitive name={column} value={row[column]} /> : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {value.length > MAX_ROWS && (
            <p className="border-t border-border px-2.5 py-1.5 text-xs text-muted">
              {value.length - MAX_ROWS} more rows in Tree view
            </p>
          )}
        </div>
      )
    }
    if (value.every((item) => typeof item !== 'object' || item === null)) {
      return (
        <span className="flex flex-wrap gap-1.5">
          {value.slice(0, MAX_CHIPS).map((item, i) => (
            <span key={i} className="rounded-full bg-sunken px-2 py-0.5 text-xs">
              {chipText(name, item)}
            </span>
          ))}
          {value.length > MAX_CHIPS && (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-muted">
              +{value.length - MAX_CHIPS} more
            </span>
          )}
        </span>
      )
    }
    return (
      <Fields
        value={Object.fromEntries(value.map((item, i) => [`Item ${i + 1}`, item]))}
        depth={depth + 1}
        boxed
      />
    )
  }
  if (isPlainObject(value)) return <Fields value={value} depth={depth + 1} boxed />
  return <Primitive name={name} value={value} />
}

function Fields({
  value,
  depth,
  boxed = false,
}: {
  value: Record<string, unknown>
  depth: number
  boxed?: boolean
}) {
  const entries = Object.entries(value)
  if (entries.length === 0) return <span className="text-muted">None</span>
  if (depth > MAX_DEPTH) return <span className="text-muted">More detail in Tree view</span>
  return (
    <div className={boxed ? 'border-l-2 border-border pl-3' : ''}>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
        {entries.slice(0, MAX_KEYS).map(([key, item]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{humanizeKey(key)}</dt>
            <dd className="min-w-0">
              <Value name={key} value={item} depth={depth} />
            </dd>
          </div>
        ))}
      </dl>
      {entries.length > MAX_KEYS && (
        <p className="mt-2 text-xs text-muted">
          {entries.length - MAX_KEYS} more fields in Tree view
        </p>
      )}
    </div>
  )
}

/** JSON without syntax: keys as words, values with meaning, lists as chips or tables. */
export function ReadableView({ value }: ReadableViewProps) {
  if (value === undefined) return <p className="text-sm text-muted">No value</p>
  if (isPlainObject(value)) return <Fields value={value} depth={0} />
  return (
    <div className="text-sm">
      <Value name="" value={value} depth={0} />
    </div>
  )
}
