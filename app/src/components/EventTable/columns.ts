// One template for header, rows and skeleton. Container queries, not viewport ones: the docked
// panel is resizable, so the table's own width decides. Arguments only shows from 67rem.

export const ROW_GRID =
  'grid items-center gap-3 px-4 grid-cols-[184px_minmax(0,1fr)_minmax(0,1fr)_112px_88px] @min-[67rem]:gap-4 @min-[67rem]:grid-cols-[184px_176px_180px_112px_88px_minmax(0,1fr)]'

export const ARGS_COLUMN = 'hidden @min-[67rem]:block'

export interface ColumnDef {
  label: string
  className?: string
}

export const COLUMNS: readonly ColumnDef[] = [
  { label: 'Time (UTC)' },
  { label: 'Agent' },
  { label: 'Tool' },
  { label: 'Status' },
  { label: 'Latency', className: 'text-right' },
  { label: 'Arguments', className: ARGS_COLUMN },
]
