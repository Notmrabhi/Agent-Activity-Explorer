// Runtime guards for API responses. The API is a third-party service, so its JSON is `unknown`
// until it has been checked here. Guards are deliberately shallow-but-sufficient: they check the
// fields the UI relies on, not every nested value.
import {
  EVENT_STATUSES,
  type EventDetail,
  type EventStatus,
  type EventSummary,
  type EventsPage,
} from './types'

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && (EVENT_STATUSES as readonly string[]).includes(value)
}

function hasEventCore(value: Json): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.agent === 'string' &&
    typeof value.tool === 'string' &&
    isEventStatus(value.status) &&
    typeof value.latencyMs === 'number'
  )
}

export function isEventSummary(value: unknown): value is EventSummary {
  return isObject(value) && hasEventCore(value) && typeof value.argsPreview === 'string'
}

export function isEventsPage(value: unknown): value is EventsPage {
  return (
    isObject(value) &&
    Array.isArray(value.items) &&
    value.items.every(isEventSummary) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    typeof value.total === 'number'
  )
}

export function isEventDetail(value: unknown): value is EventDetail {
  return (
    isObject(value) &&
    hasEventCore(value) &&
    'args' in value &&
    Array.isArray(value.policyMatches) &&
    value.policyMatches.every((rule) => typeof rule === 'string')
  )
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** Error bodies from the API look like `{ "error": "message" }`. */
export function readErrorMessage(value: unknown): string | null {
  return isObject(value) && typeof value.error === 'string' ? value.error : null
}
