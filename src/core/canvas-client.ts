import logger from '../utils/logger.js';
import type { SelectionReport } from './describe.js';
import type { PanesReport } from './panes.js';
import { ServerElement } from '../types.js';
import { EXPRESS_SERVER_URL, ENABLE_CANVAS_SYNC } from './config.js';
import type { BoardWriteConflict } from './board.js';
import type { HoldReport } from './board-hold.js';
import type { Claim } from './board-lock.js';
import type { CompareResult } from './compare.js';

// API Response types
export interface ApiResponse {
  success: boolean;
  element?: ServerElement;
  elements?: ServerElement[];
  message?: string;
  error?: string;
  count?: number;
}

export interface SyncResponse {
  element?: ServerElement;
  elements?: ServerElement[];
}

// ---- Which board this invocation is talking about ----
//
// Set once, from something the caller typed: `--board <key>` on the command
// line, or a `board` argument on an MCP tool. It is deliberately NOT read from
// the environment and NOT remembered between invocations — a board that comes
// from somewhere the caller cannot see is the whole problem (ADR 0009). The
// canvas refuses a request that carries no board, so leaving this unset does
// not silently pick one; it produces a refusal that says what to pass.
let requestedBoard: string | null = null;

export function setRequestedBoard(key: string | null): void {
  requestedBoard = key && key.trim() ? key.trim() : null;
}

export function currentRequestedBoard(): string | null {
  return requestedBoard;
}

// ---- Whether the board this invocation touched is being saved ----
//
// The canvas puts a `held` block on every answer about a board that has stopped
// saving (ADR 0006, TASK-079), and it is worth saying whatever the command was:
// an agent that draws on a held board is drawing into a copy that lives in the
// canvas process and in no note. Kept here, next to the request that saw it, so
// that the CLI and MCP each add it to their answer in one place rather than in
// forty. One-shot process, so it lasts exactly one command.
let heldBoard: HoldReport | null = null;

export function boardHoldSeen(): HoldReport | null {
  return heldBoard;
}

/**
 * Forget what the last call saw. The CLI is one command and does not need it;
 * an MCP server is a process that handles many calls, and a hold reported on
 * the answer to a call that never asked about that board would be a lie.
 */
export function forgetBoardHold(): void {
  heldBoard = null;
}

/** Attach the board to a request path, unless the caller already named one. */
function withBoard(path: string): string {
  if (!requestedBoard) return path;
  if (/[?&]board=/.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}board=${encodeURIComponent(requestedBoard)}`;
}

// ---- What this invocation is doing to the board ----
//
// Set once, from `--doing` on the command line or the `doing` argument on an
// MCP write tool, and attached to every request that could change a board — the
// same shape as the board above, and for the same reason. An agent must say
// what it is doing on every write (TASK-095), and a requirement threaded
// through forty call sites is a requirement one of them will get away with
// not meeting.
//
// A query parameter rather than a field in the body: DELETE has no body, and a
// line that rode inside an element's JSON would be one careless spread away
// from being written into the note, which is the one thing this must never be.
let writeDoing: string | null = null;

export function setWriteDoing(doing: string | null): void {
  writeDoing = doing && doing.trim() ? doing.trim() : null;
}

export function currentWriteDoing(): string | null {
  return writeDoing;
}

// ---- And which version of each board this process was last told ----
//
// A write is checked against the version its writer was working from
// (TASK-091), and the writer must not have to remember it: a number an agent
// threads from one command's output into the next is a number it drops. So the
// number comes from the last thing the canvas said about that board, and this
// is where a client that lives long enough to have heard it keeps it.
//
// THAT IS THE MCP SERVER, above all. It is one process serving one agent
// session, so what it was told an hour ago is what this agent last saw, exactly
// the way a pane's `clientId` makes a browser's reading of a board followable.
// The CLI gets the same thing inside one invocation, which is worth having
// where a command makes several writes — `import` clears a board and then
// batches a scene into it — and gets nothing across two, because a fresh
// process has heard nothing. On the canvas's side a claim is the identity that
// covers that gap; see `claimSeen` in board-lock.ts.
//
// `--expect-version` and the `expectVersion` argument are the override, for a
// writer that knows something this map does not. Explicit beats remembered.
//
// The canvas imports this file and reads none of it. The processes that do read
// it are the CLI, which is one command long, and the MCP server, which nothing
// hot-reloads.
// hot-safe: client state a reload rebuilds for a process that never asks for it
const versionsSeen = new Map<string, number | null>();
let statedVersion: number | null | undefined;

export function setExpectedVersion(version: number | null): void {
  statedVersion = version === null || Number.isNaN(version) ? undefined : version;
}

/** What this process would send: what it was told, unless the caller overrode it. */
export function currentExpectedVersion(): number | null | undefined {
  if (statedVersion !== undefined) return statedVersion;
  return requestedBoard ? versionsSeen.get(requestedBoard) : undefined;
}

/**
 * Read the version out of anything the canvas says about a board, refusals
 * included.
 *
 * A refusal is a telling too, and the important one: a write turned away for
 * being against an old version is told which version the board is really at, so
 * the next write goes against that rather than against the number that was just
 * refused. Without this an agent would be refused for ever on one stale read.
 */
function rememberVersion(data: unknown): void {
  if (!requestedBoard || !data || typeof data !== 'object') return;
  const body = data as Record<string, any>;
  // A fingerprint and a conflict are always about the board the request named.
  // A bare `version` is not: `board save --as other` answers about the note it
  // wrote, which is a different board from the one the call was addressed to,
  // and recording that under this board's name would invent an expectation
  // nobody was ever given. So it is taken only when the answer names the board
  // that was asked for, and a name that does not compare equal is skipped
  // rather than guessed at.
  const found = readVersion(body.fingerprint)
    ?? readVersion(body.versionConflict, 'actual')
    ?? (sameBoard(body.board) ? readVersion(body) : undefined);
  if (found !== undefined) versionsSeen.set(requestedBoard, found);
}

function sameBoard(answered: unknown): boolean {
  return typeof answered === 'string'
    && !!requestedBoard
    && answered.toLowerCase() === requestedBoard.toLowerCase();
}

function readVersion(from: unknown, key = 'version'): number | null | undefined {
  if (!from || typeof from !== 'object') return undefined;
  const value = (from as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return value === null ? null : undefined;
}

/** Forget what this process has been told. For a check that wants a fresh caller. */
export function forgetVersionsSeen(): void {
  versionsSeen.clear();
  statedVersion = undefined;
}

/**
 * Attach what this invocation says about its write to anything that is not a
 * read: what it is doing, and which version it believes it is editing.
 *
 * Deny by default, like the boundary on the server that demands it: a request
 * with a method carries them unless it is a GET, so a route added later is
 * covered without anybody remembering. Nothing is refused here — the canvas
 * owns both refusals, because it is the only side that knows which routes are
 * board writes, and two lists that must agree are how they stop agreeing.
 */
function withWriteClaims(path: string, method?: string): string {
  if ((method ?? 'GET').toUpperCase() === 'GET') return path;
  let out = path;
  if (writeDoing && !/[?&]doing=/.test(out)) {
    out = `${out}${out.includes('?') ? '&' : '?'}doing=${encodeURIComponent(writeDoing)}`;
  }
  const expected = currentExpectedVersion();
  // `0` is the wire spelling for a board with no note yet, so that "I saw no
  // version" is a statement rather than a silence.
  if (expected !== undefined && !/[?&]expectVersion=/.test(out)) {
    out = `${out}${out.includes('?') ? '&' : '?'}expectVersion=${expected ?? 0}`;
  }
  return out;
}

// Helper functions to sync with Express server (canvas)
export async function syncToCanvas(
  operation: string, data: any, write: { document?: boolean } = {}
): Promise<SyncResponse | null> {
  if (!ENABLE_CANVAS_SYNC) {
    logger.debug('Canvas sync disabled, skipping');
    return null;
  }

  // Only when the caller said so: a write answers with what it touched, and
  // the board itself is 60,000 tokens at 300 elements (TASK-075).
  const asked = (path: string) => write.document
    ? `${path}${path.includes('?') ? '&' : '?'}document=1`
    : path;

  try {
    let url: string;
    let options: any;

    switch (operation) {
      case 'create':
        url = `${EXPRESS_SERVER_URL}${withWriteClaims(asked(withBoard('/api/elements')), 'POST')}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'update':
        url = `${EXPRESS_SERVER_URL}${withWriteClaims(asked(withBoard(`/api/elements/${data.id}`)), 'PUT')}`;
        options = {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'delete':
        url = `${EXPRESS_SERVER_URL}${withWriteClaims(asked(withBoard(`/api/elements/${data.id}`)), 'DELETE')}`;
        options = { method: 'DELETE' };
        break;

      case 'batch_create':
        url = `${EXPRESS_SERVER_URL}${withWriteClaims(asked(withBoard('/api/elements/batch')), 'POST')}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elements: data })
        };
        break;

      default:
        logger.warn(`Unknown sync operation: ${operation}`);
        return null;
    }

    await assertCanvasIdentity();

    logger.debug(`Syncing to canvas: ${operation}`, { url, data });
    const response = await fetch(url, options);

    // Parse JSON response regardless of HTTP status
    const result = await response.json() as ApiResponse;
    rememberVersion(result);

    if (!response.ok) {
      logger.warn(`Canvas sync returned error status: ${response.status}`, result);
      throw new Error(result.error || `Canvas sync failed: ${response.status} ${response.statusText}`);
    }

    logger.debug(`Canvas sync successful: ${operation}`, result);
    return result as SyncResponse;

  } catch (error) {
    logger.warn(`Canvas sync failed for ${operation}:`, (error as Error).message);
    // Don't throw - we want MCP operations to work even if canvas is unavailable
    return null;
  }
}

/**
 * What a write says about itself, whichever route it went through
 * (TASK-075). `element` is the one the caller named, where there was one;
 * `elements` is everything the write touched in the form the board now holds
 * it, side effects and all; `fingerprint` is the board in one line; `document`
 * is the whole board and is present only when it was asked for.
 */
export interface WriteAnswer {
  element?: ServerElement;
  elements?: ServerElement[];
  fingerprint?: BoardFingerprint;
  document?: ServerElement[];
  alsoDeleted?: string[];
}

/** Ask a write for the whole board back. Off by default, everywhere. */
export interface WriteOptions {
  document?: boolean;
}

// Helper to sync element creation to canvas.
// Sync disabled = deliberate no-op (echo the input, legacy behavior);
// sync enabled but failed = null, so callers report the failure instead of
// claiming "synced to canvas" for an element that never landed.
export async function createElementOnCanvas(
  elementData: ServerElement, options: WriteOptions = {}
): Promise<WriteAnswer | null> {
  if (!ENABLE_CANVAS_SYNC) return { element: elementData };
  const result = await syncToCanvas('create', elementData, options);
  return result ? (result as unknown as WriteAnswer) : null;
}

// Helper to sync element update to canvas
export async function updateElementOnCanvas(
  elementData: Partial<ServerElement> & { id: string }, options: WriteOptions = {}
): Promise<WriteAnswer | null> {
  const result = await syncToCanvas('update', elementData, options);
  return result?.element ? (result as unknown as WriteAnswer) : null;
}

// Helper to sync element deletion to canvas
export async function deleteElementOnCanvas(elementId: string, options: WriteOptions = {}): Promise<any> {
  const result = await syncToCanvas('delete', { id: elementId }, options);
  return result;
}

// Helper to sync batch creation to canvas (same failure semantics as
// createElementOnCanvas: disabled = echo, failed = null)
export async function batchCreateElementsOnCanvas(
  elementsData: ServerElement[], options: WriteOptions = {}
): Promise<WriteAnswer | null> {
  if (!ENABLE_CANVAS_SYNC) return { elements: elementsData };
  const result = await syncToCanvas('batch_create', elementsData, options);
  return result?.elements ? (result as unknown as WriteAnswer) : null;
}

// Helper to fetch element from canvas
export async function getElementFromCanvas(elementId: string): Promise<ServerElement | null> {
  if (!ENABLE_CANVAS_SYNC) {
    logger.debug('Canvas sync disabled, skipping fetch');
    return null;
  }

  try {
    await assertCanvasIdentity();
    const response = await fetch(`${EXPRESS_SERVER_URL}${withBoard(`/api/elements/${elementId}`)}`);
    if (!response.ok) {
      logger.warn(`Failed to fetch element ${elementId}: ${response.status}`);
      return null;
    }
    const data = await response.json() as { element?: ServerElement };
    return data.element || null;
  } catch (error) {
    logger.error('Error fetching element from canvas:', error);
    return null;
  }
}

// ---- Typed REST wrappers shared by the MCP server and CLI ----

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  await assertCanvasIdentity();
  // Every canvas request carries the board when one was named. Attached here
  // rather than at 30 call sites, so a route can never be the one that forgot.
  const response = await fetch(`${EXPRESS_SERVER_URL}${withWriteClaims(withBoard(path), init?.method)}`, init);
  const data = await response.json().catch(() => null) as any;
  // Whether that board is saving. Read off every answer, refusals included,
  // because the answer that most needs it is the one refusing the write that
  // stopped it.
  if (data && typeof data === 'object') {
    heldBoard = data.held && typeof data.held === 'object' ? data.held as HoldReport : null;
  }
  // And which version of it this process has now been told about, for the same
  // reason: read off every answer including the refusals (TASK-091).
  rememberVersion(data);
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP server error: ${response.status} ${response.statusText}`);
    // A refused board write is a result, not a fault: it carries the three
    // outcomes the caller has to choose between, so the body has to survive
    // being turned into an Error. See ADR 0006.
    if (data?.conflict) {
      (error as any).code = 'BOARD_CONFLICT';
      (error as any).conflict = data.conflict as BoardWriteConflict;
    } else if (typeof data?.code === 'string') {
      // BOARD_REQUIRED and its kin: the canvas already said what to do about
      // it, so the code rides along and picks the exit status.
      (error as any).code = data.code;
      if (Array.isArray(data.open)) (error as any).open = data.open;
    }
    throw error;
  }
  return data as T;
}

// A save the server refused because the destination changed underneath it.
export function boardConflictOf(error: unknown): BoardWriteConflict | null {
  const conflict = (error as any)?.conflict;
  return conflict && typeof conflict === 'object' ? conflict as BoardWriteConflict : null;
}

export async function getElements(): Promise<ServerElement[]> {
  const data = await requestJson<ApiResponse>('/api/elements');
  return data.elements || [];
}

export async function searchElements(queryParams: URLSearchParams): Promise<ServerElement[]> {
  const data = await requestJson<ApiResponse>(`/api/elements/search?${queryParams}`);
  return data.elements || [];
}

export async function clearCanvas(): Promise<ApiResponse> {
  return requestJson<ApiResponse>('/api/elements/clear', { method: 'DELETE' });
}

// Ask the canvas to re-evaluate its source, keeping everything on screen.
// Refused unless it was started with `bun run dev:canvas` (ADR 0014).
export async function reloadCanvas(): Promise<{ success: boolean; generation: number; pid: number }> {
  return requestJson<{ success: boolean; generation: number; pid: number }>(
    '/api/reload', { method: 'POST' }
  );
}

// What a human currently has picked on the board. Ids plus enough semantic
// detail (label, node-ness, kind, binding) to act on without a scene fetch.
export async function getSelection(): Promise<SelectionReport & { success: boolean }> {
  return requestJson<SelectionReport & { success: boolean }>('/api/selection');
}

// What the human is currently looking at: one entry per pane on screen, with
// the board it holds, where it sits, how much of it is in view, and what is
// picked in it. View state only — cheap enough to read every turn.
export async function getPanes(): Promise<PanesReport & { success: boolean; activeBoard: string }> {
  return requestJson<PanesReport & { success: boolean; activeBoard: string }>('/api/panes');
}

// ---- Pane layout ----
//
// Splitting the canvas used to be a click, which meant a thread that could
// only talk had no way to put a proposal beside the architecture it changes.
// It reused the pane the human was reading instead (TASK-033).

export interface PaneAddress {
  paneId: string;
  clientId: string;
  place: string;
  position: number;
}

export interface PaneLayoutResponse {
  success: boolean;
  pane?: PaneAddress | null;
  closed?: PaneAddress & { board: string };
  paneCount: number;
  onScreen: Array<{ paneId: string; place: string; board: string }>;
  /** The board that was opened into the new pane, when one was named. */
  board?: BoardResponse;
}

/**
 * Split the canvas, and put a board in the new half if one was named.
 *
 * Two calls on purpose. The pane is made first and answers with its own id,
 * and the board is then opened into that id through the one route that knows
 * how to open a board — vault load, unsaved work kept, frontmatter mismatch
 * reported. A second copy of that logic living behind a layout command is how
 * the two would drift.
 *
 * The pane survives a board that does not: the caller is told both facts
 * rather than left guessing whether the split happened.
 */
export async function openPane(params: { board?: string } = {}): Promise<PaneLayoutResponse> {
  const created = await requestJson<PaneLayoutResponse>('/api/panes/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!params.board) return created;

  const target = created.pane?.clientId;
  try {
    const board = await openBoard({ board: params.board, ...(target ? { pane: target } : {}) });
    return { ...created, board };
  } catch (error) {
    const where = created.pane ? `the ${created.pane.place} pane` : 'a new pane';
    const failure = new Error(
      `The canvas was split, but "${params.board}" did not open into ${where}: ` +
      `${(error as Error).message}` +
      (created.pane
        ? ` The pane is on screen showing what it inherited. Point it somewhere with ` +
          `\`board open <name> --pane ${created.pane.place}\`, or close it with \`pane close ${created.pane.place}\`.`
        : '')
    );
    (failure as any).code = (error as any)?.code;
    throw failure;
  }
}

/** Close one pane, named the way `--pane` names one. */
export async function closePane(pane: string): Promise<PaneLayoutResponse> {
  return requestJson<PaneLayoutResponse>('/api/panes/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pane })
  });
}

// ---- Claiming a board for longer than one write (ADR 0016) ----
//
// Nothing is carried between these two calls. The claim lives on the canvas
// against the board, so every write in between is recognised as the claim's by
// naming the same board it already had to name — which is what makes claiming
// usable from a surface that is a fresh process every command.

export interface ClaimReply {
  success: boolean;
  board: string;
  claim: Claim;
  /** False when this extended a claim that was already standing. */
  created: boolean;
}

export interface ClaimReleaseReply {
  success: boolean;
  board: string;
  released: boolean;
  claim: Claim | null;
}

export async function claimBoard(params: { reason: string; forMs?: number }): Promise<ClaimReply> {
  return requestJson<ClaimReply>('/api/boards/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: params.reason, ...(params.forMs !== undefined ? { forMs: params.forMs } : {}) })
  });
}

export async function releaseBoardClaim(): Promise<ClaimReleaseReply> {
  return requestJson<ClaimReleaseReply>('/api/boards/claim/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
}

export async function getFiles(): Promise<Record<string, any>> {
  const data = await requestJson<{ files?: Record<string, any> }>('/api/files');
  return data.files || {};
}

export async function postFiles(files: any[]): Promise<void> {
  await requestJson('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(files)
  });
}

// A picture of one pane. `pane` names which — without it the pane that answers
// for the browser is photographed, which with a single pane is that pane.
export async function exportImage(
  format: 'png' | 'svg',
  background = true,
  pane?: string
): Promise<{ success: boolean; format: string; data: string }> {
  return requestJson('/api/export/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, background, ...(pane ? { pane } : {}) })
  });
}

export async function setViewport(params: Record<string, unknown>): Promise<{ success: boolean; message?: string }> {
  return requestJson('/api/viewport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
}

export async function saveSnapshot(name: string): Promise<any> {
  return requestJson('/api/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

export async function listSnapshots(): Promise<{ success: boolean; snapshots: any[]; count: number }> {
  return requestJson('/api/snapshots');
}

export async function getSnapshot(name: string): Promise<{ name: string; board?: string; elements: ServerElement[]; createdAt: string }> {
  const data = await requestJson<{ success: boolean; snapshot: { name: string; board?: string; elements: ServerElement[]; createdAt: string } }>(
    `/api/snapshots/${encodeURIComponent(name)}`
  );
  return data.snapshot;
}

// ---- Boards ----
// The canvas server owns the vault I/O: it holds the store, so making it read
// and write the notes keeps the whole scene off the wire on every save and
// means the CLI, the MCP server and the browser all get the same answer.

export interface BoardIdentityPayload {
  board: string;
  variant: string;
  level?: string;
  displayName?: string;
}

export interface BoardResponse {
  success: boolean;
  board: string;
  identity: BoardIdentityPayload;
  elementCount: number;
  vaultBacked: boolean;
  file?: string;
  savedAt?: string;
  loadedAt?: string;
  source?: 'vault' | 'memory';
  created?: boolean;
  saved?: boolean;
  elements?: number;
  overwrote?: boolean;
  forced?: boolean;
  declaredKey?: string;
  /** Where the board landed, when the act was one that put it on screen. */
  pane?: PaneRef | null;
  /**
   * What a save did to the address (ADR 0012): wrote the board back to its own
   * note, gave the scratch board its first home, or branched a board that
   * already had one.
   */
  saveKind?: 'same-board' | 'named' | 'branch';
  /** The board the save read from, which is only interesting when it differs. */
  savedFrom?: string;
  /**
   * Set when this save was one of the two outcomes that end a hold: the board
   * had stopped saving because its note changed underneath, and this write is
   * what un-sticks it (ADR 0006, TASK-079). `overwrite` put the held copy over
   * the note; `elsewhere` put it in a note of its own and left theirs alone.
   */
  resolvedHold?: {
    board: string;
    outcome: 'overwrite' | 'elsewhere';
    /** How many changes were riding on the choice that was just made. */
    writes: number;
    since: string;
  };
  /**
   * What the save did to the screen. `moved` is the panes it repointed at the
   * board just written, which only happens when scratch got a name; `kept` is
   * the panes deliberately left on the board that was saved from; `onScreen`
   * is every pane and what it holds, which is what says whether there is room
   * for the board just written to sit beside its source.
   */
  panes?: {
    moved: PaneRef[];
    kept: PaneRef[];
    onScreen?: Array<{ paneId: string; place: string; board: string }>;
  };
}

export interface PaneRef {
  paneId: string;
  clientId: string;
  /** "left", "right", "the only pane" — how a human points at it. */
  place: string;
  position: number;
}

export interface BoardListResponse {
  success: boolean;
  vault: string;
  // With ?repo=, each entry also carries where it was read from and the nodes
  // bound to that repository, and `file` is absent for a board that only exists
  // on the canvas so far.
  boards: Array<{
    key: string;
    identity: BoardIdentityPayload;
    file?: string;
    declaredKey?: string;
    collidesWith?: string[];
    source?: 'vault' | 'memory';
    nodes?: Array<{ node: string; kind?: string; name?: string; path: string; branch?: string; commit?: string }>;
  }>;
  open: Array<{
    key: string;
    identity: BoardIdentityPayload;
    elementCount: number;
    vaultBacked: boolean;
    file?: string;
    savedAt?: string;
    loadedAt?: string;
  }>;
  /** What each pane is holding right now, in reading order. */
  onScreen: Array<{ paneId: string; place: string; board: string }>;
  /** Set when the listing was narrowed to one repository (TASK-030). */
  repo?: string;
  scanned?: number;
  unreadable?: Array<{ file: string; reason: string }>;
}

// One line naming the board a read is about. Best effort: an older canvas
// server, or one that cannot reach its vault, still answers scene questions.
export async function boardHeading(): Promise<string> {
  try {
    const current = await getBoardInfo();
    const level = current.identity?.level ? `, level ${current.identity.level}` : '';
    return `Board: ${current.board}${level}`;
  } catch {
    return '';
  }
}

// Every board, or only the ones describing one repository. The identity is
// resolved by the caller: the canvas server's working directory is nobody's
// (ADR 0011), so it never turns a path into a repository.
export async function listBoardsOnCanvas(repo?: string): Promise<BoardListResponse> {
  const query = repo ? `?repo=${encodeURIComponent(repo)}` : '';
  return requestJson<BoardListResponse>(`/api/boards${query}`);
}

// One board's identity and save state. There is no "the current board" to ask
// about: the board is named, like everywhere else (ADR 0009).
export async function getBoardInfo(): Promise<BoardResponse> {
  return requestJson<BoardResponse>('/api/boards/info');
}

async function postBoard(path: string, body: Record<string, unknown>): Promise<BoardResponse> {
  return requestJson<BoardResponse>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function openBoard(params: {
  board: string;
  variant?: string;
  level?: string;
  reload?: boolean;
  /** Which pane to show it in: left, right, 1, focused, a pane id… */
  pane?: string;
}): Promise<BoardResponse> {
  return postBoard('/api/boards/open', params);
}

export async function newBoard(params: {
  board: string;
  variant?: string;
  level?: string;
  pane?: string;
}): Promise<BoardResponse> {
  return postBoard('/api/boards/new', params);
}

export async function saveBoard(params: {
  name?: string;
  variant?: string;
  level?: string;
  board?: string;
  // Overwrite a destination archboard has not seen. The human's call, never
  // archboard's — see ADR 0006.
  force?: boolean;
}): Promise<BoardResponse> {
  return postBoard('/api/boards/save', params);
}

// A structured semantic diff between two boards. Read-only on the server: it
// reads whichever copy of each side is authoritative (memory when the board is
// open, the vault note otherwise) and never touches the board on screen.
export async function compareBoardsOnCanvas(params: { from: string; to?: string }): Promise<CompareResult> {
  const query = new URLSearchParams({ from: params.from, ...(params.to ? { to: params.to } : {}) });
  return requestJson<CompareResult>(`/api/boards/compare?${query.toString()}`);
}

/**
 * Hand a Mermaid diagram to the pane holding this call's board.
 *
 * No pane argument, on purpose. Conversion runs in a pane and the elements
 * land on the board that pane holds, so the board already decides which pane
 * (ADR 0009, TASK-046). The answer names the pane it went to, because that is
 * the half of the screen the diagram is about to appear on.
 */
export async function sendMermaid(
  mermaidDiagram: string,
  config?: Record<string, unknown>
): Promise<ApiResponse & { board?: string; pane?: PaneRef | null }> {
  return requestJson('/api/elements/from-mermaid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mermaidDiagram, config })
  });
}

// ---- Change feed -------------------------------------------------------
//
// Semantic changes since a cursor. Read-only, and cheap enough to poll: the
// server holds the events, so this never re-transmits the board.
export interface ChangeFeedResponse {
  success: boolean;
  board: string;
  feedId?: string;
  cursor: number;
  since?: string;
  events: Array<Record<string, any>>;
  coalesced?: Record<string, any> | null;
  truncated?: boolean;
  message?: string;
  feed?: Record<string, any>;
  injection?: Record<string, any>;
}

export async function getChanges(params: {
  since?: number;
  board?: string;
  coalesce?: boolean;
  detail?: boolean;
}): Promise<ChangeFeedResponse> {
  const query = new URLSearchParams();
  query.set('since', String(params.since ?? 0));
  if (params.board) query.set('board', params.board);
  if (params.coalesce) query.set('coalesce', '1');
  if (params.detail) query.set('detail', '1');
  return requestJson<ChangeFeedResponse>(`/api/changes?${query.toString()}`);
}

export interface InjectionReport {
  success: boolean;
  [key: string]: any;
}

export async function getInjection(): Promise<InjectionReport> {
  return requestJson<InjectionReport>('/api/injection');
}

export async function postInjectionTest(params: { text?: string; loud?: boolean }): Promise<InjectionReport> {
  return requestJson<InjectionReport>('/api/injection/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
}

// ---- Strict CRUD variants (throw on failure) ----
// syncToCanvas deliberately swallows errors so MCP tools degrade gracefully;
// the CLI wants hard failures with real error messages instead.

export async function createElementStrict(element: ServerElement): Promise<ServerElement> {
  const data = await requestJson<ApiResponse>('/api/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(element)
  });
  return data.element!;
}

export async function updateElementStrict(
  element: Partial<ServerElement> & { id: string }, options: WriteOptions = {}
): Promise<WriteAnswer & { element: ServerElement }> {
  const data = await requestJson<ApiResponse & WriteAnswer>(
    `/api/elements/${element.id}${options.document ? '?document=1' : ''}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(element)
    });
  return data as WriteAnswer & { element: ServerElement };
}

export async function deleteElementStrict(id: string): Promise<ApiResponse> {
  return requestJson<ApiResponse>(`/api/elements/${id}`, { method: 'DELETE' });
}

export async function getElementStrict(id: string): Promise<ServerElement> {
  const data = await requestJson<ApiResponse>(`/api/elements/${id}`);
  if (!data.element) {
    throw new Error(`Element ${id} not found`);
  }
  return data.element;
}

/**
 * One intent, one write.
 *
 * Everything an agent does to several elements at once — aligning them,
 * distributing them, locking them, grouping them, applying a patch — arrives
 * here as a single request. It used to arrive as one HTTP write per element,
 * which is merely wasteful today and is lost updates once the note is the only
 * copy of the board and every write is a read-modify-write cycle against it
 * (ADR 0015), or nineteen gaps in a lock somebody else can write into
 * (ADR 0016).
 *
 * `origin: agent` is stated here, in the one place agent writes go through, so
 * no caller can forget it and have its own drawing narrated back at it.
 */
export async function applyElementChanges(changes: {
  upserts?: (Partial<ServerElement> & { id?: string })[];
  deletes?: string[];
  /** Ask for the whole board back. Off by default; see BoardFingerprint. */
  document?: boolean;
}): Promise<ElementChangesResult> {
  return requestJson<ElementChangesResult>('/api/elements/changes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upserts: changes.upserts ?? [],
      deletes: changes.deletes ?? [],
      origin: 'agent',
      ...(changes.document ? { document: true } : {})
    })
  });
}

/**
 * The board as one line: how many elements, the sha-256 of its note, and which
 * edit of that note this is. Comparing two of these is how an agent finds out
 * whether anything it did not do has happened, without reading the board
 * (TASK-075).
 *
 * The hash says whether the note is the same document; the version says which
 * of two documents is newer, and is what a writer sends back as
 * `--expect-version` to have its next write refused if the board has moved on
 * (TASK-091). Null on a board whose note carries no version archboard can read,
 * and on a board that has stopped saving, which wrote no note at all.
 */
export interface BoardFingerprint {
  elements: number;
  note: string;
  version: number | null;
}

export interface ElementChangesResult {
  success: boolean;
  board: string;
  created: number;
  updated: number;
  deleted: number;
  count: number;
  appliedAt: string;
  /**
   * Every element the write touched, in the form the board now holds it —
   * including what the server made and the caller never named: minted ids,
   * a text element expanded from a `label` seed, arrows it re-routed.
   */
  elements: ServerElement[];
  fingerprint: BoardFingerprint;
  /** The whole board, and only when it was asked for. */
  document?: ServerElement[];
}

export async function batchCreateElementsStrict(
  elements: ServerElement[], options: WriteOptions = {}
): Promise<WriteAnswer & { elements: ServerElement[] }> {
  const data = await requestJson<ApiResponse & WriteAnswer>(
    `/api/elements/batch${options.document ? '?document=1' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements })
    });
  return { ...data, elements: data.elements ?? [] };
}

// Identity marker the canvas server puts in /health (v1.1+)
export const CANVAS_SERVICE_NAME = 'mcp-excalidraw-canvas';

export function foreignServiceError(): Error {
  const error = new Error(
    `Something is answering at ${EXPRESS_SERVER_URL} but does not identify as this canvas server ` +
    `(a pre-1.1 canvas build or an unrelated service on the port). ` +
    `Upgrade/stop that service, or point EXPRESS_SERVER_URL elsewhere.`
  );
  (error as any).code = 'CANVAS_UNREACHABLE';
  return error;
}

// Revalidating identity gate in front of every /api request: mutations must
// not reach a foreign service squatting on the canvas port. The verification
// is cached only briefly (burst-coalescing TTL) so a long-lived MCP server
// re-checks identity after its verified canvas goes away — a service swapped
// onto the port is refused within seconds, while batch operations (align =
// many concurrent requests) share a single probe instead of stampeding
// /health. Note this is defense-in-depth against accidents, not a security
// boundary: local processes can always reach a loopback port directly.
const IDENTITY_TTL_MS = 3000;
let identityVerifiedAt = 0;
let identityProbe: Promise<void> | null = null;

export function markCanvasIdentityVerified(): void {
  identityVerifiedAt = Date.now();
}

async function assertCanvasIdentity(): Promise<void> {
  if (Date.now() - identityVerifiedAt < IDENTITY_TTL_MS) return;

  if (!identityProbe) {
    identityProbe = (async () => {
      try {
        let response: Response;
        try {
          response = await fetch(`${EXPRESS_SERVER_URL}/health`, { signal: AbortSignal.timeout(1500) });
        } catch (error) {
          // Fail CLOSED on timeout: a listener that accepts connections but
          // never answers /health could still be a foreign service that
          // would accept /api mutations.
          const name = (error as { name?: string })?.name;
          if (name === 'TimeoutError' || name === 'AbortError') {
            const timeoutError = new Error(
              `The service at ${EXPRESS_SERVER_URL} did not answer the /health identity probe within 1500ms — ` +
              `refusing to send it requests.`
            );
            (timeoutError as any).code = 'CANVAS_UNREACHABLE';
            throw timeoutError;
          }
          // Connection-level unreachable (refused/reset/DNS): canvas is down
          // or booting — let the actual request fail with its own error.
          // Deliberately not marked verified, so the next call re-probes.
          return;
        }

        // SOMETHING answered. Only a 200 with our identity payload may pass —
        // a 404 or an HTML page here is a foreign service, not a down canvas.
        let health: { service?: string } | null = null;
        try {
          health = await response.json() as { service?: string };
        } catch { /* non-JSON body: foreign */ }

        if (!response.ok || health?.service !== CANVAS_SERVICE_NAME) {
          throw foreignServiceError();
        }
        identityVerifiedAt = Date.now();
      } finally {
        identityProbe = null;
      }
    })();
  }

  return identityProbe;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  elements_count: number;
  websocket_clients: number;
  // Identity fields (v1.1+); `stop` requires both before signaling anything
  service?: string;
  pid?: number;
  /** True only under `bun run dev:canvas` (ADR 0014). */
  reloadable?: boolean;
  /** Whether the canvas is running the source on disk now (TASK-056). */
  source?: {
    evaluatedAt: string;
    newestFile: string | null;
    newestAt: string | null;
    stale: boolean;
  };
  /** The entry script the built frontend names now, or null if nothing is built. */
  frontendBuild?: string | null;
}

export async function getHealth(timeoutMs = 2000): Promise<HealthStatus> {
  const response = await fetch(`${EXPRESS_SERVER_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return await response.json() as HealthStatus;
}

export async function getSyncStatus(): Promise<Record<string, unknown>> {
  return requestJson('/api/sync/status');
}

// ─── The library ──────────────────────────────────────────────
//
// Read-only from here. The palette is edited in a browser, where the shapes
// are; the reason an agent can see it at all is that it lives on the server
// (ADR 0007) rather than in some tab's localStorage — which is what makes
// "put a Redis on the board" a question with an answer.

export interface LibraryResponse {
  success: boolean;
  items: Array<{ id: string; name?: string; status: string; created: number; elements: unknown[] }>;
  seeded: string[];
  /** Which curated set each seeded stencil came from, by item id. */
  origins: Record<string, string>;
  file: string | null;
  vaultBacked: boolean;
}

export async function getLibrary(): Promise<LibraryResponse> {
  return requestJson<LibraryResponse>('/api/library');
}
