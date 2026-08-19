import logger from '../utils/logger.js';
import type { SelectionReport } from './describe.js';
import { ServerElement } from '../types.js';
import { EXPRESS_SERVER_URL, ENABLE_CANVAS_SYNC } from './config.js';
import type { BoardWriteConflict } from './board.js';

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
        url = `${EXPRESS_SERVER_URL}/api/elements`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'update':
        url = `${EXPRESS_SERVER_URL}/api/elements/${data.id}`;
        options = {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
        break;

      case 'delete':
        url = `${EXPRESS_SERVER_URL}/api/elements/${data.id}`;
        options = { method: 'DELETE' };
        break;

      case 'batch_create':
        url = `${EXPRESS_SERVER_URL}/api/elements/batch`;
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
    const response = await fetch(`${EXPRESS_SERVER_URL}/api/elements/${elementId}`);
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
  const response = await fetch(`${EXPRESS_SERVER_URL}${path}`, init);
  const data = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP server error: ${response.status} ${response.statusText}`);
    // A refused board write is a result, not a fault: it carries the three
    // outcomes the caller has to choose between, so the body has to survive
    // being turned into an Error. See ADR 0006.
    if (data?.conflict) {
      (error as any).code = 'BOARD_CONFLICT';
      (error as any).conflict = data.conflict as BoardWriteConflict;
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

export async function exportImage(format: 'png' | 'svg', background = true): Promise<{ success: boolean; format: string; data: string }> {
  return requestJson('/api/export/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, background })
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
}

export interface BoardListResponse {
  success: boolean;
  vault: string;
  boards: Array<{ key: string; identity: BoardIdentityPayload; file: string; declaredKey?: string }>;
  open: Array<{
    key: string;
    identity: BoardIdentityPayload;
    elementCount: number;
    vaultBacked: boolean;
    file?: string;
    active: boolean;
    savedAt?: string;
    loadedAt?: string;
  }>;
  active: string;
}

// One line naming the board a read is about. Best effort: an older canvas
// server, or one that cannot reach its vault, still answers scene questions.
export async function boardHeading(): Promise<string> {
  try {
    const current = await getCurrentBoard();
    const level = current.identity?.level ? `, level ${current.identity.level}` : '';
    return `Board: ${current.board}${level}`;
  } catch {
    return '';
  }
}

export async function listBoardsOnCanvas(): Promise<BoardListResponse> {
  return requestJson<BoardListResponse>('/api/boards');
}

export async function getCurrentBoard(): Promise<BoardResponse> {
  return requestJson<BoardResponse>('/api/boards/current');
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
}): Promise<BoardResponse> {
  return postBoard('/api/boards/open', params);
}

export async function newBoard(params: {
  board: string;
  variant?: string;
  level?: string;
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

export async function sendMermaid(mermaidDiagram: string, config?: Record<string, unknown>): Promise<ApiResponse> {
  return requestJson('/api/elements/from-mermaid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mermaidDiagram, config })
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
