// Every server call the browser makes, in one place, so a pane and the shell
// disagree about nothing.

import type { BoardIdentity, BoardInfo, BoardListing, BoardWriteConflict, ServerElement } from '../types'
import type { ChangeReport } from './changes'

/**
 * A refused board write. Distinct from a plain Error because the shell has to
 * offer the human a choice rather than show them a message: it is an outcome of
 * saving, not a fault.
 */
export class BoardConflictError extends Error {
  constructor(public readonly conflict: BoardWriteConflict) {
    super(conflict.message)
    this.name = 'BoardConflictError'
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.success === false) {
    if (body?.conflict) throw new BoardConflictError(body.conflict as BoardWriteConflict)
    throw new Error(body?.error ?? `${init?.method ?? 'GET'} ${url} failed (${response.status})`)
  }
  return body as T
}

function post<T>(url: string, payload: unknown): Promise<T> {
  return json<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

const boardQuery = (board: string | null): string =>
  board ? `?board=${encodeURIComponent(board)}` : ''

// ─── Elements ─────────────────────────────────────────────────

export function fetchElements(board: string | null) {
  return json<{ elements: ServerElement[] }>(`/api/elements${boardQuery(board)}`)
}

export function fetchFiles() {
  return json<{ files?: Record<string, unknown> }>('/api/files')
}

/**
 * Tell the server what changed. The board rides in the query string so that a
 * switch landing mid-flight files the change under the board it came from
 * rather than the one now on screen.
 */
export function reportChanges(
  board: string | null,
  report: ChangeReport,
  clientId: string
): Promise<{ created: number; updated: number; deleted: number; count: number }> {
  return post(`/api/elements/changes${boardQuery(board)}`, {
    upserts: report.upserts,
    deletes: report.deletes,
    clientId,
    timestamp: new Date().toISOString()
  })
}

/** The one call that empties a board. Confirmed in the shell, never here. */
export function clearBoard(board: string | null) {
  return json<{ count: number }>(`/api/elements/clear${boardQuery(board)}`, { method: 'DELETE' })
}

// ─── Boards ───────────────────────────────────────────────────

export function fetchCurrentBoard() {
  return json<BoardInfo & { success: true }>('/api/boards/current')
}

export function fetchBoards() {
  return json<BoardListing>('/api/boards')
}

export function openBoard(address: Partial<BoardIdentity> & { board: string; reload?: boolean }) {
  return post<BoardInfo>('/api/boards/open', address)
}

export function newBoard(address: Partial<BoardIdentity> & { board: string }) {
  return post<BoardInfo>('/api/boards/new', address)
}

/** Throws BoardConflictError when the note at the destination is not ours to overwrite. */
export function saveBoard(as?: SaveRequest) {
  return post<BoardInfo & { file: string; overwrote: boolean; forced?: boolean }>(
    '/api/boards/save',
    as ?? {}
  )
}

export interface SaveRequest {
  name?: string
  variant?: string
  level?: string
  /** The human's "overwrite it anyway", never the shell's own initiative. */
  force?: boolean
}
