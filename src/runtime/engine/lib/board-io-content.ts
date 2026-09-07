// A board as one request works on it: the maps a loaded note turns into, and
// the session bookkeeping that installs one (ADR 0015, ADR 0020). Nothing here
// reads or writes a note; `board-io.ts` does that and hands the result in.

import { type ExcalidrawFile, type ServerElement } from "@/runtime/engine/types";
import { holdOn } from "@/runtime/engine/board-hold";
import { type BoardState, getOrCreateBoard, recordBaseline } from "@/runtime/engine/board-store";
import { BoardResolutionError } from "@/runtime/engine/board-target";
import { type BoardIdentity, boardKey } from "@/runtime/engine/lib/board-address";
import { validateRenderGeometry } from "@/runtime/engine/geometry";
import { validatePersistedBoardElement } from "@/runtime/engine/lib/native-element";
import { isRecord } from "@/runtime/engine/lib/unknown-record";
import { errorMessage } from "@/runtime/engine/lib/board-errno";

/**
 * One board, as one request found it.
 *
 * `elements` and `files` are what the note held, in the maps the routes work
 * against. `note` is the note's own text, carried so a write can put its
 * frontmatter and prose back verbatim, and `hash` is what those bytes hashed to
 * — the thing a write checks the destination against before it replaces it
 * (ADR 0006).
 *
 * Both are absent when there is nothing at the path yet: a board somebody has
 * just made, or a scratch board in a vault that has never held one.
 */
interface BoardContent {
	elements: Map<string, ServerElement>;
	files: Map<string, ExcalidrawFile>;
	note?: string;
	hash?: string;
	/**
	 * Which edit of the board the note was, when it was read (TASK-091). Null for
	 * a note that carries no version archboard can read, absent for a board with
	 * no note behind it yet.
	 */
	version?: number | null;
}

/**
 * A note as it was found on disk.
 *
 * Whatever is true of reading a note is true here, because this is the only
 * place it happens: the `.excalidraw.md` refusal, the hash the next write is
 * checked against, and the pictures the Obsidian plugin moved out into vault
 * files.
 */
interface NoteFile {
	file: string;
	/** The whole note, so a write can put its frontmatter and prose back verbatim. */
	raw: string;
	/** sha-256 of the bytes it was decoded from: the baseline operand (ADR 0006). */
	hash: string;
	/** Which edit of the board it was, or null when it carries no count (TASK-091). */
	version: number | null;
	/** The drawing, with any image the plugin moved out of it put back. */
	sceneJson: string;
}

/**
 * A note, plus the identity of the board it turned out to hold.
 *
 * What `browser show` needs and a per-request read does not: a request already
 * knows which board it is working on, and opening one is the act that finds
 * out.
 */
interface LoadedBoard extends NoteFile {
	identity: BoardIdentity;
	// What the note's own frontmatter claims, when that is a different board
	// than the one being opened — a note renamed or moved in Obsidian since it
	// was last saved. The path is the address, so that is what the caller gets;
	// the next save rewrites the frontmatter and the disagreement goes away.
	// Surfaced rather than silently reconciled, because it usually means a human
	// moved something and may not have meant to.
	declaredKey?: string;
}

interface BoardAccess {
	key: string;
	board: BoardState;
	content: BoardContent;
}

interface ResolvedBoard extends BoardAccess {
	/** The exact persisted load used to build content, for same-load lifecycle observers. */
	loaded: LoadedBoard;
}

interface ResolvedBoardNote {
	key: string;
	loaded: LoadedBoard;
}

interface InstallBoardOptions {
	/** Establish a missing baseline from this exact load while the caller holds the board lock. */
	write?: boolean;
	/** A waiter may accept only this exact hash from the released lease it observed. */
	trustedPredecessorHash?: string;
	/** Explicit reload takes the persisted note and discards any held document. */
	ignoreHold?: boolean;
}

/**
 * A board with nothing in it, for a note that is not there yet.
 * @returns Empty element and file maps.
 */
function emptyContent(): BoardContent {
	return { elements: new Map(), files: new Map() };
}

/**
 * A board's images in the shape carried by scene messages, or nothing when it
 * has none. Every whole-board frame needs these records or image elements
 * render as holes (TASK-060).
 * @param content The board.
 * @returns A `files` record to spread into a message, or an empty object.
 */
function boardFilesMessage(content: BoardContent): { files?: Record<string, ExcalidrawFile> } {
	if (content.files.size === 0) {
		return {};
	}
	return { files: Object.fromEntries(content.files) };
}

/**
 * One scene file record as a note carries it, or null when the entry has no
 * image data to draw.
 * @param id The file id, from the scene's `files` key.
 * @param raw The value under that key.
 * @returns The record with defaults filled, or null.
 */
function ingestFile(id: string, raw: unknown): ExcalidrawFile | null {
	if (!isRecord(raw) || typeof raw["dataURL"] !== "string") {
		return null;
	}
	return {
		id,
		dataURL: raw["dataURL"],
		mimeType: typeof raw["mimeType"] === "string" ? raw["mimeType"] : "image/png",
		created: typeof raw["created"] === "number" ? raw["created"] : Date.now(),
	};
}

/**
 * Take a scene into the maps a request works against: its elements, and the
 * images those elements draw.
 *
 * Mirrors the batch-create path — ids preserved, server bookkeeping stamped —
 * so a board read from a note behaves exactly like one that was just drawn.
 *
 * The images used to be dropped here. An image element came back from a note
 * and its data did not, so the board reopened with a hole where the picture
 * was. That was a rendering failure while the process was the copy that
 * mattered; now the note is rewritten from what was read, so anything not read
 * back is deleted on the next write (TASK-060).
 * @param sceneElements The scene's raw element records.
 * @param sceneFiles The scene's raw `files` map, when it has one.
 * @param context What is being read, for error messages.
 * @returns The element and file maps.
 */
function ingestScene(
	sceneElements: unknown[],
	sceneFiles?: Record<string, unknown> | null,
	context = "scene",
): { elements: Map<string, ServerElement>; files: Map<string, ExcalidrawFile> } {
	const elements = new Map<string, ServerElement>();
	for (const raw of sceneElements) {
		const element = validatePersistedBoardElement(raw, context);
		if (elements.has(element.id)) {
			throw new Error(`${context}: duplicate element id ${element.id}`);
		}
		elements.set(element.id, element);
	}

	// A note already in the vault gets no silent repair. Refuse the whole scene
	// here, before any caller can register it or send it to a pane, and let the
	// existing board-open error path put the actionable geometry error on screen.
	validateRenderGeometry(elements.values());

	const files = new Map<string, ExcalidrawFile>();
	for (const [id, raw] of Object.entries(sceneFiles ?? {})) {
		const file = ingestFile(id, raw);
		if (file) {
			files.set(id, file);
		}
	}
	return { elements, files };
}

/**
 * The element list and files map a parsed scene holds, whether it is a bare
 * element array or a whole Excalidraw document.
 * @param scene The parsed scene JSON.
 * @param context What is being read, for the error when `elements` is not a list.
 * @returns The raw elements and the raw files record, if any.
 */
function sceneParts(
	scene: unknown,
	context: string,
): { elements: unknown[]; files: Record<string, unknown> | null } {
	if (Array.isArray(scene)) {
		return { elements: scene, files: null };
	}
	if (!isRecord(scene)) {
		return { elements: [], files: null };
	}
	const elements = scene["elements"] ?? [];
	if (!Array.isArray(elements)) {
		throw new Error(`${context}: elements is not an array`);
	}
	const files = scene["files"];
	return { elements, files: isRecord(files) ? files : null };
}

/**
 * Parse a loaded note's drawing, refusing with a resolution error a caller can
 * act on when the JSON is broken.
 * @param loaded The note as read.
 * @returns The parsed scene.
 */
function parseLoadedScene(loaded: LoadedBoard): unknown {
	try {
		return JSON.parse(loaded.sceneJson);
	} catch (error) {
		throw new BoardResolutionError(
			boardKey(loaded.identity),
			"malformed",
			`Board "${boardKey(loaded.identity)}" has malformed drawing JSON in ${loaded.file}. Repair or restore that note, then retry.`,
			[loaded.file],
			{ cause: error },
		);
	}
}

/**
 * The board a loaded note holds, with every ingestion failure reported as the
 * same malformed-note refusal.
 * @param loaded The note as read.
 * @returns The board content, carrying the note's bytes, hash and version.
 */
function contentFromLoadedBoard(loaded: LoadedBoard): BoardContent {
	const scene = parseLoadedScene(loaded);
	try {
		const parts = sceneParts(scene, loaded.file);
		const { elements, files } = ingestScene(parts.elements, parts.files, loaded.file);
		return { elements, files, note: loaded.raw, hash: loaded.hash, version: loaded.version };
	} catch (error) {
		if (error instanceof BoardResolutionError) {
			throw error;
		}
		throw new BoardResolutionError(
			boardKey(loaded.identity),
			"malformed",
			`Board "${boardKey(loaded.identity)}" cannot be read from ${loaded.file}: ${errorMessage(error)} Repair or restore that note, then retry.`,
			[loaded.file],
			{ cause: error },
		);
	}
}

/**
 * A held board has one live document, and its note is deliberately not it.
 * The maps are copied so a request that throws half way leaves the held copy
 * as it found it.
 * @param content The held document.
 * @returns The same elements and files in fresh maps.
 */
function copyHeldContent(content: BoardContent): BoardContent {
	return {
		...content,
		elements: new Map(content.elements),
		files: new Map(content.files),
	};
}

/**
 * The board behind a resolved note: the held copy while a hold lasts, the
 * note otherwise.
 * @param key The board key.
 * @param loaded The note as read.
 * @returns The board content.
 */
function resolvedBoardContent(key: string, loaded: LoadedBoard): BoardContent {
	const hold = holdOn(key);
	return hold ? copyHeldContent(hold.content) : contentFromLoadedBoard(loaded);
}

/**
 * Whether installing this load should (re)establish the board's write
 * baseline: a write with no baseline for this file yet, or one following the
 * exact predecessor lease the waiter observed.
 * @param board The registered board state.
 * @param loaded The note as read.
 * @param options What the caller is about to do.
 * @returns True when the baseline should be recorded from this load.
 */
function shouldRecordBaseline(
	board: BoardState,
	loaded: LoadedBoard,
	options: InstallBoardOptions,
): boolean {
	if (!options.write) {
		return false;
	}
	const baseline = board.baseline;
	if (!baseline || baseline.file !== loaded.file) {
		return true;
	}
	return options.trustedPredecessorHash === loaded.hash && baseline.hash !== loaded.hash;
}

/**
 * Install one already-resolved load for explicit open/create/write bookkeeping.
 * @param resolution The key and the note as read.
 * @param options Whether to take the note over a hold, and whether a write follows.
 * @returns The registered board, its content and the exact load.
 */
function materializeResolvedBoard(
	resolution: ResolvedBoardNote,
	options: InstallBoardOptions = {},
): ResolvedBoard {
	const { key, loaded } = resolution;
	const content = options.ignoreHold
		? contentFromLoadedBoard(loaded)
		: resolvedBoardContent(key, loaded);
	const { board } = getOrCreateBoard(loaded.identity);
	board.file = loaded.file;
	if (shouldRecordBaseline(board, loaded, options)) {
		recordBaseline(board, loaded.file, loaded.hash, loaded.version);
	}
	return { key, board, content, loaded };
}

export {
	type BoardContent,
	type NoteFile,
	type LoadedBoard,
	type BoardAccess,
	type ResolvedBoard,
	type ResolvedBoardNote,
	type InstallBoardOptions,
	emptyContent,
	boardFilesMessage,
	ingestScene,
	sceneParts,
	parseLoadedScene,
	contentFromLoadedBoard,
	copyHeldContent,
	resolvedBoardContent,
	materializeResolvedBoard,
};
