// The library: the palette of reusable stencils a human drags onto a board.
//
// Excalidraw keeps these in the browser's localStorage. archboard keeps them on
// the server (ADR 0007), because every other assumption localStorage makes is
// wrong here: two panes are two localStorages, a second tab is a third, the
// Flip is a shared appliance whose browser profile gets reset, and an agent
// cannot read a browser's local storage at all. Boards already live on the
// server; stencils are the same kind of thing and belong in the same place.
//
// A library item is NOT a board element. Nothing in this file touches the
// element store, the change feed, or a board — dragging a stencil onto a canvas
// is what turns it into elements, and by then it has stopped being a library
// item.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { VAULT_STATE_DIR } from "./board.js";
import { writeFileAtomic } from "./atomic-write.js";
import { ARCHBOARD_VAULT } from "./config.js";
import { kept } from "./hot.js";
import logger from "./logger.js";

// The v2 library item, which is what both this store and Excalidraw speak.
// `elements` is deliberately loose: they are Excalidraw elements, we never
// interpret them, and narrowing the type here would only invite that.
export interface LibraryItem {
	id: string;
	status: "published" | "unpublished";
	elements: unknown[];
	created: number;
	name?: string;
}

export interface LibraryState {
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

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// The curated sets ship in the checkout, not in the frontend bundle: the
// browser never needs them, because it gets the library from the server like
// everything else. Resolved from src/core/ back to the repo root.
const CURATED_DIR = path.resolve(moduleDir, "../../../libraries");

export function libraryFilePath(): string | null {
	if (!ARCHBOARD_VAULT) return null;
	return path.join(path.resolve(ARCHBOARD_VAULT), VAULT_STATE_DIR, LIBRARY_FILE);
}

// ─── Reading a .excalidrawlib ─────────────────────────────────
//
// Two on-disk formats are in the wild and both are still published by the
// library site: version 1 is a bare array of element arrays, version 2 wraps
// each in an item with an id and a name. Everything past this function is v2.

function deriveId(setName: string, index: number): string {
	return crypto.createHash("sha256").update(`${setName}:${index}`).digest("hex").slice(0, 20);
}

export function parseLibraryFile(json: string, setName: string): LibraryItem[] {
	return parseLibraryDocument(JSON.parse(json), setName);
}

export function parseLibraryDocument(parsed: unknown, setName: string): LibraryItem[] {
	if (!parsed || typeof parsed !== "object") {
		throw new Error(`${setName}: not a library file`);
	}
	const document = parsed as Record<string, unknown>;
	const raw: unknown[] = Array.isArray(document.libraryItems)
		? document.libraryItems
		: Array.isArray(document.library)
			? document.library
			: [];

	const items: LibraryItem[] = [];
	raw.forEach((entry, index) => {
		// v1: the item *is* its elements.
		const record = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
		const elements = Array.isArray(entry) ? entry : record?.elements;
		if (!Array.isArray(elements) || elements.length === 0) return;
		const item: LibraryItem = {
			// An item's own id is kept when it has one, so that installing the same
			// library from the site later merges with the seeded copy instead of
			// duplicating it — Excalidraw merges library items by id.
			id:
				(record && typeof record.id === "string" && record.id) ||
				deriveId(setName, index),
			status: record?.status === "unpublished" ? "unpublished" : "published",
			elements: elements.filter((el: unknown) => el && typeof el === "object" && (el as Record<string, unknown>).isDeleted !== true),
			created:
				(record && typeof record.created === "number" && record.created) || Date.now(),
		};
		if (record && typeof record.name === "string" && record.name) item.name = record.name;
		if (item.elements.length > 0) items.push(item);
	});
	return items;
}

/** The curated sets that ship with archboard, by file basename. */
export function curatedSets(): Array<{ name: string; items: LibraryItem[] }> {
	let files: string[];
	try {
		files = fs
			.readdirSync(CURATED_DIR)
			.filter((f) => f.endsWith(".excalidrawlib"))
			.toSorted();
	} catch {
		logger.warn(`No curated libraries found at ${CURATED_DIR}`);
		return [];
	}
	const sets: Array<{ name: string; items: LibraryItem[] }> = [];
	for (const file of files) {
		const name = file.replace(/\.excalidrawlib$/, "");
		try {
			sets.push({
				name,
				items: parseLibraryFile(fs.readFileSync(path.join(CURATED_DIR, file), "utf8"), name),
			});
		} catch (error) {
			logger.warn(`Skipping curated library ${file}: ${(error as Error).message}`);
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

// Kept across a hot reload. With no vault configured this is not a cache at
// all, it is the library, so rebuilding it on a file save would empty the
// palette (src/core/hot.ts).
const cache = kept("library", () => ({ state: null as LibraryState | null }));

function emptyState(): LibraryState {
	const file = libraryFilePath();
	return { items: [], seeded: [], origins: {}, file, vaultBacked: file !== null };
}

function readFromDisk(
	file: string,
): { items: LibraryItem[]; seeded: string[]; origins: Record<string, string> } | null {
	if (!fs.existsSync(file)) return null;
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		const seeded = Array.isArray(parsed?.archboard?.seeded)
			? parsed.archboard.seeded.filter((s: unknown) => typeof s === "string")
			: [];
		const origins =
			parsed?.archboard?.origins && typeof parsed.archboard.origins === "object"
				? (parsed.archboard.origins as Record<string, string>)
				: {};
		return { items: parseLibraryDocument(parsed, "library"), seeded, origins };
	} catch (error) {
		// A corrupt library must not take the canvas server down with it, and it
		// must not be silently replaced either: the bad file keeps its name until
		// a write moves it aside.
		logger.error(`Could not read the library at ${file}: ${(error as Error).message}`);
		return null;
	}
}

function persist(state: LibraryState): void {
	if (!state.file) return;
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
 * The library, seeding any curated set that has never been offered.
 *
 * Seeded items go in at the end, so a human's own stencils stay at the top of
 * the palette where they put them.
 */
export function readLibrary(): LibraryState {
	if (cache.state) return cache.state;

	const state = emptyState();
	if (state.file) {
		const stored = readFromDisk(state.file);
		if (stored) {
			state.items = stored.items;
			state.seeded = stored.seeded;
			state.origins = stored.origins;
		}
	}

	const known = new Set(state.items.map((item) => item.id));
	let added = 0;
	for (const set of curatedSets()) {
		if (state.seeded.includes(set.name)) continue;
		state.seeded.push(set.name);
		for (const item of set.items) {
			if (known.has(item.id)) continue;
			known.add(item.id);
			state.items.push(item);
			state.origins[item.id] = set.name;
			added++;
		}
	}
	if (added > 0) {
		logger.info(`Seeded ${added} library items from ${state.seeded.length} curated sets`);
		persist(state);
	}

	cache.state = state;
	return cache.state;
}

/** Replace the library with what a browser reports it to now be. */
export function writeLibrary(items: LibraryItem[]): LibraryState {
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
export function resetLibraryCache(): void {
	cache.state = null;
}
