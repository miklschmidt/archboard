// A label is one text element, and it stays the same text element.
//
// An agent writes a label the way it reads — `label: {text}` on the shape —
// and Excalidraw has no such field: a label there is a separate text element
// bound to the shape. Something has to turn one into the other, and for a long
// while two somethings did. The browser passed every server update to
// `convertToExcalidrawElements`, which mints a text element with a brand-new
// random id every single time it sees a `label`, and the seed that produced
// the first one stayed on the stored element.
//
// So nothing converged. The new text element synced back, the server merged it
// while keeping the seed, and the next broadcast expanded that seed again. A
// board of 41 drawn elements reached 284, five arrow labels were duplicated 42
// times each, and the arrows carrying the stacks were mangled into hairlines
// nobody could see or grab — so it read as arrows deleting themselves, and
// adjusting one only spun the loop faster (TASK-024).
//
// Under ADR 0015 there is one conversion, it happens at the write boundary,
// and nothing converts on the way out. `expand-elements.ts` is that
// conversion; the id it gives a label comes from `labelTextIdFor` below, so
// two places deriving a name for one label agree without telling each other,
// and so the name is already short enough to be an Obsidian block reference
// and the note writer has nothing to rename (TASK-069).
//
// What is left here is everything about a label that is not the conversion,
// kept pure so the server, the repair script and the regression check all read
// from the same sentence. Its one import, `geometry.ts`, is pure for the same
// reason and for the same readers.
//
// Nothing here reads a label back off a container, because a container does
// not carry one. The seed is an input format: the conversion reads it and the
// board keeps what it said, which is a text element (TASK-073). Storing it as
// well is what made a label two facts that could disagree, and every rule for
// settling the disagreement was wrong in a different way. Outbound, a report
// used to restate the seed from the text so a human's rename survived
// (`labelStatements`, TASK-028) and strike it out when Excalidraw deleted the
// text somebody emptied (`labelClearances`, TASK-029). Both are gone with the
// thing they corrected. A human retyping a label edits a text element, and the
// text element is the label.
//
// That is what a label *says*. Where it *sits* is a question of the same shape:
// the container decides, Excalidraw recomputes it at draw time, and so the
// stored coordinates can be wrong for a long while with nothing on screen to
// show it (lib/labels-placement.ts, TASK-034).

import {
	type BoundRef,
	type BoundTextPlacement,
	type LabelledElement,
	indexById,
	isText,
	live,
	num,
} from "@/runtime/engine/lib/labels-model";
import {
	anchorSlack,
	boundTextPlacement,
	labelAnchorOf,
} from "@/runtime/engine/lib/labels-placement";
import {
	type DuplicateLabel,
	type LabelRepairPlan,
	planLabelRepair as planRepair,
} from "@/runtime/engine/lib/labels-repair";
import { derivedId, type IdsInUse } from "@/shared/ids/ids";

/**
 * The name the text element for a container's label answers to.
 *
 * Derived from the container rather than invented, so a label that is expanded
 * again — a board rewritten, a note read by an older archboard — keeps the
 * name it had, without anybody having to record it. Derived in the shape every
 * id is minted in, so the note writer has nothing to rename and an echo cannot
 * rename a label out from under somebody typing into it (`ids.ts`, TASK-069).
 * @param containerId The container the label belongs to.
 * @param inUse Every id on the board, including deleted ones: a label expanded
 * where an earlier one was cleared must not be handed the cleared element's
 * name back.
 * @returns The text element's id.
 */
function labelTextIdFor(containerId: string, inUse?: IdsInUse): string {
	return derivedId(`${containerId}:label`, inUse);
}

/**
 * Record one binding, keeping the first spelling of it and ignoring repeats.
 * @param found The groups being built.
 * @param seen Which texts each container has already claimed.
 * @param container The container's id.
 * @param textId The text's id.
 */
function recordBinding(
	found: Map<string, string[]>,
	seen: Map<string, Set<string>>,
	container: string,
	textId: string,
): void {
	const texts = seen.get(container) ?? new Set<string>();
	if (texts.has(textId)) {
		return;
	}
	texts.add(textId);
	seen.set(container, texts);
	const list = found.get(container);
	if (list) {
		list.push(textId);
	} else {
		found.set(container, [textId]);
	}
}

/**
 * Every live bound text element, grouped by the container it labels.
 *
 * Both directions of the binding count, because the two disagree constantly
 * while a board is being repaired or half-synced: a text element names its
 * container in `containerId`, and a container names its texts in
 * `boundElements`. A reference that points at something not in `elements`, or
 * at something that is not a text element, is not a binding — it is a
 * leftover. The container's own list is consulted first, so the first id in
 * each group is the text Excalidraw actually draws.
 * @param elements The scene.
 * @returns Text ids per container id, container's own order first.
 */
function boundTextsByContainer(elements: readonly LabelledElement[]): Map<string, string[]> {
	const byId = indexById(elements.filter(live));
	const found = new Map<string, string[]>();
	const seen = new Map<string, Set<string>>();
	for (const element of elements) {
		for (const textId of textRefsOf(element, byId)) {
			recordBinding(found, seen, element.id, textId);
		}
	}
	for (const element of elements) {
		const container = containerNamedBy(element, byId);
		if (container !== undefined) {
			recordBinding(found, seen, container, element.id);
		}
	}
	return found;
}

/**
 * The text one entry of a container's `boundElements` names.
 * @param ref One entry of the list.
 * @param byId Live elements by id.
 * @returns The text's id, or undefined when the entry names no live text.
 */
function boundTextIdOf(
	ref: Readonly<BoundRef> | null | undefined,
	byId: ReadonlyMap<string, LabelledElement>,
): string | undefined {
	// A malformed entry is a leftover, not a binding: it can be null, or name an
	// id that is not a string, and neither is a reference to anything.
	if (ref?.type !== "text" || typeof ref.id !== "string") {
		return undefined;
	}
	return isText(byId.get(ref.id)) ? ref.id : undefined;
}

/**
 * The text elements a live container's own list names, ignoring references
 * to things the scene does not hold or that are not text.
 * @param element The container.
 * @param byId Live elements by id.
 * @returns The text ids, in the container's own order.
 */
function textRefsOf(
	element: LabelledElement,
	byId: ReadonlyMap<string, LabelledElement>,
): string[] {
	if (!live(element) || !Array.isArray(element.boundElements)) {
		return [];
	}
	const ids: string[] = [];
	for (const ref of element.boundElements) {
		const id = boundTextIdOf(ref, byId);
		if (id !== undefined) {
			ids.push(id);
		}
	}
	return ids;
}

/**
 * The container a live text names, when the scene holds it.
 * @param element The element.
 * @param byId Live elements by id.
 * @returns The container's id, or undefined.
 */
function containerNamedBy(
	element: LabelledElement,
	byId: ReadonlyMap<string, LabelledElement>,
): string | undefined {
	const container = element.containerId;
	if (!live(element) || !isText(element) || typeof container !== "string" || !container) {
		return undefined;
	}
	return byId.has(container) ? container : undefined;
}

/** One bound text whose stored position no longer matches its container. */
interface BoundTextMove {
	id: string;
	containerId: string;
	x: number;
	y: number;
	/** How far it is being moved, in px. */
	distance: number;
}

/**
 * The move that would put one container's keeper text back where the
 * container draws it.
 *
 * A move under half a pixel is not a move. Saying so keeps an update that
 * changed nothing from bumping a text element's version and waking the change
 * feed for a rounding error.
 * @param containerId The container.
 * @param textId The keeper text.
 * @param byId Elements by id.
 * @returns The move, or undefined when nothing worth reporting moves.
 */
function moveFor(
	containerId: string,
	textId: string | undefined,
	byId: ReadonlyMap<string, LabelledElement>,
): BoundTextMove | undefined {
	const container = byId.get(containerId);
	const text = textId === undefined ? undefined : byId.get(textId);
	const wantedAt = placementOf(container, text);
	if (!text || !wantedAt) {
		return undefined;
	}
	const distance = distanceTo(text, wantedAt);
	if (distance < 0.5) {
		return undefined;
	}
	return { id: text.id, containerId, x: wantedAt.x, y: wantedAt.y, distance };
}

/**
 * Where a label belongs, when both it and its container are on the board.
 * @param container The container, when the board holds it.
 * @param text The label, when the board holds it.
 * @returns The placement, or undefined.
 */
function placementOf(
	container: LabelledElement | undefined,
	text: LabelledElement | undefined,
): BoundTextPlacement | undefined {
	return container && text ? boundTextPlacement(container, text) : undefined;
}

/**
 * How far a label would travel to reach a placement. A label with no stored
 * position is treated as already there, so an unreadable record is reported
 * as no move rather than as a move to nowhere.
 * @param text The label.
 * @param wantedAt Where it belongs.
 * @returns The distance in px.
 */
function distanceTo(text: LabelledElement, wantedAt: BoundTextPlacement): number {
	const dx = wantedAt.x - (num(text.x) ?? wantedAt.x);
	const dy = wantedAt.y - (num(text.y) ?? wantedAt.y);
	return Math.hypot(dx, dy);
}

/**
 * The moves that would put every bound text back where its container draws it.
 *
 * Only the keeper text of each container is moved — the one Excalidraw
 * actually draws — so a board that still has duplicates to clear is not
 * rearranged behind that job's back.
 * @param elements The scene.
 * @param containerIds Settle only these containers, which is what the server
 * wants after an update; leave it out to sweep a whole scene, which is what a
 * repair wants.
 * @returns The moves.
 */
function recentreBoundTexts(
	elements: readonly LabelledElement[],
	containerIds?: readonly string[],
): BoundTextMove[] {
	const byId = indexById(elements);
	const wanted = containerIds ? new Set(containerIds) : undefined;
	const moves: BoundTextMove[] = [];
	for (const [containerId, textIds] of boundTextsByContainer(elements)) {
		if (wanted && !wanted.has(containerId)) {
			continue;
		}
		const move = moveFor(containerId, textIds[0], byId);
		if (move) {
			moves.push(move);
		}
	}
	return moves;
}

/**
 * The moves that rescue only the labels the board has lost track of.
 *
 * The browser needs a narrower rule than the server does. On an incoming
 * server update the pane can put a label back on the thing it names, but it
 * must not fine-tune one: Excalidraw is the authority on where a label is drawn, and it
 * has opinions this module does not share — a curved multi-point arrow hangs
 * its label from the bezier, not from the midpoint of a straight segment. Move
 * a label to disagree with Excalidraw by a pixel and Excalidraw moves it back,
 * which is reported, which arrives, which moves it again. That is the shape of
 * the loop TASK-024 was about, and it is not worth re-entering to correct a
 * pixel. So the pane acts only where the record is plainly wrong.
 * @param elements The scene.
 * @returns The moves for drifted labels only.
 */
function rescueDriftedBoundTexts(elements: readonly LabelledElement[]): BoundTextMove[] {
	const lost = new Set(boundTextDrift(elements).map((entry) => entry.textId));
	if (lost.size === 0) {
		return [];
	}
	return recentreBoundTexts(elements).filter((move) => lost.has(move.id));
}

/** A bound text sitting further from its container than the container allows. */
interface BoundTextDrift {
	containerId: string;
	containerType: string;
	textId: string;
	text: string;
	/** Distance from the container's anchor to the label's centre, in px. */
	distance: number;
	/** The most that container's own size can account for. */
	allowed: number;
}

/**
 * How far one label's centre sits from its container's anchor.
 * @param text The label.
 * @param anchor The container's anchor.
 * @returns The distance in px, or undefined when the label has no coordinates.
 */
function distanceFromAnchor(text: LabelledElement, anchor: BoundTextPlacement): number | undefined {
	const x = num(text.x);
	const y = num(text.y);
	if (x === undefined || y === undefined) {
		return undefined;
	}
	const centreX = x + (num(text.width) ?? 0) / 2;
	const centreY = y + (num(text.height) ?? 0) / 2;
	return Math.hypot(centreX - anchor.x, centreY - anchor.y);
}

/**
 * The labels of one container that sit further from it than its own size can
 * account for.
 * @param container The container.
 * @param containerId Its id.
 * @param textIds Its labels.
 * @param byId Elements by id.
 * @returns The drift entries.
 */
function driftOf(
	container: LabelledElement,
	containerId: string,
	textIds: readonly string[],
	byId: ReadonlyMap<string, LabelledElement>,
): BoundTextDrift[] {
	const anchor = labelAnchorOf(container);
	if (!anchor) {
		return [];
	}
	const allowed = anchorSlack(container);
	const drifted: BoundTextDrift[] = [];
	for (const textId of textIds) {
		const text = byId.get(textId);
		const distance = driftDistance(text, anchor, allowed);
		if (distance !== undefined) {
			drifted.push(describeDrift(container, containerId, textId, text?.text, distance, allowed));
		}
	}
	return drifted;
}

/**
 * How far a label has drifted, when it has drifted further than its
 * container can account for.
 * @param text The label, when the board holds it.
 * @param anchor The container's anchor.
 * @param allowed The most that container's own size can account for.
 * @returns The distance, or undefined when the label is where it belongs.
 */
function driftDistance(
	text: LabelledElement | undefined,
	anchor: BoundTextPlacement,
	allowed: number,
): number | undefined {
	const distance = text ? distanceFromAnchor(text, anchor) : undefined;
	return distance !== undefined && distance > allowed ? distance : undefined;
}

/**
 * One drifted label, as the record a report prints.
 * @param container The container it belongs to.
 * @param containerId The container's id.
 * @param textId The label's id.
 * @param text The label's words, when it has any.
 * @param distance How far it sits from the anchor.
 * @param allowed The most the container can account for.
 * @returns The drift record.
 */
function describeDrift(
	container: LabelledElement,
	containerId: string,
	textId: string,
	text: string | undefined,
	distance: number,
	allowed: number,
): BoundTextDrift {
	return {
		containerId,
		containerType: container.type,
		textId,
		text: text ?? "",
		distance,
		allowed,
	};
}

/**
 * Every bound text the board has lost track of.
 *
 * The test is deliberately generous — a label may sit as far from its anchor
 * as half the container's own diagonal, which covers every alignment
 * Excalidraw offers — because the failure this catches is not a label a few
 * pixels off. It is a label the board left behind entirely, hundreds of pixels
 * from the thing it names, dragging the scene's bounding box with it.
 * @param elements The scene.
 * @returns The drifted labels, furthest first.
 */
function boundTextDrift(elements: readonly LabelledElement[]): BoundTextDrift[] {
	const byId = indexById(elements);
	const drifted: BoundTextDrift[] = [];
	for (const [containerId, textIds] of boundTextsByContainer(elements)) {
		const container = byId.get(containerId);
		if (container) {
			drifted.push(...driftOf(container, containerId, textIds, byId));
		}
	}
	return drifted.toSorted((a, b) => b.distance - a.distance);
}

/**
 * What it would take to make each container's label singular again
 * (lib/labels-repair.ts holds the rules).
 * @param elements The scene.
 * @returns The repair plan.
 */
function planLabelRepair(elements: readonly LabelledElement[]): LabelRepairPlan {
	return planRepair(elements, boundTextsByContainer(elements));
}

export {
	type BoundRef,
	type BoundTextDrift,
	type BoundTextMove,
	type BoundTextPlacement,
	type DuplicateLabel,
	type LabelRepairPlan,
	type LabelledElement,
	boundTextDrift,
	boundTextPlacement,
	boundTextsByContainer,
	labelAnchorOf,
	labelTextIdFor,
	planLabelRepair,
	recentreBoundTexts,
	rescueDriftedBoundTexts,
};
