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

import { kept } from './hot.js';
import { ExcalidrawFile, ServerElement } from '../types.js';
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
  /**
   * The images this board's elements draw, keyed by the `fileId` an image
   * element carries. Excalidraw's own model: a scene has a `files` map and an
   * image element names an entry in it, so a board's images are exactly the
   * ones its elements reference (TASK-060).
   *
   * This used to be one map for the whole process, keyed by file id and shared
   * by every open board, which is what made saving board A write board B's
   * images into A's note. A file id says nothing about which board it belongs
   * to; only an element does.
   */
  files: Map<string, ExcalidrawFile>;
  // Where this board's note is, or would be. Every board has one, scratch
  // included (ADR 0015): the vault is the only place board content may live,
  // so a board the process held and the vault did not would be the exception
  // that turns that rule into a preference. The file is not written until a
  // save, so `file` set with no `savedAt` means "nothing there yet".
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
  // baseline onto a file archboard has never read. A board archboard has not
  // read a note for — one `board new` just started, or a scratch board whose
  // note does not exist yet — has no baseline at all, and that is the same
  // situation as a changed file: there are bytes at the destination that this
  // process has not seen.
  baseline?: { file: string; hash: string; at: string };
  loadedAt?: string;
  savedAt?: string;
}

// The boards this canvas has open, and the only copy of anything unsaved on
// them. Kept across a hot reload, because a file save must never be what
// throws a human's rearrangement away (src/core/hot.ts, ADR 0014).
export const boards = kept('boards', () => new Map<string, BoardState>());

function newBoardState(identity: BoardIdentity): BoardState {
  return { identity, elements: new Map(), files: new Map() };
}

// The board a pane shows when nothing else is on screen: somewhere for work
// that has not been given a name yet. It is a board like any other and has to
// be named like any other — `--board scratch` — but it exists from boot, so a
// first-time user has something in front of them and something to name.
//
// Its note is `<vault>/.archboard/scratch.excalidraw.md`, and the canvas
// adopts whatever is there when it starts (`adoptScratchBoard` in server.ts).
// The path is not resolved here, because this module is loaded by processes
// that have no vault and no business demanding one.
export const SCRATCH_KEY = boardKey(makeIdentity({ board: SCRATCH_BOARD }));
// Only when it is missing. A hot reload re-runs this line with the scratch
// board already open, and setting it again would blank whatever is on it.
if (!boards.has(SCRATCH_KEY)) {
  boards.set(SCRATCH_KEY, newBoardState(makeIdentity({ board: SCRATCH_BOARD })));
}

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

export function getOrCreateBoard(identity: BoardIdentity): { key: string; board: BoardState } {
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
    return { key, board: existing };
  }
  const board = newBoardState(identity);
  boards.set(key, board);
  return { key, board };
}

/**
 * Elements that share nothing with the ones handed in.
 *
 * Three things keep a copy of a board and mean it: a branch, which exists so
 * the source can stay put (TASK-042); a snapshot, whose entire job is to be
 * the copy you go back to (TASK-048); and the change feed's baseline, which is
 * what "the board as anybody was last told it stood" means (TASK-052). All
 * three used to hold the live board's own element objects. Nothing failed,
 * because every path that changes an element replaces the object rather than
 * editing it — but that invariant was never written down and nothing enforced
 * it, and a copy that only works while every future writer remembers a rule is
 * not a copy.
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

/**
 * The images a set of elements draws, out of everything a board holds.
 *
 * An image element names its data with `fileId`, so this is Excalidraw's own
 * answer to "which images does this board use" rather than a guess at one. A
 * file nothing points at is not written into a note (TASK-060).
 */
export function filesUsedBy(
  elements: Iterable<Pick<ServerElement, 'fileId'>>,
  available: ReadonlyMap<string, ExcalidrawFile>
): Record<string, ExcalidrawFile> {
  const used: Record<string, ExcalidrawFile> = {};
  for (const element of elements) {
    const id = element.fileId;
    if (typeof id !== 'string') continue;
    const file = available.get(id);
    if (file) used[id] = file;
  }
  return used;
}

/**
 * Give a board copies of some images, replacing whatever it held.
 *
 * Takes a scene's `files` object, which is keyed by file id. The key is the
 * authority on the id: an entry read out of a note may carry an `id` field or
 * may not, and the key is the thing an image element's `fileId` matches.
 */
export function replaceBoardFiles(board: BoardState, files: Record<string, unknown>): void {
  board.files.clear();
  for (const [id, raw] of Object.entries(files)) {
    if (!raw || typeof raw !== 'object') continue;
    const file = raw as Partial<ExcalidrawFile>;
    if (typeof file.dataURL !== 'string') continue;
    board.files.set(id, {
      id,
      dataURL: file.dataURL,
      mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'image/png',
      created: typeof file.created === 'number' ? file.created : Date.now()
    });
  }
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
  placeholder: boolean;
  file?: string;
  savedAt?: string;
  loadedAt?: string;
}> {
  return Array.from(boards.entries()).map(([key, board]) => ({
    key,
    identity: board.identity,
    elementCount: board.elements.size,
    // Scratch is a board with a note but not a name anybody chose, and that is
    // the only thing about it that is different. Said on the wire so a surface
    // can offer "give this a name" without knowing what scratch is called.
    placeholder: key === SCRATCH_KEY,
    ...(board.file ? { file: board.file } : {}),
    ...(board.savedAt ? { savedAt: board.savedAt } : {}),
    ...(board.loadedAt ? { loadedAt: board.loadedAt } : {})
  }));
}
