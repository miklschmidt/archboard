// The library: the palette of reusable stencils a human drags onto a board.
//
// Excalidraw keeps these in the browser's localStorage. archboard keeps them on
// the server (ADR 0007), because every other assumption localStorage makes is
// wrong here: two panes are two localStorages, a second tab is a third, the
// Browser profiles may be reset, and an agent
// cannot read a browser's local storage at all. Boards already live on the
// server; stencils are the same kind of thing and belong in the same place.
//
// A library item is NOT a board element. Nothing in this file touches the
// element store, the change feed, or a board — dragging a stencil onto a canvas
// is what turns it into elements, and by then it has stopped being a library
// item.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { VAULT_STATE_DIR } from "@/runtime/engine/board";
import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import { ARCHBOARD_VAULT } from "@/runtime/engine/config";
import { logger } from "@/runtime/engine/logger";
import { errorMessage } from "@/runtime/engine/lib/thrown-error";
import { isRecord, numberAt, stringAt } from "@/runtime/engine/lib/unknown-record";

// The v2 library item, which is what both this store and Excalidraw speak.
// `elements` is deliberately loose: they are Excalidraw elements, we never
// interpret them, and narrowing the type here would only invite that.
interface LibraryItem {
	id: string;
	status: "published" | "unpublished";
	elements: unknown[];
	created: number;
	name?: string;
}

interface LibraryState {
	items: LibraryItem[];
	/** Curated sets already offered, by file basename. Seeding never repeats. */
	seeded: string[];
	/**
	 * Which curated set each seeded item came from, by item id. Attribution that
	 * lives in the data rather than only in libraries/README.md, and the only
	 * thing that makes the 100 unnamed stencils tellable apart — the v1 library
	 * format carries no names at all. Kept out of the items themselves so that a
	 * browser round-trip cannot quietly drop it.
	 */
	origins: Record<string, string>;
	/** Where this is written, or null when there is no vault to write it to. */
	file: string | null;
	vaultBacked: boolean;
}

// In the vault's state directory, alongside the scratch note (board.ts): out
// of the way, because Obsidian hides dot-directories, so the vault's note list
// stays notes. The file keeps the standard .excalidrawlib shape and extension,
// so it can be handed to excalidraw.com or to the Obsidian plugin without
// conversion; our seeding bookkeeping rides in an extra key, which every
// reader of that format ignores.
const LIBRARY_FILE = "library.excalidrawlib";

// The curated sets ship in the checkout, not in the frontend bundle: the
// browser never needs them, because it gets the library from the server like
// everything else. Resolved from src/runtime/engine/ back to the repo root.
const CURATED_DIR = path.resolve(import.meta.dirname, "../../../libraries");

/**
 * Where the library is kept.
 * @returns The path, or null when there is no vault to write one to.
 */
function libraryFilePath(): string | null {
	if (!ARCHBOARD_VAULT) {
		return null;
	}
	return path.join(path.resolve(ARCHBOARD_VAULT), VAULT_STATE_DIR, LIBRARY_FILE);
}

// ─── Reading a .excalidrawlib ─────────────────────────────────
//
// Two on-disk formats are in the wild and both are still published by the
// library site: version 1 is a bare array of element arrays, version 2 wraps
// each in an item with an id and a name. Everything past this function is v2.

/**
 * A stable id for a v1 item, which carries none of its own.
 *
 * Derived from the set and the position rather than minted, so that reading
 * the same curated file twice produces the same ids and the second read merges
 * rather than duplicating.
 * @param setName The curated set's basename.
 * @param index Where the item sits in it.
 * @returns The id.
 */
function deriveId(setName: string, index: number): string {
	return crypto.createHash("sha256").update(`${setName}:${index}`).digest("hex").slice(0, 20);
}

/**
 * The item list a library document carries, under either of the two keys the
 * library site publishes.
 * @param document The parsed file.
 * @returns The entries, or none when it holds no list at all.
 */
function libraryEntriesOf(document: Record<string, unknown>): unknown[] {
	if (Array.isArray(document["libraryItems"])) {
		return document["libraryItems"];
	}
	return Array.isArray(document["library"]) ? document["library"] : [];
}

/**
 * One entry as a v2 item record, when it is one.
 * @param entry The entry as it was published.
 * @returns The record, or null for a v1 entry, which is its elements.
 */
function entryRecord(entry: unknown): Record<string, unknown> | null {
	return isRecord(entry) && !Array.isArray(entry) ? entry : null;
}

/**
 * The elements one entry states, in either format.
 * @param entry The entry as it was published.
 * @param record The same entry as a v2 record, when it is one.
 * @returns The elements, or none.
 */
function statedElements(entry: unknown, record: Record<string, unknown> | null): unknown[] {
	const stated = Array.isArray(entry) ? entry : record?.["elements"];
	return Array.isArray(stated) ? stated : [];
}

/**
 * The elements that still exist. Excalidraw tombstones a deleted element
 * rather than removing it, and a stencil made only of tombstones draws nothing.
 * @param elements The stated elements.
 * @returns The ones that are not tombstones.
 */
function liveElements(elements: readonly unknown[]): unknown[] {
	return elements.filter((el) => isRecord(el) && el["isDeleted"] !== true);
}

/**
 * An item's id.
 *
 * Its own is kept when it has one, so that installing the same library from
 * the site later merges with the seeded copy instead of duplicating it —
 * Excalidraw merges library items by id.
 * @param record The v2 record, when there is one.
 * @param setName The curated set's basename.
 * @param index Where the item sits in it.
 * @returns The id.
 */
function itemId(record: Record<string, unknown> | null, setName: string, index: number): string {
	const stated = record ? stringAt(record, "id") : undefined;
	return stated || deriveId(setName, index);
}

/**
 * Whether an item was published or is somebody's own work in progress.
 * @param record The v2 record, when there is one.
 * @returns The status.
 */
function itemStatus(record: Record<string, unknown> | null): LibraryItem["status"] {
	return record?.["status"] === "unpublished" ? "unpublished" : "published";
}

/**
 * When an item was made, falling back to now for a format that never said.
 * @param record The v2 record, when there is one.
 * @returns The timestamp.
 */
function itemCreated(record: Record<string, unknown> | null): number {
	const stated = record ? numberAt(record, "created", 0) : 0;
	return stated || Date.now();
}

/**
 * An item's name, present only where the file actually carried one: the v1
 * format has no names at all.
 * @param record The v2 record, when there is one.
 * @returns The `name` field, or nothing.
 */
function itemName(record: Record<string, unknown> | null): { name?: string } {
	const stated = record ? stringAt(record, "name") : undefined;
	return stated ? { name: stated } : {};
}

/**
 * One published entry as a library item.
 * @param entry The entry as it was published.
 * @param setName The curated set's basename.
 * @param index Where the entry sits in it.
 * @returns The item, or null when it draws nothing.
 */
function libraryItemOf(entry: unknown, setName: string, index: number): LibraryItem | null {
	const record = entryRecord(entry);
	const elements = liveElements(statedElements(entry, record));
	if (elements.length === 0) {
		return null;
	}
	return {
		id: itemId(record, setName, index),
		status: itemStatus(record),
		elements,
		created: itemCreated(record),
		...itemName(record),
	};
}

/**
 * Every stencil a library document holds, in v2 form whichever format it came
 * in.
 * @param parsed The parsed file.
 * @param setName What to call it in errors and derived ids.
 * @returns The items.
 * @throws {Error} When the file is not a library at all.
 */
function parseLibraryDocument(parsed: unknown, setName: string): LibraryItem[] {
	if (!isRecord(parsed)) {
		throw new Error(`${setName}: not a library file`);
	}
	const items: LibraryItem[] = [];
	for (const [index, entry] of libraryEntriesOf(parsed).entries()) {
		const item = libraryItemOf(entry, setName, index);
		if (item) {
			items.push(item);
		}
	}
	return items;
}

/**
 * Every stencil a .excalidrawlib file holds.
 * @param json The file's contents.
 * @param setName What to call it in errors and derived ids.
 * @returns The items.
 * @throws {Error} When the file is not a library, or not JSON at all.
 */
function parseLibraryFile(json: string, setName: string): LibraryItem[] {
	return parseLibraryDocument(JSON.parse(json), setName);
}

/** One curated set, named after the file it shipped in. */
interface CuratedSet {
	name: string;
	items: LibraryItem[];
}

/**
 * The curated set files that ship with archboard.
 * @returns Their basenames, sorted, or none when the directory is missing.
 */
function curatedFiles(): string[] {
	try {
		return fs
			.readdirSync(CURATED_DIR)
			.filter((f) => f.endsWith(".excalidrawlib"))
			.toSorted();
	} catch {
		logger.warn(`No curated libraries found at ${CURATED_DIR}`);
		return [];
	}
}

/**
 * The curated sets that ship with archboard, by file basename.
 *
 * One unreadable set is skipped rather than fatal: the rest of the palette is
 * still worth having.
 * @returns The sets, in file order.
 */
function curatedSets(): CuratedSet[] {
	const sets: CuratedSet[] = [];
	for (const file of curatedFiles()) {
		const name = file.replace(/\.excalidrawlib$/u, "");
		try {
			const contents = fs.readFileSync(path.join(CURATED_DIR, file), "utf8");
			sets.push({ name, items: parseLibraryFile(contents, name) });
		} catch (error) {
			logger.warn(`Skipping curated library ${file}: ${errorMessage(error)}`);
		}
	}
	return sets;
}

// ─── The store ────────────────────────────────────────────────
//
// Held in memory and written through, because every library change in a browser
// posts the whole set and a 1MB re-read per keystroke-sized edit is silly. With
// no vault configured there is nothing to write to, so the library lives for as
// long as the process does — the same deal boards get, minus the refusal, since
// there is no wrong file to be written here.

// With no vault configured this is not a cache at all; it is process state.
const cache = { state: null as LibraryState | null };

/**
 * A library with nothing in it, knowing where it would be written.
 * @returns The empty state.
 */
function emptyState(): LibraryState {
	const file = libraryFilePath();
	return { items: [], seeded: [], origins: {}, file, vaultBacked: file !== null };
}

/** What the stored library file says, beyond its items. */
interface StoredLibrary {
	items: LibraryItem[];
	seeded: string[];
	origins: Record<string, string>;
}

/**
 * Which curated sets the stored file records as already offered.
 * @param archboard Our own bookkeeping key, when the file carries one.
 * @returns The set names.
 */
function storedSeeded(archboard: Record<string, unknown> | undefined): string[] {
	const seeded = archboard?.["seeded"];
	return Array.isArray(seeded) ? seeded.filter((s): s is string => typeof s === "string") : [];
}

/**
 * Which curated set each stored item came from.
 * @param archboard Our own bookkeeping key, when the file carries one.
 * @returns Item id to set name, keeping only the entries that name one.
 */
function storedOrigins(archboard: Record<string, unknown> | undefined): Record<string, string> {
	const origins = archboard?.["origins"];
	if (!isRecord(origins)) {
		return {};
	}
	const kept: Record<string, string> = {};
	for (const [id, source] of Object.entries(origins)) {
		if (typeof source === "string") {
			kept[id] = source;
		}
	}
	return kept;
}

/**
 * The library as the vault holds it.
 *
 * A corrupt library must not take the canvas server down with it, and it must
 * not be silently replaced either: the bad file keeps its name until a write
 * moves it aside.
 * @param file Where the library is kept.
 * @returns What it holds, or null when there is nothing readable there.
 */
function readFromDisk(file: string): StoredLibrary | null {
	if (!fs.existsSync(file)) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		const stated = isRecord(parsed) ? parsed["archboard"] : undefined;
		const archboard = isRecord(stated) ? stated : undefined;
		return {
			items: parseLibraryDocument(parsed, "library"),
			seeded: storedSeeded(archboard),
			origins: storedOrigins(archboard),
		};
	} catch (error) {
		logger.error(`Could not read the library at ${file}: ${errorMessage(error)}`);
		return null;
	}
}

/**
 * Write the library out, when there is a vault to write it to.
 * @param state The library to persist.
 */
function persist(state: LibraryState): void {
	if (!state.file) {
		return;
	}
	const document = {
		type: "excalidrawlib",
		version: 2,
		source: "archboard",
		libraryItems: state.items,
		// Which curated sets have already been offered. Kept so that deleting one
		// means deleting it — reseeding on every start would make the library
		// impossible to curate — and so that an eighth set added later still
		// reaches a vault that already exists.
		archboard: { seeded: state.seeded, origins: state.origins },
	};
	fs.mkdirSync(path.dirname(state.file), { recursive: true });
	// Atomic, like every other write into the vault (TASK-061). The library is
	// one file every pane reads, and a torn one loses every stencil in it.
	writeFileAtomic(state.file, JSON.stringify(document, null, 2));
}

/**
 * Fill a fresh state from the vault, where there is one to read.
 * @param state The state to fill, edited in place.
 */
function loadStoredState(state: LibraryState): void {
	if (!state.file) {
		return;
	}
	const stored = readFromDisk(state.file);
	if (!stored) {
		return;
	}
	state.items = stored.items;
	state.seeded = stored.seeded;
	state.origins = stored.origins;
}

/**
 * Offer every curated set that has never been offered before.
 *
 * Seeded items go in at the end, so a human's own stencils stay at the top of
 * the palette where they put them. A set is marked as offered whether or not
 * any of its items were new, so deleting one means deleting it.
 * @param state The state to seed, edited in place.
 * @returns How many items were added.
 */
function seedCuratedSets(state: LibraryState): number {
	const known = new Set(state.items.map((item) => item.id));
	let added = 0;
	for (const set of curatedSets()) {
		if (state.seeded.includes(set.name)) {
			continue;
		}
		state.seeded.push(set.name);
		for (const item of set.items) {
			if (known.has(item.id)) {
				continue;
			}
			known.add(item.id);
			state.items.push(item);
			state.origins[item.id] = set.name;
			added++;
		}
	}
	return added;
}

/**
 * The library, seeding any curated set that has never been offered.
 * @returns The library after seeding any newly available curated sets.
 */
function readLibrary(): LibraryState {
	if (cache.state) {
		return cache.state;
	}
	const state = emptyState();
	loadStoredState(state);
	const added = seedCuratedSets(state);
	if (added > 0) {
		logger.info(`Seeded ${added} library items from ${state.seeded.length} curated sets`);
		persist(state);
	}
	cache.state = state;
	return cache.state;
}

/**
 * Replace the library with what a browser reports it to now be.
 * @param items The complete library, as the browser holds it.
 * @returns The persisted library state.
 */
function writeLibrary(items: LibraryItem[]): LibraryState {
	const state = readLibrary();
	state.items = items;
	// Provenance follows the items. A stencil the human deleted leaves nothing
	// behind, and one they kept keeps its attribution.
	const present = new Set(items.map((item) => item.id));
	state.origins = Object.fromEntries(
		Object.entries(state.origins).filter(([id]) => present.has(id)),
	);
	persist(state);
	return state;
}

/** Test seam: forget what has been read, so the next read hits the disk. */
function resetLibraryCache(): void {
	cache.state = null;
}

export {
	type LibraryItem,
	type LibraryState,
	libraryFilePath,
	parseLibraryFile,
	parseLibraryDocument,
	curatedSets,
	readLibrary,
	writeLibrary,
	resetLibraryCache,
};
