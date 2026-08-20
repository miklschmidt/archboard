// Shapes shared between the shell and the canvases it hosts.

export interface ServerElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string | number;
  label?: { text: string };
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncedAt?: string;
  source?: string;
  syncTimestamp?: string;
  boundElements?: any[] | null;
  containerId?: string | null;
  locked?: boolean;
  start?: { id: string };
  end?: { id: string };
  strokeStyle?: string;
  endArrowhead?: string;
  startArrowhead?: string;
  fileId?: string;
  status?: string;
  scale?: [number, number];
  angle?: number;
  link?: string | null;
  customData?: Record<string, unknown> | null;
}

/** A board's address: what it is called, which variant, and at what level. */
export interface BoardIdentity {
  board: string;
  variant: string;
  level?: string;
}

/** What `/api/boards/current` and the board mutations answer with. */
export interface BoardInfo {
  board: string;
  identity: BoardIdentity;
  elementCount: number;
  vaultBacked: boolean;
  file?: string;
  savedAt?: string;
  loadedAt?: string;
}

/**
 * A save the server refused because the note at the destination is not the one
 * archboard read (ADR 0006). Carries the three outcomes rather than leaving the
 * UI to invent them, so every surface offers the same choice.
 */
export interface BoardWriteConflict {
  board: string;
  file: string;
  reason: 'changed' | 'unseen';
  lastReadAt?: string;
  fileModifiedAt?: string;
  outcomes: { reload: string; overwrite: string; saveAs: string };
  message: string;
}

export interface BoardListing {
  vault: string;
  boards: Array<{ key: string; identity: BoardIdentity; file?: string }>;
  open: Array<{ key: string; identity: BoardIdentity; elementCount?: number }>;
  /** What each pane is holding right now, in reading order. */
  onScreen: Array<{ paneId: string; place: string; board: string }>;
}

export interface WebSocketMessage {
  type: string;
  board?: string;
  identity?: BoardIdentity;
  element?: ServerElement;
  elements?: ServerElement[];
  created?: ServerElement[];
  updated?: ServerElement[];
  deleted?: string[];
  origin?: string | null;
  elementId?: string;
  count?: number;
  timestamp?: string;
  source?: string;
  mermaidDiagram?: string;
  config?: any;
  requestId?: string;
  format?: string;
  background?: boolean;
  scrollToContent?: boolean;
  scrollToElementId?: string;
  scrollToElementIds?: string[];
  viewportZoomFactor?: number;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  files?: any;
  /** Library items, on `library_changed`. Never elements. */
  items?: unknown[];
}

/** What one pane tells the shell about itself. */
export interface PaneStatus {
  paneId: string;
  /** The pane's identity to the server — how a board is addressed to it. */
  clientId: string;
  connected: boolean;
  board: BoardIdentity | null;
  boardKey: string | null;
  elementCount: number;
  /** When this pane last saw the board change, from either direction. */
  lastChangeAt: string | null;
}
