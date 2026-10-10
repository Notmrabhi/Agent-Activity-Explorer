// One grid template for the header, the event rows and the skeleton rows, so the columns can
// never drift apart. Class names are full static strings because Tailwind scans source text.
//
// Breakpoints are *container* queries on the table card (`@container`), not viewport ones:
// the docked detail panel is resizable (360-960px), so a 1440px window can leave the table
// narrower than a 1024px window without the panel. The table adapts to the width it actually has.
//
// - Narrow (< 67rem / 1072px of table): the five required columns. Agent and Tool share the
//   remaining space and may shrink to 0 (they truncate with an ellipsis). A fixed minimum would
//   overflow on tablets, and the header lives outside the scroll container, so a horizontal
//   scroll would misalign it.
// - Wide (>= 1072px): Agent and Tool get fixed widths and the Arguments preview takes the rest.
//   184 + 176 + 180 + 112 + 88 = 740px of columns + 5 gaps × 16 + 32px padding = 852px; with
//   the 2px card border and the ~15px scrollbar gutter, Arguments starts at ~200px and grows.
//   (It used to switch at 896px, leaving a ~44-80px sliver that only ever showed `{"heade…`
//   with the panel docked at 1440px.) 67rem is not a named container size, hence the
//   arbitrary `@min-[67rem]` variant.

/** Applied to the header row, every event row and every skeleton row. */
export const ROW_GRID =
  'grid items-center gap-3 px-4 grid-cols-[184px_minmax(0,1fr)_minmax(0,1fr)_112px_88px] @min-[67rem]:gap-4 @min-[67rem]:grid-cols-[184px_176px_180px_112px_88px_minmax(0,1fr)]'

/** Applied to the Arguments header and cells: only shown when the wide template applies. */
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
