// Every server call the browser makes, in one place, so a pane and the shell
// disagree about nothing.

import type { LibraryItems } from '@excalidraw/excalidraw/types'
import type {
  BoardIdentity, BoardInfo, BoardListing, BoardSaveResult, BoardWriteConflict, ServerElement
} from '../types'
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

/**
 * Tell the server what this pane currently has in front of the human: which
 * board, where the pane sits on the glass, and what of the board is in view.
 *
 * Pushed rather than polled, for the same reason selection is: an agent asking
 * "what am I looking at" must get an answer off server state, not by waking a
 * browser. Registration lives exactly as long as this pane's socket, so an
 * unsplit or a closed tab retires it without anyone saying so.
 */
export function reportPane(pane: PaneReport): Promise<{ success: true; registered: boolean; paneCount: number }> {
  return post('/api/panes', pane)
}

export interface PaneReport {
  clientId: string
  paneId: string
  board: string
  primary: boolean
  focused: boolean
  elementCount: number
  /** Where the pane is in the page, in CSS pixels. */
  rect: { x: number; y: number; width: number; height: number }
  /** Which part of the board is on screen, in scene coordinates. */
  viewport: { x: number; y: number; width: number; height: number; zoom: number }
}

/** The one call that empties a board. Confirmed in the shell, never here. */
export function clearBoard(board: string | null) {
  return json<{ count: number }>(`/api/elements/clear${boardQuery(board)}`, { method: 'DELETE' })
}

// ─── The library ──────────────────────────────────────────────
//
// Stencils, not board content: these never go near /api/elements, and nothing
// they carry reaches the element store until a human drags one onto a canvas.

export function fetchLibrary() {
  return json<{ items: LibraryItems; seeded: string[]; file: string | null; vaultBacked: boolean }>(
    '/api/library'
  )
}

/** The whole palette, because Excalidraw reports the whole palette. */
export function putLibrary(items: LibraryItems) {
  return json<{ count: number; file: string | null; vaultBacked: boolean }>('/api/library', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
}

// ─── Boards ───────────────────────────────────────────────────

/**
 * One board's identity and save state. Named, always: there is no "the current
 * board" on the server any more — a pane asks about the board it holds, and
 * the shell asks about the board in the pane the human is using (ADR 0009).
 */
export function fetchBoardInfo(board: string) {
  return json<BoardInfo & { success: true }>(`/api/boards/info?board=${encodeURIComponent(board)}`)
}

export function fetchBoards() {
  return json<BoardListing>('/api/boards')
}

/** `pane` is the pane to show it in — required once more than one is open. */
export function openBoard(address: Partial<BoardIdentity> & { board: string; reload?: boolean; pane?: string }) {
  return post<BoardInfo>('/api/boards/open', address)
}

export function newBoard(address: Partial<BoardIdentity> & { board: string; pane?: string }) {
  return post<BoardInfo>('/api/boards/new', address)
}

/** Throws BoardConflictError when the note at the destination is not ours to overwrite. */
export function saveBoard(as: SaveRequest) {
  return post<BoardSaveResult>('/api/boards/save', as)
}

export interface SaveRequest {
  /** Which board to write. Required: the server has no default (ADR 0009). */
  board: string
  name?: string
  variant?: string
  level?: string
  /** The human's "overwrite it anyway", never the shell's own initiative. */
  force?: boolean
}
