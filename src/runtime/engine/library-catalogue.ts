// The stencil palette, as something an agent can choose from and place.
//
// `src/runtime/engine/library.ts` is the store: what a browser posts, what a vault holds.
// This is the layer above it — the two questions an agent actually asks, "what
// can I draw with" and "put that one there". The public CLI commands `library
// list` and `library insert` share these helpers and reach the canvas through
// its internal REST API.
//
// Two things about the palette make this more than a lookup:
//
//   nothing is named   the v1 library format carries no names, so 100 of the
//                      111 shipped stencils are identified only by the overlay
//                      in library-names.ts — and a name alone still does not
//                      tell "Server" from "Device". A catalogue entry therefore
//                      carries size and the words drawn inside the stencil, so
//                      it can be chosen from without being rendered.
//
//   names collide      a name is unique only within the library it came from.
//                      "Database" exists in four. That is the caller's choice
//                      to make, so insertion refuses and names the candidates
//                      rather than picking one.

import {
	getLibrary,
	batchCreateElementsStrict,
	type LibraryResponse,
} from "@/runtime/engine/canvas-client";
import type { ServerElement } from "@/runtime/engine/types";
import { LIBRARY_NAME_OVERLAY } from "@/runtime/engine/library-names";
import { extentOf } from "@/runtime/engine/geometry";
import { AmbiguousStencilError } from "@/runtime/engine/lib/ambiguous-stencil-error";
import { UnknownStencilError } from "@/runtime/engine/lib/unknown-stencil-error";
import type { RawElement } from "@/runtime/engine/lib/library-raw-element";
import { rawElementOf } from "@/runtime/engine/lib/library-raw-element";
import { remapStencil } from "@/runtime/engine/lib/library-stencil-placement";

/** One stencil, described well enough to be picked without being drawn. */
interface CatalogueEntry {
	id: string;
	name: string | null;
	/** The curated set it was seeded from, or null when a human installed it. */
	source: string | null;
	elements: number;
	width: number;
	height: number;
	/** The words drawn inside the stencil, which are often what it really is. */
	text: string | null;
}

/** The whole palette, and where it is kept. */
interface Catalogue {
	count: number;
	seeded: string[];
	file: string | null;
	vaultBacked: boolean;
	items: CatalogueEntry[];
}

/** One palette item as it is stored, elements and all. */
interface StoredItem {
	id: string;
	name?: string | null;
	elements: RawElement[];
}

/**
 * One palette item, with its elements read as stencil elements.
 * @param item The item as the canvas served it.
 * @returns The stored item.
 */
function storedItemOf(item: LibraryResponse["items"][number]): StoredItem {
	return {
		id: item.id,
		name: item.name ?? null,
		elements: item.elements.map((element) => rawElementOf(element)),
	};
}

/** What identifies a palette item well enough to name it. */
interface NameableItem {
	id: string;
	name?: string | null;
}

/**
 * What a stencil is called: its own name, else the overlay's, else nothing.
 *
 * The v1 library format carries no names, so most shipped stencils are named
 * only by `library-names.ts`.
 * @param item The stored item.
 * @returns The name, or null when nothing names it.
 */
function resolvedName(item: NameableItem): string | null {
	return item.name ?? LIBRARY_NAME_OVERLAY[item.id] ?? null;
}

/**
 * How big a stencil is.
 *
 * Measured rather than assumed: a connector inside it stores an origin and a
 * path, not a top-left and a size, so a stencil with a leftward arrow in it
 * used to be listed at the wrong size (geometry.ts, TASK-038).
 * @param elements The stencil's elements.
 * @returns Its width and height, rounded.
 */
function boundingBox(elements: RawElement[]): { width: number; height: number } {
	if (elements.length === 0) {
		return { width: 0, height: 0 };
	}
	const boxes = elements.map((element) => extentOf(element));
	const minX = Math.min(...boxes.map((b) => b.x));
	const minY = Math.min(...boxes.map((b) => b.y));
	const maxX = Math.max(...boxes.map((b) => b.x + b.width));
	const maxY = Math.max(...boxes.map((b) => b.y + b.height));
	return { width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

const TEXT_BUDGET = 60;

/**
 * The distinct lines of text drawn inside a stencil, in the order they appear.
 * @param elements The stencil's elements.
 * @returns The lines, whitespace collapsed and duplicates dropped.
 */
function stencilWords(elements: RawElement[]): string[] {
	const words: string[] = [];
	for (const el of elements) {
		if (typeof el.text !== "string") {
			continue;
		}
		const line = el.text.replaceAll(/\s+/gu, " ").trim();
		if (line.length > 0 && !words.includes(line)) {
			words.push(line);
		}
	}
	return words;
}

/**
 * What a stencil says, in one short phrase.
 *
 * This is what tells "Server" from "Device" when neither carries a name worth
 * reading, so it is worth a listing column of its own.
 * @param elements The stencil's elements.
 * @returns The phrase, truncated to fit a listing, or null when it is silent.
 */
function stencilText(elements: RawElement[]): string | null {
	const words = stencilWords(elements);
	if (words.length === 0) {
		return null;
	}
	const joined = words.join(" / ");
	return joined.length > TEXT_BUDGET ? `${joined.slice(0, TEXT_BUDGET - 1)}…` : joined;
}

/**
 * One stencil described well enough to be chosen without being drawn.
 * @param item The stored item.
 * @param source The curated set it came from, or null when a human installed it.
 * @returns The catalogue entry.
 */
function entryOf(item: StoredItem, source: string | null): CatalogueEntry {
	const { width, height } = boundingBox(item.elements);
	const name = resolvedName(item);
	const text = stencilText(item.elements);
	return {
		id: item.id,
		name,
		source,
		elements: item.elements.length,
		width,
		height,
		// Most names were read off the stencil's own text in the first place, so
		// the two agree more often than not; repeating it would be noise. This
		// field is here for the ones where they part — a "Key-value cache" that
		// reads "Key / Value / Cache", a decision diamond that says "Condition".
		text: text && text.toLowerCase() !== name?.toLowerCase() ? text : null,
	};
}

/** The catalogue plus the elements behind it, which only insertion needs. */
interface LoadedCatalogue extends Catalogue {
	/** The elements behind each entry, by id. Only insertion needs them. */
	stored: Map<string, StoredItem>;
}

/**
 * The whole palette, described and with its elements kept to one side.
 * @returns The catalogue and the stored items behind it.
 */
async function loadCatalogue(): Promise<LoadedCatalogue> {
	const state = await getLibrary();
	const items = state.items.map((item) => storedItemOf(item));
	const stored = new Map(items.map((item) => [item.id, item]));
	return {
		count: items.length,
		seeded: state.seeded,
		file: state.file,
		vaultBacked: state.vaultBacked,
		// Elements are the bulk of a library and say nothing an agent can use to
		// pick a stencil, so the listing carries what identifies one instead.
		items: items.map((item) => entryOf(item, state.origins[item.id] ?? null)),
		stored,
	};
}

/**
 * What is in the palette.
 * @returns The catalogue, without the elements behind it.
 */
async function readCatalogue(): Promise<Catalogue> {
	const { stored: _stored, ...catalogue } = await loadCatalogue();
	return catalogue;
}

/**
 * What the listing says before the stencils themselves: how many there are,
 * where they are kept, and how to ask for one.
 * @param catalogue The catalogue to render.
 * @returns The opening lines.
 */
function catalogueHeader(catalogue: Catalogue): string[] {
	const lines: string[] = [
		catalogue.count === 0 ? "The library is empty." : `${catalogue.count} stencils in the library.`,
		catalogue.vaultBacked
			? `Stored at ${catalogue.file}.`
			: "Not stored: no vault is configured, so the library lasts as long as this canvas server.",
	];
	if (catalogue.seeded.length > 0) {
		lines.push(`Seeded from: ${catalogue.seeded.join(", ")}.`);
	}
	lines.push(
		"",
		"name — size — elements — source library — id, then in quotes what the stencil says, where that is not just its name.",
		"Insert one by name, adding its source when two libraries use that name.",
		"",
	);
	return lines;
}

/**
 * One stencil as a row of the listing.
 * @param item The catalogue entry.
 * @param nameColumn How wide the name column is across the whole listing.
 * @param sourceColumn How wide the source column is.
 * @returns The row.
 */
function catalogueRow(item: CatalogueEntry, nameColumn: number, sourceColumn: number): string {
	const parts = [
		(item.name ?? "—").padEnd(nameColumn),
		`${item.width}x${item.height}`.padStart(9),
		`${item.elements} el`.padStart(7),
		(item.source ?? "installed").padEnd(sourceColumn),
		item.id,
	];
	return `  ${parts.join(" ")}${item.text ? `  "${item.text}"` : ""}`;
}

/**
 * The catalogue as a table, for a human or a narrow context.
 * @param catalogue The catalogue to render.
 * @returns The table.
 */
function catalogueText(catalogue: Catalogue): string {
	const nameColumn = Math.max(4, ...catalogue.items.map((item) => (item.name ?? "—").length));
	const sourceColumn = Math.max(
		9,
		...catalogue.items.map((item) => (item.source ?? "installed").length),
	);
	return [
		...catalogueHeader(catalogue),
		...catalogue.items.map((item) => catalogueRow(item, nameColumn, sourceColumn)),
	].join("\n");
}

// ─── choosing one ─────────────────────────────────────────────────────────

// Both of these are the caller's question to answer, not ours, so each carries
// what it takes to answer it and neither says how — the phrasing of the retry
// is a surface's own business, since one has flags and the other has fields.

/** How a caller says which stencil it means. */
interface StencilQuery {
	name?: string;
	source?: string;
	itemId?: string;
}

/**
 * The one stencil with this id.
 * @param items The catalogue entries to search.
 * @param itemId The id the caller gave.
 * @returns The entry.
 * @throws {UnknownStencilError} When no stencil has that id.
 */
function stencilById(items: CatalogueEntry[], itemId: string): CatalogueEntry {
	const match = items.find((entry) => entry.id === itemId);
	if (match === undefined) {
		throw new UnknownStencilError(`No library item with id "${itemId}".`);
	}
	return match;
}

/**
 * The refusal for a name nothing answers to, quoting the source when the
 * caller narrowed by one.
 * @param query The caller's stencil identity.
 * @returns The error to throw.
 */
function noSuchStencil(query: StencilQuery): UnknownStencilError {
	const from = query.source ? ` from "${query.source}"` : "";
	return new UnknownStencilError(`No library item named "${query.name}"${from}.`);
}

/**
 * The one stencil with this name.
 *
 * A name is unique only within the library it came from — "Database" exists in
 * four — so a name shared by several is the caller's choice to make, not ours.
 * @param items The catalogue entries to search.
 * @param query The caller's stencil identity.
 * @returns The entry.
 * @throws {UnknownStencilError} When nothing answers to the name.
 * @throws {AmbiguousStencilError} When several do.
 */
function stencilByName(items: CatalogueEntry[], query: StencilQuery): CatalogueEntry {
	const name = query.name ?? "";
	const wanted = name.toLowerCase();
	let candidates = items.filter((entry) => entry.name?.toLowerCase() === wanted);
	if (query.source) {
		candidates = candidates.filter((entry) => entry.source === query.source);
	}
	if (candidates.length > 1) {
		throw new AmbiguousStencilError(name, candidates);
	}
	const [match] = candidates;
	if (match === undefined) {
		throw noSuchStencil(query);
	}
	return match;
}

/**
 * The one stencil a caller means.
 * @param items The catalogue entries to search.
 * @param query The caller's stencil identity.
 * @returns The uniquely selected stencil.
 * @throws {UnknownStencilError} When nothing matches.
 * @throws {AmbiguousStencilError} When a name belongs to more than one library.
 */
function chooseStencil(items: CatalogueEntry[], query: StencilQuery): CatalogueEntry {
	return query.itemId ? stencilById(items, query.itemId) : stencilByName(items, query);
}

/**
 * A stencil's elements as a copy to drop on the board.
 *
 * Kept loosely typed at the boundary because a caller decides for itself how
 * much of a raw library element it needs to look at.
 * @param elements The stored elements.
 * @param targetX Where the copy's left edge lands.
 * @param targetY Where the copy's top edge lands.
 * @param attribution What to record on each element about where it came from.
 * @returns The elements to create.
 */
function remapElements(
	elements: RawElement[],
	targetX: number,
	targetY: number,
	attribution: Record<string, unknown>,
): unknown[] {
	return remapStencil(elements, targetX, targetY, attribution);
}

/** What one insertion did. */
interface InsertResult {
	success: true;
	name: string | null;
	source: string | null;
	id: string;
	at: { x: number; y: number };
	count: number;
	elements: ServerElement[];
}

/**
 * Copy a stencil onto the board with its top-left corner at (x, y).
 * @param query The stencil identity and target coordinates.
 * @returns The created board elements and the resolved stencil identity.
 * @throws {UnknownStencilError} When nothing matches; the caller's to answer,
 * so it is not guessed at here.
 * @throws {AmbiguousStencilError} When a name belongs to more than one library.
 */
async function insertStencil(
	query: StencilQuery & { x: number; y: number },
): Promise<InsertResult> {
	const catalogue = await loadCatalogue();
	const entry = chooseStencil(catalogue.items, query);
	const item = catalogue.stored.get(entry.id);

	if (item === undefined || !Array.isArray(item.elements) || item.elements.length === 0) {
		throw new Error(`Library item "${entry.name}" (${entry.id}) has no elements.`);
	}

	// Where a stencil came from, carried on the elements themselves: the only
	// record afterwards that these shapes were a palette item rather than drawn.
	const attribution = {
		library: { item: entry.name, itemId: entry.id, source: entry.source },
	};
	const elements = remapStencil(item.elements, query.x, query.y, attribution);
	const creation = await batchCreateElementsStrict(elements);
	const { elements: created } = creation;

	return {
		success: true,
		name: entry.name,
		source: entry.source,
		id: entry.id,
		at: { x: query.x, y: query.y },
		count: created.length,
		elements: created,
	};
}

export {
	type CatalogueEntry,
	type Catalogue,
	type RawElement,
	readCatalogue,
	catalogueText,
	AmbiguousStencilError,
	UnknownStencilError,
	type StencilQuery,
	chooseStencil,
	remapElements,
	type InsertResult,
	insertStencil,
};
