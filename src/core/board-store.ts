// The element store, keyed by board.
//
// Before multi-document there was a single global `elements` map: every element
// in the process implicitly belonged to one unnamed board, so "load board X"
// had nowhere to put X. The store is a registry of boards, each holding its
// own elements — and nothing else. There is no pointer to a current one.
//
// A canvas holds exactly one board at a time (CONTEXT.md) and a pane is a slot
// holding its own canvas, so the number of boards on screen is the number of
// panes. The registry keeps every board opened this session, which is what
// makes switching away and back instant and what lets two panes hold two
// boards at once; it is not a cache of the vault, and nothing here is written
// to disk until a save.
//
// The pointer that used to live here — `activeKey`, "the board" — is gone. It
// answered for every caller that named no board, and with a board per pane
// there is nothing for it to point at that is not a guess. So resolveBoard()
// requires a key and refuses without one (ADR 0009), and this module is the
// single place every board-blind caller funnelled through, which is why the
// refusal only had to be written once.

import { ServerElement } from '../types.js';
import { BoardRequiredError } from './board-target.js';
import {
  BoardIdentity,
  boardKey,
  makeIdentity,
  normalizeBoardKey,
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

// The board a pane shows when nothing else is on screen: somewhere for work
// that has not been given a name yet. It is a board like any other and has to
// be named like any other — `--board scratch` — but it exists from boot, so a
// first-time user has something in front of them and something to name.
export const SCRATCH_KEY = boardKey(makeIdentity({ board: SCRATCH_BOARD }));
boards.set(SCRATCH_KEY, newBoardState(makeIdentity({ board: SCRATCH_BOARD }), false));

/** Every board this canvas has open, for the message that lists them. */
export function openBoardKeys(): string[] {
  return Array.from(boards.keys()).sort();
}

// Resolve the board a request names — and it has to name one.
//
// There is deliberately no else-branch here. The pointer this function used to
// fall back to is gone (ADR 0009): with a board per pane there is no single
// board for it to point at, and any answer invented for a caller who named
// none is a write landing somewhere nobody chose.
export function resolveBoard(key?: string | null, what?: string): { key: string; board: BoardState } {
  if (key === undefined || key === null || key.trim() === '') {
    throw new BoardRequiredError(openBoardKeys(), what);
  }
  // Addresses are case-insensitive (ADR 0010), so `--board Payments` reaches
  // the board that was opened as `payments`. Normalising here rather than at
  // each caller is the same reasoning as the refusal above: this is the one
  // door every board-shaped request comes through.
  const normalized = normalizeBoardKey(key);
  const board = boards.get(normalized);
  if (!board) {
    throw new Error(
      `Board "${normalized}" is not open. Open it first (\`board open ${normalized}\`). ` +
      `Open right now: ${openBoardKeys().join(', ')}.`
    );
  }
  return { key: normalized, board };
}

export function getOrCreateBoard(identity: BoardIdentity, vaultBacked: boolean): { key: string; board: BoardState } {
  const key = boardKey(identity);
  const existing = boards.get(key);
  if (existing) {
    // Identity can gain a level (or have one corrected) without the board
    // being reloaded; the address itself cannot change here.
    //
    // The display casing is the note's, not the caller's: opening `payments`
    // must not rename a board somebody created as `Payments`, because the
    // address is case-insensitive and the request said nothing about casing.
    existing.identity = {
      ...identity,
      ...(identity.displayName || !existing.identity.displayName
        ? {}
        : { displayName: existing.identity.displayName })
    };
    if (vaultBacked) existing.vaultBacked = true;
    return { key, board: existing };
  }
  const board = newBoardState(identity, vaultBacked);
  boards.set(key, board);
  return { key, board };
}

/**
 * Elements that share nothing with the ones handed in.
 *
 * Two things keep a copy of a board and mean it: a branch, which exists so the
 * source can stay put (TASK-042), and a snapshot, whose entire job is to be
 * the copy you go back to (TASK-048). Both used to hold the live board's own
 * element objects. Nothing failed, because every path that changes an element
 * replaces the object rather than editing it — but that invariant was never
 * written down and nothing enforced it, and a copy that only works while every
 * future writer remembers a rule is not a copy.
 *
 * It is the same reasoning that removed the sync path in TASK-016: two things
 * holding one scene is how one of them silently overwrites the other.
 *
 * Deep rather than a spread, because the fields that carry the meaning are the
 * nested ones. `customData` is the semantic channel (ADR 0003) and
 * `boundElements` is how a label belongs to its container, so a shallow copy
 * would leave exactly the parts worth protecting shared.
 */
export function copyElements(elements: Iterable<ServerElement>): ServerElement[] {
  return Array.from(elements, element => structuredClone(element));
}

/** Fill a board with copies of some elements, replacing whatever it held. */
export function replaceBoardElements(board: BoardState, elements: ServerElement[]): void {
  board.elements.clear();
  for (const element of copyElements(elements)) board.elements.set(element.id, element);
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
  savedAt?: string;
  loadedAt?: string;
}> {
  return Array.from(boards.entries()).map(([key, board]) => ({
    key,
    identity: board.identity,
    elementCount: board.elements.size,
    vaultBacked: board.vaultBacked,
    ...(board.file ? { file: board.file } : {}),
    ...(board.savedAt ? { savedAt: board.savedAt } : {}),
    ...(board.loadedAt ? { loadedAt: board.loadedAt } : {})
  }));
}
