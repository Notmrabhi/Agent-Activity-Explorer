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
  eventId: string
  /** The list row, shown at once while the full event loads. */
  summary?: EventSummary
  /** ≥ 1200px: docked beside the list (non-modal). Below: a modal sheet over the list. */
  docked: boolean
  onClose: () => void
  /** Undefined disables the button (first / last loaded row). */
  onPrev?: () => void
  onNext?: () => void
  /** Docked: at maximum width. Overlay: full screen. */
  expanded?: boolean
  onToggleExpanded?: () => void
  id?: string
}

const SKELETON_VALUE_WIDTHS = ['w-56', 'w-44', 'w-48', 'w-16'] as const

const META_ITEM = 'relative flex min-w-0 items-center gap-1.5 pl-4'
const SEPARATOR = (
  <span aria-hidden="true" className="absolute left-1.5 font-sans text-subtle">
    ·
  </span>
)

/** Elements whose own Esc handling wins over "close the docked panel". */
const MODAL_SELECTOR = 'dialog[open], [role="dialog"][aria-modal="true"]'

/**
 * Docked: a non-modal panel, so J/K still moves through the list. Overlay: a native modal
 * <dialog> (focus trap, inert background and Esc for free).
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
  const head = detail ?? summary
  const error = query.isError ? query.error : null
  const notFound = error instanceof ApiError && error.isNotFound

  // Focus the title so screen readers announce it. Not on eventId change: J/K users keep their place.
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
        closingOnPurpose.current = true
        dialog.close()
      }
    }
  }, [docked])

  // Docked has no native Esc; another open modal handles its own Esc.
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

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onClose()
  }
  // Chrome can force-close on a repeated Esc, so sync the URL. 'close' is async: ignore it when
  // we closed the dialog ourselves or it has been reopened since (StrictMode).
  const handleNativeClose = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (closingOnPurpose.current) {
      closingOnPurpose.current = false
      return
    }
    if (event.currentTarget.open) return
    onClose()
  }
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') event.stopPropagation()
  }
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

  const policyCount = detail?.policyMatches.length ?? 0
  const header = (
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
          <CopyButton
            value={() => window.location.href}
            label="Copy link to this event"
            icon={<LinkIcon size={14} />}
            className="ml-1"
          >
            Copy link
          </CopyButton>
          {onToggleExpanded && (
            <span className={docked ? 'contents' : 'contents max-[30rem]:hidden'}>
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
            {/* A span: headings may not contain a div. */}
            <span aria-hidden="true" className="skeleton my-1 block h-4 w-40 rounded-sm" />
          </>
        ) : (
          <span className="text-base">{eventId}</span>
        )}
      </h2>
      {head ? (
        <>
          <div className="mt-2 overflow-hidden">
            <div className="-ml-4 flex flex-wrap items-center gap-y-1.5 text-sm">
              <span className={META_ITEM}>
                {SEPARATOR}
                <StatusBadge status={head.status} size="md" />
              </span>
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

      <dt className={dt}>Latency</dt>
      <dd className={mono}>{formatCount(head.latencyMs)} ms</dd>
    </dl>
  ) : (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-3.5">
      {SKELETON_VALUE_WIDTHS.map((width, index) => (
        <Fragment key={index}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className={`h-2.5 ${width}`} />
        </Fragment>
      ))}
    </div>
  )

  // Each section keeps a fixed slot (not remounted on J/K), so a collapsed one stays collapsed.
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
      data-detail-panel=""
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onKeyDown={handleDialogKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none max-w-none border-l border-border bg-surface p-0 text-fg shadow-panel backdrop:bg-scrim motion-safe:animate-panel-in ${
        expanded ? 'w-screen' : 'w-[min(var(--panel-width),100vw)]'
      }`}
    >
      <div className="flex h-full flex-col">{content}</div>
    </dialog>
  )
}
