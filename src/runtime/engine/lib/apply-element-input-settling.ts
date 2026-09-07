// What the board has to settle once a write has landed: arrows re-routed to
// the shapes that moved, labels put back where their containers draw them,
// references cut to what was deleted, and z-order repaired.

import { bindingOf, boundEndpoint, centreOf } from "@/runtime/engine/arrow-binding";
import {
	relabelBoundTexts,
	repairIndices,
	settleDeletions,
} from "@/runtime/engine/expand-elements";
import { DEFAULT_LINEAR_POINTS, pointsOf } from "@/runtime/engine/geometry";
import { recentreBoundTexts } from "@/runtime/engine/labels";
import { bumpVersion, sizeFromPath } from "@/runtime/engine/lib/apply-element-input-merge";
import type { ServerElement } from "@/runtime/engine/types";
import type { LegacyElementIngress } from "@/shared/board-elements";

/** An arrow or a line: the elements that carry a path and two bindings. */
type LinearElement = Extract<ServerElement, { type: "arrow" | "line" }>;

/** What a write did to the document, before and after settling. */
interface DocumentChanges {
	created: ServerElement[];
	updated: ServerElement[];
	deleted: string[];
}

/**
 * Whether an element is one with a path and bindings.
 * @param element The element.
 * @returns True for an arrow or a line.
 */
function isLinear(element: ServerElement): element is LinearElement {
	return element.type === "arrow" || element.type === "line";
}

/**
 * An arrow's path in scene coordinates, falling back to the default two-point
 * path when it carries none worth routing.
 * @param element The arrow.
 * @returns The points.
 */
function pathOf(element: LinearElement): { x: number; y: number }[] {
	const measured = pointsOf(element.points);
	const points =
		measured && measured.length >= 2 ? measured : DEFAULT_LINEAR_POINTS.map(([x, y]) => ({ x, y }));
	return points.map((point) => ({ x: element.x + point.x, y: element.y + point.y }));
}

/**
 * The shape an end is bound to, as the router should see it.
 *
 * A shape the same write created without saying anything about its corners is
 * routed to as a sharp rectangle: the default roundness is archboard's, and
 * an arrow drawn to the shape in the same breath was aimed at the box.
 * @param target The bound shape, when the board holds it.
 * @param inputSquareIds Shapes this write created without stating roundness.
 * @returns The shape to route to.
 */
function routingShape(
	target: ServerElement | undefined,
	inputSquareIds: ReadonlySet<string>,
): ServerElement | undefined {
	if (!target || !inputSquareIds.has(target.id)) {
		return target;
	}
	return { ...target, roundness: null };
}

/** Where one arrow's two ends aim, and which shapes they are bound to. */
interface ArrowEnds {
	start?: { shape: ServerElement; binding: NonNullable<ReturnType<typeof bindingOf>> };
	end?: { shape: ServerElement; binding: NonNullable<ReturnType<typeof bindingOf>> };
}

/**
 * The shapes an arrow's bindings name, when the board holds them.
 * @param element The arrow.
 * @param available Every element this write can see.
 * @param inputSquareIds Shapes this write created without stating roundness.
 * @returns The bound ends.
 */
function endsOf(
	element: LinearElement,
	available: ReadonlyMap<string, ServerElement>,
	inputSquareIds: ReadonlySet<string>,
): ArrowEnds {
	return {
		...boundEnd("start", bindingOf(element.startBinding), available, inputSquareIds),
		...boundEnd("end", bindingOf(element.endBinding), available, inputSquareIds),
	};
}

/**
 * One end of an arrow, when its binding names a shape the board holds.
 * @param which Which end.
 * @param binding The binding, when the end carries one.
 * @param available Every element this write can see.
 * @param inputSquareIds Shapes this write created without stating roundness.
 * @returns The end, or nothing when it is bound to nothing.
 */
function boundEnd(
	which: "start" | "end",
	binding: ReturnType<typeof bindingOf>,
	available: ReadonlyMap<string, ServerElement>,
	inputSquareIds: ReadonlySet<string>,
): ArrowEnds {
	if (!binding) {
		return {};
	}
	const shape = routingShape(available.get(binding.elementId), inputSquareIds);
	return shape ? { [which]: { shape, binding } } : {};
}

/**
 * Put one arrow's bound ends where its bindings say, and restate the path
 * from wherever the first point ended up.
 * @param element The arrow, re-routed in place.
 * @param ends The shapes its bindings name.
 * @param newlyDrawn Whether the write drew this arrow, in which case a
 * straight one aims at the other shape's centre rather than at its own far
 * point, which is where a person's drag would have left it.
 */
function routeArrow(element: LinearElement, ends: ArrowEnds, newlyDrawn: boolean): void {
	const points = pathOf(element);
	const last = points.length - 1;
	// Both aims are read off the path before either end moves: on a two-point
	// arrow the end aims at the point the start is about to be moved from.
	const aims = aimsFor(points, ends, newlyDrawn);
	if (ends.start) {
		points[0] = boundEndpoint(ends.start.shape, ends.start.binding, aims.start, points[0]!);
	}
	if (ends.end) {
		points[last] = boundEndpoint(ends.end.shape, ends.end.binding, aims.end, points[last]!);
	}
	const origin = points[0]!;
	element.x = origin.x;
	element.y = origin.y;
	element.points = points.map((point) => [point.x - origin.x, point.y - origin.y]);
	sizeFromPath(element);
}

/**
 * What each end of an arrow aims at.
 *
 * A straight arrow the write drew aims at the other shape's centre, which is
 * where a person's drag would have left it; anything else aims at its own
 * next point, which is what a bend in the path already says.
 * @param points The path in scene coordinates.
 * @param ends The shapes the arrow's bindings name.
 * @param newlyDrawn Whether the write drew this arrow.
 * @returns The aim for each end.
 */
function aimsFor(
	points: readonly { x: number; y: number }[],
	ends: ArrowEnds,
	newlyDrawn: boolean,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
	const last = points.length - 1;
	const atCentres = newlyDrawn && points.length === 2;
	return {
		start: atCentres && ends.end ? centreOf(ends.end.shape) : points[1]!,
		end: atCentres && ends.start ? centreOf(ends.start.shape) : points[last - 1]!,
	};
}

/**
 * Route every bound arrow among the written elements. An elbowed arrow keeps
 * its own path: Excalidraw routes those itself, and a second router would be
 * a second answer.
 * @param written The elements the write touched.
 * @param board The board they land on.
 * @param newlyDrawn Whether the write drew these arrows.
 * @param inputSquareIds Shapes this write created without stating roundness.
 */
function resolveArrowBindings(
	written: ServerElement[],
	board: Map<string, ServerElement>,
	newlyDrawn = false,
	inputSquareIds: ReadonlySet<string> = new Set(),
): void {
	const available = new Map(board);
	for (const element of written) {
		available.set(element.id, element);
	}
	for (const element of written.filter(isRoutable)) {
		routeIfBound(element, available, inputSquareIds, newlyDrawn);
	}
}

/**
 * Route one arrow, unless neither end is bound to a shape the board holds.
 * @param element The arrow.
 * @param available Every element this write can see.
 * @param inputSquareIds Shapes this write created without stating roundness.
 * @param newlyDrawn Whether the write drew this arrow.
 */
function routeIfBound(
	element: LinearElement,
	available: ReadonlyMap<string, ServerElement>,
	inputSquareIds: ReadonlySet<string>,
	newlyDrawn: boolean,
): void {
	const ends = endsOf(element, available, inputSquareIds);
	if (ends.start || ends.end) {
		routeArrow(element, ends, newlyDrawn);
	}
}

/**
 * Whether this router owns an element's path. An elbowed arrow keeps its own:
 * Excalidraw routes those itself, and a second router would be a second
 * answer.
 * @param element The element.
 * @returns True when the element is an arrow or line this routes.
 */
function isRoutable(element: ServerElement): element is LinearElement {
	return isLinear(element) && element.elbowed !== true;
}

/**
 * Re-route every arrow bound to a shape that has just moved.
 * @param movedId The shape that moved.
 * @param board The board, re-routed in place.
 * @returns The arrows that moved with it.
 */
function rerouteBoundArrows(movedId: string, board: Map<string, ServerElement>): ServerElement[] {
	const rerouted: ServerElement[] = [];
	for (const element of board.values()) {
		if (!isLinear(element) || !joinsShape(element, movedId)) {
			continue;
		}
		resolveArrowBindings([element], board);
		bumpVersion(element);
		rerouted.push(element);
	}
	return rerouted;
}

/**
 * Whether either of an arrow's ends is bound to one shape.
 * @param element The arrow.
 * @param shapeId The shape.
 * @returns True when the arrow joins it.
 */
function joinsShape(element: LinearElement, shapeId: string): boolean {
	return (
		bindingOf(element.startBinding)?.elementId === shapeId ||
		bindingOf(element.endBinding)?.elementId === shapeId
	);
}

/**
 * Put every named container's label back where the container draws it.
 * @param containerIds The containers to settle.
 * @param board The board, moved in place.
 * @returns The labels that moved.
 */
function settleBoundTexts(
	containerIds: string[],
	board: Map<string, ServerElement>,
): ServerElement[] {
	const moved: ServerElement[] = [];
	for (const move of recentreBoundTexts([...board.values()], containerIds)) {
		const text = board.get(move.id);
		if (!text) {
			continue;
		}
		text.x = move.x;
		text.y = move.y;
		bumpVersion(text);
		moved.push(text);
	}
	return moved;
}

/**
 * Write a renamed label into the text element that is the label.
 * @param written The statements the write carried.
 * @param board The board, rewritten in place.
 * @returns The text elements that now say something else.
 */
function restateLabels(
	written: LegacyElementIngress[],
	board: Map<string, ServerElement>,
): ServerElement[] {
	const restated = relabelBoundTexts(written, board);
	for (const element of restated) {
		bumpVersion(element, board.get(element.id) ?? element);
		board.set(element.id, element);
	}
	return restated;
}

/**
 * The containers one moved element implies: itself, the container it labels,
 * and every arrow that had to move with it.
 * @param id The element that moved.
 * @param board The board, re-routed in place.
 * @param moved Collects the arrows that moved.
 * @returns The container ids to settle labels for.
 */
function containersFor(
	id: string,
	board: Map<string, ServerElement>,
	moved: Map<string, ServerElement>,
): string[] {
	const element = board.get(id);
	if (!element) {
		return [];
	}
	const containers = [id];
	if (element.type === "text" && element.containerId) {
		containers.push(element.containerId);
	}
	if (!isLinear(element)) {
		for (const arrow of rerouteBoundArrows(id, board)) {
			moved.set(arrow.id, arrow);
			containers.push(arrow.id);
		}
	}
	return containers;
}

/**
 * Settle everything that follows from the elements a write moved.
 * @param movedIds The elements the write moved.
 * @param board The board, settled in place.
 * @returns Everything else that moved with them.
 */
function settleAfterWrite(movedIds: string[], board: Map<string, ServerElement>): ServerElement[] {
	const containers: string[] = [];
	const moved = new Map<string, ServerElement>();
	for (const id of movedIds) {
		containers.push(...containersFor(id, board, moved));
	}
	for (const text of settleBoundTexts(containers, board)) {
		moved.set(text.id, text);
	}
	return [...moved.values()];
}

/**
 * Fold the elements a settlement rewrote into what the write reported, so an
 * element repaired after the fact is reported as the write that repaired it.
 * @param applied What the write did.
 * @param rewritten The elements settlement replaced.
 * @param alsoDeleted The elements settlement deleted.
 * @param board The settled board.
 * @returns The write as it now stands.
 */
function foldSettlement(
	applied: DocumentChanges,
	rewritten: readonly ServerElement[],
	alsoDeleted: readonly string[],
	board: ReadonlyMap<string, ServerElement>,
): DocumentChanges {
	const created = new Map(applied.created.map((element) => [element.id, element]));
	const updated = new Map(applied.updated.map((element) => [element.id, element]));
	for (const element of rewritten) {
		if (created.has(element.id)) {
			created.set(element.id, element);
		} else {
			updated.set(element.id, element);
		}
	}
	for (const id of alsoDeleted) {
		created.delete(id);
		updated.delete(id);
	}
	return {
		created: [...created.values()].filter((element) => board.has(element.id)),
		updated: [...updated.values()].filter((element) => board.has(element.id)),
		deleted: [...applied.deleted, ...alsoDeleted],
	};
}

/**
 * Settle the whole document after a write: cut every reference to what was
 * deleted, and repair the z-order.
 * @param applied What the write did.
 * @param board The board, settled in place.
 * @returns The write as it now stands.
 */
function settleDocument(
	applied: DocumentChanges,
	board: Map<string, ServerElement>,
): DocumentChanges {
	const { alsoDeleted, changed } = settleDeletions(applied.deleted, board);
	const repaired = repairIndices(board);
	if (alsoDeleted.length === 0 && changed.length === 0 && repaired.length === 0) {
		return applied;
	}
	return foldSettlement(applied, [...changed, ...repaired], alsoDeleted, board);
}

export {
	type DocumentChanges,
	resolveArrowBindings,
	restateLabels,
	settleAfterWrite,
	settleDocument,
};
