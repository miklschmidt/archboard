// Projecting one selected element onto its arrow-bound connected component.
// Reads only ids and bindings; never annotates, repairs or changes the scene.

import type {
	ExcalidrawElement,
	ExcalidrawLinearElement,
	ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

import type {
	ConnectedPathFocus,
	NoPathFocus,
	PathFocusReason,
} from "@/ui/path-focus/lib/snapshot";

/** What the projection reads of an element: its id, type, bindings and container. */
type PathFocusElement = Pick<ExcalidrawElement, "id" | "type"> &
	Partial<Pick<ExcalidrawLinearElement, "startBinding" | "endBinding">> &
	Partial<Pick<ExcalidrawTextElement, "containerId">>;

/** The projection of a selection onto its path, before focus is applied. */
type ConnectedPathProjection = NoPathFocus | ConnectedPathFocus;

/** An arrow whose both ends are bound to elements on the board. */
interface ValidArrow {
	readonly id: string;
	readonly startId: string;
	readonly endId: string;
}

/** The arrows of a scene, and which touch each element. */
interface ArrowGraph {
	readonly arrows: ReadonlyMap<string, ValidArrow>;
	readonly incident: ReadonlyMap<string, readonly ValidArrow[]>;
}

/**
 * The element a binding names.
 * @param binding An arrow's start or end binding.
 * @returns The bound element's id, or null when unbound.
 */
function bindingElementId(binding: { elementId: string } | null | undefined): string | null {
	return binding !== null && binding !== undefined && binding.elementId.length > 0
		? binding.elementId
		: null;
}

/**
 * The container a text element is bound to.
 * @param element The element.
 * @returns The container id, or null for anything but a bound text.
 */
function containerId(element: PathFocusElement): string | null {
	return element.type === "text" && typeof element.containerId === "string"
		? element.containerId
		: null;
}

/**
 * An arrow with both ends bound to elements on the board.
 * @param element The element.
 * @param byId The board by id.
 * @returns The valid arrow, or null for anything else.
 */
function validArrow(
	element: PathFocusElement,
	byId: ReadonlyMap<string, PathFocusElement>,
): ValidArrow | null {
	if (element.type !== "arrow") {
		return null;
	}
	const startId = bindingElementId(element.startBinding);
	const endId = bindingElementId(element.endBinding);
	if (startId === null || endId === null || !byId.has(startId) || !byId.has(endId)) {
		return null;
	}
	return { id: element.id, startId, endId };
}

/**
 * Index the board's valid arrows by id and by the elements they touch.
 * @param scene The board.
 * @param byId The board by id.
 * @returns The graph.
 */
function arrowGraph(
	scene: readonly PathFocusElement[],
	byId: ReadonlyMap<string, PathFocusElement>,
): ArrowGraph {
	const arrows = new Map<string, ValidArrow>();
	const incident = new Map<string, ValidArrow[]>();
	for (const element of scene) {
		const arrow = validArrow(element, byId);
		if (arrow === null) {
			continue;
		}
		arrows.set(arrow.id, arrow);
		for (const endpointId of new Set([arrow.startId, arrow.endId])) {
			const connected = incident.get(endpointId);
			if (connected) {
				connected.push(arrow);
			} else {
				incident.set(endpointId, [arrow]);
			}
		}
	}
	return { arrows, incident };
}

/**
 * Walk every arrow reachable from the seed vertices.
 * @param seedIds Where to start.
 * @param graph The arrow graph.
 * @returns The visited vertices and arrows.
 */
function walk(
	seedIds: readonly string[],
	graph: ArrowGraph,
): { vertices: Set<string>; arrows: Set<string> } {
	const vertices = new Set<string>();
	const arrows = new Set<string>();
	const queue = [...seedIds];
	for (let index = 0; index < queue.length; index += 1) {
		const vertexId = queue[index];
		if (vertexId === undefined || vertices.has(vertexId)) {
			continue;
		}
		vertices.add(vertexId);
		for (const arrow of graph.incident.get(vertexId) ?? []) {
			arrows.add(arrow.id);
			queue.push(arrow.startId, arrow.endId);
		}
	}
	return { vertices, arrows };
}

/**
 * A no-path projection.
 * @param reason Why.
 * @param selectedId The selected element, or null.
 * @returns The projection.
 */
function noPath(reason: PathFocusReason, selectedId: string | null): NoPathFocus {
	return { kind: "no-path", reason, selectedId };
}

/** Where a traversal starts: its seed vertices, or why it cannot start. */
type Seed = { seedIds: readonly string[] } | NoPathFocus;

/**
 * Where the selected element's traversal starts. An arrow seeds from its two
 * ends; a label seeds from its container, or its container arrow's ends; a
 * shape seeds from itself. A broken arrow or an orphaned label seeds nothing.
 * @param selected The selected element.
 * @param byId The board by id.
 * @param graph The arrow graph.
 * @returns The seed, or the no-path reason.
 */
function seedFor(
	selected: PathFocusElement,
	byId: ReadonlyMap<string, PathFocusElement>,
	graph: ArrowGraph,
): Seed {
	if (selected.type === "arrow") {
		return arrowSeed(graph.arrows.get(selected.id), selected.id);
	}
	const container = containerId(selected);
	if (container === null) {
		return { seedIds: [selected.id] };
	}
	const containerElement = byId.get(container);
	if (containerElement === undefined) {
		return noPath("broken", selected.id);
	}
	if (containerElement.type !== "arrow") {
		return { seedIds: [container] };
	}
	return arrowSeed(graph.arrows.get(containerElement.id), selected.id);
}

/**
 * The seed for an arrow: both its ends, or nothing when the arrow is broken.
 * @param arrow The valid arrow, when the graph has it.
 * @param selectedId The selected element, for the no-path answer.
 * @returns The seed, or the broken reason.
 */
function arrowSeed(arrow: ValidArrow | undefined, selectedId: string): Seed {
	return arrow ? { seedIds: [arrow.startId, arrow.endId] } : noPath("broken", selectedId);
}

/**
 * Everything on the selected element's path, or why there is none.
 * @param scene The board.
 * @param selected The selected element.
 * @param byId The board by id.
 * @returns The connected path, or the no-path reason.
 */
function pathOf(
	scene: readonly PathFocusElement[],
	selected: PathFocusElement,
	byId: ReadonlyMap<string, PathFocusElement>,
): ConnectedPathProjection {
	const graph = arrowGraph(scene, byId);
	const seed = seedFor(selected, byId, graph);
	if ("kind" in seed) {
		return seed;
	}
	const visited = walk(seed.seedIds, graph);
	if (visited.arrows.size === 0) {
		return noPath("isolated", selected.id);
	}
	const focused = new Set([...visited.vertices, ...visited.arrows]);
	addBoundLabels(scene, focused);
	return { kind: "connected", selectedId: selected.id, elementIds: [...focused].toSorted() };
}

/**
 * Add every label bound to a focused element.
 * @param scene The board.
 * @param focused The focused ids, extended in place.
 */
function addBoundLabels(scene: readonly PathFocusElement[], focused: Set<string>): void {
	for (const element of scene) {
		const container = containerId(element);
		if (container !== null && focused.has(container)) {
			focused.add(element.id);
		}
	}
}

/**
 * Project one selected element onto its arrow-bound connected component.
 * @param scene The board.
 * @param selectedIds The selected ids.
 * @returns The connected path, or why there is none.
 */
function projectConnectedPath(
	scene: readonly PathFocusElement[],
	selectedIds: readonly string[],
): ConnectedPathProjection {
	const selectedId = selectedIds[0];
	if (selectedId === undefined) {
		return noPath("empty", null);
	}
	if (selectedIds.length > 1) {
		return noPath("multiple", null);
	}
	const byId = new Map(scene.map((element) => [element.id, element]));
	const selected = byId.get(selectedId);
	return selected === undefined ? noPath("missing", selectedId) : pathOf(scene, selected, byId);
}

export { projectConnectedPath, type ConnectedPathProjection, type PathFocusElement };
