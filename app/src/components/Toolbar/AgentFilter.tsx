import { useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAgents } from '../../hooks/useEvents'
import { Spinner } from '../feedback/Spinner'
import { AgentAvatar } from '../ui/AgentAvatar'
import { Button } from '../ui/Button'
import { AlertTriangleIcon, SearchIcon } from '../ui/icons'
import { Popover } from '../ui/Popover'
import { FilterButton } from './FilterButton'

export interface AgentFilterProps {
  selected: string[]
  onChange: (agents: string[]) => void
}

const sortedUnique = (names: Iterable<string>) =>
  [...new Set(names)].sort((a, b) => a.localeCompare(b))

/** Agents in the URL but unknown to the API are still listed, so the user can undo them. */
export function AgentFilter({ selected, onChange }: AgentFilterProps) {
  const agents = useAgents()
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  // Snapshot on open, so unchecking an unknown agent doesn't make its row vanish.
  const [pinned, setPinned] = useState<string[]>([])
  const anchorRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const findId = useId()

  const known = agents.data
  const knownSet = useMemo(() => new Set(known ?? []), [known])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const options = useMemo(
    () => sortedUnique([...(known ?? []), ...pinned, ...selected]),
    [known, pinned, selected],
  )

  const needle = find.trim().toLowerCase()
  const visible = needle ? options.filter((name) => name.toLowerCase().includes(needle)) : options
  const allVisibleSelected = visible.length > 0 && visible.every((name) => selectedSet.has(name))

  const openPopover = () => {
    setPinned(selected)
    setOpen(true)
  }
  const closePopover = () => {
    setOpen(false)
    setFind('')
  }

  const toggle = (name: string, checked: boolean) => {
    onChange(
      sortedUnique(checked ? [...selected, name] : selected.filter((agent) => agent !== name)),
    )
  }

  const selectVisible = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') return
    onChange(sortedUnique([...selected, ...visible]))
  }
  const clearAll = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') return
    onChange([])
  }

  let status = null
  if (agents.isPending) {
    status = (
      <p role="status" className="flex items-center gap-2 px-2 py-2.5 text-sm text-muted">
        <Spinner />
        Loading agents…
      </p>
    )
  } else if (agents.isError) {
    status = (
      <div className="px-2 py-2.5 text-sm">
        <p role="alert" className="flex items-start gap-2">
          <AlertTriangleIcon size={16} className="mt-px text-error" />
          <span>
            <span className="font-medium text-error">Couldn’t load agents.</span>{' '}
            <span className="text-muted">Search and status filters still work.</span>
          </span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          aria-disabled={agents.isFetching || undefined}
          icon={agents.isFetching ? <Spinner /> : undefined}
          onClick={() => {
            if (!agents.isFetching) void agents.refetch()
          }}
        >
          {agents.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    )
  } else if (options.length === 0) {
    status = <p className="px-2 py-2.5 text-sm text-muted">No agents</p>
  } else if (visible.length === 0) {
    status = (
      <p role="status" className="px-2 py-2.5 text-sm text-muted">
        No agents match “{find.trim()}”
      </p>
    )
  }

  return (
    <div className="relative">
      <FilterButton
        ref={anchorRef}
        label="Agent"
        count={selected.length}
        open={open}
        aria-controls={popoverId}
        onClick={() => (open ? closePopover() : openPopover())}
      />
      <Popover
        open={open}
        onClose={closePopover}
        anchorRef={anchorRef}
        label="Filter by agent"
        id={popoverId}
        className="w-72"
      >
        <div className="border-b border-border p-2">
          <label htmlFor={findId} className="sr-only">
            Find agent
          </label>
          <div className="relative">
            <SearchIcon
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
            />
            <input
              id={findId}
              type="text"
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Find agent"
              autoComplete="off"
              spellCheck={false}
              className="h-8 w-full rounded-md border border-control bg-surface pr-2.5 pl-8 text-sm text-fg placeholder:text-subtle"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {status}
          {visible.length > 0 && (
            <fieldset>
              <legend className="sr-only">Agents</legend>
              {visible.map((name) => (
                <label
                  key={name}
                  className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-hover"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(name)}
                    onChange={(event) => toggle(name, event.target.checked)}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <AgentAvatar name={name} />
                  <span className="min-w-0 flex-1 truncate text-base">{name}</span>
                  {agents.isSuccess && !knownSet.has(name) && (
                    <span className="shrink-0 text-xs text-subtle">Not in list</span>
                  )}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={allVisibleSelected || visible.length === 0 || undefined}
            onClick={selectVisible}
          >
            {needle ? 'Select matches' : 'Select all'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={selected.length === 0 || undefined}
            onClick={clearAll}
          >
            Clear
          </Button>
        </div>
      </Popover>
    </div>
  )
}
