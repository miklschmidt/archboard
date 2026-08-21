import { kept } from './core/hot.js';

export interface ExcalidrawElementBase {
  id: string;
  type: ExcalidrawElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: {
    type: number;
    value?: number;
  } | null;
  seed?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  locked?: boolean;
  link?: string | null;
  customData?: Record<string, any> | null;
  boundElements?: readonly ExcalidrawBoundElement[] | null;
  updated?: number;
  containerId?: string | null;
  /**
   * z-order, as a fractional index. Excalidraw's own field, and a field of the
   * note like any other: an element without one is a document the renderer has
   * to repair, which under ADR 0015 is a board with two answers. Issued and
   * kept valid by `repairIndices` (TASK-074).
   */
  index?: string | null;
}

export interface ExcalidrawTextElement extends ExcalidrawElementBase {
  type: 'text';
  text: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  baseline?: number;
  lineHeight?: number;
}

export interface ExcalidrawRectangleElement extends ExcalidrawElementBase {
  type: 'rectangle';
  width: number;
  height: number;
}

export interface ExcalidrawEllipseElement extends ExcalidrawElementBase {
  type: 'ellipse';
  width: number;
  height: number;
}

export interface ExcalidrawDiamondElement extends ExcalidrawElementBase {
  type: 'diamond';
  width: number;
  height: number;
}

export interface ExcalidrawArrowElement extends ExcalidrawElementBase {
  type: 'arrow';
  points: readonly [number, number][];
  lastCommittedPoint?: readonly [number, number] | null;
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export interface ExcalidrawLineElement extends ExcalidrawElementBase {
  type: 'line';
  points: readonly [number, number][];
  lastCommittedPoint?: readonly [number, number] | null;
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
}

export interface ExcalidrawFreedrawElement extends ExcalidrawElementBase {
  type: 'freedraw';
  points: readonly [number, number][];
  pressures?: readonly number[];
  simulatePressure?: boolean;
  lastCommittedPoint?: readonly [number, number] | null;
}

export type ExcalidrawElement = 
  | ExcalidrawTextElement
  | ExcalidrawRectangleElement
  | ExcalidrawEllipseElement
  | ExcalidrawDiamondElement
  | ExcalidrawArrowElement
  | ExcalidrawLineElement
  | ExcalidrawFreedrawElement;

export interface ExcalidrawBoundElement {
  id: string;
  type: 'text' | 'arrow';
}

export interface ExcalidrawBinding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint?: readonly [number, number] | null;
}

export type ExcalidrawElementType = 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'line' | 'freedraw' | 'image';

// Excalidraw element types
export const EXCALIDRAW_ELEMENT_TYPES: Record<string, ExcalidrawElementType> = {
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  DIAMOND: 'diamond',
  ARROW: 'arrow',
  TEXT: 'text',
  FREEDRAW: 'freedraw',
  LINE: 'line',
  IMAGE: 'image'
} as const;

// Server-side element with metadata
export interface ServerElement extends Omit<ExcalidrawElementBase, 'id'> {
  id: string;
  type: ExcalidrawElementType;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncedAt?: string;
  source?: string;
  syncTimestamp?: string;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: string | number;
  label?: {
    text: string;
  };
  points?: any;
  // An image element names the picture it draws. It is the only thing in the
  // format that says which board an image belongs to, which is why a board's
  // images are read off its elements rather than out of a map (TASK-060).
  fileId?: string;
  // What an arrow touches, and Excalidraw's own record of it: which shape, how
  // far round it (`focus`), and how far short of its outline the path stops
  // (`gap`). Everything that routes or reads a connection reads these.
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
  /**
   * The agent's spelling of the same thing, and an input format only: `start`
   * and `end` are converted to bindings at the write boundary and never stored,
   * exactly as `label` stopped being stored in TASK-073. Storing them made the
   * board hold two answers to what an arrow touched, and a human who dragged
   * an end onto a different shape had their edit undone by the stale one the
   * next time anything moved (TASK-088, ADR 0015).
   */
  start?: { id: string } | null;
  end?: { id: string } | null;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ElementsResponse extends ApiResponse {
  elements: ServerElement[];
  count: number;
}

export interface ElementResponse extends ApiResponse {
  element: ServerElement;
}

export interface SyncResponse extends ApiResponse {
  count: number;
  syncedAt: string;
  beforeCount: number;
  afterCount: number;
}

// WebSocket message types
//
// Every message carries the board it is about. The canvas holds one board at a
// time, so a client that is showing board A must be able to tell that an
// element_created for board B is not its business — otherwise a board switch
// races with in-flight broadcasts and the wrong elements land on screen.
export interface WebSocketMessage {
  type: WebSocketMessageType;
  board?: string;
  [key: string]: any;
}

export type WebSocketMessageType =
  | 'initial_elements'
  | 'element_created'
  | 'element_updated'
  | 'element_deleted'
  | 'elements_batch_created'
  | 'elements_changed'
  | 'mermaid_convert'
  | 'canvas_cleared'
  | 'export_image_request'
  | 'set_viewport'
  | 'files_added'
  | 'file_deleted'
  | 'selection_changed'
  | 'board_switched'
  // This board has stopped saving, or is saving again (ADR 0006, TASK-079).
  // Board news rather than pane news: every pane holding it is affected, and a
  // pane holding something else is not.
  | 'board_hold'
  | 'board_released'
  // The stencil palette changed. Boardless on purpose: the library is not a
  // board's content, so every client applies it whatever it is showing.
  | 'library_changed'
  // Layout, asked of the shell that owns it. Boardless for the same reason the
  // library is: a pane appearing or going away says nothing about any board,
  // and the pane that receives one keeps whatever it was holding.
  | 'pane_open'
  | 'pane_close';

export interface InitialElementsMessage extends WebSocketMessage {
  type: 'initial_elements';
  elements: ServerElement[];
  board: string;
}

// The canvas is now showing a different board. Carries the whole scene rather
// than a delta: nothing about board A's elements helps render board B, so the
// client replaces what it has instead of merging.
export interface BoardSwitchedMessage extends WebSocketMessage {
  type: 'board_switched';
  board: string;
  identity: { board: string; variant: string; level?: string };
  elements: ServerElement[];
  timestamp: string;
}

export interface ElementCreatedMessage extends WebSocketMessage {
  type: 'element_created';
  element: ServerElement;
}

export interface ElementUpdatedMessage extends WebSocketMessage {
  type: 'element_updated';
  element: ServerElement;
}

export interface ElementDeletedMessage extends WebSocketMessage {
  type: 'element_deleted';
  elementId: string;
}

export interface BatchCreatedMessage extends WebSocketMessage {
  type: 'elements_batch_created';
  elements: ServerElement[];
}

// The result of a browser's change report, after the server applied it. Named
// per-effect rather than as one scene so a client can tell "this element is
// new" from "this element moved" from "this element is gone" without diffing.
//
// `origin` is the client that reported the change. That client already has the
// result on screen and skips its own echo; every other client applies it.
export interface ElementsChangedMessage extends WebSocketMessage {
  type: 'elements_changed';
  created: ServerElement[];
  updated: ServerElement[];
  deleted: string[];
  origin: string | null;
  timestamp: string;
}

// Pushed whenever the reported selection changes, so a later change-event feed
// or a second pane can follow it without polling.
export interface SelectionChangedMessage extends WebSocketMessage {
  type: 'selection_changed';
  elementIds: string[];
  clientId: string | null;
  at: string;
}

export interface MermaidConvertMessage extends WebSocketMessage {
  type: 'mermaid_convert';
  mermaidDiagram: string;
  config?: MermaidConfig;
  timestamp: string;
}

// Mermaid conversion types
export interface MermaidConfig {
  startOnLoad?: boolean;
  flowchart?: {
    curve?: 'linear' | 'basis';
  };
  themeVariables?: {
    fontSize?: string;
  };
  maxEdges?: number;
  maxTextSize?: number;
}

export interface MermaidConversionRequest {
  mermaidDiagram: string;
  config?: MermaidConfig;
}

export interface MermaidConversionResponse extends ApiResponse {
  elements: ServerElement[];
  files?: any;
  count: number;
}

// Canvas cleared message
export interface CanvasClearedMessage extends WebSocketMessage {
  type: 'canvas_cleared';
  timestamp: string;
}

// Image export types
export interface ExportImageRequestMessage extends WebSocketMessage {
  type: 'export_image_request';
  requestId: string;
  format: 'png' | 'svg';
  background?: boolean;
}

// Viewport control types
export interface SetViewportMessage extends WebSocketMessage {
  type: 'set_viewport';
  requestId: string;
  scrollToContent?: boolean;
  scrollToElementId?: string;
  scrollToElementIds?: string[];
  viewportZoomFactor?: number;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
}

// Selection types
//
// Selection is what a human has picked on the board — the thing they mean when
// they say "map this to the payments service". One canvas, one selection:
// whichever browser client reported last owns it (see /api/selection).
export interface CanvasSelection {
  elementIds: string[];
  clientId: string;
  at: string;
}

// Snapshot types
export interface Snapshot {
  name: string;
  // Which board the snapshot was taken from — a snapshot of one board says
  // nothing about another, and restoring across boards would be a data loss.
  board: string;
  /**
   * A deep copy of the board as it stood, sharing no object with it.
   *
   * The whole value of a snapshot is that editing the board cannot reach it,
   * so this is built with `copyElements` rather than from the live map
   * (TASK-048). Restoring goes back out through batch-create, which builds
   * fresh objects again, so a snapshot can be restored more than once.
   */
  elements: ServerElement[];
  createdAt: string;
}

// The element store lives in core/board-store.ts: it is keyed by board now,
// not one global map (see that file for why).

// Snapshots, and one of the two copies of a board the process is still allowed
// to hold (ADR 0015, under "Nor is a record of what a board used to be"; the
// other is the change feed's baseline).
//
// The test the ADR sets is which question a copy answers. "What is on this
// board" must be the note, and nothing here answers that. A snapshot answers
// "what was on it when I asked to be able to come back", which the vault has
// never been asked and has no file for, so keeping it in the process removes no
// second truth and writing it to disk would invent a second one. Losing it
// costs the ability to go back and costs no work.
//
// Kept across a hot reload, along with every other holder in this file: a
// snapshot is taken to protect work, so a file save must not be what loses it
// (src/core/hot.ts).
export const snapshots = kept('snapshots', () => new Map<string, Snapshot>());

// The current selection, or null when nothing is selected. A mutable holder so
// the server can swap the value while importers keep a single reference.
//
// `current` answers "what does the human mean by *this*" — one canvas, one
// selection, last writer wins. `byClient` answers a different question: what is
// picked in *each* pane, which is not the same thing once two panes are on
// screen, because a pane the human clicked away from still shows its selection.
// `panes` reads the map; `selection` reads `current`; both stay true.
export const selectionState: {
  current: CanvasSelection | null;
  byClient: Map<string, CanvasSelection>;
} = kept('selection', () => ({ current: null, byClient: new Map() }));

// One image an element draws (Excalidraw BinaryFiles), keyed by the `fileId`
// the element carries.
//
// There is deliberately no map of these here. There used to be — one per
// process, keyed by file id and shared by every open board — and a file id
// says nothing about which board it belongs to, so saving board A wrote board
// B's images into A's note (TASK-060). The map lives on `BoardState` now,
// because a board's images are the ones its own elements reference.
export interface ExcalidrawFile {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
}

// Validation function for Excalidraw elements
export function validateElement(element: Partial<ServerElement>): element is ServerElement {
  const requiredFields: (keyof ServerElement)[] = ['type', 'x', 'y'];
  const hasRequiredFields = requiredFields.every(field => field in element);
  
  if (!hasRequiredFields) {
    throw new Error(`Missing required fields: ${requiredFields.join(', ')}`);
  }

  if (!Object.values(EXCALIDRAW_ELEMENT_TYPES).includes(element.type as ExcalidrawElementType)) {
    throw new Error(`Invalid element type: ${element.type}`);
  }

  return true;
}

// Ids are minted in src/core/ids.ts and nowhere else. See the header there for
// why the shape they come out in is not negotiable.

// Normalize fontFamily from string names to numeric values that Excalidraw expects
// Excalidraw uses: 1 = Virgil (handwritten), 2 = Helvetica (sans-serif), 3 = Cascadia (monospace)
// 5 = Excalifont, 6 = Nunito, 7 = Lilita One, 8 = Comic Shanns
export function normalizeFontFamily(fontFamily: string | number | undefined): number | undefined {
  if (fontFamily === undefined) return undefined;
  if (typeof fontFamily === 'number') return fontFamily;
  const map: Record<string, number> = {
    'virgil': 1, 'hand': 1, 'handwritten': 1,
    'helvetica': 2, 'sans': 2, 'sans-serif': 2,
    'cascadia': 3, 'mono': 3, 'monospace': 3,
    'excalifont': 5,
    'nunito': 6,
    'lilita': 7, 'lilita one': 7,
    'comic shanns': 8, 'comic': 8,
    '1': 1, '2': 2, '3': 3, '5': 5, '6': 6, '7': 7, '8': 8,
  };
  return map[fontFamily.toLowerCase()];
}
