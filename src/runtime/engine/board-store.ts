// Which boards this canvas has open, and where each one's note is.
//
// Before multi-document there was a single global `elements` map: every element
// in the process implicitly belonged to one unnamed board, so "load board X"
// had nowhere to put X. This became a registry of boards, each holding its own
// elements. Now it holds no elements at all.
//
// THE NOTE IS THE BOARD (ADR 0015). This registry used to hold the elements,
// the images and the note's own bytes, which made it a second copy of every
// open board — one that could drift from the note for as long as a session ran,
// and did, four times, each found by a person noticing something absurd. A
// request reads the note it is about and writes it back (src/core/board-io.ts);
// what survives between requests is the sentence "this canvas has payments open,
// and its note is at <path>", which is a fact about this process rather than
// about the board.
//
// So there is no cache to invalidate here and nothing here is unsaved. A board
// with no note yet — a `board new` nobody has written, a scratch board in a
// fresh vault — is empty rather than pending.
//
// A canvas holds exactly one board at a time (CONTEXT.md) and a pane is a slot
// holding its own canvas, so the number of boards on screen is the number of
// panes.
//
// The pointer that used to live here — `activeKey`, "the board" — is gone. It
// answered for every caller that named no board, and with a board per pane
// there is nothing for it to point at that is not a guess. So resolveBoard()
// requires a key and refuses without one (ADR 0009), and this module is the
// single place every board-blind caller funnelled through, which is why the
// refusal only had to be written once.

import { kept } from "./hot.js";
import { type ServerElement } from "./types.js";
import { BoardRequiredError } from "./board-target.js";
import {
	type BoardIdentity,
	boardKey,
	makeIdentity,
	normalizeBoardKey,
	SCRATCH_BOARD,
} from "./board.js";

export interface BoardState {
	identity: BoardIdentity;
	// Where this board's note is. Every board has one, scratch included
	// (ADR 0015): the vault is the only place board content may live, so a board
	// the process held and the vault did not would be the exception that turns
	// that rule into a preference. Optional only because this module is loaded by
	// processes with no vault, which have no path to put here.
	file?: string;
	// What archboard last saw at `file`: the sha-256 of the bytes it read when it
	// opened the board, or of the bytes it wrote at its last write. A write
	// compares the destination against this and refuses when they differ, because
	// the difference is somebody else's work (ADR 0006).
	//
	// This is not the bytes the current request read. That would make the check
	// vacuous — a note Obsidian rewrote a moment ago reads back cleanly — and it
	// is why a plain read does not touch this: only putting a board on screen and
	// writing one do. Under ADR 0015 a write happens on every gesture, so the
	// baseline is milliseconds old and the question it asks is "did somebody get
	// in between our last two writes" rather than "has anything happened since
	// this session began".
	//
	// Pinned to a path rather than to the board, so a save-as cannot carry a
	// baseline onto a file archboard has never read. A board archboard has not
	// read a note for — one `board new` just started, or a scratch board whose
	// note does not exist yet — has no baseline at all, and that is the same
	// situation as a changed file: there are bytes at the destination that this
	// process has not seen.
	//
	// The version goes with the hash because the two answer different halves of
	// one question (TASK-091). The hash says the note is not the one archboard
	// left; the version, compared against the one the note carries now, says
	// which way it moved and therefore who moved it. Null for a note carrying no
	// version archboard can read, which is every note written before this existed.
	baseline?: { file: string; hash: string; at: string; version: number | null };
	loadedAt?: string;
	savedAt?: string;
}

// The boards this canvas has open. Kept across a hot reload, because which
// board each pane is holding must not change under somebody at a wall display
// (src/core/hot.ts, ADR 0014). What is on those boards is in the vault and is
// re-read per request, so a reload cannot lose it.
export const boards = kept("boards", () => new Map<string, BoardState>());

function newBoardState(identity: BoardIdentity): BoardState {
	return { identity };
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
// board already open, and setting it again would throw away the note path the
// server resolved for it at startup.
if (!boards.has(SCRATCH_KEY)) {
	boards.set(SCRATCH_KEY, newBoardState(makeIdentity({ board: SCRATCH_BOARD })));
}

/** Every board this canvas has open, for the message that lists them. */
export function openBoardKeys(): string[] {
	return Array.from(boards.keys()).toSorted();
}

// Resolve the board a request names — and it has to name one.
//
// There is deliberately no else-branch here. The pointer this function used to
// fall back to is gone (ADR 0009): with a board per pane there is no single
// board for it to point at, and any answer invented for a caller who named
// none is a write landing somewhere nobody chose.
export function resolveBoard(
	key?: string | null,
	what?: string,
): { key: string; board: BoardState } {
	if (key === undefined || key === null || key.trim() === "") {
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
				`Open right now: ${openBoardKeys().join(", ")}.`,
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
				: { displayName: existing.identity.displayName }),
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
	return Array.from(elements, (element) => structuredClone(element));
}

// The most recent bytes archboard has seen at `file`, or null when it has never
// seen any. Asked of every open board rather than of one, because a baseline
// belongs to the path: `board save --as other` writes a file that a different
// open board may be the one that read it. Where more than one board has a
// claim, the newest wins — that is the last moment archboard actually looked.
export function baselineForFile(
	file: string,
): { hash: string; at: string; version: number | null } | null {
	let best: { hash: string; at: string; version: number | null } | null = null;
	for (const board of boards.values()) {
		const baseline = board.baseline;
		if (!baseline || baseline.file !== file) continue;
		if (!best || baseline.at > best.at) {
			best = { hash: baseline.hash, at: baseline.at, version: baseline.version };
		}
	}
	return best;
}

export function recordBaseline(
	board: BoardState,
	file: string,
	hash: string,
	version: number | null,
): void {
	board.baseline = { file, hash, at: new Date().toISOString(), version };
}

// How many elements each open board has, which is the one thing about a board
// this module can no longer answer on its own: it is in the note, and reading
// notes is board-io's job. Injected rather than imported, because board-io
// reads and writes through this registry and a cycle between them would be a
// worse shape than one argument.
export function boardSummaries(elementCount: (board: BoardState) => number): Array<{
	key: string;
	identity: BoardIdentity;
	elementCount: number;
	placeholder: boolean;
	file?: string;
	savedAt?: string;
	loadedAt?: string;
}> {
	return Array.from(boards.entries()).map(([key, board]) =>
		Object.assign(
			{
				key,
				identity: board.identity,
				elementCount: elementCount(board),
				// Scratch is a board with a note but not a name anybody chose, and that is
				// the only thing about it that is different. Said on the wire so a surface
				// can offer "give this a name" without knowing what scratch is called.
				placeholder: key === SCRATCH_KEY,
			},
			board.file ? { file: board.file } : {},
			board.savedAt ? { savedAt: board.savedAt } : {},
			board.loadedAt ? { loadedAt: board.loadedAt } : {},
		),
	);
}
