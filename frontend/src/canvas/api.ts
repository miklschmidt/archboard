// Every server call the browser makes, in one place, so a pane and the shell
// disagree about nothing.

import type { LibraryItems } from '@excalidraw/excalidraw/types'
import type {
  BoardHold, BoardIdentity, BoardInfo, BoardListing, BoardSaveResult, BoardWriteConflict, LockHolder, ServerElement
} from '../types'
import type { ChangeReport } from './changes'

/**
 * A refused board write. Distinct from a plain Error because the shell has to
 * offer the human a choice rather than show them a message: it is an outcome of
 * saving, not a fault.
 */
export class BoardConflictError extends Error {
  constructor(
    public readonly conflict: BoardWriteConflict,
    /** The hold this refusal started or ran into, when the board has one. */
    public readonly held?: BoardHold
  ) {
    super(conflict.message)
    this.name = 'BoardConflictError'
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.success === false) {
    if (body?.conflict) {
      throw new BoardConflictError(body.conflict as BoardWriteConflict, body.held as BoardHold | undefined)
    }
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

/**
 * The images one board draws. Board-scoped like the elements: an image belongs
 * to the board whose elements reference it, and asking without saying which
 * board used to get every image in the process (TASK-060).
 */
export function fetchFiles(board: string | null) {
  return json<{ files?: Record<string, unknown> }>(`/api/files${boardQuery(board)}`)
}

/**
 * Tell the server what changed, and get a compact canonical acknowledgement.
 *
 * The board rides in the query string so that a switch landing mid-flight
 * files the change under the board it came from rather than the one now on
 * screen.
 *
 * Ordinary human reports never return the whole board. The server compares the
 * request-local post-conversion document with the exact document it persisted
 * and returns only canonical corrections. A held-board full report keeps its
 * explicit whole-document recovery answer.
 */
export function reportChanges(
  board: string | null,
  report: ChangeReport,
  clientId: string,
  fullReport = false
): Promise<ChangeReportReply> {
  return post(`/api/elements/changes${boardQuery(board)}`, changeReportPayload(report, clientId, fullReport))
}

function changeReportPayload(report: ChangeReport, clientId: string, fullReport = false) {
  return {
    upserts: report.upserts,
    deletes: report.deletes,
    clientId,
    timestamp: new Date().toISOString(),
    // Only ever on a board that has stopped saving, and the server refuses it
    // anywhere else: it says "this is the whole board", which is the one thing
    // a pane is otherwise never allowed to say (TASK-016, TASK-079).
    ...(fullReport ? { fullReport: true } : {})
  }
}

export function beaconChanges(board: string | null, report: ChangeReport, clientId: string): boolean {
  if (typeof navigator.sendBeacon !== 'function') return false
  const body = new Blob(
    [JSON.stringify(changeReportPayload(report, clientId))],
    { type: 'application/json' }
  )
  return navigator.sendBeacon(`/api/elements/changes${boardQuery(board)}`, body)
}

export interface ChangeReportReply {
  created: number
  updated: number
  deleted: number
  count: number
  /** Canonical changes made after input conversion and before persistence. */
  corrections: { upserts: ServerElement[]; deletes: string[] }
  /** The authoritative board fingerprint after persistence. */
  fingerprint: { elements: number; note: string; version: number | null }
  /** Only present for explicit held-board full-report recovery. */
  document?: ServerElement[]
  /** Set when this board has stopped saving: what is held, and the way out. */
  held?: BoardHold
}

/**
 * Tell the server what this pane currently has in front of the human: which
 * board, where the pane sits on the display, and what of the board is in view.
 *
 * Pushed rather than polled, for the same reason selection is: an agent asking
 * "what am I looking at" must get an answer off server state, not by waking a
 * browser. Registration lives exactly as long as this pane's socket, so an
 * unsplit or a closed tab retires it without anyone saying so.
 */
export function reportPane(pane: PaneReport): Promise<PaneReply> {
  return post('/api/panes', pane)
}

export interface PaneReply {
  success: true
  registered: boolean
  paneCount: number
  /**
   * Set when this tab is running a bundle the canvas no longer serves, i.e.
   * somebody rebuilt the frontend after the tab was opened (TASK-056).
   */
  staleFrontend?: { loaded: string | null; current: string | null; message: string | null }
}

/**
 * The entry script this tab loaded, hash and all.
 *
 * Read off the tag in the served index.html rather than baked in at build time,
 * so the tab and the canvas are reading the same fact from the same place: the
 * canvas reads that tag out of `dist/frontend/index.html` on disk, this reads
 * it out of the document that was actually delivered. A vite dev server names
 * a source file here instead of a hashed bundle, and the canvas knows to say
 * nothing about that.
 */
export function loadedBundle(): string | undefined {
  const script = document.querySelector('script[type="module"][src]')
  return script?.getAttribute('src') ?? undefined
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
  /** Which bundle this tab is running, so the canvas can say when it is old. */
  build?: string
}

export function publishSelection(elementIds: readonly string[], clientId: string) {
  return post<{ success: true }>('/api/selection', { elementIds, clientId })
}

export function postExportResult(requestId: string, payload: Record<string, unknown>) {
  return post<{ success: true }>('/api/export/image/result', { requestId, ...payload })
}

export function postViewportResult(requestId: string, payload: Record<string, unknown>) {
  return post<{ success: true }>('/api/viewport/result', { requestId, ...payload })
}

// ─── The board's mutex ────────────────────────────────────────
//
// The message a change report cannot be (ADR 0016). Reporting is a trailing
// debounce with no maximum wait, so a continuous drag says nothing to the
// server until 400 ms after the finger lifts — long after the change is on
// screen and far too late to refuse. This goes out on the first change instead,
// and the write that follows joins the hold rather than taking a second one.
//
// Deliberately not `json()`: a refusal here is an answer, not a failure. It
// means somebody else is writing the board, and the caller has to be able to
// read who.

export interface HoldReply {
  held: boolean
  /** Who has it: this pane on success, somebody else on a refusal. */
  holder: LockHolder | null
}

export async function holdBoard(board: string | null, clientId: string): Promise<HoldReply> {
  const response = await fetch(`/api/boards/hold${boardQuery(board)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  })
  const body = await response.json().catch(() => ({})) as { success?: boolean; holder?: LockHolder | null }
  if (response.ok && body.success) return { held: true, holder: body.holder ?? null }
  return { held: false, holder: body.holder ?? null }
}

/**
 * Give the board back. Best effort on purpose: the hold is a lease, so a
 * release that never arrives costs LOCK_LEASE_MS and not the board.
 */
export function releaseBoard(board: string | null, clientId: string): void {
  void fetch(`/api/boards/hold/release${boardQuery(board)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  }).catch(() => { })
}

/**
 * Take a claimed board back from the agent that has it.
 *
 * The same message a gesture sends, which is the point: a person taking their
 * board back is a person starting to use it, and the server treats it as one
 * act. It steals from a claim and waits out an ordinary write, so a user edit that
 * lands inside somebody's twenty-millisecond write does not end up being told
 * it lost the board.
 *
 * Given back immediately, because taking it back is not taking it: the board
 * goes to nobody, and the next thing the person draws holds it the way any
 * gesture does. Whoever had it is told at their next write, and nothing they
 * already wrote is undone — a claim was never a transaction (ADR 0016).
 */
export async function takeBoardBack(board: string | null, clientId: string): Promise<HoldReply> {
  const taken = await holdBoard(board, clientId)
  if (taken.held) releaseBoard(board, clientId)
  return taken
}

/**
 * The one call that empties a board. Confirmed in the shell, never here.
 *
 * `clientId` is the pane the person is working in, and it is what says this
 * write is theirs. Without it the server sees an unnamed writer, which is its
 * definition of an agent — and an agent is refused unless it says what it is
 * doing (TASK-095). Nobody is going to narrate their own button press.
 */
export function clearBoard(board: string | null, clientId: string) {
  const query = `${boardQuery(board)}${boardQuery(board) ? '&' : '?'}clientId=${encodeURIComponent(clientId)}`
  return json<{ count: number }>(`/api/elements/clear${query}`, { method: 'DELETE' })
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
  /**
   * The pane the person pressed Save in. As on `clearBoard`: it is what makes
   * this a person's write rather than an unnamed one, and an unnamed writer is
   * an agent, which must say what it is doing (TASK-095).
   */
  clientId?: string
  name?: string
  variant?: string
  level?: string
  /** The human's "overwrite it anyway", never the shell's own initiative. */
  force?: boolean
}
