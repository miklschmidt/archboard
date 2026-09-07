// What a board must settle after an element is deleted.

import type { ServerElement } from "@/runtime/engine/types";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * Whether a `boundElements` entry names a deleted element.
 * @param ref The entry.
 * @param gone The deleted ids.
 * @returns True when the entry points at nothing now.
 */
function refersToGone(ref: unknown, gone: ReadonlySet<string>): boolean {
	return isRecord(ref) && typeof ref["id"] === "string" && gone.has(ref["id"]);
}

/**
 * Whether an arrow binding names a deleted element.
 * @param binding The `startBinding` or `endBinding` value.
 * @param gone The deleted ids.
 * @returns True when the binding must be cut.
 */
function bindsToGone(binding: unknown, gone: ReadonlySet<string>): boolean {
	return isRecord(binding) && typeof binding["elementId"] === "string" && gone.has(binding["elementId"]);
}

/**
 * The labels of deleted containers, which go with them. A label is part of
 * the thing it names: deleting a box and leaving its word floating is not
 * what anybody means by deleting the box, and it is not what Excalidraw does
 * when a user deletes one.
 * @param board The board, with the labels removed in place.
 * @param gone The deleted ids, extended in place with the labels.
 * @returns The label ids removed.
 */
function removeOrphanedLabels(board: Map<string, ServerElement>, gone: Set<string>): string[] {
	const alsoDeleted: string[] = [];
	for (const element of board.values()) {
		const container = element.type === "text" ? element.containerId : null;
		if (typeof container === "string" && gone.has(container)) {
			alsoDeleted.push(element.id);
			gone.add(element.id);
		}
	}
	for (const id of alsoDeleted) {
		board.delete(id);
	}
	return alsoDeleted;
}

/**
 * One element with every reference to a deleted element cut, or null when it
 * referenced none.
 * @param element The element.
 * @param gone The deleted ids.
 * @returns The replacement, or null.
 */
function withoutGoneReferences(
	element: ServerElement,
	gone: ReadonlySet<string>,
): ServerElement | null {
	const refs = Array.isArray(element.boundElements) ? element.boundElements : null;
	const kept = refs?.filter((ref: unknown) => !refersToGone(ref, gone));
	const loosened = refs !== null && kept !== undefined && kept.length !== refs.length;
	const unbindStart = "startBinding" in element && bindsToGone(element.startBinding, gone);
	const unbindEnd = "endBinding" in element && bindsToGone(element.endBinding, gone);
	if (!loosened && !unbindStart && !unbindEnd) {
		return null;
	}
	return {
		...element,
		...(loosened ? { boundElements: kept } : {}),
		...(unbindStart ? { startBinding: null } : {}),
		...(unbindEnd ? { endBinding: null } : {}),
	};
}

/**
 * References the board must settle after an element is deleted.
 *
 * Three things point at an element by id, and every one of them is a hole once
 * the element is gone. A bound text names its container in `containerId`, a
 * container names its label and its arrows in `boundElements`, and an arrow
 * names both ends in `startBinding` and `endBinding`.
 *
 * The pane repairs the first two on a server update, in `elementsForScene` —
 * it has to, because Excalidraw dereferences them as it renders and a pointer at
 * nothing is the one shape it will not survive. So a store that leaves them is
 * a store holding a document the renderer rewrites, which under ADR 0015 is a
 * board with two answers, and `tests/system/browser/live-session-convergence.test.ts` catches it as
 * one: delete a labelled box and the server keeps the words pointing at a shape
 * that is not there while the pane shows them loose.
 * @param deleted The ids deleted by the write.
 * @param board The board, repaired in place.
 * @returns The ids that went with them and the elements it had to rewrite.
 */
function settleDeletions(
	deleted: readonly string[],
	board: Map<string, ServerElement>,
): { alsoDeleted: string[]; changed: ServerElement[] } {
	if (deleted.length === 0) {
		return { alsoDeleted: [], changed: [] };
	}
	const gone = new Set(deleted);
	const alsoDeleted = removeOrphanedLabels(board, gone);
	const changed: ServerElement[] = [];
	for (const element of board.values()) {
		const repaired = withoutGoneReferences(element, gone);
		if (repaired === null) {
			continue;
		}
		board.set(repaired.id, repaired);
		changed.push(repaired);
	}
	return { alsoDeleted, changed };
}

export { settleDeletions };
