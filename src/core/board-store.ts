// The element store, keyed by board.
//
// Before multi-document there was a single global `elements` map: every element
// in the process implicitly belonged to one unnamed board, so "load board X"
// had nowhere to put X. The store is now a registry of boards, each holding its
// own elements, plus a pointer to the one the canvas is showing.
//
// A canvas holds exactly one board at a time (CONTEXT.md), and this server
// drives one canvas — so exactly one board is *active*, and every existing
// caller that says nothing about boards means that one. The registry keeps the
// boards that have been opened this session, which is what makes switching away
// and back instant and is the shape panes (TASK-006) will need; it is not a
// cache of the vault, and nothing here is written to disk until a save.

import { ServerElement } from '../types.js';
import {
  BoardIdentity,
  boardKey,
  makeIdentity,
  SCRATCH_BOARD
} from './board.js';

export interface BoardState {
  identity: BoardIdentity;
  elements: Map<string, ServerElement>;
  // Whether this board has a home in the vault. The scratch board the canvas
  // boots with does not until it is saved under a name.
  vaultBacked: boolean;
  file?: string;
  // The note exactly as it was read from (or last written to) disk. Carried so
  // the next save can preserve its frontmatter and anything else the vault put
  // there verbatim.
  note?: string;
  // What archboard last saw at `file`: the sha-256 of the bytes it read there,
  // or of the bytes it wrote there. A save compares the destination against
  // this and refuses when they differ, because the difference is somebody
  // else's work (ADR 0006).
  //
  // Pinned to a path rather than to the board, so a save-as cannot carry a
  // baseline onto a file archboard has never read. A board archboard invented
  // — scratch, or `board new` — has no baseline at all, and that is the same
  // situation as a changed file: there are bytes at the destination that this
  // process has not seen.
  baseline?: { file: string; hash: string; at: string };
  loadedAt?: string;
  savedAt?: string;
}

export const boards = new Map<string, BoardState>();

function newBoardState(identity: BoardIdentity, vaultBacked: boolean): BoardState {
  return { identity, elements: new Map(), vaultBacked };
}

// The board the canvas boots holding. Unnamed work has to land somewhere, and
// every pre-board caller (`add`, `describe`, the browser) targets it without
// knowing boards exist.
const scratchIdentity = makeIdentity({ board: SCRATCH_BOARD });
boards.set(boardKey(scratchIdentity), newBoardState(scratchIdentity, false));

let activeKey = boardKey(scratchIdentity);

export function activeBoardKey(): string {
  return activeKey;
}

export function activeBoard(): BoardState {
  const board = boards.get(activeKey);
  if (board) return board;
  // Unreachable unless a board was deleted out from under the pointer; recover
  // rather than serving undefined to every element route.
  const identity = makeIdentity({ board: SCRATCH_BOARD });
  const fresh = newBoardState(identity, false);
  activeKey = boardKey(identity);
  boards.set(activeKey, fresh);
  return fresh;
}

// Resolve the board a request names. An absent key means the active board,
// which is what every caller written before boards existed means.
export function resolveBoard(key?: string | null): { key: string; board: BoardState } {
  if (key === undefined || key === null || key === '') {
    return { key: activeKey, board: activeBoard() };
  }
  const board = boards.get(key);
  if (!board) {
    throw new Error(
      `Board "${key}" is not open. Open it first (\`board open ${key}\`), or omit the board key to target the active board.`
    );
  }
  return { key, board };
}

export function getOrCreateBoard(identity: BoardIdentity, vaultBacked: boolean): { key: string; board: BoardState } {
  const key = boardKey(identity);
  const existing = boards.get(key);
  if (existing) {
    // Identity can gain a level (or have one corrected) without the board
    // being reloaded; the address itself cannot change here.
    existing.identity = identity;
    if (vaultBacked) existing.vaultBacked = true;
    return { key, board: existing };
  }
  const board = newBoardState(identity, vaultBacked);
  boards.set(key, board);
  return { key, board };
}

export function setActiveBoard(key: string): BoardState {
  const board = boards.get(key);
  if (!board) throw new Error(`Board "${key}" is not open`);
  activeKey = key;
  return board;
}

// The most recent bytes archboard has seen at `file`, or null when it has never
// seen any. Asked of every open board rather than of one, because a baseline
// belongs to the path: `board save --as other` writes a file that a different
// open board may be the one that read it. Where more than one board has a
// claim, the newest wins — that is the last moment archboard actually looked.
export function baselineForFile(file: string): { hash: string; at: string } | null {
  let best: { hash: string; at: string } | null = null;
  for (const board of boards.values()) {
    const baseline = board.baseline;
    if (!baseline || baseline.file !== file) continue;
    if (!best || baseline.at > best.at) best = { hash: baseline.hash, at: baseline.at };
  }
  return best;
}

export function recordBaseline(board: BoardState, file: string, hash: string): void {
  board.baseline = { file, hash, at: new Date().toISOString() };
}

export function boardSummaries(): Array<{
  key: string;
  identity: BoardIdentity;
  elementCount: number;
  vaultBacked: boolean;
  file?: string;
  active: boolean;
  savedAt?: string;
  loadedAt?: string;
}> {
  return Array.from(boards.entries()).map(([key, board]) => ({
    key,
    identity: board.identity,
    elementCount: board.elements.size,
    vaultBacked: board.vaultBacked,
    ...(board.file ? { file: board.file } : {}),
    active: key === activeKey,
    ...(board.savedAt ? { savedAt: board.savedAt } : {}),
    ...(board.loadedAt ? { loadedAt: board.loadedAt } : {})
  }));
}
