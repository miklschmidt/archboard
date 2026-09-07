// Finishing the one board document that can enter a hold, a note or an
// answer, so that what the caller is told, what the panes are sent and what
// the note holds are the same document (ADR 0015).

import type { BoardContent } from "@/runtime/engine/lib/board-io-content";
import type { ServerElement } from "@/runtime/engine/types";
import { validateRenderGeometry } from "@/runtime/engine/geometry";
import { derivedId, isBlockId } from "@/shared/ids/ids";
import { renameElementId } from "@/runtime/engine/obsidian-md";

/**
 * Whether a text element still needs its `rawText` filled from its text.
 * @param element Any element on the board.
 * @returns True for a live text element with no raw text of its own.
 */
function needsRawText(element: ServerElement): element is ServerElement & { type: "text" } {
	if (element.type !== "text" || element.isDeleted) {
		return false;
	}
	return typeof element.rawText !== "string" || element.rawText === "";
}

/**
 * A text element carries the text the note's `## Text Elements` block lists.
 *
 * `rawText` is the Obsidian Excalidraw plugin's field: the text as somebody
 * wrote it, before links are resolved, and the note writer fills it in from the
 * element's own text when there is none. That used to happen on a copy on its
 * way into a file, so the board never had it — and a text element an agent
 * created came back from its own note carrying a field the pane had never been
 * sent (`tests/system/browser/live-session-convergence.test.ts` catches it).
 *
 * Filled rather than restated: a note the plugin wrote can hold a `rawText`
 * that is genuinely different from its `text` — a `[[wikilink]]` against what
 * it resolves to — and overwriting that would throw away the link.
 * @param content The board being settled.
 */
function settleRawText(content: BoardContent): void {
	for (const element of content.elements.values()) {
		if (needsRawText(element)) {
			element.rawText = element.originalText || element.text;
		}
	}
}

/**
 * Give every text element an id that can be written as a block reference,
 * before the note writer has to.
 *
 * A text element's block id is its element id, and a block reference cannot
 * hold more than eight characters (`src/shared/ids/ids.ts`), so `wrapSceneAsObsidianMd`
 * renames a longer one on the way into a note. Nothing archboard mints needs
 * that (TASK-069), and a pane settles what Excalidraw minted before it reports
 * it, because renaming a text element somebody has an editor open on is how
 * typed characters disappear (TASK-098). So what still arrives here needing a
 * name is what a caller supplied and what came out of a note archboard did not
 * write.
 *
 * While the process held the board, the two spellings could sit side by side:
 * the store said one thing, the note said another, and nobody compared them.
 * The note is the board now, so that rename decides the element's real name —
 * and it used to happen after the write's answer had already been computed, so
 * an agent was told an id the board did not hold and a pane rendered a document
 * whose next read would come back with the element renamed under it.
 *
 * So it happens here, once, on the way in: the map, the answer, the broadcast
 * and the note all say the same name. `wrapSceneAsObsidianMd` keeps its own
 * rename for notes archboard did not write.
 *
 * Deterministic, through the same `derivedId` the note writer used, so a board
 * already in a vault keeps the ids it has.
 * @param content The board being settled.
 */
function settleBlockIds(content: BoardContent): void {
	const foreign = Array.from(content.elements.values()).filter(
		(element) => element.type === "text" && !element.isDeleted && !isBlockId(element.id),
	);
	if (foreign.length === 0) {
		return;
	}
	const elements = Array.from(content.elements.values());
	const taken = {
		/**
		 * Whether an id is already on the board.
		 * @param id The candidate id.
		 * @returns True when taken.
		 */
		has: (id: string): boolean => content.elements.has(id),
	};
	for (const element of foreign) {
		const oldId = element.id;
		const newId = derivedId(oldId, taken);
		renameElementId(elements, oldId, newId);
		content.elements.delete(oldId);
		content.elements.set(newId, element);
	}
}

/**
 * Add an arrow to the `boundElements` of one shape it is bound to, unless the
 * shape already lists it or the binding points at nothing on the board.
 * @param content The board being settled.
 * @param arrow The arrow or line.
 * @param shapeId The id its binding names, if any.
 */
function bindArrowToShape(
	content: BoardContent,
	arrow: ServerElement,
	shapeId: string | undefined,
): void {
	if (typeof shapeId !== "string") {
		return;
	}
	const shape = content.elements.get(shapeId);
	if (!shape || shape.id === arrow.id) {
		return;
	}
	const bound = Array.isArray(shape.boundElements) ? shape.boundElements : [];
	if (bound.some((entry) => entry.id === arrow.id)) {
		return;
	}
	shape.boundElements = [...bound, { id: arrow.id, type: "arrow" as const }];
}

/**
 * A shape an arrow is bound to says so, in its own `boundElements`.
 *
 * Excalidraw's model is two-sided: the arrow names the shape in `startBinding`
 * and `endBinding`, and the shape names the arrow back. The exporter has always
 * patched the second half in on the way into a file, and the board never had
 * it — which was survivable while the note and the store were different
 * documents, and is not now that they are one. The pane was handed a shape with
 * no reference to the arrow, the note was written with one, and the next read
 * brought back a document the pane did not have
 * (`tests/system/browser/live-session-convergence.test.ts` catches it).
 *
 * So the board gets it too, before the write, in the same pass as the block
 * ids: what the caller is told, what the panes are sent and what the note holds
 * are one document.
 * @param content The board being settled.
 */
function settleBoundArrows(content: BoardContent): void {
	for (const arrow of content.elements.values()) {
		if (arrow.type !== "arrow" && arrow.type !== "line") {
			continue;
		}
		bindArrowToShape(content, arrow, arrow.startBinding?.elementId);
		bindArrowToShape(content, arrow, arrow.endBinding?.elementId);
	}
}

/**
 * Finish the one board document that can enter a hold, a note or an answer.
 * Keep this order beside the settlement functions it owns. Validation after
 * them proves the document a caller receives is the document persistence sees.
 * @param content The board to settle in place.
 */
function settleBoardContent(content: BoardContent): void {
	settleBlockIds(content);
	settleBoundArrows(content);
	settleRawText(content);
	validateRenderGeometry(content.elements.values());
}

export { settleBoardContent };
