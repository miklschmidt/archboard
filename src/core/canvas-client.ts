import logger from '../utils/logger.js';
import type { SelectionReport } from './describe.js';
import type { PanesReport } from './panes.js';
import { ServerElement } from '../types.js';
import { EXPRESS_SERVER_URL, ENABLE_CANVAS_SYNC } from './config.js';
import type { BoardWriteConflict } from './board.js';
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

/** Attach the board to a request path, unless the caller already named one. */
function withBoard(path: string): string {
  if (!requestedBoard) return path;
  if (/[?&]board=/.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}board=${encodeURIComponent(requestedBoard)}`;
}

// Helper functions to sync with Express server (canvas)
export async function syncToCanvas(operation: string, data: any): Promise<SyncResponse | null> {
  if (!ENABLE_CANVAS_SYNC) {
    logger.debug('Canvas sync disabled, skipping');
    return null;
  }

  try {
    let url: string;
    let options: any;

    switch (operation) {
      case 'create':
        url = `${EXPRESS_SERVER_URL}${withBoard('/api/elements')}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'update':
        url = `${EXPRESS_SERVER_URL}${withBoard(`/api/elements/${data.id}`)}`;
        options = {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'delete':
        url = `${EXPRESS_SERVER_URL}${withBoard(`/api/elements/${data.id}`)}`;
        options = { method: 'DELETE' };
        break;

      case 'batch_create':
        url = `${EXPRESS_SERVER_URL}${withBoard('/api/elements/batch')}`;
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

// Helper to sync element creation to canvas.
// Sync disabled = deliberate no-op (echo the input, legacy behavior);
// sync enabled but failed = null, so callers report the failure instead of
// claiming "synced to canvas" for an element that never landed.
export async function createElementOnCanvas(elementData: ServerElement): Promise<ServerElement | null> {
  if (!ENABLE_CANVAS_SYNC) return elementData;
  const result = await syncToCanvas('create', elementData);
  return result?.element ?? null;
}

// Helper to sync element update to canvas
export async function updateElementOnCanvas(elementData: Partial<ServerElement> & { id: string }): Promise<ServerElement | null> {
  const result = await syncToCanvas('update', elementData);
  return result?.element || null;
}

// Helper to sync element deletion to canvas
export async function deleteElementOnCanvas(elementId: string): Promise<any> {
  const result = await syncToCanvas('delete', { id: elementId });
  return result;
}

// Helper to sync batch creation to canvas (same failure semantics as
// createElementOnCanvas: disabled = echo, failed = null)
export async function batchCreateElementsOnCanvas(elementsData: ServerElement[]): Promise<ServerElement[] | null> {
  if (!ENABLE_CANVAS_SYNC) return elementsData;
  const result = await syncToCanvas('batch_create', elementsData);
  return result?.elements ?? null;
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
  const response = await fetch(`${EXPRESS_SERVER_URL}${withBoard(path)}`, init);
  const data = await response.json().catch(() => null) as any;
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
   * What the save did to the screen. `moved` is the panes it repointed at the
   * board just written, which only happens when scratch got a name; `kept` is
   * the panes deliberately left on the board that was saved from.
   */
  panes?: { moved: PaneRef[]; kept: PaneRef[] };
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

export async function sendMermaid(mermaidDiagram: string, config?: Record<string, unknown>): Promise<ApiResponse> {
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

export async function updateElementStrict(element: Partial<ServerElement> & { id: string }): Promise<ServerElement> {
  const data = await requestJson<ApiResponse>(`/api/elements/${element.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(element)
  });
  return data.element!;
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

export async function batchCreateElementsStrict(elements: ServerElement[]): Promise<ServerElement[]> {
  const data = await requestJson<ApiResponse>('/api/elements/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elements })
  });
  return data.elements || [];
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
