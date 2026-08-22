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
  /** Scratch: a board with a note, but not a name anybody chose. */
  placeholder: boolean;
  file?: string;
  savedAt?: string;
  loadedAt?: string;
}

/** One pane, named the way an answer points at it: "left", "the only pane". */
export interface PaneRef {
  paneId: string;
  clientId: string;
  place: string;
  position: number;
}

/**
 * What a save did, as the server classified it (ADR 0012). A save writes a
 * file and does not choose what is on screen, so the answer says which of the
 * three acts it was and which panes it moved. Reading `saveKind` is how the
 * shell knows whether the pane in front of the human is holding what was just
 * written: after a branch it is not.
 */
export interface BoardSaveResult extends BoardInfo {
  file: string;
  overwrote: boolean;
  forced?: boolean;
  saveKind?: 'same-board' | 'named' | 'branch';
  /** The board the save read from, which is only interesting when it differs. */
  savedFrom?: string;
  /** `moved` was repointed at what was written; `kept` was left on the source. */
  panes?: { moved: PaneRef[]; kept: PaneRef[] };
  /**
   * Set when this save was one of the two outcomes that end a hold: the board
   * had stopped saving, and it is saving again now (ADR 0006, TASK-079).
   */
  resolvedHold?: {
    board: string;
    outcome: 'overwrite' | 'elsewhere';
    /** How many changes were riding on the choice that was just made. */
    writes: number;
    since: string;
  };
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

/**
 * A board that has stopped saving (ADR 0006, TASK-079).
 *
 * Its note changed underneath, so archboard refused to write it and has not
 * written it since. What is drawn on it after that is held on the canvas and is
 * in nothing else, which is why the mark stays up: it is not a message about
 * something that happened, it is the state of the board until somebody picks
 * one of the conflict's three outcomes.
 */
export interface BoardHold {
  board: string;
  since: string;
  /** Changes that have gone into the held copy rather than into the note. */
  writes: number;
  /** Whether a pane has said what is on its screen since it stopped saving. */
  fromScreen: boolean;
  conflict: BoardWriteConflict;
  message: string;
}

/**
 * The note this pane's board came from has been written by something that is
 * not archboard — Obsidian, a sync client, an editor (TASK-062).
 *
 * The state before a hold and not a smaller version of one. Nothing has been
 * refused, because nobody has written since; what is on screen is simply no
 * longer what the vault holds, and the person drawing on it has not been told.
 * Mirrors `NoteWrittenElsewhere` in `src/core/note-watch.ts`.
 */
export interface NoteWrittenElsewhere {
  board: string;
  file: string;
  reason: 'changed' | 'unseen';
  /** When the note was last written, from the filesystem. */
  writtenAt: string;
  /** When archboard last read it. Absent when it never has. */
  lastReadAt?: string;
  /**
   * Which side is newer (TASK-091). `ahead` is another archboard, and the two
   * versions say by how many writes; `unchanged` is an editor that keeps no
   * version, so the note is newer by an unknown amount; `behind` is the note
   * having been rolled back under a pane holding the later work.
   */
  versionMove: 'unchanged' | 'behind' | 'ahead' | 'unknown';
  /** What the note carries now, and what archboard last wrote there. */
  version: number | null;
  ourVersion: number | null;
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
  /** On `board_hold` and `board_released`: the board that stopped saving. */
  hold?: BoardHold;
  /** On `board_released`: which of the three outcomes ended it. */
  outcome?: 'reload' | 'overwrite' | 'elsewhere';
  /** On `board_lock`: is anybody writing this board (ADR 0016). */
  held?: boolean;
  /** On `board_lock`: who, or null. `id` is their client id, so a pane can recognise itself. */
  holder?: LockHolder | null;
  /** On `board_note`: who wrote the note last, if it was not archboard, or null. */
  writtenElsewhere?: NoteWrittenElsewhere | null;
  /** On `board_doing`: the line that has just arrived, when this is a new one. */
  doing?: DoingEntry;
  /** On `board_doing`: the last few, oldest first, so a pane that has just arrived is not blank. */
  recent?: DoingEntry[];
}

/**
 * One thing an agent said it was doing to this board (TASK-095).
 *
 * Mirrors `DoingEntry` in `src/core/board-doing.ts`. It is never board content
 * and it is nowhere in the note: it is what somebody said while changing
 * something, and it dies with the canvas.
 */
export interface DoingEntry {
  doing: string;
  at: string;
  /** The writer's lock-holder id, so two agents on one board do not read as one. */
  by: string;
  kind: 'human' | 'agent';
  /** Part of a claim — a step of a campaign, rather than a lone act. */
  claimed?: boolean;
}

/**
 * Who holds a board's mutex. Mirrors `LockHolder` in `src/core/board-lock.ts`,
 * which the pane cannot import: that module reads the vault off a filesystem a
 * browser has not got.
 */
export interface LockHolder {
  id: string;
  kind: 'human' | 'agent';
  since: string;
  until: string;
  process: string;
  reason?: string;
  /**
   * A claim rather than one write: an agent has this board across everything it
   * is doing, not for the twenty milliseconds of a single write.
   *
   * The difference the pane cares about, because it is the difference between
   * a surface that flickers and a wall that has stopped. A claim is what gets a
   * banner naming the holder and their reason, and the one tap that takes it
   * back.
   */
  claimed?: boolean;
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
  /**
   * Set while the board this pane is holding has stopped saving. The chrome
   * shows it continuously rather than announcing it once, because it is a state
   * and not an event: everything drawn from here is on this canvas and nowhere
   * else until somebody chooses (ADR 0006).
   */
  hold: BoardHold | null;
  /**
   * Set while the note behind this pane's board has been written by somebody
   * else and this pane is still showing the older one (TASK-062). Distinct from
   * `hold`, which is what this becomes once archboard has tried to write and
   * been refused, and from a lock, which is another archboard writer.
   */
  writtenElsewhere: NoteWrittenElsewhere | null;
  /**
   * The last few things an agent said it was doing to this pane's board, oldest
   * first (TASK-095). Short on purpose: a list of one-liners is glanceable from
   * two metres away, and a transcript is a log nobody reads.
   */
  doing: DoingEntry[];
}
