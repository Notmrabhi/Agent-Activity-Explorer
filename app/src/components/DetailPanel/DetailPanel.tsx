import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react'
import { ApiError } from '../../api/client'
import type { EventSummary } from '../../api/types'
import { useEventDetail } from '../../hooks/useEvents'
import { useSlowFlag } from '../../hooks/useSlowFlag'
import {
  formatCount,
  formatLatency,
  formatLocalDateTime,
  formatTimestampUtc,
  SLOW_LATENCY_MS,
} from '../../lib/format'
import { ErrorState } from '../feedback/ErrorState'
import { Skeleton } from '../feedback/Skeleton'
import { SlowNotice } from '../feedback/SlowNotice'
import { AgentAvatar } from '../ui/AgentAvatar'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { IconButton } from '../ui/IconButton'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  LinkIcon,
  MaximizeIcon,
  MinimizeIcon,
  ShieldIcon,
} from '../ui/icons'
import { Kbd } from '../ui/Kbd'
import { StatusBadge } from '../ui/StatusBadge'
import { JsonView } from './JsonView'
import { PanelSection } from './PanelSection'

export interface DetailPanelProps {
  /** The event to show (from the URL). */
  eventId: string
  /**
   * The list row for this event, if it is loaded. The header and Metadata render from it at
   * once while the full event loads. Ignored if its id does not match `eventId`.
   */
  summary?: EventSummary
  /** ≥ 1200px: docked beside the list (non-modal). Below: a modal sheet over the list. */
  docked: boolean
  /** Close the panel (remove the event from the URL). The parent returns focus to the row. */
  onClose: () => void
  /** Undefined disables the button (first / last loaded row). */
  onPrev?: () => void
  onNext?: () => void
  /**
   * Docked: the panel is at its maximum width. Overlay: the sheet is full screen.
   * The docked width itself comes from the `--detail-panel-width` custom property, set by the
   * page (usePanelWidth) and rewritten by ResizeHandle while dragging.
   */
  expanded?: boolean
  /** Shows the Expand / Restore toggle in the header. */
  onToggleExpanded?: () => void
  /** id of the panel element, for the resize handle's aria-controls. */
  id?: string
}

/** Value widths for the Metadata skeleton. Static strings so Tailwind can see them. */
const SKELETON_VALUE_WIDTHS = ['w-56', 'w-44', 'w-48', 'w-16'] as const

/** One item of a header meta row; see the separator note in the header. */
const META_ITEM = 'relative flex min-w-0 items-center gap-1.5 pl-4'
/** Leading separator of a META_ITEM. Decorative: the items are separate text runs anyway. */
const SEPARATOR = (
  <span aria-hidden="true" className="absolute left-1.5 font-sans text-subtle">
    ·
  </span>
)

/** Elements whose own Esc handling wins over "close the docked panel". */
const MODAL_SELECTOR = 'dialog[open], [role="dialog"][aria-modal="true"]'

/**
 * Side panel with the full event. Linkable (the parent drives it from `?event=` in the URL),
 * closable with Esc, the close button, or (overlay mode) a click on the scrim.
 *
 * Docked mode is a non-modal <aside role="dialog">: the list stays usable so J/K can step
 * through events while the panel follows. Overlay mode is a native modal <dialog> opened with
 * showModal(), which gives a focus trap, an inert background and Esc for free.
 */
export function DetailPanel({
  eventId,
  summary: summaryProp,
  docked,
  onClose,
  onPrev,
  onNext,
  expanded = false,
  onToggleExpanded,
  id,
}: DetailPanelProps) {
  const query = useEventDetail(eventId)
  const slow = useSlowFlag(query.isFetching)
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const detail = query.data
  const summary = summaryProp?.id === eventId ? summaryProp : undefined
  // Both shapes share every field the header and Metadata need.
  const head = detail ?? summary
  const error = query.isError ? query.error : null
  const notFound = error instanceof ApiError && error.isNotFound

  // Open the overlay as a modal, then put focus on the title so screen readers announce the
  // event. Runs on mount and when the viewport crosses the dock breakpoint (the element is
  // swapped, so focus was lost anyway) but NOT when eventId changes: keyboard users stepping
  // through the list with J/K must keep their place.
  const closingOnPurpose = useRef(false)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!docked && dialog && !dialog.open) {
      closingOnPurpose.current = false
      dialog.showModal()
    }
    titleRef.current?.focus({ preventScroll: true })
    return () => {
      if (dialog?.open) {
        // Our own close() must not be read as the user closing the panel (see handleNativeClose).
        closingOnPurpose.current = true
        dialog.close()
      }
    }
  }, [docked])

  // Docked mode has no native Esc handling, so listen on the document. Skip keys that something
  // else already handled (defaultPrevented), IME composition, and keys from inside another modal
  // (e.g. the shortcuts dialog), which owns its own Esc.
  const onDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
    const target = event.target
    if (target instanceof Element) {
      const modal = target.closest(MODAL_SELECTOR)
      if (modal !== null && modal !== panelRef.current) return
    }
    onClose()
  })

  useEffect(() => {
    if (!docked) return
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => document.removeEventListener('keydown', onDocumentKeyDown)
  }, [docked])

  // --- Overlay (<dialog>) wiring, same approach as ui/Dialog ---
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onClose()
  }
  // Chrome may force-close on a repeated Esc despite preventDefault; keep the URL in sync.
  // 'close' is dispatched asynchronously, so ignore it when it is stale: either we closed the
  // dialog ourselves (dock switch, unmount) or it has been reopened since (StrictMode runs the
  // effect twice: close, then showModal again, before the first 'close' event arrives).
  const handleNativeClose = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (closingOnPurpose.current) {
      closingOnPurpose.current = false
      return
    }
    if (event.currentTarget.open) return
    onClose()
  }
  // Stop Esc here so page-level shortcut handlers do not act on it as well. Default is kept,
  // so the browser still fires 'cancel'.
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') event.stopPropagation()
  }
  // The content fills the whole sheet, so a click whose target is the <dialog> itself is on the
  // ::backdrop. Require pointerdown there too, so a text selection dragged out does not close.
  const pressedBackdrop = useRef(false)
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget
  }
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && event.target === event.currentTarget) onClose()
  }

  const retry = () => {
    void query.refetch()
  }

  // ---------------------------------------------------------------- header
  // Everything you scan for when triaging a call sits in the header (tool, status, latency,
  // policy hits, agent, time), so the body can open straight onto the payload.
  const policyCount = detail?.policyMatches.length ?? 0
  const header = (
    // A size container: the eyebrow drops out when the header is too narrow for it next to
    // the actions (the 360px docked minimum, phones).
    <header className="@container flex-none border-b border-border px-5 pt-2.5 pb-3.5">
      <div className="flex items-center gap-3">
        <p className="hidden text-xs font-medium tracking-wide text-muted uppercase @min-[25rem]:block">
          Event details
        </p>
        <div className="-mr-1.5 ml-auto flex flex-none items-center gap-1">
          <IconButton
            label="Previous event (K)"
            size="sm"
            disabled={onPrev === undefined}
            onClick={onPrev}
          >
            <ChevronUpIcon />
          </IconButton>
          <IconButton
            label="Next event (J)"
            size="sm"
            disabled={onNext === undefined}
            onClick={onNext}
          >
            <ChevronDownIcon />
          </IconButton>
          {/* Read at click time: the URL is the source of truth, so it is the shareable link. */}
          <CopyButton
            value={() => window.location.href}
            label="Copy link to this event"
            icon={<LinkIcon size={14} />}
            className="ml-1"
          >
            Copy link
          </CopyButton>
          {onToggleExpanded && (
            // A phone-width sheet is already full width, so the toggle would do nothing there.
            <span className={docked ? 'contents' : 'contents max-[30rem]:hidden'}>
              {/* A toggle keeps one accessible name and reports its state with aria-pressed
                  (renaming it as well would make "pressed" ambiguous); only the tooltip says
                  what the next click does. */}
              <IconButton
                label="Expand panel"
                title={expanded ? 'Restore panel width' : 'Expand panel'}
                aria-pressed={expanded}
                size="sm"
                onClick={onToggleExpanded}
              >
                {expanded ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
              </IconButton>
            </span>
          )}
          <IconButton label="Close details (Esc)" variant="ghost" size="sm" onClick={onClose}>
            <CloseIcon size={18} />
          </IconButton>
        </div>
      </div>
      {/* Focused programmatically so screen readers announce the event. It is not a control,
          so no focus ring (a cold link would otherwise open with a ring around the title). */}
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        title={head?.tool}
        className="mt-1 truncate rounded-sm font-mono text-lg font-medium focus-visible:outline-none"
      >
        {head ? (
          head.tool
        ) : query.isPending ? (
          <>
            <span className="sr-only">Loading event</span>
            {/* A span, not <Skeleton> (a div): headings only allow phrasing content. */}
            <span aria-hidden="true" className="skeleton my-1 block h-4 w-40 rounded-sm" />
          </>
        ) : (
          // Failed with nothing to show: the id is the only thing we know.
          <span className="text-base">{eventId}</span>
        )}
      </h2>
      {head ? (
        <>
          {/* Separators: every item carries its own leading "·" and the row is shifted left by
              the same amount inside an overflow-hidden box, so the "·" of whichever item starts
              a line is clipped. A "·" only ever shows BETWEEN two items on the same line, never
              dangling at the end of a wrapped one. */}
          <div className="mt-2 overflow-hidden">
            <div className="-ml-4 flex flex-wrap items-center gap-y-1.5 text-sm">
              <span className={META_ITEM}>
                {SEPARATOR}
                <StatusBadge status={head.status} size="md" />
              </span>
              {/* Slow calls are emphasised by weight as well as colour, as in the list. */}
              <span
                className={`${META_ITEM} font-mono text-data whitespace-nowrap ${
                  head.latencyMs >= SLOW_LATENCY_MS ? 'font-medium text-fg' : 'text-muted'
                }`}
              >
                {SEPARATOR}
                <span className="sr-only">Latency </span>
                {formatLatency(head.latencyMs)}
              </span>
              {policyCount > 0 && (
                <span className={META_ITEM}>
                  {SEPARATOR}
                  <span className="inline-flex items-center gap-1 rounded-sm bg-blocked-bg px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-blocked">
                    <ShieldIcon size={12} strokeWidth={2.4} />
                    {policyCount} {policyCount === 1 ? 'policy match' : 'policy matches'}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-1.5 overflow-hidden">
            <div className="-ml-4 flex flex-wrap items-center gap-y-1 text-sm text-muted">
              {/* min-w-0: alone on its line, a long agent name truncates instead of overflowing. */}
              <span className={META_ITEM}>
                {SEPARATOR}
                <AgentAvatar name={head.agent} />
                <span className="truncate text-fg" title={head.agent}>
                  {head.agent}
                </span>
              </span>
              <span className={META_ITEM}>
                {SEPARATOR}
                <time dateTime={head.timestamp} className="font-mono text-data whitespace-nowrap">
                  {formatTimestampUtc(head.timestamp)} UTC
                </time>
              </span>
            </div>
          </div>
        </>
      ) : (
        query.isPending && (
          <>
            <div className="mt-2.5 flex items-center gap-3">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <Skeleton className="size-[22px] rounded-full" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </>
        )
      )}
    </header>
  )

  // ---------------------------------------------------------------- metadata
  // Reference facts go last: the header already shows what you scan for.
  const dt = 'text-muted'
  const mono = 'font-mono text-xs'
  const metadataSection = head ? (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-sm">
      <dt className={dt}>Event ID</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <code className={`truncate ${mono}`}>{head.id}</code>
        <CopyButton value={head.id} label="Copy event ID" variant="ghost" className="-my-1.5" />
      </dd>

      <dt className={dt}>Timestamp</dt>
      <dd>
        <time dateTime={head.timestamp} className={`break-all ${mono}`}>
          {head.timestamp}
        </time>
      </dd>

      <dt className={dt}>Local time</dt>
      <dd>{formatLocalDateTime(head.timestamp)}</dd>

      {/* The header shows the rounded figure; this is the exact one. */}
      <dt className={dt}>Latency</dt>
      <dd className={mono}>{formatCount(head.latencyMs)} ms</dd>
    </dl>
  ) : (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-3.5">
      {SKELETON_VALUE_WIDTHS.map((width, index) => (
        // Static placeholder list: index keys are fine.
        <Fragment key={index}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className={`h-2.5 ${width}`} />
        </Fragment>
      ))}
    </div>
  )

  // ---------------------------------------------------------------- body
  // Order: policy hits (only when there are any), Arguments, Result, Metadata. Each section has
  // a fixed slot and draws its own skeleton, so its element is kept (not remounted) while J/K
  // steps through events: a section the user collapsed stays collapsed.
  const failed = detail === undefined && error !== null && !notFound
  const showPayload = detail !== undefined || (query.isPending && !failed)

  const body = notFound ? (
    <div role="alert" className="rounded-lg border border-border p-3">
      <p className="mb-1 font-semibold">Event not found</p>
      <p className="text-sm text-muted">
        No event with ID <code className="font-mono text-xs break-all text-fg">{eventId}</code>. The
        link may be wrong or out of date.
      </p>
      <Button size="sm" className="mt-2.5" onClick={onClose}>
        Close panel
      </Button>
    </div>
  ) : (
    <>
      {slow && query.isPending && <SlowNotice onRetry={retry} />}
      {detail && policyCount > 0 && (
        <PanelSection
          title="Policy matches"
          meta={`· ${policyCount} ${policyCount === 1 ? 'rule' : 'rules'} fired`}
        >
          <ul className="flex flex-wrap gap-1.5">
            {detail.policyMatches.map((rule) => (
              <li
                key={rule}
                className="rounded-sm bg-blocked-bg px-2 py-0.5 font-mono text-xs text-blocked"
              >
                {rule}
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      {failed && (
        <ErrorState
          compact
          error={error}
          onRetry={retry}
          retrying={query.isFetching}
          title="Couldn’t load this event"
        />
      )}
      {showPayload && (
        <PanelSection title="Arguments">
          {detail ? (
            <JsonView value={detail.args} label="Arguments" />
          ) : (
            <Skeleton className="h-24 w-full rounded-md" />
          )}
        </PanelSection>
      )}
      {showPayload && (
        <PanelSection title="Result">
          {detail ? (
            <JsonView value={detail.result} label="Result" />
          ) : (
            <Skeleton className="h-16 w-full rounded-md" />
          )}
        </PanelSection>
      )}
      {/* Rendered from the list row while the full event loads (a skeleton if not loaded). */}
      {(head || query.isPending) && <PanelSection title="Metadata">{metadataSection}</PanelSection>}
    </>
  )

  const content = (
    <>
      {header}
      <div
        aria-busy={query.isPending}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-3 pb-4"
      >
        {body}
      </div>
      {/* Always mounted so the change to "Loading…" is announced. */}
      <p role="status" className="sr-only">
        {query.isPending ? 'Loading event details' : ''}
      </p>
      <footer
        className={`flex-none items-center gap-4 border-t border-border px-5 py-2 text-xs text-muted ${docked ? 'flex' : 'hidden sm:flex'}`}
      >
        <span className="flex items-center gap-1">
          <Kbd size="sm">J</Kbd>
          <Kbd size="sm">K</Kbd>
          <span className="ml-1">next / previous</span>
        </span>
        <span className="flex items-center gap-1">
          <Kbd size="sm">Esc</Kbd>
          <span className="ml-1">close</span>
        </span>
      </footer>
    </>
  )

  if (docked) {
    return (
      <aside
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-detail-panel=""
        // Width from the page's custom property (falls back to the token if it is unset).
        // Deliberately no width transition: a drag must track the pointer 1:1, and animating
        // width would re-lay out the list every frame.
        className="flex h-full w-[var(--detail-panel-width,var(--panel-width))] flex-none flex-col border-l border-border bg-surface text-fg shadow-panel motion-safe:animate-panel-in"
      >
        {content}
      </aside>
    )
  }

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      // Lets the page's J/K shortcut tell this dialog apart from other modals (see ExplorerPage).
      data-detail-panel=""
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onKeyDown={handleDialogKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      // Expanded on a tablet = a full-screen event view instead of a sheet over the list.
      className={`fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none max-w-none border-l border-border bg-surface p-0 text-fg shadow-panel backdrop:bg-scrim motion-safe:animate-panel-in ${
        expanded ? 'w-screen' : 'w-[min(var(--panel-width),100vw)]'
      }`}
    >
      <div className="flex h-full flex-col">{content}</div>
    </dialog>
  )
}
