// What the human is currently looking at.
//
// This exists for one reason. The voice model cannot see the screen, so "move
// that box over there" is uninterpretable unless the thread can ask what is on
// screen and what is under the person's finger. That is spatial deixis, and it
// is the whole justification for this module.
//
// So this reports VIEW STATE, never board contents. It is meant to be called on
// every turn, which it can only be if it stays small: inlining the elements "to
// save a round trip" would make it expensive, which would make it uncallable
// every turn, which defeats the point. `describe` and `compare` report contents;
// this reports where the panes are, which board each holds, how much of it is on
// screen, and what is picked in each — bounded no matter how big the board is.
//
// A pane is known to the server only while its socket is open (see server.ts):
// a closed tab or an unsplit takes its registration with it, so there are no
// ghosts. No pane at all is the normal state of a headless canvas, not an error.

import { ServerElement } from '../types.js';
import { BoardIdentity, boardKey, parseBoardKey } from './board.js';
import { nameSelection } from './describe.js';

/** A rectangle. Page coordinates for `rect`, scene coordinates for `viewport`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What one pane tells the server about itself.
 *
 * The pane reports the board key it *adopted*, not the server's active board.
 * Today those are always the same — one active board, so every pane shows it —
 * but reading the pane's own answer is what makes this report survive panes
 * becoming independently addressable without being redesigned.
 */
export interface PaneRegistration {
  /** The pane's identity to the server: also its websocket and selection key. */
  clientId: string;
  /** Stable within the tab, and what the human sees on the pane tab. */
  paneId: string;
  /** Board key, e.g. `payments` or `payments@option-a`. */
  board: string;
  /** Does this pane answer export / viewport / mermaid requests? */
  primary: boolean;
  /** Is this the pane the human last touched? */
  focused: boolean;
  elementCount: number;
  /** Where the pane sits in the page, in CSS pixels. */
  rect: Rect;
  /** Which part of the board is on screen, in scene coordinates. */
  viewport: Rect & { zoom: number };
  at: string;
}

export interface PaneSelection {
  count: number;
  /** Capped: a select-all must not make this report expensive. */
  elementIds: string[];
  moreIds: number;
  nodeCount: number;
  names: string[];
  /** One phrase, e.g. `2 nodes — "Gateway", "Payments"`. */
  summary: string;
  at: string | null;
}

export interface PaneReport {
  paneId: string;
  clientId: string;
  /** 1-based, in reading order. */
  position: number;
  /** Where it is, said the way a human would: `left`, `right`, `top`… */
  place: string;
  focused: boolean;
  primary: boolean;
  board: string;
  identity: BoardIdentity;
  elementCount: number;
  viewport: Rect & { zoom: number };
  rect: Rect;
  selection: PaneSelection;
  /** When this pane last told the server about itself. */
  at: string;
}

export type Arrangement =
  | 'none'
  | 'single'
  | 'side-by-side'
  | 'stacked'
  | 'grid'
  /**
   * Two panes in the same place: separate tabs or windows, not a split. Worth
   * its own name because "the left one" means nothing here, and an agent that
   * assumed a split would point the human at the wrong screen.
   */
  | 'overlapping';

export interface PanesReport {
  paneCount: number;
  arrangement: Arrangement;
  /** paneId of the pane the human last touched. */
  focused: string | null;
  /** Are all panes showing the same board? */
  sameBoard: boolean;
  panes: PaneReport[];
  summary: string;
  text: string;
}

/** What the report needs from the server, without importing the server. */
export interface PaneContext {
  /** The identity the board registry holds for a key, if it holds one. */
  identity(board: string): BoardIdentity | null;
  /** The board's elements — used only to name what is selected, never listed. */
  elements(board: string): ServerElement[];
  /** What this client last reported picking. */
  selection(clientId: string): { elementIds: string[]; at: string } | null;
  /** Where to open the canvas, for the no-pane case. */
  canvasUrl?: string;
}

/** Panes within this many pixels of each other are in the same row or column. */
const BAND = 24;

/** Beyond this many selected ids, the report says how many rather than which. */
const MAX_IDS = 20;

const readingOrder = (a: PaneRegistration, b: PaneRegistration): number =>
  Math.abs(a.rect.y - b.rect.y) > BAND ? a.rect.y - b.rect.y : a.rect.x - b.rect.x;

/** Distinct positions along one axis, collapsing anything within a band. */
function bands(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1]! > BAND) out.push(value);
  }
  return out;
}

const bandIndex = (edges: number[], value: number): number => {
  let index = 0;
  edges.forEach((edge, i) => { if (value - edge > -BAND) index = i; });
  return index;
};

function arrangementOf(panes: PaneRegistration[]): Arrangement {
  if (panes.length === 0) return 'none';
  if (panes.length === 1) return 'single';
  const rows = bands(panes.map(p => p.rect.y)).length;
  const columns = bands(panes.map(p => p.rect.x)).length;
  if (rows === 1 && columns === 1) return 'overlapping';
  if (rows === 1) return 'side-by-side';
  if (columns === 1) return 'stacked';
  return 'grid';
}

const ROW_NAMES = ['top', 'middle', 'bottom'];
const COLUMN_NAMES = ['left', 'middle', 'right'];

function placeOf(
  pane: PaneRegistration,
  index: number,
  panes: PaneRegistration[],
  arrangement: Arrangement
): string {
  switch (arrangement) {
    case 'single':
      return 'the only pane';
    case 'side-by-side': {
      if (panes.length === 2) return index === 0 ? 'left' : 'right';
      if (panes.length === 3) return COLUMN_NAMES[index]!;
      return `column ${index + 1} of ${panes.length}`;
    }
    case 'stacked': {
      if (panes.length === 2) return index === 0 ? 'top' : 'bottom';
      if (panes.length === 3) return ROW_NAMES[index]!;
      return `row ${index + 1} of ${panes.length}`;
    }
    case 'overlapping':
      return `tab ${index + 1} of ${panes.length}`;
    default: {
      const rows = bands(panes.map(p => p.rect.y));
      const columns = bands(panes.map(p => p.rect.x));
      return `row ${bandIndex(rows, pane.rect.y) + 1}, column ${bandIndex(columns, pane.rect.x) + 1}`;
    }
  }
}

const round = (n: number): number => Math.round(n);

function selectionOf(pane: PaneRegistration, context: PaneContext): PaneSelection {
  const picked = context.selection(pane.clientId);
  const ids = picked?.elementIds ?? [];
  if (ids.length === 0) {
    return {
      count: 0, elementIds: [], moreIds: 0, nodeCount: 0, names: [],
      summary: 'nothing selected', at: picked?.at ?? null
    };
  }

  const named = nameSelection(ids, context.elements(pane.board));
  const things = named.nodeCount === named.count
    ? `${named.count} node${named.count === 1 ? '' : 's'}`
    : `${named.count} element${named.count === 1 ? '' : 's'}${named.nodeCount > 0 ? ` (${named.nodeCount} node${named.nodeCount === 1 ? '' : 's'})` : ''}`;
  const list = named.names.length > 0
    ? ` — ${named.names.map(n => `"${n}"`).join(', ')}${named.more > 0 ? `, and ${named.more} more` : ''}`
    : '';
  const missing = named.missing > 0 ? `, ${named.missing} no longer on the board` : '';

  return {
    count: ids.length,
    elementIds: ids.slice(0, MAX_IDS),
    moreIds: Math.max(0, ids.length - MAX_IDS),
    nodeCount: named.nodeCount,
    names: named.names,
    summary: `${things}${list}${missing}`,
    at: picked?.at ?? null
  };
}

function boardPhrase(identity: BoardIdentity): string {
  const name = identity.variant === 'current'
    ? identity.board
    : `${identity.board}@${identity.variant}`;
  const detail = [identity.variant, identity.level].filter(Boolean).join(', ');
  return `${name} (${detail})`;
}

function paneLine(pane: PaneReport): string {
  const view = pane.viewport;
  const parts = [
    `${pane.position}. ${pane.place}`,
    boardPhrase(pane.identity),
    `${pane.elementCount} element${pane.elementCount === 1 ? '' : 's'}`,
    `view (${round(view.x)},${round(view.y)}) ${round(view.width)}x${round(view.height)} @${view.zoom.toFixed(2)}x`,
    pane.selection.count > 0 ? `selected: ${pane.selection.summary}` : 'nothing selected'
  ];
  if (pane.focused) parts.push('focused');
  if (pane.primary) parts.push('answers screenshots');
  return parts.join(' · ');
}

/**
 * Build the read-out. Cost is one pass over the registry plus, for each pane
 * that has something selected, one pass over its board to name it — not over
 * the elements themselves, which never appear here.
 */
export function buildPanesReport(
  registrations: PaneRegistration[],
  context: PaneContext
): PanesReport {
  const ordered = [...registrations].sort(readingOrder);
  const arrangement = arrangementOf(ordered);

  if (ordered.length === 0) {
    const where = context.canvasUrl ? ` Open ${context.canvasUrl} to put it in front of somebody.` : '';
    const summary = `No pane is open, so nothing is on screen.${where}`;
    return {
      paneCount: 0, arrangement, focused: null, sameBoard: true, panes: [],
      summary,
      text: summary + '\nThe board itself is unaffected — it lives on the server, not in the browser.'
    };
  }

  const panes: PaneReport[] = ordered.map((pane, index) => {
    const identity = context.identity(pane.board) ?? parseBoardKey(pane.board);
    return {
      paneId: pane.paneId,
      clientId: pane.clientId,
      position: index + 1,
      place: placeOf(pane, index, ordered, arrangement),
      focused: pane.focused,
      primary: pane.primary,
      board: boardKey(identity),
      identity,
      elementCount: pane.elementCount,
      viewport: pane.viewport,
      rect: pane.rect,
      selection: selectionOf(pane, context),
      at: pane.at
    };
  });

  const boardsShown = new Set(panes.map(p => p.board));
  const sameBoard = boardsShown.size === 1;
  const focused = panes.find(p => p.focused)?.paneId ?? null;

  const LAYOUT_PHRASE: Record<string, string> = {
    grid: 'in a grid',
    overlapping: 'in the same place',
    'side-by-side': 'side by side',
    stacked: 'stacked'
  };
  const layout = arrangement === 'single'
    ? '1 pane on screen'
    : `${panes.length} panes, ${LAYOUT_PHRASE[arrangement] ?? arrangement}`;
  const showing = sameBoard
    ? `, showing ${boardPhrase(panes[0]!.identity)}`
    : `, showing ${panes.map(p => boardPhrase(p.identity)).join(' and ')}`;
  const summary = `${layout}${showing}.`;

  const lines = [summary];
  if (arrangement === 'overlapping') {
    // Not a split: two browsers on the same canvas. Saying so stops a thread
    // offering "the left one" as a way to tell them apart.
    lines.push('These are separate tabs or windows on the same canvas, not a split — nothing is to the left of anything.');
  }
  // Said once, not per pane: without it a thread reading two identical lines
  // would reasonably wonder whether it had misread one of them.
  if (panes.length > 1 && sameBoard) {
    lines.push('Every pane shows the same board because this server holds one board at a time.');
  }
  for (const pane of panes) lines.push(`  ${paneLine(pane)}`);

  return { paneCount: panes.length, arrangement, focused, sameBoard, panes, summary, text: lines.join('\n') };
}
