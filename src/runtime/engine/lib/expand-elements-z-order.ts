// Excalidraw's `index` is a fractional index, and it is the z-order. Two rules
// make one valid: the strings increase along the array, and each parses. Ours
// used to be `a${n}`, which breaks at ten elements — `a10` sorts before `a2` —
// so a board of twelve came back from a render with five indices repaired.

import { generateKeyBetween } from "fractional-indexing";
import type { ServerElement } from "@/runtime/engine/types";

/**
 * Whether a value is an index key the fractional-indexing scheme accepts.
 * @param key The candidate key.
 * @returns True for a parseable string key.
 */
const validIndexKey = (key: unknown): key is string => {
	if (typeof key !== "string") {
		return false;
	}
	try {
		generateKeyBetween(key, null);
		return true;
	} catch {
		return false;
	}
};

// The integer keys of the fractional-indexing scheme: one leading letter
// saying how many digits follow, then base-62 digits. `a0` through `az`, then
// `b00`.
const INDEX_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * The integer index key for a position in a run.
 * @param position The zero-based position.
 * @returns The key.
 */
function fractionalIndex(position: number): string {
	let width = 1;
	let offset = 0;
	let span = INDEX_DIGITS.length;
	// `a` holds 62, `b` holds 62², and so on; `az` < `b00` because `a` < `b`.
	while (position >= offset + span && width < 26) {
		offset += span;
		width += 1;
		span *= INDEX_DIGITS.length;
	}
	let remaining = position - offset;
	let digits = "";
	for (let i = 0; i < width; i++) {
		digits = INDEX_DIGITS.charAt(remaining % INDEX_DIGITS.length) + digits;
		remaining = Math.floor(remaining / INDEX_DIGITS.length);
	}
	return INDEX_DIGITS.charAt(36 + width - 1) + digits; // 36 is 'a'
}

/**
 * The position `fractionalIndex` would have been given to produce this key, or
 * null for a key from anywhere else.
 *
 * Excalidraw's scheme is wider than ours: it puts a key *between* two others
 * when a human sends one shape behind another, and those have no position in
 * our integer run. Saying null for those is the honest answer; validity and
 * repair use the shared fractional-indexing implementation.
 * @param key The index key.
 * @returns The integer position, or null.
 */
function indexPosition(key: string): number | null {
	const width = INDEX_DIGITS.indexOf(key.charAt(0)) - 36 + 1; // 36 is 'a'
	if (width < 1 || key.length !== width + 1) {
		return null;
	}
	let offset = 0;
	let span = INDEX_DIGITS.length;
	for (let w = 1; w < width; w++) {
		offset += span;
		span *= INDEX_DIGITS.length;
	}
	let value = 0;
	for (let i = 1; i < key.length; i++) {
		const digit = INDEX_DIGITS.indexOf(key.charAt(i));
		if (digit < 0) {
			return null;
		}
		value = value * INDEX_DIGITS.length + digit;
	}
	return offset + value;
}

/**
 * Elements in z-order: by the index they carry, and by where they already sit
 * for anything that carries none.
 * @param elements The elements in array order.
 * @returns A new array in z-order.
 */
function inZOrder<T extends { index?: string | null }>(elements: T[]): T[] {
	return elements
		.map((element, position) => ({ element, position }))
		.toSorted((a, b) => {
			const ai = typeof a.element.index === "string" ? a.element.index : null;
			const bi = typeof b.element.index === "string" ? b.element.index : null;
			if (ai !== null && bi !== null && ai !== bi) {
				return ai < bi ? -1 : 1;
			}
			return a.position - b.position;
		})
		.map(({ element }) => element);
}

/**
 * Whether a key keeps the run increasing past the last accepted key.
 * @param key The candidate.
 * @param last The last accepted key, or null at the start.
 * @returns True when the key is valid and greater than `last`.
 */
function extendsRun(key: unknown, last: string | null): key is string {
	return validIndexKey(key) && (last === null || key > last);
}

/**
 * The next key after a position that keeps the run increasing, so a repaired
 * key can be placed before it.
 * @param ordered The run.
 * @param from The position to search from.
 * @param last The last accepted key.
 * @returns The key, or null when nothing ahead fits.
 */
function nextValidKey(
	ordered: ReadonlyArray<{ index?: string | null }>,
	from: number,
	last: string | null,
): string | null {
	for (let ahead = from; ahead < ordered.length; ahead += 1) {
		const candidate = ordered[ahead]?.index;
		if (extendsRun(candidate, last)) {
			return candidate;
		}
	}
	return null;
}

/**
 * The index each element in a z-ordered run should carry, or null where the
 * one it has is already right.
 *
 * REPAIR, NOT RESTATEMENT. Reissuing every index from its position would
 * rewrite all 300 of them every time somebody deleted a shape near the front,
 * and every one of those is an element a write has to report as changed. So an
 * index that is already increasing is kept, and one is issued only where the
 * run breaks: after a creation that is the new element and nothing else, and
 * after a deletion it is nothing at all.
 *
 * One rule, used by the board and by the note. The exporter used to reissue
 * every index while this repaired them, which was survivable while a note and
 * a board were two documents: the note said `a0, a1, a2` and the board said
 * `a0, a1, aB` and nobody compared them. The note is the board now (ADR 0015),
 * so two rules is two answers, and the second one arrives on the next read
 * having told nobody (`tests/system/browser/live-session-convergence.test.ts` catches it).
 * @param ordered The elements in z-order.
 * @returns One entry per element: the repaired key, or null to keep its own.
 */
function settledIndices(ordered: ReadonlyArray<{ index?: string | null }>): Array<string | null> {
	const wanted: Array<string | null> = [];
	let last: string | null = null;
	for (const [at, element] of ordered.entries()) {
		const key = element.index;
		if (extendsRun(key, last)) {
			last = key;
			wanted.push(null);
			continue;
		}
		const repaired = generateKeyBetween(last, nextValidKey(ordered, at + 1, last));
		wanted.push(repaired);
		last = repaired;
	}
	return wanted;
}

/**
 * Give every element on a board an `index`, and leave the valid ones alone.
 *
 * `index` is z-order, it is a field of the note like any other, and until this
 * existed the store simply had none: an element an agent created carried no
 * index at all, Excalidraw assigned one the moment it rendered, and the pane
 * and the server then held two different documents for the rest of the session
 * (guarded by `tests/system/browser/live-session-convergence.test.ts`). Under ADR 0015 that is a board
 * with two answers, and a write cannot return a document the renderer has to
 * repair.
 *
 * The board is left in z-order, because z-order is the order a document is
 * written in and the store is what a document is built from.
 * @param board The board, rewritten in place when anything changes.
 * @returns The elements it had to change, for whoever is reporting the write.
 */
function repairIndices(board: Map<string, ServerElement>): ServerElement[] {
	const held = [...board.values()];
	const ordered = inZOrder(held);
	const changed: ServerElement[] = [];
	const settled: ServerElement[] = [];
	const wanted = settledIndices(ordered);
	for (const [at, element] of ordered.entries()) {
		const index = wanted[at];
		if (index === null || index === undefined) {
			settled.push(element);
			continue;
		}
		// Replaced rather than edited: a snapshot or a branch may be holding a
		// deep copy taken from this one, and every write path here replaces
		// (TASK-042).
		const repaired = { ...element, index };
		changed.push(repaired);
		settled.push(repaired);
	}
	const reordered = ordered.some((element, at) => element !== held[at]);
	if (changed.length === 0 && !reordered) {
		return changed;
	}
	board.clear();
	for (const element of settled) {
		board.set(element.id, element);
	}
	return changed;
}

/**
 * Restate `index` over a whole document, in one increasing run.
 *
 * z-order is what `index` means, so the existing order is kept: elements sort
 * by the index they arrived with, and anything without one keeps its place in
 * the array. What changes is that a run that does not increase is repaired.
 * The same rule the board is held to (`settledIndices`), because a note is
 * the board (ADR 0015) and a second rule here would be a second answer.
 * @param elements The converted elements in array order.
 * @returns The same elements in z-order, indices repaired in place.
 */
function restateIndices(elements: Record<string, unknown>[]): Record<string, unknown>[] {
	const order = inZOrder(elements);
	const wanted = settledIndices(order);
	order.forEach((element, at) => {
		const index = wanted[at];
		if (index !== null && index !== undefined) {
			element["index"] = index;
		}
	});
	return order;
}

export { fractionalIndex, indexPosition, repairIndices, restateIndices, settledIndices };
