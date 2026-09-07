// The note is the board. This module reads one and writes one, and it is the
// only place either happens (ADR 0015).
//
// One read, `readNoteFile`, under both callers that want a board out of a
// note: `readBoardFile` for `browser show`, which wants the identity the note
// declares as well, and `readNote` for the per-request read, which wants the
// elements in the maps the routes work against. Resolving which file, reading
// it, and interpreting what came back are three jobs and only the middle one
// is shared — that middle one used to exist twice, and the second copy is what
// let TASK-085's fix miss the path every request takes. Interpreting what came
// back is lib/board-io-content.ts; working out which file is
// lib/board-io-resolution.ts; the read stays here.
//
// `writeBoardContent` reads the destination too and deliberately does not go
// through it: it hashes whatever bytes are there, including bytes that are not
// a note at all, because a foreign file at a board's path is the conflict it
// exists to report rather than an error it should throw.
//
// Before this, a board opened once and then lived in the process: the elements,
// the images, the note's own bytes, and a hash taken at the moment it was read.
// A save wrote that copy out. Everything in between — every agent write, every
// edit a user made — moved the copy and left the note where it was, so the two
// diverged for as long as a session ran and four bugs came out of the gap.
//
// Now a request reads the note, works on what it read, and writes it back. What
// the process holds between requests is which boards are open and where each
// one's note is (src/runtime/engine/board-store.ts); the content belongs to the request
// that read it and is gone when the response goes out.
//
// The cost is a read-modify-write per mutating request: 15.6 ms on a 56-element
// board and 18 to 23 ms on a 300-element one, of which the fsync is over half
// and does not vary with size (docs/design/server-is-the-truth.md §8). Against
// the busiest second of real use anybody has measured — seven writes — that is
// 110 to 162 ms, on a board four times larger than any real one. The estimate
// this was accepted on was 6.21 and 9.75 ms; the parse and the render came in
// where it said and the fsync is about twice what it said.
//
// EVERYTHING HERE IS SYNCHRONOUS, and that is load-bearing rather than
// incidental. Express runs synchronous handlers to completion one at a time, so
// two requests for one board cannot interleave their read-modify-write cycles
// and lose an update. An `await` anywhere between the read and the write would
// open exactly that window. Excluding a *second process* is a different problem
// and belongs to the board mutex (ADR 0016), not here.

import fs from "fs";
import path from "path";

import { writeFileAtomic, writeFileAtomicExclusive } from "@/runtime/engine/atomic-write";
import { holdOn } from "@/runtime/engine/board-hold";
import { type BoardState, getOrCreateBoard, recordBaseline } from "@/runtime/engine/board-store";
import { BoardRequiredError, BoardResolutionError } from "@/runtime/engine/board-target";
import {
	type BoardIdentity,
	boardKey,
	hashBoardBytes,
	identityFromFrontmatter,
	identityFromVaultPath,
	listBoards,
	makeIdentity,
	requireVaultRoot,
	sceneJsonWithEmbeddedImages,
	vaultPathFor,
} from "@/runtime/engine/board";
import { describeWriteConflict, stampBoardVersion, versionNumber } from "@/runtime/engine/board-version";
import { isObsidianExcalidrawMd } from "@/runtime/engine/obsidian-md";
import { errnoCode, errorMessage } from "@/runtime/engine/lib/board-errno";
import {
	type BoardAccess,
	type BoardContent,
	type LoadedBoard,
	type NoteFile,
	type ResolvedBoard,
	type ResolvedBoardNote,
	type InstallBoardOptions,
	copyHeldContent,
	emptyContent,
	ingestScene,
	materializeResolvedBoard,
	parseLoadedScene,
	resolvedBoardContent,
	sceneParts,
} from "@/runtime/engine/lib/board-io-content";
import {
	type BoardInspectionSnapshot,
	projectBoardRenderSnapshot,
	renderSnapshotFingerprint,
	sceneElementsOf,
} from "@/runtime/engine/lib/board-io-inspection";
import {
	availableBoardKeys,
	candidateNoteFor,
	conflictingDeclaration,
	existingNotesError,
	parseAskedKey,
} from "@/runtime/engine/lib/board-io-resolution";
import {
	BoardWriteConflictError,
	type WriteOptions,
	foreignWriteTo,
} from "@/runtime/engine/lib/board-io-conflict";
import { renderContent } from "@/runtime/engine/lib/board-io-note-render";
import { settleBoardContent } from "@/runtime/engine/lib/board-io-settlement";
import { type VaultBoard } from "@/runtime/engine/lib/board-vault-listing";

/**
 * Read one note. THE one read: everything else here and in `board.ts` is
 * either working out which file, or working out what the result means.
 *
 * That is not tidiness, it is the bug this had. Two readers stood here — this
 * one for the per-request read every route takes (ADR 0015), and
 * `readBoardFile` for `browser show` — and TASK-085 taught only one of them to
 * follow a migrated picture. The two merged with no conflict, and a board the
 * plugin had been through rendered holes on every read until `256369d`
 * repaired it with a targeted change. `tests/system/boards/image-persistence.test.ts` guards both
 * callers: it reads one migrated note through each caller below and asserts they agree on
 * the bytes, the hash, the picture and the refusal, and it asserts that exactly
 * one line in `src/` calls `sceneJsonWithEmbeddedImages`.
 * @param file The note's path.
 * @param root The vault root, for following moved pictures.
 * @returns The note as found, or null for a note that is not there: a board
 * somebody has just made has no file yet and that is not an error.
 */
function readNoteFile(file: string, root = requireVaultRoot()): NoteFile | null {
	let bytes: Buffer;
	try {
		// Read bytes, then decode. The baseline hash has to be of what is on disk,
		// so decoding is a separate step that cannot get between the two.
		bytes = fs.readFileSync(file);
	} catch (error) {
		if (errnoCode(error) === "ENOENT") {
			return null;
		}
		throw error;
	}
	const raw = bytes.toString("utf-8");
	if (!isObsidianExcalidrawMd(raw)) {
		throw new Error(
			`${file} exists but is not an Obsidian .excalidraw.md note — refusing to read it as a board.`,
		);
	}
	return {
		file,
		raw,
		hash: hashBoardBytes(bytes),
		version: versionNumber(raw),
		// A picture the plugin moved out into a vault file is followed here
		// (TASK-085, ADR 0017), which is what decides whether a migrated board
		// draws or renders holes. It costs nothing on a note with no
		// `## Embedded Files` section: the scene is reassembled only when one of
		// its links resolved to a file.
		sceneJson: sceneJsonWithEmbeddedImages(raw, file, root),
	};
}

/**
 * The display name a note's own frontmatter or filename chose for the board
 * being asked for. Casing comes from the note, not from whoever typed the
 * address: the note is where a human chose it and the address is
 * case-insensitive either way. Its own frontmatter first, then the filename,
 * then the address.
 * @param asked The identity as asked.
 * @param declared What the frontmatter declares, if anything.
 * @param onDisk What the file name implies, if anything.
 * @returns The display name to carry, if any.
 */
function chosenDisplayName(
	asked: BoardIdentity,
	declared: BoardIdentity | null,
	onDisk: BoardIdentity | null,
): string | undefined {
	const key = boardKey(asked);
	return (
		(declared && boardKey(declared) === key ? declared.displayName : undefined) ??
		(onDisk && boardKey(onDisk) === key ? onDisk.displayName : undefined) ??
		asked.displayName
	);
}

/**
 * A board note, and who the note says it is.
 *
 * The address being opened is the identity, because that is how the file was
 * found; the note's frontmatter supplies `level`, which no path can carry, and
 * is reported when it names a different board — a note the Obsidian plugin
 * created has no archboard keys at all until archboard first saves it.
 *
 * Two jobs on top of the read, and only these two: turn an identity into a
 * path, and say what the note's own frontmatter claims. The bytes come back
 * exactly as any other read gets them.
 * @param identity The board to open.
 * @param root The vault root.
 * @returns The note and its identity, or null when there is no note.
 */
function readBoardFile(
	identity: Pick<BoardIdentity, "board" | "variant" | "displayName">,
	root = requireVaultRoot(),
): LoadedBoard | null {
	const note = readNoteFile(vaultPathFor(identity, root), root);
	if (!note) {
		return null;
	}
	const asked = makeIdentity({ board: identity.board, variant: identity.variant });
	const declared = identityFromFrontmatter(note.raw);
	const displayName = chosenDisplayName(asked, declared, identityFromVaultPath(note.file, root));
	return {
		...note,
		identity: {
			...asked,
			...(declared?.level ? { level: declared.level } : {}),
			...(displayName ? { displayName } : {}),
		},
		...(declared && boardKey(declared) !== boardKey(asked)
			? { declaredKey: boardKey(declared) }
			: {}),
	};
}

/**
 * The elements and images a note holds, plus the bytes they came out of.
 * @param file The note's path.
 * @returns The board content, or null when there is no note.
 */
function readNote(file: string): BoardContent | null {
	const note = readNoteFile(file);
	if (!note) {
		return null;
	}
	const parts = sceneParts(JSON.parse(note.sceneJson), file);
	const { elements, files } = ingestScene(parts.elements, parts.files, file);
	return { elements, files, note: note.raw, hash: note.hash, version: note.version };
}

/**
 * Read the one note a resolved address names, turning a failed or missing
 * read into the refusal that says what to do about it.
 * @param identity The board asked for.
 * @param key Its key, for the messages.
 * @param candidate The listed note, when the listing had one.
 * @param root The vault root.
 * @returns The loaded note.
 */
function loadResolvedNote(
	identity: BoardIdentity,
	key: string,
	candidate: VaultBoard | undefined,
	root: string,
): LoadedBoard {
	let loaded: LoadedBoard | null;
	try {
		loaded = readBoardFile(identity, root);
	} catch (error) {
		throw new BoardResolutionError(
			key,
			"malformed",
			`Board "${key}" cannot be read from the vault: ${errorMessage(error)} Repair or restore its note, then retry.`,
			candidate ? [candidate.file] : [],
			{ cause: error },
		);
	}
	if (!loaded) {
		throw new BoardResolutionError(
			key,
			"missing",
			`Board "${key}" was not found in the vault at ${root}. Run \`board list\` to see what exists, or \`board new ${key}\` to create it.`,
		);
	}
	return loaded;
}

/**
 * Resolve one explicit address to exactly one valid persisted note, or refuse
 * with the reason: nothing named, a bad address, several notes, a note that
 * disagrees with its own frontmatter, an unreadable note, or no note at all.
 * @param asked The address as typed, if any.
 * @param what What is being done, for the "needs a board" refusal.
 * @returns The key and the loaded note.
 */
function resolveBoardNote(asked?: string | null, what?: string): ResolvedBoardNote {
	const root = requireVaultRoot();
	if (asked === undefined || asked === null || asked.trim() === "") {
		throw new BoardRequiredError(availableBoardKeys(root), what);
	}
	const identity = parseAskedKey(asked);
	const key = boardKey(identity);
	const candidate = candidateNoteFor(key, root);
	const loaded = loadResolvedNote(identity, key, candidate, root);
	if (loaded.declaredKey) {
		throw conflictingDeclaration(key, loaded.file, loaded.declaredKey);
	}
	return { key, loaded };
}

/**
 * Resolve one explicit address to exactly one valid persisted note and the
 * board behind it, without touching session bookkeeping.
 * @param asked The address as typed, if any.
 * @param what What is being done, for the "needs a board" refusal.
 * @returns The board, its content and the exact load.
 */
function resolveBoard(asked?: string | null, what?: string): ResolvedBoard {
	const { key, loaded } = resolveBoardNote(asked, what);
	const content = resolvedBoardContent(key, loaded);
	const board: BoardState = { identity: loaded.identity, file: loaded.file };
	return { key, board, content, loaded };
}

/**
 * Resolve and install a board only for an operation that needs session bookkeeping.
 * @param asked The address as typed, if any.
 * @param what What is being done, for the "needs a board" refusal.
 * @param options Whether to take the note over a hold, and whether a write follows.
 * @returns The registered board, its content and the exact load.
 */
function resolveInstalledBoard(
	asked?: string | null,
	what?: string,
	options: InstallBoardOptions = {},
): ResolvedBoard {
	return materializeResolvedBoard(resolveBoardNote(asked, what), options);
}

/**
 * Publish and register a canonical empty board without touching browser state.
 * The note is created exclusively, so two writers racing to the same name
 * leave one note and one refusal rather than one note written twice.
 * @param identity The board to create.
 * @returns The registered board and its empty content.
 */
function createBoard(identity: BoardIdentity): BoardAccess {
	const root = requireVaultRoot();
	const key = boardKey(identity);
	const existing = listBoards(root).filter((entry) => entry.key === key);
	if (existing.length > 0) {
		throw existingNotesError(key, existing);
	}
	const file = vaultPathFor(identity, root);
	const content = emptyContent();
	const rendered = renderContent(identity, content, null);
	const stamped = stampBoardVersion(rendered, undefined);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	try {
		writeFileAtomicExclusive(file, stamped.bytes);
	} catch (error) {
		if (errnoCode(error) !== "EEXIST") {
			throw error;
		}
		throw new BoardResolutionError(
			key,
			"conflicting",
			`Board "${key}" was created by another writer at ${file}. Use that board or choose another name.`,
			[file],
			{ cause: error },
		);
	}
	const { board } = getOrCreateBoard(identity);
	board.file = file;
	board.savedAt = new Date().toISOString();
	recordBaseline(board, file, hashBoardBytes(stamped.bytes), stamped.version);
	return {
		key,
		board,
		content: {
			...content,
			note: stamped.note,
			hash: hashBoardBytes(stamped.bytes),
			version: stamped.version,
		},
	};
}

/**
 * Read raw persisted element records for the read-only inspection command.
 *
 * This stops before ingestScene. In particular, it does not mint ids, stamp
 * server fields, validate render geometry, deduplicate into a map, register a
 * board, or establish a write baseline.
 * @param key The board key.
 * @returns The scene's element records as the note holds them.
 */
function readRawBoardElementsForInspection(key: string): readonly unknown[] {
	return readBoardInspectionSnapshot(key).elements;
}

/**
 * One named note read shared by inspection and focused rendering.
 * @param key The board key.
 * @returns The raw elements, a render projection and a fingerprint of both.
 */
function readBoardInspectionSnapshot(key: string): BoardInspectionSnapshot {
	const { key: resolvedKey, loaded: note } = resolveBoardNote(key, "Inspecting a board");
	const scene = parseLoadedScene(note);
	const elements = sceneElementsOf(scene);
	if (!elements) {
		throw new Error(`${note.file} has no elements array in its Drawing payload.`);
	}
	return {
		board: resolvedKey,
		elements,
		fingerprint: renderSnapshotFingerprint(note.hash, scene),
		renderScene: projectBoardRenderSnapshot(scene),
	};
}

/**
 * A board, read fresh.
 *
 * Every request that touches a board starts here, which is what makes the note
 * the answer to "what is on this board" rather than one of two answers. A board
 * whose note is not there yet — one `board new` has just started, a scratch
 * board in a fresh vault — reads as empty rather than failing: it exists, it is
 * open, and there is nothing on it.
 *
 * A board on hold is the one case where the note is not the answer, and it is
 * not an exception to ADR 0015 so much as the situation ADR 0015 assumes cannot
 * be avoided: the note has been taken over by another editor, so it holds their
 * board and not this one (src/runtime/engine/board-hold.ts). There is still exactly one
 * answer here, which is the whole property — every reader, every describe,
 * every pane and the change feed come through this line and see the same board.
 *
 * The maps are copied so that a request which throws half way through leaves
 * the held copy as it found it, the way a re-read from the note would. The
 * elements inside them are shared, so a write path that edited one in place
 * rather than replacing it would still reach through; that is TASK-084 and it
 * is no worse here than on the note.
 * @param board The open board.
 * @returns Its content: the held copy, the note, or empty.
 */
function readBoardContent(board: BoardState): BoardContent {
	const hold = holdOn(boardKey(board.identity));
	if (hold) {
		return copyHeldContent(hold.content);
	}
	if (!board.file) {
		return emptyContent();
	}
	return readNote(board.file) ?? emptyContent();
}

/**
 * The destination as it stands right now, not as this request found it.
 * @param file The note's path.
 * @returns Its bytes, or undefined when nothing is there to conflict with.
 */
function destinationBytes(file: string): Buffer | undefined {
	try {
		return fs.readFileSync(file);
	} catch {
		return undefined;
	}
}

/**
 * Write a board to its note, or refuse.
 *
 * WHAT THE CHECK ASKS, AND WHY IT IS NOT THE BYTES THIS REQUEST JUST READ.
 * The operand is the baseline: the bytes archboard last put on screen or last
 * wrote at this path. It is deliberately not the read at the top of this
 * request, which would make the check vacuous — a note Obsidian rewrote a
 * second ago reads back cleanly, and applying a pane's delta to it would
 * silently merge two scenes that do not merge (ADR 0006).
 *
 * What ADR 0015 changes is how *recent* that baseline is. archboard used to
 * record a note's hash when it opened the board and check it at the next
 * explicit save, hours later, so the question was "did this change at some
 * point during the session". Every write goes through here now, so the baseline
 * is the one the previous write left milliseconds ago and the question is "did
 * somebody else get in between our last two writes". The refusal therefore
 * arrives on the user edit that follows a foreign edit rather than at the end of
 * an afternoon — and arrives without anybody having asked for a save, which is
 * TASK-079's problem, not this function's.
 *
 * Nothing is written when the check fails, so a refused write leaves the vault
 * exactly as it found it, empty directories included.
 * @param board The open board, which must have a note path.
 * @param content The board to write; settled in place first.
 * @param options Force, and which board the save was issued for.
 * @returns Where it was written, what the bytes hashed to, and the note's new version.
 */
function writeBoardContent(
	board: BoardState,
	content: BoardContent,
	options: WriteOptions = {},
): {
	file: string;
	hash: string;
	note: string;
	elementCount: number;
	overwrote: boolean;
	version: number | null;
} {
	const file = board.file;
	if (!file) {
		throw new Error(`Board "${boardKey(board.identity)}" has no note to write to.`);
	}
	const identity = board.identity;
	// Before anything is rendered or checked, so what the caller is holding and
	// what the note will say are the same document.
	settleBoardContent(content);

	const destination = destinationBytes(file);
	const foreign = options.force ? null : foreignWriteTo(file, destination);
	if (foreign) {
		throw new BoardWriteConflictError(
			describeWriteConflict({
				target: identity,
				...foreign,
				...(options.savedFrom === undefined ? {} : { savedFrom: options.savedFrom }),
			}),
		);
	}

	const rendered = renderContent(
		identity,
		content,
		// The destination's own frontmatter and prose, not the source's: a save-as
		// onto an existing note keeps what that note's author put there.
		destination?.toString("utf-8"),
	);
	const { note, bytes, version } = stampBoardVersion(rendered, destination);
	// The folder for a nested name, made after the check rather than before it,
	// so a refused write leaves no directory behind.
	fs.mkdirSync(path.dirname(file), { recursive: true });
	// By rename, so a reader sees the old note or the new one and never a partial
	// (TASK-061). The note is the only copy of the board now, so a torn write is
	// the board rather than the last save.
	writeFileAtomic(file, bytes);

	const hash = hashBoardBytes(bytes);
	// What archboard has now seen at this path is what it just wrote — the
	// operand the *next* write's check compares against, both halves of it.
	recordBaseline(board, file, hash, version);
	return {
		file,
		hash,
		note,
		elementCount: rendered.elementCount,
		overwrote: destination !== undefined,
		version,
	};
}

export {
	type BoardContent,
	type LoadedBoard,
	type NoteFile,
	type BoardAccess,
	type ResolvedBoard,
	type InstallBoardOptions,
	type ResolvedBoardNote,
	boardFilesMessage,
	emptyContent,
	ingestScene,
	materializeResolvedBoard,
} from "@/runtime/engine/lib/board-io-content";
export {
	type BoardInspectionSnapshot,
	projectBoardRenderSnapshot,
} from "@/runtime/engine/lib/board-io-inspection";
export {
	BoardWriteConflictError,
	type ForeignWrite,
	type WriteOptions,
	foreignWriteTo,
} from "@/runtime/engine/lib/board-io-conflict";
export { renderContent } from "@/runtime/engine/lib/board-io-note-render";
export { settleBoardContent } from "@/runtime/engine/lib/board-io-settlement";
export {
	readNoteFile,
	readBoardFile,
	readNote,
	resolveBoardNote,
	resolveBoard,
	resolveInstalledBoard,
	createBoard,
	readRawBoardElementsForInspection,
	readBoardInspectionSnapshot,
	readBoardContent,
	writeBoardContent,
};
