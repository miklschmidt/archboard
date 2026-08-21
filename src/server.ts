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
  snapshots,
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
import { IdsInUse, mintId } from './core/ids.js';
import { buildSelectionReport } from './core/describe.js';
import {
  buildPanesReport,
  MAX_PANES,
  PaneRegistration,
  panesInOrder,
  paneWords,
  resolvePaneSpec,
  soloPane
} from './core/panes.js';
import { BoardRequiredError } from './core/board-target.js';
import { z } from 'zod';
import WebSocket from 'ws';
import { isMainModule } from './core/entry.js';
import { kept } from './core/hot.js';
import { askForReload, reloadIsAskable } from './core/reload-token.js';
import { writePidFile, removePidFile } from './core/pidfile.js';
import fs from 'fs';
import {
  BoardState,
  boardSummaries,
  boards,
  copyElements,
  getOrCreateBoard,
  recordBaseline,
  resolveBoard,
  openBoardKeys,
  SCRATCH_KEY
} from './core/board-store.js';
import {
  BoardContent,
  BoardWriteConflictError,
  emptyContent,
  ingestScene,
  LoadedBoard,
  readBoardContent,
  readBoardFile,
  renderContent,
  writeBoardContent
} from './core/board-io.js';
import {
  BoardIdentity,
  boardKey,
  classifyBoardSave,
  hashBoardBytes,
  listBoards,
  makeIdentity,
  SCRATCH_BOARD,
  panesFollowSave,
  parseBoardKey,
  requireVaultRoot,
  validateLevel,
  validateVariant,
  vaultPathFor
} from './core/board.js';
import { ARCHBOARD_VAULT, noVaultMessage } from './core/config.js';
import { CURRENT_VARIANT } from './core/board.js';
import { restampVariant } from './core/promote.js';
import { boardsForRepo } from './core/repo-boards.js';
import { CompareSideInput, compareBoards } from './core/compare.js';
import { ChangeOrigin, changeFeed } from './core/change-feed.js';
import type { ChangeEvent } from './core/change-feed.js';
import { PANE_LAYOUT_TIMEOUT_MS, PANE_SETTLE_CAP_MS } from './core/timing.js';
import { narrateChange } from './core/changes.js';
import { injectTest, injectionStatus, startInjection } from './core/injection.js';
import { LibraryItem, readLibrary, writeLibrary } from './core/library.js';
import { recentreBoundTexts } from './core/labels.js';
import {
  expandForBoard, relabelBoundTexts, repairIndices, settleDeletions
} from './core/expand-elements.js';
import { overlapsRegion, remeasureLinear } from './core/geometry.js';
import { frontendState, sourceState } from './core/staleness.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// The port and the sockets on it are made once per process and reused across a
// hot reload; the routes and handlers on them are replaced every time this file
// is re-evaluated (ADR 0014).
//
// That split is the whole trick. A tab's WebSocket belongs to `wss`, which
// belongs to `server`, so rebuilding either would disconnect every pane on the
// wall — and a pane that reconnects has to be told what it holds all over
// again. Binding again would fail on EADDRINUSE against ourselves, which the
// loopback guard would read as a second canvas and exit over.
//
// So `server` is created with a dispatcher that looks up the current express
// app rather than being handed one, and each reload points `wiring.app` at the
// app it just built.
interface Wiring {
  app: express.Express;
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  /** Set once the port is bound, so a reload does not try to bind it again. */
  listening: boolean;
  /** Set once the signal and exit handlers are on `process`. */
  signalsBound: boolean;
}

const wiring = kept<Wiring>('http', () => {
  const state = { listening: false, signalsBound: false } as Wiring;
  state.server = createServer((req, res) => state.app(req, res));
  state.wss = new WebSocketServer({ server: state.server });
  return state;
});
wiring.app = app;
const server = wiring.server;
const wss = wiring.wss;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the frontend bundle, and only that.
//
// This used to mount `../dist` as well, which meant whatever a build tool had
// left in that directory was reachable over http by path. Under ADR 0014 vite
// writes nothing but `dist/frontend`, so today that mount adds nothing. But a
// checkout from before ADR 0014 still has a compiled server, CLI and every core
// module sitting in `dist/`, and the broad mount served all of it. What is
// reachable is now this line's decision rather than a build tool's.
// `scripts/check-local-bind.mjs` plants a file in `dist/` and checks it 404s.
app.use(express.static(path.join(__dirname, '../dist/frontend')));
// Serve Excalidraw fonts so the font subsetting worker can fetch them for export
app.use('/assets/fonts', express.static(
  path.join(__dirname, '../node_modules/@excalidraw/excalidraw/dist/prod/fonts')
));

// WebSocket connections.
//
// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because ADR 0015 says
// the note is the board and the canvas holds no copy of one. Three kinds of
// thing survive that, and the test is which question each answers.
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneBoards`, `selectionState`, the four
// `pending*` maps and `wiring`. None of it can live in a note, all of it dies
// with the tab, and a reading of ADR 0015 that forbade it would be
// unimplementable — which is why the ADR names it.
//
// A record of what a board used to be answers "how did it stand then": the
// change feed's baseline and checkpoints (`src/core/change-feed.ts`) and
// `snapshots` (`src/types.ts`). Each carries its own reasoning; the short form
// is that the vault has never held a board's past and so statelessness does not
// move them anywhere.
//
// Where each board's note is answers "which boards does this canvas have open"
// (`src/core/board-store.ts`). That is a fact about this process, like which
// pane has focus, and the note has nowhere to put it.
//
// Nothing else. Anything that answers "what is on this board" is the note.
//
// Everything from here to `paneBoards` is kept across a hot reload, because it
// describes what is on screen right now: the sockets themselves, which pane is
// which, and what each one holds. A reload that rebuilt these would leave the
// tabs connected to a server that had forgotten them.
const clients = kept('ws-clients', () => new Set<WebSocket>());
// Browser client id per socket, taken from the ?clientId= connect param. The
// same id is sent with every selection post, which is what lets a disconnect
// retire that client's selection.
const clientIds = kept('ws-client-ids', () => new Map<WebSocket, string>());

// What is on screen right now, one entry per pane, keyed by the same client id.
// A pane is in here only while its socket is open: closing a tab or unsplitting
// takes the registration with it, so `panes` can never report a pane that is no
// longer in front of anybody. Empty is the normal headless state.
const panes = kept('panes', () => new Map<string, PaneRegistration>());

// Which board each pane has been pointed at, keyed by client id.
//
// This is the *authority*: what the server has decided a pane holds. The
// registration above carries what the pane says it is rendering, which is the
// same thing a beat later, and reporting the pane's own answer is what keeps
// `panes` a description of the glass rather than a restatement of this map.
//
// Entries outlive the socket on purpose. A dropped connection reconnects with
// the same client id, and a pane that came back showing a different board than
// it had a second ago would undo an arrangement the human made by hand.
const paneBoards = kept('pane-boards', () => new Map<string, string>());

/** What each pane holds, in reading order. */
function boardsOnScreen(): Array<{ paneId: string; place: string; board: string }> {
  return panesInOrder(Array.from(panes.values())).map(entry => ({
    paneId: entry.pane.paneId,
    place: entry.place,
    board: paneBoards.get(entry.pane.clientId) ?? entry.pane.board
  }));
}

/** The live sockets belonging to one pane. */
function socketsFor(clientId: string): WebSocket[] {
  const found: WebSocket[] = [];
  clientIds.forEach((id, socket) => {
    if (id === clientId && socket.readyState === WebSocket.OPEN) found.push(socket);
  });
  return found;
}

// Broadcast to all connected clients.
//
// The board key is not optional: a client showing board A has to be able to
// drop a message about board B rather than merge it into what it is rendering.
// With two panes on two boards that filter stops being a formality — it is the
// only thing keeping an edit on one board out of the other one's scene.
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

// Send to one pane, named by client id.
//
// A board switch is the message this exists for: it replaces the receiving
// pane's whole scene, so sending it to every socket is how one pane's `board
// open` used to drag the other pane along with it.
function sendToPane(clientId: string, message: WebSocketMessage, board: string): boolean {
  return deliverToPane(clientId, JSON.stringify({ ...message, board }));
}

// Send one pane something that is about the pane itself rather than about a
// board: open another one, close this one. Layout is not board news — the
// receiving pane keeps whatever board it is holding — so stamping a board key
// on it would be inventing one. Kept separate from sendToPane so that omitting
// the board stays a deliberate act rather than a missing argument.
function sendLayoutToPane(clientId: string, message: WebSocketMessage): boolean {
  return deliverToPane(clientId, JSON.stringify(message));
}

function deliverToPane(clientId: string, data: string): boolean {
  let delivered = false;
  for (const socket of socketsFor(clientId)) {
    try {
      socket.send(data);
      delivered = true;
    } catch {
      logger.warn('Failed to send to a pane, removing');
      clients.delete(socket);
    }
  }
  return delivered;
}

// Broadcast something that is not about a board.
//
// Only the library qualifies today: it is one palette behind every board, so a
// client applies it without asking which board the message came from. Kept
// separate from broadcast() so that omitting the board key stays a deliberate
// act rather than a missing argument.
function broadcastBoardless(message: WebSocketMessage): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    try {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    } catch {
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
  changeFeed.record(key, board.identity, () => boardElements(board), origin);
}

/**
 * A board's elements, read out of its note.
 *
 * The one answer to "what is on this board", for everything that is not a
 * request working against content it already read: the change feed at the end
 * of a settle window, a pane being handed a board, the report of what each pane
 * holds. Each is a fresh read, which is what makes them agree with the note
 * rather than with a copy of it that stopped being right at some point nobody
 * noticed (ADR 0015).
 */
function boardElements(board: BoardState): ServerElement[] {
  return Array.from(readBoardContent(board).elements.values());
}

/** How many elements a board has, for a summary that does not need them all. */
function boardElementCount(board: BoardState): number {
  return readBoardContent(board).elements.size;
}

/**
 * A board went somewhere: into the vault, and then into the feed.
 *
 * Every mutating route ends here, and the order is the point. The note is
 * written first, so a broadcast or a response describing a board is describing
 * one that exists; a refused write throws before either, leaving the panes
 * holding what they had (ADR 0006). The feed is told afterwards because it
 * measures settled boards rather than deltas, and the board has only settled
 * once it is on disk.
 *
 * Synchronous, deliberately. Express runs a synchronous handler to completion
 * before starting the next, so two writes to one board cannot interleave their
 * read-modify-write cycles; an `await` between the read at the top of a request
 * and this call would open exactly that window. Keeping a *second process* out
 * is the board mutex's job (ADR 0016), not this one's.
 */
function persistBoard(
  key: string,
  board: BoardState,
  content: BoardContent,
  origin: ChangeOrigin
): void {
  writeBoardContent(board, content);
  board.savedAt = new Date().toISOString();
  noteChange(key, board, origin);
}

function normalizeLineBreakMarkup(text: string): string {
  return text
    .replace(/<\s*b\s*r\s*\/?\s*>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Which board a request is about, and what is on it. `?board=` or a `board`
// field in the body — and one of them has to be there. A request that names no
// board is refused (ADR 0009); `what` is the name of the operation, so the
// refusal can say what it was that needed a board.
//
// The note is read here, once, and the request works against what it read. That
// read is what makes the vault the truth (ADR 0015): there is no map to consult
// instead, so the answer cannot be a copy that stopped agreeing with the note.
function boardFromRequest(
  req: Request,
  what?: string
): { key: string; board: BoardState; content: BoardContent } {
  const fromQuery = typeof req.query.board === 'string' ? req.query.board : undefined;
  const fromBody = req.body && typeof req.body === 'object' && typeof req.body.board === 'string'
    ? req.body.board as string
    : undefined;
  const { key, board } = resolveBoard(fromQuery ?? fromBody, what);
  return { key, board, content: readBoardContent(board) };
}

// A board that was not named, or was named and is not open, is a client error
// rather than a server fault.
function boardErrorStatus(error: unknown): number {
  if (error instanceof BoardRequiredError) return error.status;
  // A refused write is not a fault, it is the other outcome the write always
  // had (ADR 0006). Every route that writes can now produce it, because every
  // write goes to the note (ADR 0015), so it is answered here once rather than
  // in each of them.
  if (error instanceof BoardWriteConflictError) return 409;
  return /is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault|No pane called|matches \d+ panes|No pane is open|needs a pane/.test(
    (error as Error).message
  ) ? 400 : 500;
}

// The refusal, as a body. Carries the open boards as data so a caller can act
// on it without parsing the sentence.
function boardErrorBody(error: unknown): Record<string, unknown> {
  const base = { success: false, error: (error as Error).message };
  if (error instanceof BoardRequiredError) {
    return { ...base, code: error.code, open: error.open };
  }
  // The three outcomes as data, so a surface offers them rather than rewording
  // them. Which one the human picks is never archboard's to choose.
  if (error instanceof BoardWriteConflictError) {
    return { ...base, conflict: error.conflict };
  }
  return base;
}

/**
 * What a pane opening for the first time should show.
 *
 * A split is "another look at what I am working on", so a new pane starts on
 * whatever is already in front of the human and is then pointed somewhere else
 * deliberately. With nothing on screen there is nothing to copy, and the
 * server's active board — the last one opened — is the only answer available.
 */
function boardForNewPane(clientId: string): string {
  const remembered = paneBoards.get(clientId);
  if (remembered && boards.has(remembered)) return remembered;
  const existing = Array.from(panes.values());
  const reference = existing.find(pane => pane.primary) ?? existing.find(pane => pane.focused) ?? existing[0];
  const key = reference ? paneBoards.get(reference.clientId) ?? reference.board : null;
  return key && boards.has(key) ? key : SCRATCH_KEY;
}

/**
 * A board's images, in the shape a scene message carries them, or nothing when
 * it has none.
 *
 * Every frame that hands a pane a whole board — the first one, and every board
 * switch — has to bring the images with it, because an image element without
 * its file renders as a hole. `board_switched` used to bring none at all, so a
 * pane pointed at a board with pictures on it got the elements and no pictures
 * (TASK-060).
 */
function boardFilesMessage(content: BoardContent): { files?: Record<string, ExcalidrawFile> } {
  if (content.files.size === 0) return {};
  const filesObj: Record<string, ExcalidrawFile> = {};
  content.files.forEach((file, id) => { filesObj[id] = file; });
  return { files: filesObj };
}

// WebSocket connection handling.
//
// The listener is replaced rather than added, because `wss` outlives a hot
// reload and a second registration would answer every connection twice.
wss.removeAllListeners('connection');
wss.on('connection', (ws: WebSocket, req) => {
  clients.add(ws);
  const clientId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('clientId');
  if (clientId) clientIds.set(ws, clientId);
  logger.info(`New WebSocket connection established${clientId ? ` (client ${clientId})` : ''}`);

  // Which board this pane gets, and it is a board *for this pane* — not "the"
  // board, which no longer exists as a single thing. A pane that has been here
  // before (a dropped socket, not a new tab) resumes what it was holding,
  // because a reconnect must not undo an arrangement the human made by hand.
  const startingKey = clientId ? boardForNewPane(clientId) : SCRATCH_KEY;
  if (clientId) paneBoards.set(clientId, startingKey);
  const board = boards.get(startingKey)!;
  // Read out of the note, like everything else that hands a pane a whole board.
  const content = readBoardContent(board);
  const initialMessage: InitialElementsMessage & {
    files?: Record<string, ExcalidrawFile>;
    identity: BoardIdentity;
  } = {
    type: 'initial_elements',
    board: startingKey,
    identity: board.identity,
    elements: Array.from(content.elements.values()),
    ...boardFilesMessage(content)
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
      // taken out of the shell. Reporting it would be reporting a ghost.
      panes.delete(closingId);
      // And if somebody asked for that pane to go, this is the proof it did.
      notePaneClosed(closingId);
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
    const { key, content } = boardFromRequest(req, 'Listing elements');
    const elementsArray = Array.from(content.elements.values());
    res.json({
      success: true,
      board: key,
      elements: elementsArray,
      count: elementsArray.length
    });
  } catch (error) {
    logger.error('Error fetching elements:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Create new element
app.post('/api/elements', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'Creating an element');
    const elements = content.elements;
    // Prioritize passed ID (for MCP sync), otherwise generate new ID
    const element = buildCreatedElement(req.body, elements);
    const id = element.id;
    logger.info('Creating element via API', { type: element.type, board: boardKeyForRequest });

    // Resolve arrow bindings against existing elements
    if (element.type === 'arrow' || element.type === 'line') {
      resolveArrowBindings([element], elements);
    }
    sizeFromPath(element);

    // Converted here, because here is the boundary: a label becomes its text
    // element before the board holds either of them.
    const written = expandForBoard([element], elements);
    for (const el of written) elements.set(el.id, el);
    // z-order for whatever was just made, so the board holds a document the
    // renderer does not have to repair (TASK-074).
    const madeIds = new Set(written.map(el => el.id));
    const repaired = repairIndices(elements).filter(el => !madeIds.has(el.id));
    const stored = elements.get(id) as ServerElement;

    // Into the note before anybody is told about it, so nothing is broadcast
    // that the vault does not hold (ADR 0015). A refused write throws here.
    persistBoard(boardKeyForRequest, board, content, 'agent');

    // Broadcast to all connected clients
    for (const el of written) {
      broadcast({
        type: 'element_created',
        element: elements.get(el.id) ?? el
      } as ElementCreatedMessage, boardKeyForRequest);
    }
    for (const el of repaired) {
      broadcast({ type: 'element_updated', element: el } as ElementUpdatedMessage, boardKeyForRequest);
    }

    res.json({
      success: true,
      board: boardKeyForRequest,
      element: stored,
      // `element` is what the caller asked for; `elements` is what the board
      // became, label and z-order included (TASK-075).
      ...agentWriteAnswer(
        board,
        content,
        [...written.map(el => elements.get(el.id) ?? el), ...repaired],
        wantsDocument(req)
      )
    });
  } catch (error) {
    logger.error('Error creating element:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Update element
app.put('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'Updating an element');
    const elements = content.elements;
    const { id } = req.params;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

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

    // One element's worth of the same write a batched report performs, so the
    // two sizes of write cannot drift apart (see mergeElementUpdate).
    const { element: updatedElement, geometryChanged, reboundArrow } =
      mergeElementUpdate(existingElement, body);

    elements.set(id, updatedElement);
    if (reboundArrow) resolveArrowBindings([updatedElement], elements);

    // A label this write states is either a rename of the text element that
    // already carries it, or one that has to be expanded. Either way the
    // element the board keeps is the converted one, seed consumed and gone —
    // this route used to keep the merge and store only what the conversion
    // added, which left the seed on the board for the next write to read
    // (TASK-073).
    const restated = restateLabels([updatedElement], elements);
    const written = expandForBoard([updatedElement], elements);
    for (const el of written) elements.set(el.id, el);
    const expanded = written.filter(el => el.id !== id);
    const namedIds = new Set([id, ...restated.map(el => el.id), ...expanded.map(el => el.id)]);
    const repaired = repairIndices(elements).filter(el => !namedIds.has(el.id));

    // Whatever moved, its label moves with it: the element itself, and — when a
    // shape moved — every arrow the server dragged along behind it. A label
    // that was just re-measured has moved too, by half the change in its width.
    //
    // Settled before the write rather than after the broadcasts, because these
    // are part of what the board became and the note has to hold them.
    const consequences = geometryChanged || reboundArrow || restated.length > 0
      ? settleAfterWrite([id], elements)
      : [];

    persistBoard(boardKeyForRequest, board, content, 'agent');

    // Broadcast to all connected clients
    const message: ElementUpdatedMessage = {
      type: 'element_updated',
      element: elements.get(id) as ServerElement
    };
    broadcast(message, boardKeyForRequest);
    for (const el of restated) {
      broadcast({
        type: 'element_updated',
        element: elements.get(el.id) ?? el
      } as ElementUpdatedMessage, boardKeyForRequest);
    }
    for (const el of expanded) {
      broadcast({
        type: 'element_created',
        element: elements.get(el.id) ?? el
      } as ElementCreatedMessage, boardKeyForRequest);
    }
    for (const el of repaired) {
      broadcast({ type: 'element_updated', element: el } as ElementUpdatedMessage, boardKeyForRequest);
    }
    for (const element of consequences) {
      broadcast({ type: 'element_updated', element } as ElementUpdatedMessage, boardKeyForRequest);
    }

    // Everything this one update turned into: the element, the label it
    // renamed or expanded, the arrows it dragged along, the z-order it fixed —
    // each in the form the board now holds it (TASK-075).
    const touched = new Map<string, ServerElement>();
    for (const el of [...restated, ...expanded, ...repaired, ...consequences]) {
      const held = elements.get(el.id);
      if (held) touched.set(el.id, held);
    }
    touched.set(id, elements.get(id) as ServerElement);

    res.json({
      success: true,
      board: boardKeyForRequest,
      element: elements.get(id) as ServerElement,
      ...agentWriteAnswer(board, content, Array.from(touched.values()), wantsDocument(req))
    });
  } catch (error) {
    logger.error('Error updating element:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Clear all elements (must be before /:id route)
app.delete('/api/elements/clear', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'Clearing a board');
    const count = content.elements.size;
    content.elements.clear();

    // Nothing is on this board, so nothing on it can be selected — in any pane
    // showing it. A pane on another board keeps its pick; its elements are
    // still there.
    for (const [clientId] of selectionState.byClient) {
      if (paneBoards.get(clientId) === boardKeyForRequest) {
        selectionState.byClient.delete(clientId);
      }
    }
    const owner = selectionState.current?.clientId;
    if (owner && paneBoards.get(owner) === boardKeyForRequest) {
      selectionState.current = null;
      broadcastSelection();
    }

    persistBoard(boardKeyForRequest, board, content, 'agent');

    broadcast({
      type: 'canvas_cleared',
      timestamp: new Date().toISOString()
    }, boardKeyForRequest);

    logger.info(`Canvas cleared: ${count} elements removed from board "${boardKeyForRequest}"`);

    res.json({
      success: true,
      board: boardKeyForRequest,
      message: `Cleared ${count} elements`,
      count
    });
  } catch (error) {
    logger.error('Error clearing canvas:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Delete element
app.delete('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'Deleting an element');
    const elements = content.elements;
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
    // A label goes with the box it names, and nothing is left pointing at
    // what has gone (TASK-074).
    const { alsoDeleted, changed } = settleDeletions([id!], elements);

    persistBoard(boardKeyForRequest, board, content, 'agent');

    // Broadcast to all connected clients
    for (const elementId of [id!, ...alsoDeleted]) {
      broadcast({ type: 'element_deleted', elementId } as ElementDeletedMessage, boardKeyForRequest);
    }
    for (const el of changed) {
      broadcast({ type: 'element_updated', element: el } as ElementUpdatedMessage, boardKeyForRequest);
    }

    res.json({
      success: true,
      board: boardKeyForRequest,
      message: `Element ${id} deleted successfully`,
      ...(alsoDeleted.length > 0 ? { alsoDeleted } : {}),
      ...agentWriteAnswer(board, content, changed, wantsDocument(req))
    });
  } catch (error) {
    logger.error('Error deleting element:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Query elements with filters
app.get('/api/elements/search', (req: Request, res: Response) => {
  try {
    const { content } = boardFromRequest(req, 'Querying elements');
    const { type, x_min, x_max, y_min, y_max, board: _boardParam, ...filters } = req.query;
    let results = Array.from(content.elements.values());

    // Filter by type if specified
    if (type && typeof type === 'string') {
      results = results.filter(element => element.type === type);
    }

    // Filter by bounding box if specified. An element is in the region when
    // any part of it is, measured from its path where it has one — asking
    // where an arrow starts is not asking where it goes (TASK-044).
    if (x_min !== undefined || x_max !== undefined || y_min !== undefined || y_max !== undefined) {
      const region = {
        xMin: x_min !== undefined ? Number(x_min) : -Infinity,
        xMax: x_max !== undefined ? Number(x_max) : Infinity,
        yMin: y_min !== undefined ? Number(y_min) : -Infinity,
        yMax: y_max !== undefined ? Number(y_max) : Infinity
      };
      results = results.filter(el => overlapsRegion(el, region));
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
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Get element by ID
app.get('/api/elements/:id', (req: Request, res: Response) => {
  try {
    const { content } = boardFromRequest(req, 'Getting an element');
    const elements = content.elements;
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
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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

// Restate a path element's width and height from the path itself, and say
// whether that changed anything.
//
// A linear element keeps its size in its points, and its `x, y` is the first
// of them rather than a top-left corner (geometry.ts). Every reader that
// places an arrow reads these numbers, so the server owes them the truth
// wherever it writes a path: on creation, on a re-route, and on a caller
// re-pointing an arrow by hand.
function sizeFromPath(element: ServerElement): boolean {
  const measured = remeasureLinear(element);
  if (!measured) return false;
  element.width = measured.width;
  element.height = measured.height;
  return true;
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

    // Set arrow position and points, and say how big the arrow now is: writing
    // a path without re-measuring left every arrow the server had re-routed
    // recorded at the size it used to be (TASK-038).
    el.x = finalStart.x;
    el.y = finalStart.y;
    el.points = [[0, 0], [finalEnd.x - finalStart.x, finalEnd.y - finalStart.y]];
    sizeFromPath(el);

    // Do NOT delete `start` and `end` here. They are what says which shapes
    // this arrow joins, so `rerouteBoundArrows` reads them every time one of
    // those shapes moves, and the converter turns them into `startBinding`,
    // `endBinding` and the `boundElements` entries on the shapes themselves.
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

// A label belongs to the thing it names, so moving that thing has to move the
// label with it. Excalidraw recomputes a bound text's position from its
// container on every draw, which is why nothing on screen ever complained
// about this — but the stored coordinates are what the scene bounding box,
// zoom-to-fit, the crop of an image export and layout.ts's relative-position
// signals all read, and those had been reading a label the board left behind
// (TASK-034). Returns the text elements that moved, for broadcasting.
function settleBoundTexts(
  containerIds: string[],
  boardElements: Map<string, ServerElement>
): ServerElement[] {
  if (containerIds.length === 0) return [];
  const moved: ServerElement[] = [];
  for (const move of recentreBoundTexts([...boardElements.values()], containerIds)) {
    const text = boardElements.get(move.id);
    if (!text) continue;
    text.x = move.x;
    text.y = move.y;
    text.updatedAt = new Date().toISOString();
    text.version = (text.version || 0) + 1;
    moved.push(text);
  }
  return moved;
}

// ─── One write, at either size ────────────────────────────────
//
// A single-element route and a batched change report are the same write in
// different quantities: one element's merge, one element's creation, and the
// settling the board owes whatever moved. Three functions, called by both, and
// not three pairs of functions that have to agree — a batched write quietly
// doing less than a PUT would be a second update path nobody had written down.
// One intent is one write (ADR 0015), and it has to be the same write.

interface ElementMerge {
  element: ServerElement;
  /** It moved, grew or was re-pathed, so whatever hangs off it has to follow. */
  geometryChanged: boolean;
  /** An arrow was pointed at something else, which is a re-route, not an annotation. */
  reboundArrow: boolean;
}

/** Merge one caller's statement into the element the board is holding. */
function mergeElementUpdate(existing: ServerElement, body: Record<string, any>): ElementMerge {
  const { board: _boardField, ...updates } =
    UpdateElementSchema.parse({ ...body, id: existing.id }) as Record<string, any>;

  const element: ServerElement = {
    ...existing,
    ...updates,
    fontFamily: updates.fontFamily !== undefined ? normalizeFontFamily(updates.fontFamily) : existing.fontFamily,
    updatedAt: new Date().toISOString(),
    version: (existing.version || 0) + 1
  };

  // Keep Excalidraw text source in sync when clients update text via REST.
  // If originalText lags behind text, rendered wrapping/position can drift.
  const hasTextUpdate = Object.prototype.hasOwnProperty.call(body, 'text');
  const hasOriginalTextUpdate = Object.prototype.hasOwnProperty.call(body, 'originalText');
  if (element.type === EXCALIDRAW_ELEMENT_TYPES.TEXT && hasTextUpdate && !hasOriginalTextUpdate) {
    const incomingText = updates.text ?? '';
    const existingText = typeof existing.text === 'string' ? existing.text : '';
    const existingOriginalText = typeof existing.originalText === 'string'
      ? existing.originalText
      : '';
    const existingOriginalHasBr = /<\s*b\s*r\s*\/?\s*>/i.test(existingOriginalText);
    const normalizedExistingText = normalizeLineBreakMarkup(existingText);
    const normalizedExistingOriginalText = normalizeLineBreakMarkup(existingOriginalText);

    // Handle common cleanup flow: caller normalizes the rendered text value.
    // In this case, prefer normalized originalText so words aren't split by stale wraps.
    if (existingOriginalHasBr && incomingText === normalizedExistingText && normalizedExistingOriginalText) {
      element.text = normalizedExistingOriginalText;
      element.originalText = normalizedExistingOriginalText;
    } else {
      element.originalText = incomingText;
    }
  }

  const changed = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  // New points, new size. Width and height are not a second opinion about a
  // linear element, they are the size of its path, so a caller that states
  // the path has stated them too and any it sent alongside is the old
  // arrow's (TASK-038).
  if (changed('points')) sizeFromPath(element);

  const isLinear = element.type === 'arrow' || element.type === 'line';
  return {
    element,
    geometryChanged: ['x', 'y', 'width', 'height', 'points', 'angle'].some(changed),
    // Pointing an arrow at a different shape is a re-route, not an annotation.
    // Creating one resolves the path from its refs; re-stating them has to do
    // the same, or the arrow keeps its old path until some shape it is bound
    // to happens to move and the server recomputes it as a side effect.
    reboundArrow: isLinear && ['start', 'end', 'startBinding', 'endBinding'].some(changed)
  };
}

/**
 * A label this write renamed, written into the text element that carries it
 * and put back on the board. `relabelBoundTexts` decides; this is the
 * bookkeeping the board owes on top, and `settleAfterWrite` moves the label
 * afterwards because it is now a different width.
 */
function restateLabels(
  written: ServerElement[],
  boardElements: Map<string, ServerElement>
): ServerElement[] {
  const restated = relabelBoundTexts(written, boardElements);
  for (const element of restated) {
    element.updatedAt = new Date().toISOString();
    element.version = (boardElements.get(element.id)?.version || 0) + 1;
    boardElements.set(element.id, element);
  }
  return restated;
}

/** Build one new element from what a caller stated. Not yet on the board. */
function buildCreatedElement(raw: unknown, inUse: IdsInUse): ServerElement {
  const params = CreateElementSchema.parse(raw);
  const { board: _boardField, ...elementParams } = params as typeof params & { board?: string };
  return {
    id: params.id || mintId(inUse),
    ...elementParams,
    fontFamily: normalizeFontFamily(params.fontFamily),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  } as ServerElement;
}

/**
 * What the board owes whatever just moved: every arrow bound to it re-routed,
 * and every bound label put back where the thing it names now is. Returns what
 * it moved, once each, for whoever is broadcasting.
 *
 * A label that was itself re-measured is re-placed by its container, because it
 * is half a size bigger and therefore half a size off centre.
 */
function settleAfterWrite(movedIds: string[], elements: Map<string, ServerElement>): ServerElement[] {
  if (movedIds.length === 0) return [];
  const settled: string[] = [];
  const moved = new Map<string, ServerElement>();
  for (const id of movedIds) {
    const element = elements.get(id);
    if (!element) continue;
    settled.push(id);
    if (typeof element.containerId === 'string' && element.containerId) {
      settled.push(element.containerId);
    }
    if (element.type !== 'arrow' && element.type !== 'line') {
      for (const arrow of rerouteBoundArrows(id, elements)) {
        moved.set(arrow.id, arrow);
        settled.push(arrow.id);
      }
    }
  }
  for (const text of settleBoundTexts(settled, elements)) moved.set(text.id, text);
  return Array.from(moved.values());
}

// Batch create elements
app.post('/api/elements/batch', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'Creating elements');
    const elements = content.elements;
    const { elements: elementsToCreate } = req.body;

    if (!Array.isArray(elementsToCreate)) {
      return res.status(400).json({
        success: false,
        error: 'Expected an array of elements'
      });
    }

    // The batch reaches the board's map only after bindings are resolved, so
    // an id minted here has to avoid what the batch has already named as well
    // as what the board holds.
    const mintedInBatch = new Set<string>();
    const taken = { has: (id: string) => elements.has(id) || mintedInBatch.has(id) };

    // Prioritize passed ID (for MCP sync), otherwise generate new ID
    const createdElements: ServerElement[] = elementsToCreate.map(elementData => {
      const element = buildCreatedElement(elementData, taken);
      mintedInBatch.add(element.id);
      return element;
    });

    // Resolve arrow bindings (computes positions, startBinding, endBinding, boundElements)
    resolveArrowBindings(createdElements, elements);

    // An arrow drawn as a bare path, bound to nothing, never went through the
    // re-router, so this is where its size gets stated (TASK-038).
    createdElements.forEach(sizeFromPath);

    // Converted once, on the way in (ADR 0015), so the count that comes back
    // is the count the board holds: a labelled box is a box and its label.
    const written = expandForBoard(createdElements, elements);
    written.forEach(el => elements.set(el.id, el));
    // z-order, so the board holds a document the renderer does not have to
    // repair (TASK-074).
    const madeIds = new Set(written.map(el => el.id));
    const repaired = repairIndices(elements).filter(el => !madeIds.has(el.id));
    const stored = written.map(el => elements.get(el.id) ?? el);

    persistBoard(boardKeyForRequest, board, content, 'agent');

    // Broadcast to all connected clients
    const message: BatchCreatedMessage = {
      type: 'elements_batch_created',
      elements: stored
    };
    broadcast(message, boardKeyForRequest);
    for (const el of repaired) {
      broadcast({ type: 'element_updated', element: el } as ElementUpdatedMessage, boardKeyForRequest);
    }

    res.json({
      success: true,
      board: boardKeyForRequest,
      count: stored.length,
      // `elements` here has always been what the write produced; the
      // fingerprint and the opt-in document are what TASK-075 adds.
      ...agentWriteAnswer(board, content, [...stored, ...repaired], wantsDocument(req))
    });
  } catch (error) {
    logger.error('Error batch creating elements:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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

    // Conversion happens in the browser, and the elements land on whatever
    // board the converting pane is holding. So the pane is decided by the board
    // the caller already named (ADR 0009), not by which pane happens to be
    // first: a proposal drawn on the right must not need the current
    // architecture taken off the left to make room for it (TASK-046).
    const { key: wanted } = boardFromRequest(req, 'Mermaid conversion');
    if (panes.size === 0) {
      return res.status(503).json({
        success: false,
        code: 'BROWSER_REQUIRED',
        error: 'No browser is open, and mermaid conversion happens in the browser. Open the canvas first.'
      });
    }
    const pane = paneShowing(wanted);
    if (!pane) {
      // The board exists, it is just not on screen, and conversion needs a
      // canvas to run in. Two ways to give it one, and which is available
      // depends on whether there is still room on the glass.
      const room = panes.size < MAX_PANES
        ? `Put it beside ${panes.size === 1 ? 'that one' : 'those'} with \`archboard pane open --board ${wanted}\`, `
        : `Put it on screen with \`board open ${wanted} --pane <left|right>\`, `;
      return res.status(409).json({
        success: false,
        error:
          `Mermaid converts in the pane holding the board, and no pane is holding "${wanted}". ` +
          `Nothing was converted. Panes on screen: ${panesShowingList()}. ` +
          `${room}then convert again.`
      });
    }

    sendToPane(pane.clientId, {
      type: 'mermaid_convert',
      mermaidDiagram,
      config: config || {},
      timestamp: new Date().toISOString()
    }, wanted);
    changeFeed.expectAgentEcho(wanted);

    // Return the diagram for frontend processing, and name the pane it went
    // to, the way `board open` names the pane a board landed in.
    const place = panesInOrder(Array.from(panes.values()))
      .find(entry => entry.pane.clientId === pane.clientId)?.place ?? 'the only pane';
    res.json({
      success: true,
      board: wanted,
      ...paneResponse(pane),
      mermaidDiagram,
      config: config || {},
      message: `Mermaid diagram sent to ${paneWords(place)}, which is holding "${wanted}", for conversion.`
    });
  } catch (error) {
    logger.error('Error processing Mermaid diagram:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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
//
// It is also the one route an agent writes a whole intent through. Aligning
// twenty boxes is one thing somebody asked for, and it costs one write here
// rather than twenty (ADR 0015, TASK-068). Who is writing decides two things
// and nothing else — see `origin`.
const ElementChangesSchema = z.object({
  upserts: z.array(z.record(z.any())).default([]),
  deletes: z.array(z.string()).default([]),
  /**
   * Who is writing. Absent means the browser, which was this route's only
   * writer when it was written: its elements are stamped `frontend_sync` and
   * the feed is told a human moved them.
   *
   * An agent says so and gets neither. Stamping its own drawing `frontend_sync`
   * would make it indistinguishable from a human's hands, and calling it human
   * to the feed would make it eligible to be narrated back into the agent's own
   * thread (ADR 0005).
   */
  origin: z.enum(['human', 'agent']).default('human'),
  clientId: z.string().optional(),
  timestamp: z.string().optional()
});

interface AppliedChanges {
  created: ServerElement[];
  updated: ServerElement[];
  deleted: string[];
}

/**
 * What an agent gets back from a write, and deliberately not what a pane gets.
 *
 * A pane gets the document, because a pane is long-lived and divergence is
 * what it accumulates (TASK-074). An agent gets something it can afford. At
 * 300 elements a board is 229,551 bytes of JSON, roughly 60,000 tokens, and
 * `align` in a loop would pull 1.2 million tokens through a context to move
 * twenty boxes. The failure a whole document prevents does not apply here
 * either: every CLI invocation is a fresh process holding nothing between
 * calls, so there is no long-lived copy to diverge.
 *
 * So, two things and an opt-in.
 *
 * `elements` is what the write touched, in the form the board now holds it —
 * not the payload that was sent, the record as it now stands. That includes
 * what the server made and the caller never named: the ids it minted, the text
 * element it expanded from a `label` seed, the arrows it re-routed behind a
 * move. Without it an agent that writes `{"label": {"text": "AuthService"}}`
 * has no way to learn its label's id except by re-reading the board.
 *
 * `fingerprint` is the element count and the sha-256 of the note this board
 * would write. An agent holding the previous one can tell in a single
 * comparison whether anything it did not expect has changed, and call
 * `describe` if so, instead of reading the whole board every turn. It is the
 * note's bytes rather than the store's, because the note is the board
 * (ADR 0015) and under stage 8 these are the bytes on disk.
 *
 * `document` is the whole board, and only when asked for.
 */
function agentWriteAnswer(
  board: BoardState,
  content: BoardContent,
  touched: ServerElement[],
  wantsDocument: boolean
): Record<string, unknown> {
  return {
    elements: touched,
    fingerprint: boardFingerprint(board, content),
    ...(wantsDocument ? { document: Array.from(content.elements.values()) } : {})
  };
}

/**
 * The note this board holds, identified by its bytes.
 *
 * Rendered from what the request has, rather than read back off disk, because
 * the write that has just happened wrote exactly these bytes: re-reading them
 * would cost a read to learn something already known.
 */
function boardFingerprint(board: BoardState, content: BoardContent): { elements: number; note: string } {
  const { bytes } = renderContent(board.identity, content);
  return { elements: content.elements.size, note: hashBoardBytes(bytes) };
}

/** Did this caller ask for the whole board? Off unless said, on every surface. */
function wantsDocument(req: Request): boolean {
  const asked = req.query.document ?? (req.body && typeof req.body === 'object' ? req.body.document : undefined);
  return asked === true || asked === '1' || asked === 'true';
}

/**
 * What the board owes the write, once the write itself has been applied: a
 * label that goes with the box it named, references that point at something,
 * and a z-order.
 *
 * Every write ends here, because the answer to a write is the resulting
 * document (ADR 0015) and a document is not a result if the renderer has to
 * repair it first. Two repairs the pane was quietly making on delivery are now
 * made once, here, where they are part of what the board became and everybody
 * is told: `elementsForScene` nulls a `containerId` pointing at a deleted
 * container, and Excalidraw assigns an `index` to an element that has none.
 * `scripts/check-live-session.mjs` caught both as the pane and the server
 * disagreeing about a document.
 */
function settleDocument(
  applied: AppliedChanges,
  elements: Map<string, ServerElement>
): AppliedChanges {
  const { alsoDeleted, changed } = settleDeletions(applied.deleted, elements);
  const repaired = repairIndices(elements);
  if (alsoDeleted.length === 0 && changed.length === 0 && repaired.length === 0) return applied;

  const created = new Map(applied.created.map(element => [element.id, element]));
  const updated = new Map(applied.updated.map(element => [element.id, element]));
  for (const element of [...changed, ...repaired]) {
    if (created.has(element.id)) created.set(element.id, element);
    else updated.set(element.id, element);
  }
  // An element the write made and this then took away is gone, not created.
  for (const id of alsoDeleted) {
    created.delete(id);
    updated.delete(id);
  }
  return {
    created: Array.from(created.values()).filter(element => elements.has(element.id)),
    updated: Array.from(updated.values()).filter(element => elements.has(element.id)),
    deleted: [...applied.deleted, ...alsoDeleted]
  };
}

/**
 * A browser's report of what a person did. The browser holds the elements, so
 * this is a merge and nothing more: no re-routing, no re-placing of labels,
 * because Excalidraw has already done all of that on screen and reported it.
 */
function applyReportedChanges(
  elements: Map<string, ServerElement>,
  upserts: Record<string, any>[],
  deletes: string[],
  now: string,
  timestamp?: string
): AppliedChanges {
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
    const id = typeof rawId === 'string' && rawId.length > 0 ? rawId : mintId(elements);
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

  return settleDocument({ created, updated, deleted }, elements);
}

/**
 * An agent's write, however many elements it names. Every element gets what the
 * single-element routes give it — the same merge, the same creation, the same
 * bindings — and the board settles once at the end rather than once per
 * element, so an arrow between two boxes that both moved is re-routed after
 * both moves instead of after each.
 *
 * An upsert whose id the board does not hold is a creation, which is what makes
 * a patch of creates, updates and deletes one write.
 */
function applyAgentChanges(
  elements: Map<string, ServerElement>,
  upserts: Record<string, any>[],
  deletes: string[]
): AppliedChanges {
  const created: ServerElement[] = [];
  const updated = new Map<string, ServerElement>();
  const moved: string[] = [];

  const written: ServerElement[] = [];
  for (const raw of upserts) {
    const rawId = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined;
    const existing = rawId ? elements.get(rawId) : undefined;
    if (existing) {
      const merge = mergeElementUpdate(existing, raw);
      elements.set(existing.id, merge.element);
      if (merge.reboundArrow) resolveArrowBindings([merge.element], elements);
      if (merge.geometryChanged || merge.reboundArrow) moved.push(existing.id);
      updated.set(existing.id, merge.element);
      written.push(merge.element);
    } else {
      const element = buildCreatedElement(raw, elements);
      elements.set(element.id, element);
      created.push(element);
      written.push(element);
    }
  }

  // Bindings resolve once every element in the write is on the board, so an
  // arrow can be created in the same write as the shapes it joins.
  if (created.length > 0) {
    resolveArrowBindings(created, elements);
    created.forEach(sizeFromPath);
  }

  // And then the one conversion, over everything this write named, once the
  // geometry it depends on has settled (ADR 0015).
  for (const label of restateLabels(written, elements)) {
    updated.set(label.id, label);
    moved.push(label.id);
  }
  const namedIds = new Set(written.map(el => el.id));
  for (const el of expandForBoard(written, elements)) {
    elements.set(el.id, el);
    if (namedIds.has(el.id)) {
      if (updated.has(el.id)) updated.set(el.id, el);
      const at = created.findIndex(c => c.id === el.id);
      if (at !== -1) created[at] = el;
    } else {
      created.push(el);
    }
  }

  const deleted: string[] = [];
  for (const id of deletes) {
    if (elements.delete(id)) deleted.push(id);
  }

  for (const element of settleAfterWrite(moved, elements)) {
    if (!elements.has(element.id)) continue;
    updated.set(element.id, element);
  }

  // An element written and then deleted in the same intent is gone, not changed.
  return settleDocument({
    created,
    updated: Array.from(updated.values()).filter(element => elements.has(element.id)),
    deleted
  }, elements);
}

app.post('/api/elements/changes', (req: Request, res: Response) => {
  try {
    const { key: boardKeyForRequest, board, content } = boardFromRequest(req, 'A change report');
    const elements = content.elements;
    const { upserts, deletes, origin, clientId, timestamp } = ElementChangesSchema.parse(req.body ?? {});

    const now = new Date().toISOString();
    const { created, updated, deleted } = origin === 'agent'
      ? applyAgentChanges(elements, upserts, deletes)
      : applyReportedChanges(elements, upserts, deletes, now, timestamp);

    if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
      // This is the write ADR 0006's refusal now arrives on. It used to fire
      // when somebody chose to save; it fires here, 400 ms after a human lifts
      // their finger, because that is when the note is written. Refusing loudly
      // mid-gesture is worse than the problem it reports, and TASK-079 is where
      // that stops interrupting — until then the report is refused with the
      // three outcomes, which at least loses nothing on disk.
      persistBoard(boardKeyForRequest, board, content, origin);

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

      logger.info(
        `Change report from ${clientId ?? (origin === 'agent' ? 'an agent' : 'an unidentified client')} ` +
        `on "${boardKeyForRequest}": ` +
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
      appliedAt: now,
      // A pane gets the board back, whole (TASK-074). It is what stops a
      // session accumulating divergence: every write is a resync, and the pane
      // renders the document rather than its own running total of deltas
      // (ADR 0015). Safe to hand back unconditionally because this response
      // was computed from what that pane just sent, so it cannot be missing
      // it — which is exactly what another writer's broadcast can be, and why
      // that one is still merged by id.
      //
      // An agent gets something smaller, because a 300-element board is 60,000
      // tokens and `align` in a loop would pull twenty of them through a
      // context to move twenty boxes (TASK-075).
      ...(origin === 'agent'
        ? agentWriteAnswer(board, content, [...created, ...updated], wantsDocument(req))
        : { document: Array.from(elements.values()) })
    });
  } catch (error) {
    logger.error('Error applying a change report:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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
    const { key: board } = boardFromRequest(req, 'changes');
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
// One selection per pane, keyed by client id, plus a last-writer-wins `current`
// for the callers that ask for "the selection" without naming a pane. When a
// client disconnects its selection is dropped with it.

const SelectionSchema = z.object({
  elementIds: z.array(z.string()),
  clientId: z.string().min(1)
});

// Boardless: a selection names the client that made it, and a pane that reads
// this decides what to do with it by whose it is, not by which board it is on.
// Tagging it with a board would only give panes on other boards a reason to
// drop a message that was never about their board in the first place.
function broadcastSelection(): void {
  const current = selectionState.current;
  broadcastBoardless({
    type: 'selection_changed',
    elementIds: current?.elementIds ?? [],
    clientId: current?.clientId ?? null,
    at: current?.at ?? new Date().toISOString()
  });
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
  // Named out of the board the selecting pane is holding, which with two panes
  // on two boards is the only place those ids exist. No resolution and no
  // ambiguity: whoever picked the elements settles which board they are on.
  const owner = selectionState.current?.clientId;
  const key = (owner ? paneBoards.get(owner) : undefined) ?? SCRATCH_KEY;
  const board = boards.get(key);
  const report = buildSelectionReport(
    selectionState.current,
    board ? boardElements(board) : [],
    clients.size
  );
  res.json({ success: true, board: key, ...report });
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
  // The board this pane adopted — what it is actually rendering, which is what
  // makes the report a description of the glass rather than an echo of what
  // the server thinks it sent.
  board: z.string().min(1),
  primary: z.boolean(),
  focused: z.boolean(),
  elementCount: z.number().int().nonnegative(),
  rect: RectSchema,
  viewport: RectSchema.extend({ zoom: z.number().positive() }),
  // Which bundle this tab is running. Optional: a tab from before this existed,
  // and anything that is not a browser, simply says nothing and hears nothing.
  build: z.string().optional()
});

// A pane says what it is showing, and hears back whether it is out of date.
//
// This is the pulse a browser already has. A pane posts here when it connects,
// on every change, and on every scroll, resize and zoom, so a tab that was
// opened before somebody rebuilt the frontend finds out at its next
// interaction. The alternative on offer was for the tab to discover it by
// having a command time out on it ten seconds later, which is what used to
// happen and what TASK-056 is about.
app.post('/api/panes', (req: Request, res: Response) => {
  const parsed = PaneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid pane' });
  }
  const frontend = frontendState(parsed.data.build);
  const staleFrontend = frontend.stale ? frontend : undefined;
  const registration: PaneRegistration = { ...parsed.data, at: new Date().toISOString() };
  // A pane exists exactly as long as its socket. A report arriving without one
  // is a pane on its way out — React tears the canvas down in its own order, so
  // a last change can be reported after the close — and registering it would
  // resurrect the ghost the close just retired.
  const live = Array.from(clientIds.values()).includes(registration.clientId);
  if (!live) {
    return res.json({ success: true, registered: false, paneCount: panes.size, staleFrontend });
  }
  const isNew = !panes.has(registration.clientId);
  panes.set(registration.clientId, registration);
  // A pane that was asked for has arrived. Registration is the acknowledgement
  // — see the pane layout section below for why it is that and not a reply.
  if (isNew) notePaneOpened(registration);
  res.json({ success: true, registered: true, paneCount: panes.size, staleFrontend });
});

app.get('/api/panes', (_req: Request, res: Response) => {
  const report = buildPanesReport(Array.from(panes.values()), {
    identity: (key) => boards.get(key)?.identity ?? null,
    elements: (key) => {
      const board = boards.get(key);
      return board ? boardElements(board) : [];
    },
    selection: (clientId) => selectionState.byClient.get(clientId) ?? null,
    canvasUrl: `http://${formatHostForUrl(HOST)}:${PORT}`
  });
  res.json({ success: true, ...report });
});

// ─── Pane layout ──────────────────────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. That made splitting something
// only a hand could do: an agent told to put a proposal beside the current
// architecture had no second pane and no way to ask for one, so it reused the
// pane in front of the human and overwrote what was there (TASK-033).
//
// These two routes ask the browser to change its layout and then wait for the
// registry to agree. The acknowledgement is the pane appearing in `panes` or
// its socket closing — never a promise from the shell — because a registration
// is the only evidence anywhere in this file that a pane exists.

// How long these two routes wait is in core/timing.ts, because the settle cap
// is waiting out PANE_DEBOUNCE_MS, which is a number on the other side of the
// browser boundary. PANE_LAYOUT_TIMEOUT_MS and PANE_SETTLE_CAP_MS are there
// with the reasoning that used to be here.

interface PendingPaneOpen {
  resolve: (pane: PaneRegistration) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  /** The panes that already existed, so the new one can be told from them. */
  known: Set<string>;
}
const pendingPaneOpens = kept('pending-pane-opens', () => new Set<PendingPaneOpen>());

interface PendingPaneClose {
  clientId: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
const pendingPaneCloses = kept('pending-pane-closes', () => new Set<PendingPaneClose>());

function notePaneOpened(registration: PaneRegistration): void {
  for (const pending of [...pendingPaneOpens]) {
    if (pending.known.has(registration.clientId)) continue;
    pendingPaneOpens.delete(pending);
    clearTimeout(pending.timeout);
    pending.resolve(registration);
  }
}

function notePaneClosed(clientId: string): void {
  for (const pending of [...pendingPaneCloses]) {
    if (pending.clientId !== clientId) continue;
    pendingPaneCloses.delete(pending);
    clearTimeout(pending.timeout);
    pending.resolve();
  }
}

/** No pane means no browser, which is a different thing from a bad request. */
function noBrowserBody(what: string): Record<string, unknown> {
  return {
    success: false,
    code: 'BROWSER_REQUIRED',
    error:
      `${what} needs a canvas open in a browser. A pane exists only while a tab is rendering it, ` +
      `so there is nothing on screen to split or close. Open http://${formatHostForUrl(HOST)}:${PORT} and retry.`
  };
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait until every pane has reported itself since the layout was asked for.
 *
 * The answer to a layout change names where a pane ended up, and "left" and
 * "right" are read off the rectangles the panes report. So the report has to
 * be the one taken after the shell re-laid them out, not the one from before.
 */
async function settleAfterLayout(askedAt: string): Promise<void> {
  const deadline = Date.now() + PANE_SETTLE_CAP_MS;
  while (Date.now() < deadline) {
    const all = Array.from(panes.values());
    if (all.length > 0 && all.every(pane => pane.at > askedAt)) return;
    await sleep(50);
  }
}

// Split the canvas: one more pane, side by side with what is already there.
//
// It takes no board. What lands in the new pane is a separate act — `board
// open ... --pane <the pane this answered with>` — so that opening a board
// stays the one thing that decides which board a pane holds (ADR 0009).
app.post('/api/panes/open', async (req: Request, res: Response) => {
  const answering = primaryPane();
  if (!answering) return res.status(503).json(noBrowserBody('Opening a pane'));

  if (panes.size >= MAX_PANES) {
    const showing = panesInOrder(Array.from(panes.values()))
      .map(entry => `${entry.place} (${paneBoards.get(entry.pane.clientId) ?? entry.pane.board})`)
      .join(', ');
    return res.status(409).json({
      success: false,
      error:
        `The canvas is already showing ${panes.size} panes: ${showing}. ` +
        'Point one of them at another board with `board open <name> --pane <spec>`, ' +
        'or close one first with `pane close <spec>`.'
    });
  }

  const askedAt = new Date().toISOString();
  let pending!: PendingPaneOpen;
  const opened = new Promise<PaneRegistration>((resolve, reject) => {
    pending = {
      resolve,
      reject,
      known: new Set(panes.keys()),
      timeout: setTimeout(() => {
        pendingPaneOpens.delete(pending);
        reject(new Error(
          'The browser was asked for another pane and none appeared within 10 seconds. ' +
          'The tab may be running an older build of the canvas — reload it and try again.'
        ));
      }, PANE_LAYOUT_TIMEOUT_MS)
    };
    pendingPaneOpens.add(pending);
  });

  if (!sendLayoutToPane(answering.clientId, { type: 'pane_open' })) {
    pendingPaneOpens.delete(pending);
    clearTimeout(pending.timeout);
    return res.status(503).json(noBrowserBody('Opening a pane'));
  }

  try {
    const pane = await opened;
    await settleAfterLayout(askedAt);
    logger.info(`Pane opened on request: ${pane.paneId} (${panes.size} on screen)`);
    res.json({
      success: true,
      ...paneResponse(panes.get(pane.clientId) ?? pane),
      paneCount: panes.size,
      onScreen: boardsOnScreen()
    });
  } catch (error) {
    res.status(504).json({ success: false, error: (error as Error).message });
  }
});

// Close one pane, named the way every other pane is named.
//
// Always named: unlike opening a board, which can only land somewhere visible
// and wrong, closing takes a board off the screen, and guessing which one is
// the mistake that costs the human the half they were reading.
app.post('/api/panes/close', async (req: Request, res: Response) => {
  const spec = typeof req.body?.pane === 'string' ? req.body.pane.trim() : '';
  const registrations = Array.from(panes.values());

  if (registrations.length === 0) return res.status(503).json(noBrowserBody('Closing a pane'));

  if (registrations.length === 1) {
    return res.status(409).json({
      success: false,
      error:
        'That is the only pane on screen, and closing it would leave the canvas showing nothing ' +
        'with no way back except reloading the browser. Its board is unaffected either way — ' +
        'point the pane somewhere else with `board open <name>` instead.'
    });
  }

  let target: PaneRegistration;
  let place: string;
  try {
    if (!spec) {
      throw new Error(
        'Say which pane to close. ' +
        panesInOrder(registrations)
          .map(entry => `\`pane close ${entry.place}\` drops ${entry.pane.board}`)
          .join(', ') + '.'
      );
    }
    target = resolvePaneSpec(registrations, spec);
    place = panesInOrder(registrations).find(entry => entry.pane.clientId === target.clientId)?.place ?? spec;
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  const askedAt = new Date().toISOString();
  let pending!: PendingPaneClose;
  const closed = new Promise<void>((resolve, reject) => {
    pending = {
      clientId: target.clientId,
      resolve,
      reject,
      timeout: setTimeout(() => {
        pendingPaneCloses.delete(pending);
        reject(new Error(
          `The browser was asked to close the ${place} pane and it is still there after 10 seconds. ` +
          'The tab may be running an older build of the canvas — reload it and try again.'
        ));
      }, PANE_LAYOUT_TIMEOUT_MS)
    };
    pendingPaneCloses.add(pending);
  });

  if (!sendLayoutToPane(target.clientId, { type: 'pane_close' })) {
    pendingPaneCloses.delete(pending);
    clearTimeout(pending.timeout);
    return res.status(503).json(noBrowserBody('Closing a pane'));
  }

  try {
    await closed;
    await settleAfterLayout(askedAt);
    logger.info(`Pane closed on request: ${target.paneId} (${panes.size} left on screen)`);
    res.json({
      success: true,
      closed: { paneId: target.paneId, clientId: target.clientId, place, board: target.board },
      paneCount: panes.size,
      onScreen: boardsOnScreen()
    });
  } catch (error) {
    res.status(504).json({ success: false, error: (error as Error).message });
  }
});

// ─── Files API (for image elements) ───────────────────────────
//
// Board-scoped, like every other route that touches board content. An image is
// board content: it is drawn by an element on one board, and the note that
// board is saved to is where it belongs. These used to be boardless, over one
// map per process keyed by file id, which is what put board B's pictures in
// board A's note (TASK-060, ADR 0009, ADR 0015).

// GET the images one board holds
app.get('/api/files', (req: Request, res: Response) => {
  try {
    const { key, content } = boardFromRequest(req, 'Listing images');
    const filesObj: Record<string, ExcalidrawFile> = {};
    content.files.forEach((f, id) => { filesObj[id] = f; });
    res.json({ success: true, board: key, files: filesObj });
  } catch (error) {
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// POST add/update images on one board (batch)
app.post('/api/files', (req: Request, res: Response) => {
  try {
    const { key, board, content } = boardFromRequest(req, 'Adding an image');
    const body = req.body;
    const fileList: ExcalidrawFile[] = Array.isArray(body) ? body : (body?.files || []);
    for (const f of fileList) {
      if (f.id && f.dataURL) {
        content.files.set(f.id, {
          id: f.id,
          dataURL: f.dataURL,
          mimeType: f.mimeType || 'image/png',
          created: f.created || Date.now()
        });
      }
    }
    // An image is board content, so it goes in the note with everything else.
    // A note holds the images its own elements draw and nothing else, so a
    // picture posted before the element that draws it has nowhere to be —
    // which is why `import` creates the elements first. Said out loud rather
    // than dropped quietly: a caller that gets the order wrong should not have
    // to discover it from a blank square (TASK-060).
    const drawn = new Set(
      Array.from(content.elements.values())
        .map(element => element.fileId)
        .filter((id): id is string => typeof id === 'string')
    );
    const orphaned = fileList.filter(f => f.id && f.dataURL && !drawn.has(f.id)).map(f => f.id);
    persistBoard(key, board, content, 'agent');
    broadcast({ type: 'files_added', files: fileList }, key);
    res.json({
      success: true,
      board: key,
      count: fileList.length - orphaned.length,
      ...(orphaned.length
        ? {
          orphaned,
          warning:
            `No element on "${key}" draws ${orphaned.join(', ')}, so ${orphaned.length === 1 ? 'it was' : 'they were'} ` +
            'not kept: a note holds the images its own elements reference. ' +
            'Create the image element first, then post its data.'
        }
        : {})
    });
  } catch (error) {
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// DELETE an image from one board
app.delete('/api/files/:id', (req: Request, res: Response) => {
  try {
    const { key, board, content } = boardFromRequest(req, 'Deleting an image');
    const id = req.params.id as string;
    if (content.files.delete(id)) {
      persistBoard(key, board, content, 'agent');
      broadcast({ type: 'file_deleted', fileId: id }, key);
      res.json({ success: true, board: key });
    } else {
      res.status(404).json({ success: false, error: `No image "${id}" on board "${key}".` });
    }
  } catch (error) {
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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
const pendingExports = kept('pending-exports', () => new Map<string, PendingExport>());

app.post('/api/export/image', (req: Request, res: Response) => {
  try {
    const { format, background, pane } = req.body ?? {};

    if (!format || !['png', 'svg'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'format must be "png" or "svg"'
      });
    }

    if (clients.size === 0) {
      return res.status(503).json(noBrowserBody('Taking a picture of the canvas'));
    }

    // Which pane is photographed. Resolved before anything is promised, and
    // named for the same reason the camera is: with a proposal in the second
    // pane, an agent that can only ever picture the first cannot see the thing
    // it just drew (TASK-033).
    const answering = typeof pane === 'string' && pane.trim()
      ? resolvePaneSpec(Array.from(panes.values()), pane)
      : primaryPane();
    if (!answering) {
      return res.status(503).json(noBrowserBody('Taking a picture of the canvas'));
    }

    const requestId = mintId(pendingExports);

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

    // Re-send the board to the pane that will answer, so a stale tab exports
    // what the server holds rather than what it last happened to render. Sent
    // to that pane alone and carrying that pane's own board: broadcasting it
    // would replace every other pane's scene with this one's board, which is
    // exactly the yank per-pane boards exist to prevent.
    const exportKey = paneBoards.get(answering.clientId) ?? answering.board;
    const exportBoard = boards.get(exportKey);
    if (!exportBoard) {
      return res.status(409).json({
        success: false,
        error: `The pane being pictured is showing "${exportKey}", which this canvas no longer holds.`
      });
    }
    const exportContent = readBoardContent(exportBoard);
    sendToPane(answering.clientId, {
      type: 'initial_elements',
      board: exportKey,
      identity: exportBoard.identity,
      elements: Array.from(exportContent.elements.values()),
      ...boardFilesMessage(exportContent)
    } as InitialElementsMessage & { files?: Record<string, ExcalidrawFile> }, exportKey);

    // Give the browser time to process the reload before requesting export
    setTimeout(() => {
      sendToPane(answering.clientId, {
        type: 'export_image_request',
        requestId,
        format,
        background: background ?? true
      }, exportKey);
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
    // A pane spec that names nothing is the caller's mistake, not a fault.
    res.status(boardErrorStatus(error)).json({
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
const pendingViewports = kept('pending-viewports', () => new Map<string, PendingViewport>());

const viewportRequestSchema = z.object({
  scrollToContent: z.boolean().optional(),
  scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
  viewportZoomFactor: z.number().positive().max(1).optional(),
  scrollToElementId: z.string().min(1).optional(),
  zoom: z.number().min(0.1).max(10).optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  // Which pane's camera. Display, so it defaults where it cannot be wrong: one
  // pane and it is that one. With two, framing the pane nobody asked for moves
  // the half of the wall the human was reading, so naming it is how an agent
  // says which board it means to look at (TASK-033).
  pane: z.string().min(1).optional()
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
      offsetY,
      pane
    } = viewportRequestSchema.parse(req.body);

    if (clients.size === 0) {
      return res.status(503).json(noBrowserBody('Moving the camera'));
    }

    // Resolved before anything is promised, so a pane spec that names nothing
    // comes back as a refusal listing the panes rather than as a timeout.
    const answering = pane
      ? resolvePaneSpec(Array.from(panes.values()), pane)
      : primaryPane();
    if (!answering) {
      return res.status(503).json(noBrowserBody('Moving the camera'));
    }

    const requestId = mintId(pendingViewports);

    const viewportPromise = new Promise<{ success: boolean; message: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingViewports.delete(requestId);
        reject(new Error('Viewport request timed out after 10 seconds'));
      }, 10000);

      pendingViewports.set(requestId, { resolve, reject, timeout });
    });

    // Addressed to one pane, about the board that pane holds: a
    // scroll-to-element only means anything on the board holding the element.
    sendToPane(answering.clientId, {
      type: 'set_viewport',
      requestId,
      scrollToContent,
      scrollToElementIds,
      scrollToElementId,
      viewportZoomFactor,
      zoom,
      offsetX,
      offsetY
    }, paneBoards.get(answering.clientId) ?? answering.board);

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
    // A pane spec that names nothing is a client error, and boardErrorStatus
    // is where that judgement already lives.
    res.status(error instanceof z.ZodError ? 400 : boardErrorStatus(error)).json({
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

    const { key: boardKeyForRequest, content } = boardFromRequest(req, 'Saving a snapshot');
    // A copy, deeply. A snapshot is the thing you go back to, so it must not
    // be the same objects as the board it is protecting you from (TASK-048).
    const snapshot: Snapshot = {
      name,
      board: boardKeyForRequest,
      elements: copyElements(content.elements.values()),
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
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
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
// (ADR 0004). A pane holds exactly one at a time, so these routes are how a
// pane's board gets swapped: open reads a note into the store and points ONE
// pane at it, save writes the store back out. Nothing here has an opinion
// about what any other pane is showing.
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

// `content` is passed by callers that have already read the note, which is
// every route that answers about a board it just touched; the default is for
// the ones that have not.
function identityResponse(key: string, board: BoardState, content?: BoardContent) {
  return {
    board: key,
    identity: board.identity,
    elementCount: (content ?? readBoardContent(board)).elements.size,
    // Scratch has a note like every other board; what it has not got is a name
    // anybody chose. See boardSummaries().
    placeholder: key === SCRATCH_KEY,
    ...(board.file ? { file: board.file } : {}),
    ...(board.savedAt ? { savedAt: board.savedAt } : {}),
    ...(board.loadedAt ? { loadedAt: board.loadedAt } : {})
  };
}

/**
 * Point one pane at a board.
 *
 * The message goes to that pane's socket alone. Broadcasting it — which is
 * what this did while the server held one board — is the same thing as
 * declaring that every pane shows the same board, because `board_switched`
 * replaces the receiving pane's whole scene.
 *
 * `pane` is null when nothing is on screen: the board still becomes the
 * server's active one, which is what a later pane will adopt and what an
 * unqualified caller means while there is no pane to disagree.
 */
function switchPaneTo(pane: PaneRegistration | null, key: string, known?: BoardContent): BoardState {
  const board = boards.get(key);
  if (!board) throw new Error(`Board "${key}" is not open`);
  // One read, for the two things that need the board: the feed's new baseline
  // and the scene the pane is handed. Callers that have just read the note pass
  // it in rather than making this read it again.
  const content = known ?? readBoardContent(board);
  // A board arriving wholesale is not a change anybody made, so the feed takes
  // the new state as its baseline rather than reporting several hundred
  // additions and burying the first real edit under them. Only when the board
  // was not already on screen somewhere: another pane may be part way through
  // an edit on it, and resetting would swallow that.
  const alreadyShown = boardsOnScreen().some(
    shown => shown.board === key && shown.paneId !== pane?.paneId
  );
  if (!alreadyShown) {
    changeFeed.reset(key, board.identity, () => boardElements(board));
  }

  if (!pane) return board;
  paneBoards.set(pane.clientId, key);

  // The selection belonged to the board that pane was showing and means
  // nothing on this one. Only that pane's: the other pane is still looking at
  // whatever it had picked.
  selectionState.byClient.delete(pane.clientId);
  if (selectionState.current?.clientId === pane.clientId) {
    selectionState.current = null;
    broadcastSelection();
  }

  sendToPane(pane.clientId, {
    type: 'board_switched',
    identity: board.identity,
    elements: Array.from(content.elements.values()),
    ...boardFilesMessage(content),
    timestamp: new Date().toISOString()
  }, key);
  return board;
}

/**
 * The pane a board request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the board is loaded without being shown, and two panes means say which
 * (src/core/panes.ts). The response always names where the board landed.
 */
function paneFromRequest(spec: unknown): PaneRegistration | null {
  const registrations = Array.from(panes.values());
  if (typeof spec === 'string' && spec.trim()) return resolvePaneSpec(registrations, spec);
  return soloPane(registrations);
}

/**
 * The pane that answers a request addressed to "the browser" and to no board.
 *
 * Image export and viewport control name a pane or take this one, and neither
 * of them names a board: a picture is of whatever is on that half of the
 * screen. So there is nothing here to resolve a board against, and nothing
 * that could resolve to the wrong one — the caller either says which pane or
 * gets the first.
 *
 * An operation that *does* name a board must not come through here. Use
 * `paneShowing`: the board it was given already settles which pane, so taking
 * the first one instead would answer a different question than the one asked.
 */
function primaryPane(): PaneRegistration | null {
  const registrations = Array.from(panes.values());
  return registrations.find(pane => pane.primary) ?? registrations[0] ?? null;
}

/** What a pane is holding: the server's record of it, or the pane's own claim. */
function paneBoardKey(pane: PaneRegistration): string {
  return paneBoards.get(pane.clientId) ?? pane.board ?? SCRATCH_KEY;
}

/**
 * The pane holding a board, for work that happens in the browser but is about
 * one named board.
 *
 * Mermaid converts inside a pane and the elements land on whatever board that
 * pane holds, so the pane is not a second thing for the caller to choose: the
 * board says which one (ADR 0009). Asking for `--pane` as well would be a
 * second way to say the same thing, and so a way to say two different things.
 *
 * Two panes may hold one board. Either would convert into the same board, so
 * this picks rather than refuses, and it picks the primary one so the same
 * screen gives the same answer twice.
 */
function paneShowing(board: string): PaneRegistration | null {
  const holding = panesInOrder(Array.from(panes.values()))
    .map(entry => entry.pane)
    .filter(pane => paneBoardKey(pane) === board);
  return holding.find(pane => pane.primary) ?? holding[0] ?? null;
}

/** The panes on screen and what each holds, for a refusal that has to list them. */
function panesShowingList(): string {
  return panesInOrder(Array.from(panes.values()))
    .map(entry => `${entry.position}. ${entry.place} (${paneBoardKey(entry.pane)})`)
    .join(', ');
}

/** One pane, named the way a human would point at it: "the left pane". */
function paneRef(pane: PaneRegistration): Record<string, unknown> {
  const entry = panesInOrder(Array.from(panes.values())).find(p => p.pane.clientId === pane.clientId);
  return {
    paneId: pane.paneId,
    clientId: pane.clientId,
    place: entry?.place ?? 'the only pane',
    position: entry?.position ?? 1
  };
}

/** Where a board landed, for the caller who did not say. */
function paneResponse(pane: PaneRegistration | null): Record<string, unknown> {
  return { pane: pane ? paneRef(pane) : null };
}

// What exists: every board in the vault, plus the ones open in this process.
//
// With ?repo=<identity>, the answer is narrowed to the boards that describe
// that repository: the ones with nodes bound to it, each listing which nodes
// matched (TASK-030). The identity is resolved by the caller, never here, for
// the same reason bindings are (ADR 0011) — this process's working directory is
// nobody's.
app.get('/api/boards', (req: Request, res: Response) => {
  try {
    const vault = requireVaultRoot();
    const repo = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';
    if (repo) {
      const open = Array.from(boards.entries()).map(([key, board]) => ({
        key,
        identity: board.identity,
        elements: boardElements(board),
        ...(board.file ? { file: board.file } : {})
      }));
      const found = boardsForRepo(repo, open, vault);
      return res.json({
        success: true,
        vault,
        repo,
        boards: found.boards,
        scanned: found.scanned,
        ...(found.unreadable.length ? { unreadable: found.unreadable } : {}),
        open: boardSummaries(boardElementCount),
        onScreen: boardsOnScreen()
      });
    }
    res.json({
      success: true,
      vault,
      boards: listBoards(vault),
      open: boardSummaries(boardElementCount),
      onScreen: boardsOnScreen()
    });
  } catch (error) {
    logger.error('Error listing boards:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// One board's identity and save state. Named, like everything else: there is
// no "the board the canvas is holding" to ask about any more — a pane asks
// about its own, and `panes` says what each pane holds.
app.get('/api/boards/info', (req: Request, res: Response) => {
  try {
    const { key, board, content } = boardFromRequest(req, 'board info');
    res.json({ success: true, ...identityResponse(key, board, content) });
  } catch (error) {
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Open a board from the vault onto the canvas.
app.post('/api/boards/open', (req: Request, res: Response) => {
  try {
    const params = BoardAddressSchema.extend({
      reload: z.boolean().optional(),
      pane: z.string().optional()
    }).parse(req.body ?? {});
    const asked = identityFromParams(params);
    const key = boardKey(asked);

    // A board this canvas already has open needs nothing read here: its note is
    // read on every request that touches it, so pointing a pane at it is all
    // this is. `--reload` still means something, and means more than it did:
    // it is ADR 0006's first outcome, the one that takes the note and gives up
    // the canvas. It re-reads the address off disk and moves the baseline to
    // whatever is there now, which is what lets writes resume after a refusal.
    if (boards.has(key) && !params.reload) {
      const pane = paneFromRequest(params.pane);
      const board = switchPaneTo(pane, key);
      return res.json({ success: true, ...identityResponse(key, board), source: 'memory', ...paneResponse(pane) });
    }

    // Whether there is a board at this address at all, asked before which half
    // of the screen it would go on. A board that is nowhere is a fact about the
    // address the caller typed, and putting it behind a question about panes
    // sends them off to add a --pane and meet a second, different refusal
    // (TASK-055). Reading the note changes nothing, so the pane is still
    // resolved before anything is created.
    const loaded = readBoardFile(asked);
    if (!loaded) {
      return res.status(404).json({
        success: false,
        error:
          `No board "${key}" in the vault at ${requireVaultRoot()}. ` +
          `Run \`board list\` to see what is there, or \`board new ${key}\` to start it.`
      });
    }
    const pane = paneFromRequest(params.pane);

    const scene = JSON.parse(loaded.sceneJson);
    // The note's level wins unless the caller stated one — opening a board is
    // not usually a claim about what level it sits at.
    const { key: openedKey, board } = getOrCreateBoard(
      { ...loaded.identity, ...(asked.level ? { level: asked.level } : {}) }
    );
    const { elements, files } = ingestScene(
      Array.isArray(scene) ? scene : (scene.elements ?? []),
      Array.isArray(scene) ? null : scene.files
    );
    const content: BoardContent = { elements, files, note: loaded.raw, hash: loaded.hash };
    board.file = loaded.file;
    // The bytes just read are what the panes are about to be shown, so they are
    // the baseline the next write is checked against.
    recordBaseline(board, loaded.file, loaded.hash);
    board.loadedAt = new Date().toISOString();
    switchPaneTo(pane, openedKey, content);

    logger.info(
      `Board opened: "${openedKey}" (${elements.size} elements) from ${loaded.file}` +
      (pane ? ` into pane ${pane.paneId}` : ' (no pane open)')
    );
    res.json({
      success: true,
      ...identityResponse(openedKey, board, content),
      source: 'vault',
      ...paneResponse(pane),
      ...(loaded.declaredKey ? { declaredKey: loaded.declaredKey } : {})
    });
  } catch (error) {
    logger.error('Error opening board:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Start a new, empty board.
//
// Nothing is written. The address is claimed and the note it would have is
// resolved, and the first thing drawn on it creates the file — an empty board
// has nothing to persist, and a `board new` somebody typed wrongly should not
// leave a note behind in a vault a human reads.
app.post('/api/boards/new', (req: Request, res: Response) => {
  try {
    const params = BoardAddressSchema.extend({ pane: z.string().optional() }).parse(req.body ?? {});
    const identity = identityFromParams(params);
    const key = boardKey(identity);
    // Is the name free, before which pane it would show in. Both questions can
    // refuse and neither creates anything, so the order is only about which
    // answer the caller gets first, and one of them is about state they cannot
    // see. A taken name reported second reads as "you fixed the pane, now here
    // is a different problem", with nothing having said the board exists
    // (TASK-055). Board is authority and pane is display (ADR 0009), which is
    // the same order.
    if (boards.has(key)) {
      return res.status(409).json({
        success: false,
        error: `Board "${key}" is already open. Switch to it with \`board open ${key}\`.`
      });
    }
    const wouldBe = vaultPathFor(identity);
    if (fs.existsSync(wouldBe)) {
      // Naming the file matters when the collision is only in casing: the
      // caller typed `CaseTest`, the vault holds `casetest.excalidraw.md`, and
      // those are one board (ADR 0010). Without the path the refusal looks
      // like it is talking about something else.
      return res.status(409).json({
        success: false,
        error:
          `Board "${key}" already exists in the vault, at ${wouldBe}. ` +
          'Open it instead, or choose another name or variant.'
      });
    }

    // Which pane it lands in, and the last thing that can refuse. Nothing has
    // been created at this point, so a refusal here really means the board was
    // not started.
    const pane = paneFromRequest(params.pane);

    const { key: newKey, board } = getOrCreateBoard(identity);
    board.file = vaultPathFor(identity);
    const content = emptyContent();
    switchPaneTo(pane, newKey, content);
    logger.info(`Board created: "${newKey}" (empty, no note yet)`);
    res.json({
      success: true,
      ...identityResponse(newKey, board, content),
      created: true,
      saved: false,
      ...paneResponse(pane)
    });
  } catch (error) {
    logger.error('Error creating board:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// Write a board to the vault. With no address it saves the board the canvas is
// holding under its own identity; with one it saves as that board instead
// (which is also how the scratch board gets a name).
app.post('/api/boards/save', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const source = boardFromRequest(req, 'Saving a board');
    const sourceBoard = source.board;
    // The human's "overwrite it anyway" — one of the three outcomes a conflict
    // offers. Never set by archboard on its own behalf.
    const force = body.force === true;

    // With a name, this is a save-as; without one, the board keeps its own
    // identity and only the fields actually passed are changed.
    //
    // Either way the level comes across unless the caller states another one.
    // A branch is the same subject at the same abstraction tier, and level is
    // board identity from a vocabulary the project grew on purpose, so
    // `--as payments@option-a` must not quietly produce a proposal at no level
    // while the board it came from sits at system (TASK-039). `--variant`
    // always did this, by keeping the source's identity; `--as` built a fresh
    // one and dropped it.
    const level = body.level ?? sourceBoard.identity.level;
    const target: BoardIdentity = body.name
      ? identityFromParams({ board: String(body.name), variant: body.variant, level })
      : {
        ...sourceBoard.identity,
        ...(body.variant ? { variant: validateVariant(String(body.variant)) } : {}),
        ...(level ? { level: validateLevel(String(level)) } : {})
      };

    const file = vaultPathFor(target);
    const targetKey = boardKey(target);
    // Saving under another address is branching, and the branch is a board of
    // its own variant, so every node on it is restamped to say so. Without
    // that, `save --as payments@option-a` leaves twelve nodes claiming
    // "current" and compare reports the whole board changed (TASK-035). A
    // plain save is deliberately left alone: a node that records a foreign
    // variant on a board nobody branched really was copied in, and that is
    // what `variantAnomaly` is for.
    const kind = classifyBoardSave(source.key, targetKey);
    // Both senses of "wrote somewhere else": naming scratch and branching a
    // board that has a home. They differ over panes, not over elements.
    const branched = kind !== 'same-board';
    const saved = branched
      ? restampVariant(Array.from(source.content.elements.values()), target.variant)
      : Array.from(source.content.elements.values());

    // Who was looking at the board that was saved. Whether they move depends
    // on what the save was: giving the scratch board a name renames the thing
    // in front of them, branching writes a second board and leaves the first
    // one alone (ADR 0012).
    const watching = Array.from(panes.values()).filter(
      pane => (paneBoards.get(pane.clientId) ?? pane.board) === source.key
    );
    const { board: savedBoard } = getOrCreateBoard(target);
    savedBoard.file = file;
    // The destination's own frontmatter is picked up by the write; the images
    // are the source board's, and `buildScene` narrows them to the ones the
    // elements being written actually draw. That narrowing is what stops a save
    // carrying another board's pictures (TASK-060).
    const written = writeBoardContent(savedBoard, source.content, {
      file,
      force,
      identity: target,
      elements: saved,
      saveCommand: body.name ? `board save --as ${targetKey}` : 'board save'
    });
    const { elementCount } = written;
    const overwrote = written.overwrote;
    savedBoard.savedAt = new Date().toISOString();
    // What the board just written holds, so the answer and any pane that
    // follows the save are built from it rather than from a second read.
    const savedContent: BoardContent = {
      elements: new Map(saved.map(element => [element.id, element])),
      files: source.content.files,
      note: written.note,
      hash: written.hash
    };
    const moved = panesFollowSave(kind) ? watching : [];
    for (const pane of moved) switchPaneTo(pane, targetKey, savedContent);

    logger.info(
      `Board saved: "${targetKey}" (${elementCount} elements) -> ${file}` +
      (kind === 'same-board' ? '' : ` [${kind}]`) +
      (moved.length ? `, panes moved: ${moved.map(pane => pane.paneId).join(', ')}` : '')
    );
    res.json({
      success: true,
      ...identityResponse(targetKey, savedBoard, savedContent),
      file,
      elements: elementCount,
      overwrote,
      ...(force && overwrote ? { forced: true } : {}),
      // What the save did to the screen, named the way `board open` names it.
      // A branch moves nothing, so `kept` is how the answer says the source is
      // still where it was and the board just written is not on show anywhere.
      // A save back to the board's own note had no screen decision to make, so
      // both lists are empty rather than reporting panes that were never at
      // risk of moving.
      saveKind: kind,
      savedFrom: source.key,
      panes: {
        moved: moved.map(paneRef),
        kept: (kind === 'branch' ? watching : []).map(paneRef),
        // The rest of the glass, because the branch that moved nothing has to
        // be told how to get on screen, and the answer depends on whether
        // there is still room for a pane (TASK-054). The caller cannot see
        // that from where it stands, so the save says it.
        onScreen: boardsOnScreen()
      }
    });
  } catch (error) {
    logger.error('Error saving board:', error);
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// ─── Compare ──────────────────────────────────────────────────
//
// A structured semantic diff between two variants, joined on node identity
// (src/core/compare.ts). Read-only in the strictest sense: comparing two boards
// must never disturb the one on screen, so this neither opens a board, nor
// registers one in the store, nor records a baseline, nor moves the active
// pointer. Both sides are read off disk, because that is where a board is
// (ADR 0015); what `source` still distinguishes is whether the side is a board
// this canvas has open — and therefore possibly on a pane in front of somebody
// — or one that only exists in the vault. Reported per side, because they can
// differ and the human needs to know which they were told about.

function loadSideForCompare(key: string): CompareSideInput | null {
  const live = boards.get(key);
  if (live) {
    return {
      key,
      identity: live.identity,
      elements: boardElements(live).filter(el => !el.isDeleted),
      source: 'memory',
      ...(live.file ? { file: live.file } : {}),
      onScreen: boardsOnScreen().some(shown => shown.board === key),
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
    onScreen: false
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
    res.status(boardErrorStatus(error)).json(boardErrorBody(error));
  }
});

// ─── The library ──────────────────────────────────────────────
//
// The stencil palette, which is not a board and never becomes one. These two
// routes are the whole of it: the browser reads the library when it mounts and
// writes back whatever Excalidraw says the library now is. Nothing here goes
// near an element store or the change feed — a stencil only becomes elements
// when a human drags it onto a canvas, and by then it has arrived through the
// ordinary change-report path like anything else they drew.

app.get('/api/library', (_req: Request, res: Response) => {
  try {
    const state = readLibrary();
    res.json({
      success: true,
      items: state.items,
      seeded: state.seeded,
      origins: state.origins,
      file: state.file,
      vaultBacked: state.vaultBacked
    });
  } catch (error) {
    logger.error('Error reading library:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Replace the library. The browser sends the whole set because that is what
// Excalidraw hands it — there is no library delta to be had — and last write
// wins, which is honest for a palette two tabs are unlikely to edit at once.
// The result is broadcast so the other tabs stop being the stale one.
app.put('/api/library', (req: Request, res: Response) => {
  try {
    const body = z.object({
      items: z.array(z.object({
        id: z.string(),
        status: z.enum(['published', 'unpublished']).optional(),
        elements: z.array(z.any()),
        created: z.number().optional(),
        name: z.string().optional()
      }).passthrough())
    }).parse(req.body ?? {});

    const items: LibraryItem[] = body.items.map(item => ({
      id: item.id,
      status: item.status ?? 'published',
      elements: item.elements,
      created: item.created ?? Date.now(),
      ...(item.name ? { name: item.name } : {})
    }));

    const state = writeLibrary(items);
    // Including the tab that sent it. It recognises its own write by content
    // rather than by a client id, so there is no echo to suppress here.
    broadcastBoardless({
      type: 'library_changed',
      items: state.items,
      timestamp: new Date().toISOString()
    });
    res.json({ success: true, count: state.items.length, file: state.file, vaultBacked: state.vaultBacked });
  } catch (error) {
    logger.error('Error writing library:', error);
    res.status(error instanceof z.ZodError ? 400 : 500)
      .json({ success: false, error: (error as Error).message });
  }
});

// Serve the frontend
app.get('/', (req: Request, res: Response) => {
  const htmlFile = path.join(__dirname, '../dist/frontend/index.html');
  res.sendFile(htmlFile, (err) => {
    if (err) {
      logger.error('Error serving frontend:', err);
      res.status(404).send('Frontend not found. Please run "bun run build" first.');
    }
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    boards_open: boards.size,
    elements_count: Array.from(boards.values()).reduce((total, b) => total + boardElementCount(b), 0),
    websocket_clients: clients.size,
    // Identity for `stop`: it must only ever signal a process that both
    // identifies as this service AND self-reports its pid — never a pid
    // from a stale pidfile or an unrelated app squatting on the port.
    service: 'mcp-excalidraw-canvas',
    pid: process.pid,
    // Whether this canvas can be told to reload. True only under
    // `bun run dev:canvas`; a canvas started any other way watches nothing
    // (ADR 0014).
    reloadable: reloadIsAskable(),
    // Whether this process is running the source that is on disk now, and
    // which build the frontend has been rebuilt to. A long-lived process has no
    // symptom of its own for either, so it has to be asked (TASK-056).
    source: sourceState(),
    frontendBuild: frontendState(null).current
  });
});

// Ask the canvas to re-evaluate its source.
//
// This is the whole trigger, and it is a request rather than a file save on
// purpose: a reload re-runs every module in the graph inside a process holding
// unsaved boards and open sockets, so it happens at a moment somebody chose
// (ADR 0014). Writing the reload token is all this does; bun notices the new
// bytes and `src/dev-canvas.ts` does the rest, canary included.
app.post('/api/reload', (req: Request, res: Response) => {
  if (!reloadIsAskable()) {
    res.status(409).json({
      success: false,
      error: 'This canvas cannot reload: it was not started with `bun run dev:canvas`. ' +
        'Restart it that way, or restart the canvas to pick up your changes, ' +
        'which drops every unsaved board, so save first.'
    });
    return;
  }
  try {
    const generation = askForReload();
    res.json({ success: true, generation, pid: process.pid });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Sync status endpoint
app.get('/api/sync/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    boards: boardSummaries(boardElementCount).map(b => ({ board: b.key, elementCount: b.elementCount })),
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

// Replaced, not added, for the same reason as the connection listener above.
server.removeAllListeners('error');
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

/**
 * Take the scratch board's note, if there is one.
 *
 * Scratch is where a first run draws, and it used to be the one board that
 * lived in the process and nowhere else, so quitting the canvas threw it away
 * without saying so. It has a note now like every other board (ADR 0015),
 * `<vault>/.archboard/scratch.excalidraw.md`, and this is where the canvas
 * picks it back up.
 *
 * Nothing is written here. A vault that has never held a scratch note gets one
 * when the board is first saved, which is how `board new` behaves too.
 */
function adoptScratchBoard(): void {
  const identity = makeIdentity({ board: SCRATCH_BOARD });
  const { board } = getOrCreateBoard(identity);
  let loaded: LoadedBoard | null = null;
  try {
    loaded = readBoardFile(identity);
  } catch (error) {
    // A scratch note we cannot read is not worth refusing to start over: it is
    // a scratch pad, the vault holds the boards that matter, and the file is
    // left alone rather than replaced.
    logger.warn(`Scratch note ignored: ${(error as Error).message}`);
  }
  board.file = loaded?.file ?? vaultPathFor(identity);
  if (!loaded) return;

  // The bytes just read are the baseline the first write is checked against.
  // Nothing is ingested: the note is the board, and every request that touches
  // scratch will read it for itself.
  recordBaseline(board, loaded.file, loaded.hash);
  board.loadedAt = new Date().toISOString();
  logger.info(`Scratch board picked up where it was left: ${boardElementCount(board)} element(s) from ${loaded.file}`);
}

async function startServer(): Promise<void> {
  // A hot reload re-runs this file, entry point and all, inside a process that
  // is already serving. Everything that had to happen once has happened: the
  // port is bound, the pidfile is written, injection is armed or refused, and
  // the tabs are connected to sockets we have just re-pointed at the new
  // handlers. Binding again would fail against ourselves, and the loopback
  // guard below would read that as a second canvas and exit — taking the boards
  // with it.
  if (wiring.listening) {
    // Straight to stderr, not through the logger: this is only ever printed
    // under `bun run dev:canvas`, where somebody is watching a terminal and
    // needs to know their edit is live. The logger's console transport carries
    // warnings and errors only, and a reload is neither.
    //
    // It says what it did and nothing about what survived. The reload canary
    // is what checks that, afterwards, and it once followed a line here
    // claiming "same boards" onto a report that the board had been emptied.
    process.stderr.write(
      `Canvas server source re-evaluated in place; the port was already bound (pid ${process.pid}).\n`
    );
    return;
  }

  // No vault, no canvas (ADR 0015). Every board is a note, so a canvas without
  // a vault has nowhere to put anything, and the failure it used to produce
  // came later and cost more: the canvas opened, somebody drew on it, and the
  // drawing turned out to have been nowhere all along.
  //
  // Straight to stderr as well as the log, because a first run is exactly the
  // run whose LOG_LEVEL nobody has set, and the whole value of this is that
  // the person who started it reads it.
  if (!ARCHBOARD_VAULT) {
    process.stderr.write(noVaultMessage() + '\n');
    logger.error('Refusing to start canvas server: no vault (ARCHBOARD_VAULT is unset).');
    process.exit(1);
  }

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

  // Before the port opens, so the first request cannot arrive at a scratch
  // board that is about to be filled in from a note.
  adoptScratchBoard();

  // Only the process that actually wrote the pidfile may remove it —
  // a concurrent-start loser exiting on EADDRINUSE must not delete the
  // winner's pidfile.
  let ownsPidFile = false;

  server.listen(PORT, HOST, () => {
    wiring.listening = true;
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
  // Once per process. Handlers live on `process`, which no reload touches, so
  // registering them again would only stack duplicates.
  if (!wiring.signalsBound) {
    wiring.signalsBound = true;
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('exit', () => {
      if (ownsPidFile) removePidFile(PORT);
    });
  }
}

// Start the canvas server only when this file is the process entry point
// (`bun src/server.ts`, `bun run canvas`, or spawned by the CLI/MCP
// auto-start). Importing this module must never start the server.
if (isMainModule(import.meta.url)) {
  void startServer();
}

export { startServer };
export default app;

