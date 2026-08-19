import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import {
  files,
  snapshots,
  generateId,
  EXCALIDRAW_ELEMENT_TYPES,
  ServerElement,
  ExcalidrawElementType,
  ExcalidrawFile,
  WebSocketMessage,
  ElementCreatedMessage,
  ElementUpdatedMessage,
  ElementDeletedMessage,
  BatchCreatedMessage,
  ElementsChangedMessage,
  InitialElementsMessage,
  Snapshot,
  selectionState,
  normalizeFontFamily
} from './types.js';
import { buildSelectionReport } from './core/describe.js';
import { buildPanesReport, PaneRegistration } from './core/panes.js';
import { z } from 'zod';
import WebSocket from 'ws';
import { isMainModule } from './core/entry.js';
import { writePidFile, removePidFile } from './core/pidfile.js';
import fs from 'fs';
import {
  BoardState,
  activeBoard,
  activeBoardKey,
  baselineForFile,
  boardSummaries,
  boards,
  getOrCreateBoard,
  recordBaseline,
  resolveBoard,
  setActiveBoard
} from './core/board-store.js';
import {
  BoardIdentity,
  boardKey,
  describeWriteConflict,
  hashBoardBytes,
  listBoards,
  makeIdentity,
  parseBoardKey,
  readBoardFile,
  renderBoardNote,
  requireVaultRoot,
  validateLevel,
  validateVariant,
  vaultPathFor
} from './core/board.js';
import { buildScene } from './core/scene-io.js';
import { CURRENT_VARIANT } from './core/board.js';
import { CompareSideInput, compareBoards } from './core/compare.js';
import { ChangeOrigin, changeFeed } from './core/change-feed.js';
import type { ChangeEvent } from './core/change-feed.js';
import { narrateChange } from './core/changes.js';
import { injectTest, injectionStatus, startInjection } from './core/injection.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the build directory
const staticDir = path.join(__dirname, '../dist');
app.use(express.static(staticDir));
// Also serve frontend assets
app.use(express.static(path.join(__dirname, '../dist/frontend')));
// Serve Excalidraw fonts so the font subsetting worker can fetch them for export
app.use('/assets/fonts', express.static(
  path.join(__dirname, '../node_modules/@excalidraw/excalidraw/dist/prod/fonts')
));

// WebSocket connections
const clients = new Set<WebSocket>();
// Browser client id per socket, taken from the ?clientId= connect param. The
// same id is sent with every selection post, which is what lets a disconnect
// retire that client's selection.
const clientIds = new Map<WebSocket, string>();

// What is on screen right now, one entry per pane, keyed by the same client id.
// A pane is in here only while its socket is open: closing a tab or unsplitting
// takes the registration with it, so `panes` can never report a pane that is no
// longer in front of anybody. Empty is the normal headless state.
const panes = new Map<string, PaneRegistration>();

// Broadcast to all connected clients.
//
// The board key is not optional: a client showing board A has to be able to
// drop a message about board B rather than merge it into what it is rendering.
function broadcast(message: WebSocketMessage, board: string): void {
  const data = JSON.stringify({ ...message, board });
  clients.forEach(client => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    } catch (err) {
      logger.warn('Failed to send to client, removing');
      clients.delete(client);
    }
  });
}

// Tell the change feed a board moved, without telling it what moved.
//
// Every mutating route calls this after it has succeeded. The feed looks at
// settled board states, never at the delta, so all it needs is which board and
// who did it: `human` for the browser's change reports, `agent` for the API
// routes an agent or the CLI drives. That distinction is load-bearing
// downstream — narrating the agent's own drawing back at it is noise.
function noteChange(key: string, board: BoardState, origin: ChangeOrigin): void {
  changeFeed.record(key, board.identity, () => Array.from(board.elements.values()), origin);
}

function normalizeLineBreakMarkup(text: string): string {
  return text
    .replace(/<\s*b\s*r\s*\/?\s*>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Which board a request is about. `?board=` (or a `board` field in the body)
// names one explicitly; everything written before boards existed says nothing
// and means the board the canvas is holding.
function boardFromRequest(req: Request): { key: string; board: BoardState } {
  const fromQuery = typeof req.query.board === 'string' ? req.query.board : undefined;
  const fromBody = req.body && typeof req.body === 'object' && typeof req.body.board === 'string'
    ? req.body.board as string
    : undefined;
  return resolveBoard(fromQuery ?? fromBody);
}

// An unopened board is a client error, not a server fault.
function boardErrorStatus(error: unknown): number {
  return /is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault/.test(
    (error as Error).message
  ) ? 400 : 500;
}

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  clients.add(ws);
  const clientId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('clientId');
  if (clientId) clientIds.set(ws, clientId);
  logger.info(`New WebSocket connection established${clientId ? ` (client ${clientId})` : ''}`);

  // Send the active board to the new client — which board this is, not just
  // its elements, so the tab knows what it is showing from the first frame.
  const board = activeBoard();
  const filesObj: Record<string, ExcalidrawFile> = {};
  files.forEach((f, id) => { filesObj[id] = f; });
  const initialMessage: InitialElementsMessage & {
    files?: Record<string, ExcalidrawFile>;
    identity: BoardIdentity;
  } = {
    type: 'initial_elements',
    board: activeBoardKey(),
    identity: board.identity,
    elements: Array.from(board.elements.values()),
    ...(files.size > 0 ? { files: filesObj } : {})
  };
  ws.send(JSON.stringify(initialMessage));

  ws.on('close', () => {
    clients.delete(ws);
    const closingId = clientIds.get(ws);
    clientIds.delete(ws);
    // A closed or reloaded tab must not leave a selection standing: whatever it
    // had picked is no longer on anyone's screen.
    if (closingId) {
      selectionState.byClient.delete(closingId);
      // The pane itself is gone for the same reason — a closed tab, or a pane
      // unsplit out of the shell. Reporting it would be reporting a ghost.
      panes.delete(closingId);
    }
    if (closingId && selectionState.current?.clientId === closingId) {
      selectionState.current = null;
      broadcastSelection();
      logger.info(`Selection cleared: owning client ${closingId} disconnected`);
    }
    logger.info('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Schema validation
const CreateElementSchema = z.object({
  id: z.string().optional(), // Allow passing ID for MCP sync
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES) as [ExcalidrawElementType, ...ExcalidrawElementType[]]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.string().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  label: z.object({
    text: z.string()
  }).optional(),
  fontSize: z.number().optional(),
  fontFamily: z.union([z.string(), z.number()]).optional(),
  // Bound-text back-pointer — without it, zod strips containerId on import
  // and re-imported bound labels detach from their containers
  containerId: z.string().nullable().optional(),
  // Excalidraw identity fields — preserve through import so re-exported
  // scenes keep their stacking order, roughness seeds, and timestamps, and
  // no-op import→export cycles stay byte-stable
  index: z.string().nullable().optional(),
  seed: z.number().optional(),
  versionNonce: z.number().optional(),
  updated: z.number().optional(),
  groupIds: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fillStyle: z.string().optional(),
  // Arrow-specific properties
  points: z.any().optional(),
  start: z.object({ id: z.string() }).optional(),
  end: z.object({ id: z.string() }).optional(),
  startArrowhead: z.string().nullable().optional(),
  endArrowhead: z.string().nullable().optional(),
  elbowed: z.boolean().optional(),
  // Arrow binding properties (preserved for Excalidraw frontend)
  startBinding: z.object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    mode: z.string().optional(),
  }).nullable().optional(),
  endBinding: z.object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    mode: z.string().optional(),
  }).nullable().optional(),
  boundElements: z.array(z.object({
    id: z.string(),
    type: z.enum(['arrow', 'text']),
  })).nullable().optional(),
  // Image-specific properties
  fileId: z.string().optional(),
  status: z.string().optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
}).passthrough();

const UpdateElementSchema = z.object({
  id: z.string(),
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES) as [ExcalidrawElementType, ...ExcalidrawElementType[]]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.string().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  originalText: z.string().optional(),
  label: z.object({
    text: z.string()
  }).optional(),
  fontSize: z.number().optional(),
  fontFamily: z.union([z.string(), z.number()]).optional(),
  // Bound-text back-pointer — without it, zod strips containerId on import
  // and re-imported bound labels detach from their containers
  containerId: z.string().nullable().optional(),
  // Excalidraw identity fields — preserve through import so re-exported
  // scenes keep their stacking order, roughness seeds, and timestamps, and
  // no-op import→export cycles stay byte-stable
  index: z.string().nullable().optional(),
  seed: z.number().optional(),
  versionNonce: z.number().optional(),
  updated: z.number().optional(),
  groupIds: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fillStyle: z.string().optional(),
  points: z.array(z.union([
    z.tuple([z.number(), z.number()]),
    z.object({ x: z.number(), y: z.number() })
  ])).optional(),
  start: z.object({ id: z.string() }).optional(),
  end: z.object({ id: z.string() }).optional(),
  startArrowhead: z.string().nullable().optional(),
  endArrowhead: z.string().nullable().optional(),
  elbowed: z.boolean().optional(),
  // Arrow binding properties (preserved for Excalidraw frontend)
  startBinding: z.object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    mode: z.string().optional(),
  }).nullable().optional(),
  endBinding: z.object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    mode: z.string().optional(),
  }).nullable().optional(),
  boundElements: z.array(z.object({
    id: z.string(),
    type: z.enum(['arrow', 'text']),
  })).nullable().optional(),
  // Image-specific properties
  fileId: z.string().optional(),
  status: z.string().optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
}).passthrough();

// API Routes

// Get all elements
app.get('/api/elements', (req: Request, res: Response) => {
  try {
    const { key, board } = boardFromRequest(req);
    const elementsArray = Array.from(board.elements.values());
    res.json({
      success: true,
      board: key,
      elements: elementsArray,
      count: elementsArray.length
    });
  } catch (error) {
    logger.error('Error fetching elements:', error);
    res.status(boardErrorStatus(error)).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Create new element
app.post('/api/elements', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const elements = board.elements;
    const params = CreateElementSchema.parse(req.body);
    logger.info('Creating element via API', { type: params.type, board: boardKeyForRequest });

    // Prioritize passed ID (for MCP sync), otherwise generate new ID
    const id = params.id || generateId();
    const { board: _boardField, ...elementParams } = params as typeof params & { board?: string };
    const element: ServerElement = {
      id,
      ...elementParams,
      fontFamily: normalizeFontFamily(params.fontFamily),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    // Resolve arrow bindings against existing elements
    if (element.type === 'arrow' || element.type === 'line') {
      resolveArrowBindings([element], elements);
    }

    elements.set(id, element);

    // Broadcast to all connected clients
    const message: ElementCreatedMessage = {
      type: 'element_created',
      element: element
    };
    broadcast(message, boardKeyForRequest);
    noteChange(boardKeyForRequest, board, 'agent');

    res.json({
      success: true,
      board: boardKeyForRequest,
      element: element
    });
  } catch (error) {
    logger.error('Error creating element:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Update element
app.put('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const elements = board.elements;
    const { id } = req.params;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { board: _boardField, ...updates } = UpdateElementSchema.parse({ id, ...body }) as
      Record<string, any>;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Element ID is required'
      });
    }

    const existingElement = elements.get(id);
    if (!existingElement) {
      return res.status(404).json({
        success: false,
        error: `Element with ID ${id} not found`
      });
    }

    const updatedElement: ServerElement = {
      ...existingElement,
      ...updates,
      fontFamily: updates.fontFamily !== undefined ? normalizeFontFamily(updates.fontFamily) : existingElement.fontFamily,
      updatedAt: new Date().toISOString(),
      version: (existingElement.version || 0) + 1
    };

    // Keep Excalidraw text source in sync when clients update text via REST.
    // If originalText lags behind text, rendered wrapping/position can drift.
    const hasTextUpdate = Object.prototype.hasOwnProperty.call(body, 'text');
    const hasOriginalTextUpdate = Object.prototype.hasOwnProperty.call(body, 'originalText');
    if (updatedElement.type === EXCALIDRAW_ELEMENT_TYPES.TEXT && hasTextUpdate && !hasOriginalTextUpdate) {
      const incomingText = updates.text ?? '';
      const existingText = typeof existingElement.text === 'string' ? existingElement.text : '';
      const existingOriginalText = typeof existingElement.originalText === 'string'
        ? existingElement.originalText
        : '';
      const existingOriginalHasBr = /<\s*b\s*r\s*\/?\s*>/i.test(existingOriginalText);
      const normalizedExistingText = normalizeLineBreakMarkup(existingText);
      const normalizedExistingOriginalText = normalizeLineBreakMarkup(existingOriginalText);

      // Handle common cleanup flow: caller normalizes the rendered text value.
      // In this case, prefer normalized originalText so words aren't split by stale wraps.
      if (existingOriginalHasBr && incomingText === normalizedExistingText && normalizedExistingOriginalText) {
        updatedElement.text = normalizedExistingOriginalText;
        updatedElement.originalText = normalizedExistingOriginalText;
      } else {
        updatedElement.originalText = incomingText;
      }
    }

    elements.set(id, updatedElement);

    // Broadcast to all connected clients
    const message: ElementUpdatedMessage = {
      type: 'element_updated',
      element: updatedElement
    };
    broadcast(message, boardKeyForRequest);
    noteChange(boardKeyForRequest, board, 'agent');

    // Moving/resizing a shape must drag its bound arrows along
    const geometryChanged = ['x', 'y', 'width', 'height']
      .some(key => Object.prototype.hasOwnProperty.call(body, key));
    if (geometryChanged && updatedElement.type !== 'arrow' && updatedElement.type !== 'line') {
      for (const arrow of rerouteBoundArrows(id, elements)) {
        broadcast({ type: 'element_updated', element: arrow } as ElementUpdatedMessage, boardKeyForRequest);
      }
    }

    res.json({
      success: true,
      board: boardKeyForRequest,
      element: updatedElement
    });
  } catch (error) {
    logger.error('Error updating element:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Clear all elements (must be before /:id route)
app.delete('/api/elements/clear', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const count = board.elements.size;
    board.elements.clear();

    // Nothing is on the board, so nothing can be selected — in any pane.
    selectionState.byClient.clear();
    if (selectionState.current) {
      selectionState.current = null;
      broadcastSelection();
    }

    broadcast({
      type: 'canvas_cleared',
      timestamp: new Date().toISOString()
    }, boardKeyForRequest);

    noteChange(boardKeyForRequest, board, 'agent');

    logger.info(`Canvas cleared: ${count} elements removed from board "${boardKeyForRequest}"`);

    res.json({
      success: true,
      board: boardKeyForRequest,
      message: `Cleared ${count} elements`,
      count
    });
  } catch (error) {
    logger.error('Error clearing canvas:', error);
    res.status(boardErrorStatus(error)).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Delete element
app.delete('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const elements = board.elements;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Element ID is required'
      });
    }

    if (!elements.has(id)) {
      return res.status(404).json({
        success: false,
        error: `Element with ID ${id} not found`
      });
    }

    elements.delete(id);

    // Broadcast to all connected clients
    const message: ElementDeletedMessage = {
      type: 'element_deleted',
      elementId: id!
    };
    broadcast(message, boardKeyForRequest);
    noteChange(boardKeyForRequest, board, 'agent');

    res.json({
      success: true,
      board: boardKeyForRequest,
      message: `Element ${id} deleted successfully`
    });
  } catch (error) {
    logger.error('Error deleting element:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Query elements with filters
app.get('/api/elements/search', (req: Request, res: Response) => {
  try {
    const { board } = boardFromRequest(req);
    const { type, x_min, x_max, y_min, y_max, board: _boardParam, ...filters } = req.query;
    let results = Array.from(board.elements.values());

    // Filter by type if specified
    if (type && typeof type === 'string') {
      results = results.filter(element => element.type === type);
    }

    // Filter by bounding box if specified
    if (x_min !== undefined || x_max !== undefined || y_min !== undefined || y_max !== undefined) {
      const xMin = x_min !== undefined ? Number(x_min) : -Infinity;
      const xMax = x_max !== undefined ? Number(x_max) : Infinity;
      const yMin = y_min !== undefined ? Number(y_min) : -Infinity;
      const yMax = y_max !== undefined ? Number(y_max) : Infinity;

      results = results.filter(el =>
        el.x >= xMin &&
        el.x <= xMax &&
        el.y >= yMin &&
        el.y <= yMax
      );
    }

    // Apply additional exact-match filters
    if (Object.keys(filters).length > 0) {
      results = results.filter(element => {
        return Object.entries(filters).every(([key, value]) => {
          return (element as any)[key] === value;
        });
      });
    }

    res.json({
      success: true,
      elements: results,
      count: results.length
    });
  } catch (error) {
    logger.error('Error querying elements:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get element by ID
app.get('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { board } = boardFromRequest(req);
    const elements = board.elements;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Element ID is required'
      });
    }

    const element = elements.get(id);

    if (!element) {
      return res.status(404).json({
        success: false,
        error: `Element with ID ${id} not found`
      });
    }

    res.json({
      success: true,
      element: element
    });
  } catch (error) {
    logger.error('Error fetching element:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Helper: compute edge point for an element given a direction toward a target
function computeEdgePoint(
  el: ServerElement,
  targetCenterX: number,
  targetCenterY: number
): { x: number; y: number } {
  const cx = el.x + (el.width || 0) / 2;
  const cy = el.y + (el.height || 0) / 2;
  const dx = targetCenterX - cx;
  const dy = targetCenterY - cy;

  if (el.type === 'diamond') {
    // Diamond edge: use diamond geometry (rotated square)
    const hw = (el.width || 0) / 2;
    const hh = (el.height || 0) / 2;
    if (dx === 0 && dy === 0) return { x: cx, y: cy + hh };
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // Scale factor to reach diamond edge
    const scale = (absDx / hw + absDy / hh) > 0
      ? 1 / (absDx / hw + absDy / hh)
      : 1;
    return { x: cx + dx * scale, y: cy + dy * scale };
  }

  if (el.type === 'ellipse') {
    // Ellipse edge: parametric intersection
    const a = (el.width || 0) / 2;
    const b = (el.height || 0) / 2;
    if (dx === 0 && dy === 0) return { x: cx, y: cy + b };
    const angle = Math.atan2(dy, dx);
    return { x: cx + a * Math.cos(angle), y: cy + b * Math.sin(angle) };
  }

  // Rectangle: find intersection with edges
  const hw = (el.width || 0) / 2;
  const hh = (el.height || 0) / 2;
  if (dx === 0 && dy === 0) return { x: cx, y: cy + hh };
  const angle = Math.atan2(dy, dx);
  const tanA = Math.tan(angle);
  // Check if ray intersects top/bottom edge or left/right edge
  if (Math.abs(tanA * hw) <= hh) {
    // Intersects left or right edge
    const signX = dx >= 0 ? 1 : -1;
    return { x: cx + signX * hw, y: cy + signX * hw * tanA };
  } else {
    // Intersects top or bottom edge
    const signY = dy >= 0 ? 1 : -1;
    return { x: cx + signY * hh / tanA, y: cy + signY * hh };
  }
}

// Helper: resolve arrow bindings in a batch
function resolveArrowBindings(batchElements: ServerElement[], boardElements: Map<string, ServerElement>): void {
  const elementMap = new Map<string, ServerElement>();
  batchElements.forEach(el => elementMap.set(el.id, el));

  // Also check existing elements on the same board for cross-batch references
  boardElements.forEach((el, id) => {
    if (!elementMap.has(id)) elementMap.set(id, el);
  });

  for (const el of batchElements) {
    if (el.type !== 'arrow' && el.type !== 'line') continue;
    const startRef = (el as any).start as { id: string } | undefined;
    const endRef = (el as any).end as { id: string } | undefined;

    if (!startRef && !endRef) continue;

    const startEl = startRef ? elementMap.get(startRef.id) : undefined;
    const endEl = endRef ? elementMap.get(endRef.id) : undefined;

    // Calculate arrow path from edge to edge
    const startCenter = startEl
      ? { x: startEl.x + (startEl.width || 0) / 2, y: startEl.y + (startEl.height || 0) / 2 }
      : { x: el.x, y: el.y };
    const endCenter = endEl
      ? { x: endEl.x + (endEl.width || 0) / 2, y: endEl.y + (endEl.height || 0) / 2 }
      : { x: el.x + 100, y: el.y };

    const GAP = 8;
    const startPt = startEl
      ? computeEdgePoint(startEl, endCenter.x, endCenter.y)
      : startCenter;
    const endPt = endEl
      ? computeEdgePoint(endEl, startCenter.x, startCenter.y)
      : endCenter;

    // Apply gap: move start point slightly away from source, end point slightly away from target
    const startDx = endPt.x - startPt.x;
    const startDy = endPt.y - startPt.y;
    const startDist = Math.sqrt(startDx * startDx + startDy * startDy) || 1;
    const endDx = startPt.x - endPt.x;
    const endDy = startPt.y - endPt.y;
    const endDist = Math.sqrt(endDx * endDx + endDy * endDy) || 1;

    const finalStart = {
      x: startPt.x + (startDx / startDist) * GAP,
      y: startPt.y + (startDy / startDist) * GAP
    };
    const finalEnd = {
      x: endPt.x + (endDx / endDist) * GAP,
      y: endPt.y + (endDy / endDist) * GAP
    };

    // Set arrow position and points
    el.x = finalStart.x;
    el.y = finalStart.y;
    el.points = [[0, 0], [finalEnd.x - finalStart.x, finalEnd.y - finalStart.y]];

    // Do NOT delete `start` and `end` here.
    // Excalidraw's frontend `convertToExcalidrawElements` method looks for these exact properties
    // to calculate mathematically sound `startBinding`, `endBinding`, `focus`, `gap`, and `boundElements`.
  }
}

// After a shape's geometry changes, recompute every arrow bound to it so the
// visual connection follows the shape — bindings are otherwise only resolved
// at creation time, which left arrows floating at stale coordinates when
// update/align/distribute moved their endpoints. Returns the re-routed arrows.
function rerouteBoundArrows(movedId: string, boardElements: Map<string, ServerElement>): ServerElement[] {
  const rerouted: ServerElement[] = [];
  boardElements.forEach(el => {
    if (el.type !== 'arrow' && el.type !== 'line') return;
    const startRef = (el as any).start as { id: string } | undefined;
    const endRef = (el as any).end as { id: string } | undefined;
    if (startRef?.id !== movedId && endRef?.id !== movedId) return;
    resolveArrowBindings([el], boardElements);
    el.updatedAt = new Date().toISOString();
    el.version = (el.version || 0) + 1;
    rerouted.push(el);
  });
  return rerouted;
}

// Batch create elements
app.post('/api/elements/batch', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const elements = board.elements;
    const { elements: elementsToCreate } = req.body;

    if (!Array.isArray(elementsToCreate)) {
      return res.status(400).json({
        success: false,
        error: 'Expected an array of elements'
      });
    }

    const createdElements: ServerElement[] = [];

    elementsToCreate.forEach(elementData => {
      const params = CreateElementSchema.parse(elementData);
      // Prioritize passed ID (for MCP sync), otherwise generate new ID
      const id = params.id || generateId();
      const element: ServerElement = {
        id,
        ...params,
        fontFamily: normalizeFontFamily(params.fontFamily),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      createdElements.push(element);
    });

    // Resolve arrow bindings (computes positions, startBinding, endBinding, boundElements)
    resolveArrowBindings(createdElements, elements);

    // Store all elements after binding resolution
    createdElements.forEach(el => elements.set(el.id, el));

    // Broadcast to all connected clients
    const message: BatchCreatedMessage = {
      type: 'elements_batch_created',
      elements: createdElements
    };
    broadcast(message, boardKeyForRequest);
    noteChange(boardKeyForRequest, board, 'agent');

    res.json({
      success: true,
      board: boardKeyForRequest,
      elements: createdElements,
      count: createdElements.length
    });
  } catch (error) {
    logger.error('Error batch creating elements:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Convert Mermaid diagram to Excalidraw elements
app.post('/api/elements/from-mermaid', (req: Request, res: Response) => {
  try {
    const { mermaidDiagram, config } = req.body;

    if (!mermaidDiagram || typeof mermaidDiagram !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Mermaid diagram definition is required'
      });
    }

    logger.info('Received Mermaid conversion request', {
      diagramLength: mermaidDiagram.length,
      hasConfig: !!config
    });

    // Broadcast to all WebSocket clients to process the Mermaid diagram
    broadcast({
      type: 'mermaid_convert',
      mermaidDiagram,
      config: config || {},
      timestamp: new Date().toISOString()
    }, activeBoardKey());
    changeFeed.expectAgentEcho(activeBoardKey());

    // Return the diagram for frontend processing
    res.json({
      success: true,
      mermaidDiagram,
      config: config || {},
      message: 'Mermaid diagram sent to frontend for conversion.'
    });
  } catch (error) {
    logger.error('Error processing Mermaid diagram:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// ─── Change reports from the browser ──────────────────────────
//
// The browser reports what changed; the server decides what the board is.
//
// This replaces POST /api/elements/sync, which cleared the board's element map
// and refilled it from whatever a tab happened to be holding. That made every
// tab the authority on the entire board on every keystroke, so a tab that was
// stale, still loading, or showing a board mid-switch could truncate work it
// had never seen. Nothing here can do that: the server removes only ids a
// client names explicitly, and a client can only name ids it received in the
// first place.
//
// Upserts are merged, not substituted, so server-side fields the browser does
// not model — createdAt, the monotonic version, anything a later feature
// stamps on an element — survive a human dragging the shape.
const ElementChangesSchema = z.object({
  upserts: z.array(z.record(z.any())).default([]),
  deletes: z.array(z.string()).default([]),
  clientId: z.string().optional(),
  timestamp: z.string().optional()
});

app.post('/api/elements/changes', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const elements = board.elements;
    const { upserts, deletes, clientId, timestamp } = ElementChangesSchema.parse(req.body ?? {});

    const now = new Date().toISOString();
    const created: ServerElement[] = [];
    const updated: ServerElement[] = [];

    for (const raw of upserts) {
      const {
        board: _board,
        id: rawId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        version: _version,
        syncedAt: _syncedAt,
        source: _source,
        syncTimestamp: _syncTimestamp,
        ...incoming
      } = raw as Record<string, any>;
      const id = typeof rawId === 'string' && rawId.length > 0 ? rawId : generateId();
      const existing = elements.get(id);
      const element = {
        ...(existing ?? {}),
        ...incoming,
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
        source: 'frontend_sync',
        syncedAt: now,
        ...(timestamp ? { syncTimestamp: timestamp } : {})
      } as ServerElement;
      elements.set(id, element);
      (existing ? updated : created).push(element);
    }

    // Only ids the board actually holds. A client naming something already
    // gone is telling the server news it already has, not making an error.
    const deleted: string[] = [];
    for (const id of deletes) {
      if (elements.delete(id)) deleted.push(id);
    }

    if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
      // Carries the reporting client so that client can skip its own echo:
      // re-applying a change already on screen is at best a wasted render and
      // at worst a shape snapping back mid-drag.
      broadcast({
        type: 'elements_changed',
        created,
        updated,
        deleted,
        origin: clientId ?? null,
        timestamp: now
      } as ElementsChangedMessage, boardKeyForRequest);

      // The one path a human's own hands come in on.
      noteChange(boardKeyForRequest, board, 'human');

      logger.info(
        `Change report from ${clientId ?? 'an unidentified client'} on "${boardKeyForRequest}": ` +
        `+${created.length} ~${updated.length} -${deleted.length} (${elements.size} on the board)`
      );
    }

    res.json({
      success: true,
      board: boardKeyForRequest,
      created: created.length,
      updated: updated.length,
      deleted: deleted.length,
      count: elements.size,
      appliedAt: now
    });
  } catch (error) {
    logger.error('Error applying a change report:', error);
    res.status(boardErrorStatus(error)).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// ─── Change feed ──────────────────────────────────────────────
//
// Semantic changes, not element deltas: what the board *became*, said in the
// same vocabulary `compare` uses. See core/change-feed.ts for why an event
// exists at all — briefly, a drag is one event, at rest, or none at all.
//
// Two shapes, because there are two consumers:
//   ?since=N            the events after cursor N, for something watching live
//   ?since=N&coalesce=1 one diff from cursor N to now, for a per-turn hook that
//                       wants the net difference rather than a replay to merge
//
// `detail` (the whole compare result) is off unless asked: it is complete and
// therefore large, and the narration in `text` is what most callers use.
app.get('/api/changes', (req: Request, res: Response) => {
  try {
    const since = Number(req.query.since ?? 0);
    if (!Number.isFinite(since) || since < 0) {
      return res.status(400).json({ success: false, error: 'since must be a cursor from a previous response' });
    }
    const board = typeof req.query.board === 'string' && req.query.board ? req.query.board : activeBoardKey();
    const wantDetail = req.query.detail === '1' || req.query.detail === 'true';
    const coalesce = req.query.coalesce === '1' || req.query.coalesce === 'true';
    // A caller reading the feed wants the board as it is, not as it was 1.2s
    // ago, so an open settle window is closed before answering.
    if (req.query.settle !== '0') changeFeed.settle(board);

    // A cursor ahead of the feed's own is not "nothing has happened": it came
    // from a previous canvas process, since the board lives in memory and the
    // count restarts with it. Saying "nothing changed" to that would be the
    // most damaging wrong answer available.
    if (since > changeFeed.cursor) {
      return res.json({
        success: true,
        board,
        feedId: changeFeed.status().feedId,
        cursor: changeFeed.cursor,
        events: [],
        ...(coalesce ? { coalesced: null } : {}),
        truncated: true,
        message:
          `Cursor ${since} is ahead of this feed (now at ${changeFeed.cursor}), so it was issued by a previous ` +
          'canvas process — the board is held in memory and the count restarts with the server. Treat this as ' +
          'a fresh start: take the cursor in this response, and read the board with `describe`. Watch `feedId` ' +
          'to notice the next restart.'
      });
    }


    const strip = (event: ChangeEvent) =>
      (wantDetail ? event : { ...event, change: { ...event.change, detail: undefined } });

    if (coalesce) {
      const net = changeFeed.coalesce(since, board);
      if (!net) {
        return res.json({
          success: true,
          board,
          cursor: changeFeed.cursor,
          coalesced: null,
          truncated: true,
          message:
            `Cursor ${since} is older than the change feed's memory of board "${board}", so the net diff ` +
            'since then cannot be computed. Take the cursor in this response as a fresh start, and read ' +
            'the board itself with `describe` if you need to know where things stand.'
        });
      }
      return res.json({
        success: true,
        board,
        feedId: changeFeed.status().feedId,
        cursor: net.cursor,
        since: net.since,
        events: net.events.map(strip),
        coalesced: {
          significance: net.change.significance,
          headline: net.change.headline,
          text: narrateChange(net.change),
          counts: net.change.counts,
          nodes: net.change.nodes,
          edges: net.change.edges,
          layout: net.change.layout,
          warnings: net.change.warnings,
          ...(wantDetail ? { detail: net.change.detail } : {})
        }
      });
    }

    res.json({
      success: true,
      board,
      feedId: changeFeed.status().feedId,
      cursor: changeFeed.cursor,
      events: changeFeed.since(since, board).map(strip),
      feed: changeFeed.status(),
      injection: injectionStatus()
    });
  } catch (error) {
    logger.error('Error reading the change feed:', error);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ─── Injection (push to a live Codex thread) ──────────────────
//
// Read-only status, plus a probe. Arming is NOT a request the canvas can
// serve: it happens at startup, from ARCHBOARD_INJECT and the bound address,
// because an HTTP endpoint that could switch it on would be exactly the hole
// ADR 0005 is about.
app.get('/api/injection', (_req: Request, res: Response) => {
  res.json({ success: true, ...injectionStatus() });
});

app.post('/api/injection/test', async (req: Request, res: Response) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const loud = req.body?.loud === true ? true : req.body?.loud === false ? false : undefined;
    const result = await injectTest(note, loud);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(409).json({ success: false, error: (error as Error).message, status: injectionStatus() });
  }
});

// ─── Selection ────────────────────────────────────────────────
//
// Selection is what a human has picked on the board, and it changes on every
// click — far more often than the scene itself. So it gets its own channel
// rather than riding the debounced element sync: the browser posts ids only
// (tens of bytes), and reading it back never re-transmits the scene.
//
// One canvas, one selection. Whichever browser client reported last owns it
// (last writer wins); when that client disconnects, the selection is dropped.

const SelectionSchema = z.object({
  elementIds: z.array(z.string()),
  clientId: z.string().min(1)
});

function broadcastSelection(): void {
  const current = selectionState.current;
  broadcast({
    type: 'selection_changed',
    elementIds: current?.elementIds ?? [],
    clientId: current?.clientId ?? null,
    at: current?.at ?? new Date().toISOString()
  }, activeBoardKey());
}

app.post('/api/selection', (req: Request, res: Response) => {
  const parsed = SelectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid selection' });
  }

  const { elementIds, clientId } = parsed.data;
  const at = new Date().toISOString();
  selectionState.current = elementIds.length === 0
    ? null
    : { elementIds, clientId, at };
  // Per pane, an empty selection is a fact about that pane rather than the
  // absence of one: the human deselected *there* while another pane may still
  // hold something.
  if (elementIds.length === 0) selectionState.byClient.delete(clientId);
  else selectionState.byClient.set(clientId, { elementIds, clientId, at });

  logger.info(`Selection from ${clientId}: ${elementIds.length} element(s)`);
  broadcastSelection();

  res.json({
    success: true,
    count: elementIds.length,
    elementIds
  });
});

app.get('/api/selection', (_req: Request, res: Response) => {
  const board = activeBoard();
  const report = buildSelectionReport(
    selectionState.current,
    Array.from(board.elements.values()),
    clients.size
  );
  res.json({ success: true, board: activeBoardKey(), ...report });
});

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which board, where
// it sits on the glass, how much of the board is on screen, and what is picked
// in it. View state, never contents — see core/panes.ts for why that line is
// worth holding.
//
// Like selection, this is pushed by the browser and read back off the server,
// so reading it costs a map lookup and never a browser round-trip.

const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

const PaneSchema = z.object({
  clientId: z.string().min(1),
  paneId: z.string().min(1),
  // The board this pane adopted. Today it is always the active one; reading the
  // pane's own answer is what keeps this report honest when it stops being.
  board: z.string().min(1),
  primary: z.boolean(),
  focused: z.boolean(),
  elementCount: z.number().int().nonnegative(),
  rect: RectSchema,
  viewport: RectSchema.extend({ zoom: z.number().positive() })
});

app.post('/api/panes', (req: Request, res: Response) => {
  const parsed = PaneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid pane' });
  }
  const registration: PaneRegistration = { ...parsed.data, at: new Date().toISOString() };
  // A pane exists exactly as long as its socket. A report arriving without one
  // is a pane on its way out — React tears the canvas down in its own order, so
  // a last change can be reported after the close — and registering it would
  // resurrect the ghost the close just retired.
  const live = Array.from(clientIds.values()).includes(registration.clientId);
  if (!live) {
    return res.json({ success: true, registered: false, paneCount: panes.size });
  }
  panes.set(registration.clientId, registration);
  res.json({ success: true, registered: true, paneCount: panes.size });
});

app.get('/api/panes', (_req: Request, res: Response) => {
  const report = buildPanesReport(Array.from(panes.values()), {
    identity: (key) => boards.get(key)?.identity ?? null,
    elements: (key) => {
      const board = boards.get(key);
      return board ? Array.from(board.elements.values()) : [];
    },
    selection: (clientId) => selectionState.byClient.get(clientId) ?? null,
    canvasUrl: `http://${formatHostForUrl(HOST)}:${PORT}`
  });
  res.json({ success: true, activeBoard: activeBoardKey(), ...report });
});

// ─── Files API (for image elements) ───────────────────────────
// GET all files
app.get('/api/files', (_req: Request, res: Response) => {
  const filesObj: Record<string, ExcalidrawFile> = {};
  files.forEach((f, id) => { filesObj[id] = f; });
  res.json({ files: filesObj });
});

// POST add/update files (batch)
app.post('/api/files', (req: Request, res: Response) => {
  const body = req.body;
  const fileList: ExcalidrawFile[] = Array.isArray(body) ? body : (body?.files || []);
  for (const f of fileList) {
    if (f.id && f.dataURL) {
      files.set(f.id, { id: f.id, dataURL: f.dataURL, mimeType: f.mimeType || 'image/png', created: f.created || Date.now() });
    }
  }
  // Broadcast files to connected clients
  broadcast({ type: 'files_added', files: fileList }, activeBoardKey());
  res.json({ success: true, count: fileList.length });
});

// DELETE a file
app.delete('/api/files/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (files.delete(id)) {
    broadcast({ type: 'file_deleted', fileId: id }, activeBoardKey());
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: `File with ID ${id} not found` });
  }
});

// Image export: request (MCP -> Express -> WebSocket -> Frontend)
interface PendingExport {
  resolve: (data: { format: string; data: string }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  collectionTimeout: ReturnType<typeof setTimeout> | null;
  bestResult: { format: string; data: string } | null;
}
const pendingExports = new Map<string, PendingExport>();

app.post('/api/export/image', (req: Request, res: Response) => {
  try {
    const { format, background } = req.body;

    if (!format || !['png', 'svg'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'format must be "png" or "svg"'
      });
    }

    if (clients.size === 0) {
      return res.status(503).json({
        success: false,
        error: 'No frontend client connected. Open the canvas in a browser first.'
      });
    }

    const requestId = generateId();

    const exportPromise = new Promise<{ format: string; data: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = pendingExports.get(requestId);
        pendingExports.delete(requestId);
        // If we collected any result during the window, use it
        if (pending?.bestResult) {
          resolve(pending.bestResult);
        } else {
          reject(new Error('Export timed out after 30 seconds'));
        }
      }, 30000);

      pendingExports.set(requestId, { resolve, reject, timeout, collectionTimeout: null, bestResult: null });
    });

    // Re-broadcast current elements so all connected clients (including stale ones)
    // sync to the canonical server state before exporting
    const filesObj: Record<string, ExcalidrawFile> = {};
    files.forEach((f, id) => { filesObj[id] = f; });
    const exportBoard = activeBoard();
    broadcast({
      type: 'initial_elements',
      board: activeBoardKey(),
      identity: exportBoard.identity,
      elements: Array.from(exportBoard.elements.values()),
      ...(files.size > 0 ? { files: filesObj } : {})
    } as InitialElementsMessage & { files?: Record<string, ExcalidrawFile> }, activeBoardKey());

    // Give browsers time to process the reload before requesting export
    setTimeout(() => {
      broadcast({
        type: 'export_image_request',
        requestId,
        format,
        background: background ?? true
      }, activeBoardKey());
    }, 800);

    exportPromise
      .then(result => {
        res.json({
          success: true,
          format: result.format,
          data: result.data
        });
      })
      .catch(error => {
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      });
  } catch (error) {
    logger.error('Error initiating image export:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Image export: result (Frontend -> Express -> MCP)
app.post('/api/export/image/result', (req: Request, res: Response) => {
  try {
    const { requestId, format, data, error } = req.body;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: 'requestId is required'
      });
    }

    const pending = pendingExports.get(requestId);
    if (!pending) {
      // Already resolved by another client, or expired — ignore silently
      return res.json({ success: true });
    }

    if (error) {
      // Don't reject on error — another WebSocket client may still succeed.
      logger.warn(`Export error from one client (requestId=${requestId}): ${error}`);
      return res.json({ success: true });
    }

    // Keep the largest response (most complete canvas state wins)
    if (!pending.bestResult || data.length > pending.bestResult.data.length) {
      pending.bestResult = { format, data };
    }

    // Start a short collection window on the first response, then resolve with best
    if (!pending.collectionTimeout) {
      pending.collectionTimeout = setTimeout(() => {
        const p = pendingExports.get(requestId);
        if (p?.bestResult) {
          clearTimeout(p.timeout);
          pendingExports.delete(requestId);
          p.resolve(p.bestResult);
        }
      }, 3000);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing export result:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Viewport control: request (MCP -> Express -> WebSocket -> Frontend)
interface PendingViewport {
  resolve: (data: { success: boolean; message: string }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
const pendingViewports = new Map<string, PendingViewport>();

const viewportRequestSchema = z.object({
  scrollToContent: z.boolean().optional(),
  scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
  viewportZoomFactor: z.number().positive().max(1).optional(),
  scrollToElementId: z.string().min(1).optional(),
  zoom: z.number().min(0.1).max(10).optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional()
}).superRefine((params, ctx) => {
  const modes = [
    params.scrollToContent === true,
    params.scrollToElementIds !== undefined,
    params.scrollToElementId !== undefined,
    params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined
  ].filter(Boolean).length;

  if (modes !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset'
    });
  }
  if (params.viewportZoomFactor !== undefined &&
      params.scrollToContent !== true &&
      params.scrollToElementIds === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['viewportZoomFactor'],
      message: 'viewportZoomFactor requires scrollToContent or scrollToElementIds'
    });
  }
});

app.post('/api/viewport', (req: Request, res: Response) => {
  try {
    const {
      scrollToContent,
      scrollToElementIds,
      scrollToElementId,
      viewportZoomFactor,
      zoom,
      offsetX,
      offsetY
    } = viewportRequestSchema.parse(req.body);

    if (clients.size === 0) {
      return res.status(503).json({
        success: false,
        error: 'No frontend client connected. Open the canvas in a browser first.'
      });
    }

    const requestId = generateId();

    const viewportPromise = new Promise<{ success: boolean; message: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingViewports.delete(requestId);
        reject(new Error('Viewport request timed out after 10 seconds'));
      }, 10000);

      pendingViewports.set(requestId, { resolve, reject, timeout });
    });

    broadcast({
      type: 'set_viewport',
      requestId,
      scrollToContent,
      scrollToElementIds,
      scrollToElementId,
      viewportZoomFactor,
      zoom,
      offsetX,
      offsetY
    }, activeBoardKey());

    viewportPromise
      .then(result => {
        res.json(result);
      })
      .catch(error => {
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      });
  } catch (error) {
    logger.error('Error initiating viewport change:', error);
    res.status(error instanceof z.ZodError ? 400 : 500).json({
      success: false,
      error: error instanceof z.ZodError
        ? error.issues.map(issue => issue.message).join('; ')
        : (error as Error).message
    });
  }
});

// Viewport control: result (Frontend -> Express -> MCP)
app.post('/api/viewport/result', (req: Request, res: Response) => {
  try {
    const { requestId, success, message, error } = req.body;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: 'requestId is required'
      });
    }

    const pending = pendingViewports.get(requestId);
    if (!pending) {
      return res.json({ success: true });
    }

    if (error || success === false) {
      clearTimeout(pending.timeout);
      pendingViewports.delete(requestId);
      pending.reject(new Error(error || message || 'Viewport update failed'));
      return res.json({ success: true });
    }

    clearTimeout(pending.timeout);
    pendingViewports.delete(requestId);
    pending.resolve({ success: true, message: message || 'Viewport updated' });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing viewport result:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Snapshots: save
app.post('/api/snapshots', (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Snapshot name is required'
      });
    }

    const { key: boardKeyForRequest, board } = boardFromRequest(req);
    const snapshot: Snapshot = {
      name,
      board: boardKeyForRequest,
      elements: Array.from(board.elements.values()),
      createdAt: new Date().toISOString()
    };

    snapshots.set(name, snapshot);
    logger.info(`Snapshot saved: "${name}" with ${snapshot.elements.length} elements from board "${boardKeyForRequest}"`);

    res.json({
      success: true,
      name,
      board: boardKeyForRequest,
      elementCount: snapshot.elements.length,
      createdAt: snapshot.createdAt
    });
  } catch (error) {
    logger.error('Error saving snapshot:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Snapshots: list
app.get('/api/snapshots', (req: Request, res: Response) => {
  try {
    const list = Array.from(snapshots.values()).map(s => ({
      name: s.name,
      board: s.board,
      elementCount: s.elements.length,
      createdAt: s.createdAt
    }));

    res.json({
      success: true,
      snapshots: list,
      count: list.length
    });
  } catch (error) {
    logger.error('Error listing snapshots:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Snapshots: get by name
app.get('/api/snapshots/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const snapshot = snapshots.get(name!);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: `Snapshot "${name}" not found`
      });
    }

    res.json({
      success: true,
      snapshot
    });
  } catch (error) {
    logger.error('Error fetching snapshot:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// ─── Boards ───────────────────────────────────────────────────
//
// A board is a named diagram persisted as one .excalidraw.md note in the vault
// (ADR 0004). The canvas holds exactly one at a time, so these routes are how
// that one gets swapped: open reads a note into the store and points the canvas
// at it, save writes the store back out.
//
// WRITES ARE CHECKED, NOT LOCKED (ADR 0006). archboard records the sha-256 of a
// note's bytes when it reads it, and verifies that hash against the destination
// before it writes. If the two differ, the file changed underneath — Obsidian,
// a sync client, another editor — and the save is refused with nothing written,
// because an Excalidraw scene cannot be merged and overwriting would delete
// work nobody was told about. Deliberately not locking and deliberately not
// reloading: two writers can still both hold the board, and the human picks
// which copy survives.

const BoardAddressSchema = z.object({
  board: z.string().min(1),
  variant: z.string().optional(),
  level: z.string().optional()
});

// A board address as callers write it: "payments", "payments@proposed", or a
// name plus an explicit variant. The key form is what a human says and what
// `board list` prints, so it is accepted everywhere a board is named.
function identityFromParams(params: { board: string; variant?: string; level?: string }): BoardIdentity {
  const base = params.variant
    ? makeIdentity({ board: params.board, variant: params.variant })
    : parseBoardKey(params.board);
  return { ...base, ...(params.level ? { level: validateLevel(params.level) } : {}) };
}

function identityResponse(key: string, board: BoardState) {
  return {
    board: key,
    identity: board.identity,
    elementCount: board.elements.size,
    vaultBacked: board.vaultBacked,
    ...(board.file ? { file: board.file } : {}),
    ...(board.savedAt ? { savedAt: board.savedAt } : {}),
    ...(board.loadedAt ? { loadedAt: board.loadedAt } : {})
  };
}

// Point the canvas at a board and tell every client to swap. Sends the whole
// scene rather than a delta: nothing about the old board's elements helps
// render the new one.
function switchCanvasTo(key: string): BoardState {
  const board = setActiveBoard(key);
  // A board arriving wholesale is not a change anybody made, so the feed takes
  // the new state as its baseline rather than reporting several hundred
  // additions and burying the first real edit under them.
  changeFeed.reset(key, board.identity, () => Array.from(board.elements.values()));
  // The selection belongs to the board that was on screen; it means nothing on
  // the new one. Every pane is about to be shown the new board, so no pane's
  // selection survives either.
  selectionState.byClient.clear();
  if (selectionState.current) {
    selectionState.current = null;
  }
  broadcast({
    type: 'board_switched',
    identity: board.identity,
    elements: Array.from(board.elements.values()),
    timestamp: new Date().toISOString()
  }, key);
  broadcastSelection();
  return board;
}

// Take a scene's elements into a board's store. Mirrors the batch-create path
// (ids preserved, server metadata stamped) so a loaded board behaves exactly
// like one that was drawn.
function ingestSceneElements(board: BoardState, sceneElements: any[]): number {
  board.elements.clear();
  const loaded: ServerElement[] = [];
  for (const raw of sceneElements) {
    if (!raw || typeof raw !== 'object') continue;
    const element: ServerElement = {
      ...raw,
      id: raw.id || generateId(),
      createdAt: raw.createdAt ?? new Date().toISOString(),
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      version: raw.version ?? 1
    };
    loaded.push(element);
  }
  loaded.forEach(el => board.elements.set(el.id, el));
  return loaded.length;
}

// What exists: every board in the vault, plus the ones open in this process.
app.get('/api/boards', (_req: Request, res: Response) => {
  try {
    const vault = requireVaultRoot();
    res.json({
      success: true,
      vault,
      boards: listBoards(vault),
      open: boardSummaries(),
      active: activeBoardKey()
    });
  } catch (error) {
    logger.error('Error listing boards:', error);
    res.status(boardErrorStatus(error)).json({ success: false, error: (error as Error).message });
  }
});

// Which board the canvas is holding.
app.get('/api/boards/current', (_req: Request, res: Response) => {
  res.json({ success: true, ...identityResponse(activeBoardKey(), activeBoard()) });
});

// Open a board from the vault onto the canvas.
app.post('/api/boards/open', (req: Request, res: Response) => {
  try {
    const params = BoardAddressSchema.extend({ reload: z.boolean().optional() }).parse(req.body ?? {});
    const asked = identityFromParams(params);
    const key = boardKey(asked);

    // A board already open keeps whatever unsaved work it has: switching away
    // and back must not be a way to silently lose edits. reload is the explicit
    // "throw mine away, take the file's".
    if (boards.has(key) && !params.reload) {
      const board = switchCanvasTo(key);
      return res.json({ success: true, ...identityResponse(key, board), source: 'memory' });
    }

    const loaded = readBoardFile(asked);
    if (!loaded) {
      return res.status(404).json({
        success: false,
        error:
          `No board "${key}" in the vault at ${requireVaultRoot()}. ` +
          `Run \`board list\` to see what is there, or \`board new ${key}\` to start it.`
      });
    }

    const scene = JSON.parse(loaded.sceneJson);
    // The note's level wins unless the caller stated one — opening a board is
    // not usually a claim about what level it sits at.
    const { key: openedKey, board } = getOrCreateBoard(
      { ...loaded.identity, ...(asked.level ? { level: asked.level } : {}) },
      true
    );
    const count = ingestSceneElements(board, Array.isArray(scene) ? scene : (scene.elements ?? []));
    board.file = loaded.file;
    board.note = loaded.raw;
    // The bytes just read are the baseline the next save is checked against.
    recordBaseline(board, loaded.file, loaded.hash);
    board.loadedAt = new Date().toISOString();
    switchCanvasTo(openedKey);

    logger.info(`Board opened: "${openedKey}" (${count} elements) from ${loaded.file}`);
    res.json({
      success: true,
      ...identityResponse(openedKey, board),
      source: 'vault',
      ...(loaded.declaredKey ? { declaredKey: loaded.declaredKey } : {})
    });
  } catch (error) {
    logger.error('Error opening board:', error);
    res.status(boardErrorStatus(error)).json({ success: false, error: (error as Error).message });
  }
});

// Start a new, empty board. It exists in memory only until it is saved.
app.post('/api/boards/new', (req: Request, res: Response) => {
  try {
    const identity = identityFromParams(BoardAddressSchema.parse(req.body ?? {}));
    const key = boardKey(identity);
    if (boards.has(key)) {
      return res.status(409).json({
        success: false,
        error: `Board "${key}" is already open. Switch to it with \`board open ${key}\`.`
      });
    }
    if (fs.existsSync(vaultPathFor(identity))) {
      return res.status(409).json({
        success: false,
        error: `Board "${key}" already exists in the vault. Open it instead, or choose another name or variant.`
      });
    }

    const { key: newKey, board } = getOrCreateBoard(identity, true);
    board.file = vaultPathFor(identity);
    switchCanvasTo(newKey);
    logger.info(`Board created: "${newKey}" (empty, unsaved)`);
    res.json({ success: true, ...identityResponse(newKey, board), created: true, saved: false });
  } catch (error) {
    logger.error('Error creating board:', error);
    res.status(boardErrorStatus(error)).json({ success: false, error: (error as Error).message });
  }
});

// Write a board to the vault. With no address it saves the board the canvas is
// holding under its own identity; with one it saves as that board instead
// (which is also how the scratch board gets a name).
app.post('/api/boards/save', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const source = boardFromRequest(req);
    const sourceBoard = source.board;
    // The human's "overwrite it anyway" — one of the three outcomes a conflict
    // offers. Never set by archboard on its own behalf.
    const force = body.force === true;

    // With a name, this is a save-as; without one, the board keeps its own
    // identity and only the fields actually passed are changed.
    const target: BoardIdentity = body.name
      ? identityFromParams({ board: String(body.name), variant: body.variant, level: body.level })
      : {
        ...sourceBoard.identity,
        ...(body.variant ? { variant: validateVariant(String(body.variant)) } : {}),
        ...(body.level ? { level: validateLevel(String(body.level)) } : {})
      };

    if (!sourceBoard.vaultBacked && !body.name) {
      return res.status(400).json({
        success: false,
        error:
          'The canvas is holding the scratch board, which has no home in the vault. ' +
          'Give it a name to save it: `board save --as <name>`.'
      });
    }

    const file = vaultPathFor(target);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // Read the destination as it is NOW, for two jobs at once: its frontmatter
    // and prose are carried into the note being written, and its hash is what
    // the baseline is checked against.
    let destination: Buffer | undefined;
    try {
      destination = fs.readFileSync(file);
    } catch { /* nothing there: nothing to conflict with */ }
    const existingNote = destination?.toString('utf-8');
    const overwrote = destination !== undefined;

    // The check. A file at the destination has to be one archboard has already
    // seen — the copy it read at open, or the copy it wrote at the last save.
    // Anything else is somebody else's work, and there is no merge for it.
    const expected = baselineForFile(file);
    if (destination && !force) {
      const actualHash = hashBoardBytes(destination);
      if (!expected || expected.hash !== actualHash) {
        const conflict = describeWriteConflict({
          target,
          file,
          reason: expected ? 'changed' : 'unseen',
          ...(expected ? { expectedHash: expected.hash, lastReadAt: expected.at } : {}),
          actualHash,
          fileModifiedAt: fs.statSync(file).mtime.toISOString(),
          saveCommand: body.name ? `board save --as ${boardKey(target)}` : 'board save'
        });
        logger.warn(`Board save refused: "${boardKey(target)}" changed underneath archboard at ${file}`);
        return res.status(409).json({ success: false, error: conflict.message, conflict });
      }
    }

    const filesObj: Record<string, ExcalidrawFile> = {};
    files.forEach((f, id) => { filesObj[id] = f; });
    const { scene, elementCount } = buildScene(
      Array.from(sourceBoard.elements.values()),
      filesObj as unknown as Record<string, any>
    );
    const note = renderBoardNote(scene, existingNote, target);
    const bytes = Buffer.from(note, 'utf-8');
    fs.writeFileSync(file, bytes);

    // The board is now that board: saving under a new name renames it in the
    // store too, so the next save goes to the same place.
    const targetKey = boardKey(target);
    const wasActive = source.key === activeBoardKey();
    const { board: savedBoard } = getOrCreateBoard(target, true);
    if (targetKey !== source.key) {
      savedBoard.elements.clear();
      sourceBoard.elements.forEach((el, id) => savedBoard.elements.set(id, el));
    }
    savedBoard.file = file;
    savedBoard.note = note;
    // What archboard has now seen at this path is what it just wrote.
    recordBaseline(savedBoard, file, hashBoardBytes(bytes));
    savedBoard.savedAt = new Date().toISOString();
    if (wasActive && targetKey !== source.key) switchCanvasTo(targetKey);

    logger.info(`Board saved: "${targetKey}" (${elementCount} elements) -> ${file}`);
    res.json({
      success: true,
      ...identityResponse(targetKey, savedBoard),
      file,
      elements: elementCount,
      overwrote,
      ...(force && overwrote ? { forced: true } : {})
    });
  } catch (error) {
    logger.error('Error saving board:', error);
    res.status(boardErrorStatus(error)).json({ success: false, error: (error as Error).message });
  }
});

// ─── Compare ──────────────────────────────────────────────────
//
// A structured semantic diff between two variants, joined on node identity
// (src/core/compare.ts). Read-only in the strictest sense: comparing two boards
// must never disturb the one on screen, so this neither opens a board, nor
// registers one in the store, nor records a baseline, nor moves the active
// pointer. A side that happens to be open is read out of memory — that copy is
// the truth, unsaved work included — and a side that is not is read straight
// off disk and thrown away. Which of the two happened is reported per side,
// because they can disagree and the human needs to know which they were told
// about.

function loadSideForCompare(key: string): CompareSideInput | null {
  const live = boards.get(key);
  if (live) {
    return {
      key,
      identity: live.identity,
      elements: Array.from(live.elements.values()).filter(el => !el.isDeleted),
      source: 'memory',
      ...(live.file ? { file: live.file } : {}),
      active: key === activeBoardKey(),
      ...(live.savedAt ? { savedAt: live.savedAt } : {}),
      ...(live.loadedAt ? { loadedAt: live.loadedAt } : {})
    };
  }
  const identity = parseBoardKey(key);
  const loaded = readBoardFile(identity);
  if (!loaded) return null;
  const scene = JSON.parse(loaded.sceneJson);
  const raw: any[] = Array.isArray(scene) ? scene : (scene.elements ?? []);
  return {
    key,
    identity: loaded.identity,
    elements: raw.filter(el => el && typeof el === 'object' && !el.isDeleted) as ServerElement[],
    source: 'vault',
    file: loaded.file,
    active: false
  };
}

// Every address that exists for a board name — in the vault and in this
// session — so a one-sided `compare payments` can find the other side and, when
// it cannot, say what there was to choose from.
function addressesFor(boardName: string): string[] {
  const keys = new Set<string>();
  try {
    for (const found of listBoards()) {
      if (found.identity.board === boardName) keys.add(found.key);
    }
  } catch { /* no vault: the open boards are still an answer */ }
  for (const [key, state] of boards) {
    if (state.identity.board === boardName) keys.add(key);
  }
  return [...keys].sort();
}

app.get('/api/boards/compare', (req: Request, res: Response) => {
  try {
    const fromParam = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    if (!fromParam) {
      return res.status(400).json({ success: false, error: 'compare needs at least one board: ?from=payments' });
    }
    const fromIdentity = parseBoardKey(fromParam);
    let fromKey = boardKey(fromIdentity);
    let toKey = typeof req.query.to === 'string' && req.query.to.trim()
      ? boardKey(parseBoardKey(req.query.to.trim()))
      : '';

    // One address given: find the other side among that board's variants.
    // `current` is privileged, so whenever it exists it is the `from` side —
    // the diff reads "what the proposal changes about the architecture that
    // exists", never the reverse.
    if (!toKey) {
      const siblings = addressesFor(fromIdentity.board).filter(k => k !== fromKey);
      if (siblings.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            `"${fromKey}" has no other variant to compare against. A variant is a separate note ` +
            `(${fromIdentity.board}@option-a.excalidraw.md); author one with ` +
            `\`board new ${fromIdentity.board}@option-a\`, or name both sides: ` +
            '`compare <from> <to>`.'
        });
      }
      if (siblings.length > 1) {
        return res.status(400).json({
          success: false,
          error:
            `"${fromIdentity.board}" has ${siblings.length} variants — ${siblings.join(', ')} — so which ` +
            'two to compare is not obvious. Name both sides: `compare <from> <to>`.',
          variants: [fromKey, ...siblings].sort()
        });
      }
      const other = siblings[0]!;
      if (fromIdentity.variant === CURRENT_VARIANT) {
        toKey = other;
      } else {
        // The given side is a proposal and the only other one is what it is a
        // proposal against, so it reads current -> proposal.
        toKey = fromKey;
        fromKey = other;
      }
    }

    if (fromKey === toKey) {
      return res.status(400).json({
        success: false,
        error: `Both sides name the same board ("${fromKey}"), so there is nothing to compare.`
      });
    }

    const missing: string[] = [];
    const from = loadSideForCompare(fromKey);
    if (!from) missing.push(fromKey);
    const to = loadSideForCompare(toKey);
    if (!to) missing.push(toKey);
    if (missing.length > 0 || !from || !to) {
      const board = missing[0] ? parseBoardKey(missing[0]).board : fromIdentity.board;
      const available = addressesFor(board);
      return res.status(404).json({
        success: false,
        error:
          `No board ${missing.map(m => `"${m}"`).join(' or ')} in the vault at ${requireVaultRoot()}` +
          (available.length
            ? `. What exists under "${board}": ${available.join(', ')}.`
            : `, and nothing exists under "${board}" at all.`) +
          ' Run `board list` to see everything.',
        missing
      });
    }

    const result = compareBoards(from, to);
    if (from.identity.board !== to.identity.board) {
      result.warnings.unshift(
        `"${fromKey}" and "${toKey}" are different boards, not two variants of one. They still compare — ` +
        'node ids are the join key either way — but node ids are only guaranteed unique per board, so a ' +
        'match here may be coincidence rather than the same architectural unit.'
      );
    }
    logger.info(
      `Compared "${fromKey}" (${from.source}) against "${toKey}" (${to.source}): ` +
      `+${result.summary.nodesAdded} -${result.summary.nodesRemoved} ~${result.summary.nodesChanged} nodes`
    );
    res.json(result);
  } catch (error) {
    logger.error('Error comparing boards:', error);
    res.status(boardErrorStatus(error)).json({ success: false, error: (error as Error).message });
  }
});

// Serve the frontend
app.get('/', (req: Request, res: Response) => {
  const htmlFile = path.join(__dirname, '../dist/frontend/index.html');
  res.sendFile(htmlFile, (err) => {
    if (err) {
      logger.error('Error serving frontend:', err);
      res.status(404).send('Frontend not found. Please run "npm run build" first.');
    }
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    elements_count: activeBoard().elements.size,
    board: activeBoardKey(),
    websocket_clients: clients.size,
    // Identity for `stop`: it must only ever signal a process that both
    // identifies as this service AND self-reports its pid — never a pid
    // from a stale pidfile or an unrelated app squatting on the port.
    service: 'mcp-excalidraw-canvas',
    pid: process.pid
  });
});

// Sync status endpoint
app.get('/api/sync/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    board: activeBoardKey(),
    elementCount: activeBoard().elements.size,
    timestamp: new Date().toISOString(),
    memoryUsage: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
    },
    websocketClients: clients.size
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const LOOPBACK_GUARD_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];

function formatHostForUrl(host: string): string {
  return host.includes(':') ? `[${host}]` : host;
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (isOpen: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(isOpen);
    };

    socket.setTimeout(250);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function findExistingLoopbackListener(port: number): Promise<string | null> {
  for (const host of LOOPBACK_ADDRESSES) {
    if (await canConnect(host, port)) {
      return host;
    }
  }
  return null;
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    const address = (error as NodeJS.ErrnoException & { address?: string }).address || HOST;
    logger.error(`Canvas server port ${PORT} is already in use on ${formatHostForUrl(address)}.`);
  } else if (error.code === 'EACCES') {
    logger.error(`Canvas server cannot bind ${formatHostForUrl(HOST)}:${PORT}: permission denied.`);
  } else {
    logger.error('Failed to start canvas server:', error);
  }
  process.exit(1);
});

async function startServer(): Promise<void> {
  if (LOOPBACK_GUARD_HOSTS.has(HOST)) {
    const existingHost = await findExistingLoopbackListener(PORT);
    if (existingHost) {
      logger.error(
        `Refusing to start canvas server on ${formatHostForUrl(HOST)}:${PORT}: ` +
        `${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
        'This prevents duplicate IPv4/IPv6 canvas servers from splitting state.'
      );
      process.exit(1);
    }
  }

  // Only the process that actually wrote the pidfile may remove it —
  // a concurrent-start loser exiting on EADDRINUSE must not delete the
  // winner's pidfile.
  let ownsPidFile = false;

  server.listen(PORT, HOST, () => {
    const hostForUrl = formatHostForUrl(HOST);
    logger.info(`POC server running on http://${hostForUrl}:${PORT}`);
    logger.info(`WebSocket server running on ws://${hostForUrl}:${PORT}`);

    // Written only after listen succeeds so stale files can't shadow a
    // server that never came up; lets `archboard stop` find us.
    writePidFile(PORT, process.pid);
    ownsPidFile = true;

    // Injection is armed here, with the address actually bound, and only here:
    // whether the canvas may drive a coding agent depends on where it can be
    // reached from, which is not known before this point (ADR 0005).
    startInjection(HOST);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, shutting down canvas server`);
    if (ownsPidFile) removePidFile(PORT);
    server.close(() => process.exit(0));
    // Force-exit if open sockets keep the server from closing promptly
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('exit', () => {
    if (ownsPidFile) removePidFile(PORT);
  });
}

// Start the canvas server only when this file is the process entry point
// (`node dist/server.js`, `npm run canvas`, or spawned by the CLI/MCP
// auto-start). Importing this module must never start the server.
if (isMainModule(import.meta.url)) {
  void startServer();
}

export { startServer };
export default app;
