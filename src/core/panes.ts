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
 * The pane reports the board key it *adopted*, never the server's idea of what
 * it should be holding. That is what makes this report a description of the
 * glass rather than a restatement of server state: if a pane were somehow
 * rendering a board the server did not think it had, this would say so.
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

/**
 * The panes in reading order, each with the phrase that names where it is.
 *
 * Shared on purpose: the report and pane addressing (`--pane right`) have to
 * agree about which one "right" is, and they can only be guaranteed to agree
 * by asking the same function.
 */
export function panesInOrder(
  registrations: PaneRegistration[]
): Array<{ pane: PaneRegistration; position: number; place: string }> {
  const ordered = [...registrations].sort(readingOrder);
  const arrangement = arrangementOf(ordered);
  return ordered.map((pane, index) => ({
    pane,
    position: index + 1,
    place: placeOf(pane, index, ordered, arrangement)
  }));
}

/** Everything `--pane` accepts, for the message that lists them. */
// Every spelling here has to be taught, and a spelling that is never needed is
// a spelling that can only drift. `only` used to be accepted and named nowhere:
// it matched just when one pane was open, and that is exactly when --pane can be
// left off, because `soloPane` resolves it. Closing the last pane is refused, so
// it had no use there either (TASK-050).
const PANE_SPECS = 'a place (left, right, top, bottom), a position (1, 2), `focused`, `primary`, or a pane id';

/**
 * How many panes the shell will lay out.
 *
 * A product fact, not a limit of this module: the shell's grid has a column
 * rule for two panes and its own button stops offering another past that
 * (frontend/src/shell/shell.css, BoardBar.tsx). It lives here because the
 * server has to refuse a third pane before it asks the browser for one, and
 * because the message that says "no such pane" has to know whether making one
 * is still possible.
 */
export const MAX_PANES = 2;

/**
 * A pane's place, in a sentence.
 *
 * `place` is a phrase, not a word — "left", but also "the only pane" — so
 * dropping it into "in the ... pane" produced "in the the only pane pane".
 */
export function paneWords(place: string): string {
  return place.startsWith('the ') ? place : `the ${place} pane`;
}

/** The command that makes a pane, said the same way everywhere it is offered. */
export const HOW_TO_OPEN_A_PANE =
  'Open one with `archboard pane open [--board <key>]`, which splits the canvas and answers with the pane it made.';

/**
 * Which pane a caller means by `left`, `2`, `focused`, `pane-1`…
 *
 * Deliberately refuses rather than picks when a spec matches nothing or more
 * than one thing — putting a board on the wrong half of the screen is cheap to
 * notice, but so is saying which half, and a canvas that quietly ignores the
 * half you asked for teaches you to stop trusting the flag.
 */
export function resolvePaneSpec(
  registrations: PaneRegistration[],
  spec: string
): PaneRegistration {
  const ordered = panesInOrder(registrations);
  if (ordered.length === 0) {
    throw new Error(
      `No pane is open, so there is nowhere to put a board — "${spec}" names nothing. ` +
      'Open the canvas in a browser first, or omit --pane to load the board without showing it.'
    );
  }
  const wanted = spec.trim().toLowerCase();
  const list = (): string =>
    ordered.map(entry => `${entry.position}. ${entry.place} (${entry.pane.board})`).join(', ');

  const matches = ordered.filter(entry =>
    entry.place.toLowerCase() === wanted ||
    entry.pane.paneId.toLowerCase() === wanted ||
    entry.pane.clientId === spec.trim() ||
    String(entry.position) === wanted ||
    (wanted === 'focused' && entry.pane.focused) ||
    (wanted === 'primary' && entry.pane.primary)
  );

  if (matches.length === 1) return matches[0]!.pane;
  if (matches.length > 1) {
    throw new Error(
      `"${spec}" matches ${matches.length} panes (${matches.map(m => m.place).join(', ')}), ` +
      `so which one is not decided. Panes on screen: ${list()}.`
    );
  }
  // Nothing here can point a board at a pane that does not exist, and until
  // TASK-033 nothing could make one either — the human had to click Split,
  // which is not available to a voice thread. So the refusal carries the
  // command that makes one, while there is still room on the glass for it.
  const makeOne = ordered.length < MAX_PANES ? ` ${HOW_TO_OPEN_A_PANE}` : '';
  throw new Error(
    `No pane called "${spec}". Panes on screen: ${list()}. ` +
    `--pane takes ${PANE_SPECS}.${makeOne}`
  );
}

/**
 * The pane a caller who named none means — when there is only one, that one.
 *
 * With two panes on screen there is no such pane and this refuses, for the
 * same reason a board has to be named: the answers on offer are "wherever you
 * last clicked" and "whichever we listed first", and both put a board on a
 * half of the screen nobody chose. Which half is cheaper to get wrong than
 * which board, but it is still a guess, and refusing costs one flag.
 *
 * No pane at all is not a refusal: nothing is on screen, so a board can be
 * loaded without being shown.
 */
export function soloPane(registrations: PaneRegistration[]): PaneRegistration | null {
  const ordered = panesInOrder(registrations);
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return ordered[0]!.pane;
  throw new Error(
    `${ordered.length} panes are open, so this needs a pane as well as a board — ` +
    `--pane ${ordered.map(entry => entry.place).join(' | ')}. ` +
    `They are showing ${ordered.map(entry => `${entry.pane.board} (${entry.place})`).join(', ')}.`
  );
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
  const ordered = panesInOrder(registrations).map(entry => entry.pane);
  const places = panesInOrder(registrations).map(entry => entry.place);
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
      place: places[index]!,
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
  // One pane is one board on screen, and a comparison needs two. Said here
  // because this is the report an agent reads every turn, and an agent that
  // does not know a second pane is obtainable reuses the first one — which
  // means overwriting whatever the human was looking at.
  if (panes.length === 1) {
    lines.push(
      `Only one board is on screen. To put another beside it, keeping this one: ${HOW_TO_OPEN_A_PANE}`
    );
  }
  // Said once, not per pane. Two identical lines used to need explaining
  // because the server could not do anything else; now they are a choice, and
  // what a reader needs is how to make the other one.
  if (panes.length > 1 && sameBoard) {
    lines.push(
      'These panes are all on the same board. Point one somewhere else with ' +
      '`board open <name> --pane <left|right|…>`.'
    );
  }
  // The consequence of disagreement, said where the disagreement is visible: a
  // caller that names no board is refused rather than guessed at (ADR 0009).
  if (!sameBoard) {
    lines.push(
      'The panes disagree, so commands that name no board are refused until one is named — ' +
      `\`--board ${panes[0]!.board}\`, or \`--board ${panes.find(p => p.board !== panes[0]!.board)!.board}\`.`
    );
  }
  for (const pane of panes) lines.push(`  ${paneLine(pane)}`);

  return { paneCount: panes.length, arrangement, focused, sameBoard, panes, summary, text: lines.join('\n') };
}
