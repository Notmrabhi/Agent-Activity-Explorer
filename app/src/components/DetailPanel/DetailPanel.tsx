import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { ApiError } from '../../api/client'
import type { EventSummary } from '../../api/types'
import { useEventDetail } from '../../hooks/useEvents'
import { useSlowFlag } from '../../hooks/useSlowFlag'
import { formatCount, formatLatency, formatLocalDateTime, formatTimestampUtc } from '../../lib/format'
import { ErrorState } from '../feedback/ErrorState'
import { Skeleton } from '../feedback/Skeleton'
import { SlowNotice } from '../feedback/SlowNotice'
import { AgentAvatar } from '../ui/AgentAvatar'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { IconButton } from '../ui/IconButton'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, LinkIcon } from '../ui/icons'
import { Kbd } from '../ui/Kbd'
import { StatusBadge } from '../ui/StatusBadge'
import { JsonView } from './JsonView'
import { PanelSection } from './PanelSection'

export interface DetailPanelProps {
  /** The event to show (from the URL). */
  eventId: string
  /**
   * The list row for this event, if it is loaded. The header and Details render from it at once
   * while the full event loads. Ignored if its id does not match `eventId`.
   */
  summary?: EventSummary
  /** ≥ 1200px: docked beside the list (non-modal). Below: a modal sheet over the list. */
  docked: boolean
  /** Close the panel (remove the event from the URL). The parent returns focus to the row. */
  onClose: () => void
  /** Undefined disables the button (first / last loaded row). */
  onPrev?: () => void
  onNext?: () => void
}

/** Copied to the clipboard by "Copy JSON": the full text, even when the view shows a preview. */
function toJsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return String(value)
  }
}

/** Value widths for the Details skeleton. Static strings so Tailwind can see them. */
const SKELETON_VALUE_WIDTHS = ['w-24', 'w-56', 'w-44', 'w-32', 'w-28', 'w-16'] as const

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
}: DetailPanelProps) {
  const query = useEventDetail(eventId)
  const slow = useSlowFlag(query.isFetching)
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const detail = query.data
  const summary = summaryProp?.id === eventId ? summaryProp : undefined
  // Both shapes share every field the header and Details need.
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
  const header = (
    <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs tracking-wide text-muted uppercase">Event details</p>
        {/* Focused programmatically so screen readers announce the event. It is not a control,
            so no focus ring (a cold link would otherwise open with a ring around the title). */}
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="truncate rounded-sm font-mono text-lg font-medium focus-visible:outline-none"
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
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <AgentAvatar name={head.agent} />
            <span className="min-w-0">
              {head.agent} · <span className="whitespace-nowrap">{formatTimestampUtc(head.timestamp)} UTC</span>
            </span>
          </p>
        ) : (
          query.isPending && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Skeleton className="size-[22px] rounded-full" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          )
        )}
      </div>
      <div className="flex flex-none items-center gap-1">
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
        <IconButton label="Close details (Esc)" variant="ghost" size="sm" onClick={onClose}>
          <CloseIcon size={18} />
        </IconButton>
      </div>
    </header>
  )

  // ---------------------------------------------------------------- details
  const dt = 'text-muted'
  const mono = 'font-mono text-xs'
  const detailsSection = head ? (
    <dl className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-sm">
      <dt className={dt}>Status</dt>
      <dd>
        <StatusBadge status={head.status} size="md" />
      </dd>

      <dt className={dt}>Event ID</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <code className={`truncate ${mono}`}>{head.id}</code>
        <CopyButton value={head.id} label="Copy event ID" variant="ghost" className="-my-1.5" />
      </dd>

      <dt className={dt}>Timestamp</dt>
      <dd>
        <time dateTime={head.timestamp} className={`block ${mono}`}>
          {head.timestamp}
        </time>
        <span className="mt-0.5 block text-muted">
          {formatLocalDateTime(head.timestamp)} in your time zone
        </span>
      </dd>

      <dt className={dt}>Agent</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <AgentAvatar name={head.agent} />
        <span className="truncate">{head.agent}</span>
      </dd>

      <dt className={dt}>Tool</dt>
      <dd className={`truncate ${mono}`}>{head.tool}</dd>

      <dt className={dt}>Latency</dt>
      <dd className={mono}>
        {formatLatency(head.latencyMs)}
        {/* The exact figure only adds information once the value is rounded to seconds. */}
        {head.latencyMs >= 1000 && (
          <span className="text-muted"> ({formatCount(head.latencyMs)} ms)</span>
        )}
      </dd>
    </dl>
  ) : (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-x-3 gap-y-3.5">
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
  const loadingBlocks = (
    <>
      <PanelSection title="Policy matches">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-24" />
        </div>
      </PanelSection>
      <PanelSection title="Arguments">
        <Skeleton className="h-24 w-full rounded-md" />
      </PanelSection>
      <PanelSection title="Result">
        <Skeleton className="h-16 w-full rounded-md" />
      </PanelSection>
    </>
  )

  let rest: ReactNode
  if (detail) {
    const rules = detail.policyMatches
    rest = (
      <>
        <PanelSection
          title="Policy matches"
          meta={`· ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} fired`}
        >
          {rules.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {rules.map((rule) => (
                <li
                  key={rule}
                  className="rounded-sm bg-blocked-bg px-2 py-0.5 font-mono text-xs text-blocked"
                >
                  {rule}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No policy rules fired.</p>
          )}
        </PanelSection>
        <PanelSection
          title="Arguments"
          actions={
            detail.args === undefined ? undefined : (
              <CopyButton value={() => toJsonText(detail.args)} label="Copy Arguments JSON">
                Copy JSON
              </CopyButton>
            )
          }
        >
          <JsonView value={detail.args} label="Arguments" hideCopy />
        </PanelSection>
        <PanelSection
          title="Result"
          actions={
            detail.result === undefined ? undefined : (
              <CopyButton value={() => toJsonText(detail.result)} label="Copy Result JSON">
                Copy JSON
              </CopyButton>
            )
          }
        >
          <JsonView value={detail.result} label="Result" hideCopy />
        </PanelSection>
      </>
    )
  } else if (error !== null && !notFound) {
    rest = (
      <ErrorState
        compact
        error={error}
        onRetry={retry}
        retrying={query.isFetching}
        title="Couldn’t load this event"
      />
    )
  } else if (query.isPending) {
    rest = loadingBlocks
  }

  const body = notFound ? (
    <div role="alert" className="rounded-lg border border-border p-3">
      <p className="mb-1 font-semibold">Event not found</p>
      <p className="text-sm text-muted">
        No event with ID <code className="font-mono text-xs break-all text-fg">{eventId}</code>.
        The link may be wrong or out of date.
      </p>
      <Button size="sm" className="mt-2.5" onClick={onClose}>
        Close panel
      </Button>
    </div>
  ) : (
    <>
      {slow && query.isPending && <SlowNotice onRetry={retry} />}
      {/* Always rendered (skeleton inside while loading), so its open/closed state survives J/K. */}
      {(head || query.isPending) && <PanelSection title="Details">{detailsSection}</PanelSection>}
      {rest}
    </>
  )

  const content = (
    <>
      {header}
      <div
        aria-busy={query.isPending}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4"
      >
        {body}
      </div>
      {/* Always mounted so the change to "Loading…" is announced. */}
      <p role="status" className="sr-only">
        {query.isPending ? 'Loading event details' : ''}
      </p>
      <footer
        className={`flex-none items-center gap-4 border-t border-border px-5 py-2.5 text-xs text-muted ${docked ? 'flex' : 'hidden sm:flex'}`}
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
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-detail-panel=""
        className="flex h-full w-(--panel-width) flex-none flex-col border-l border-border bg-surface text-fg shadow-panel motion-safe:animate-panel-in"
      >
        {content}
      </aside>
    )
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Lets the page's J/K shortcut tell this dialog apart from other modals (see ExplorerPage).
      data-detail-panel=""
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onKeyDown={handleDialogKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(var(--panel-width),100vw)] max-w-none border-l border-border bg-surface p-0 text-fg shadow-panel backdrop:bg-scrim motion-safe:animate-panel-in"
    >
      <div className="flex h-full flex-col">{content}</div>
    </dialog>
  )
}

