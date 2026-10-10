// One grid template for the header, the event rows and the skeleton rows, so the columns can
// never drift apart. Class names are full static strings because Tailwind scans source text.
//
// Breakpoints are *container* queries on the table card (`@container`), not viewport ones:
// the docked detail panel takes 460px, so a 1280px window can leave the table narrower than a
// 1024px window without the panel. The table adapts to the width it actually has.
//
// - Narrow (< 56rem / 896px of table): the five required columns. Agent and Tool share the
//   remaining space and may shrink to 0 (they truncate with an ellipsis). A fixed minimum would
//   overflow on tablets, and the header lives outside the scroll container, so a horizontal
//   scroll would misalign it.
// - Wide (>= 896px): Agent and Tool get fixed widths and the Arguments preview takes the rest.
//   184 + 176 + 180 + 112 + 88 + 5 gaps + padding = 852px, so Arguments starts at ~44px and grows.

/** Applied to the header row, every event row and every skeleton row. */
export const ROW_GRID =
  'grid items-center gap-3 px-4 grid-cols-[184px_minmax(0,1fr)_minmax(0,1fr)_112px_88px] @4xl:gap-4 @4xl:grid-cols-[184px_176px_180px_112px_88px_minmax(0,1fr)]'

/** Applied to the Arguments header and cells: only shown when the wide template applies. */
export const ARGS_COLUMN = 'hidden @4xl:block'

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
