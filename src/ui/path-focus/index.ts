import type {
	ExcalidrawElement,
	ExcalidrawLinearElement,
	ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

export type PathFocusElement = Pick<ExcalidrawElement, "id" | "type"> &
	Partial<Pick<ExcalidrawLinearElement, "startBinding" | "endBinding">> &
	Partial<Pick<ExcalidrawTextElement, "containerId">>;

export type PathFocusNoPathReason = "empty" | "multiple" | "missing" | "isolated" | "broken";

export type ConnectedPathProjection =
	| {
			readonly state: "no-path";
			readonly reason: PathFocusNoPathReason;
			readonly selectedId: string | null;
	  }
	| {
			readonly state: "connected";
			readonly selectedId: string;
			readonly elementIds: readonly string[];
	  };

export type PathFocusSnapshot = { readonly state: "inactive" } | ConnectedPathProjection;

export interface PathFocusController {
	readonly focus: () => void;
	readonly exit: () => void;
}

export interface PanePathFocusSnapshot {
	readonly boardKey: string | null;
	readonly projection: PathFocusSnapshot;
}

interface ValidArrow {
	readonly id: string;
	readonly startId: string;
	readonly endId: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: null;
}

function bindingElementId(value: unknown): string | null {
	const elementId = record(value)?.elementId;
	return typeof elementId === "string" && elementId.length > 0 ? elementId : null;
}

function containerId(element: PathFocusElement): string | null {
	return element.type === "text" && typeof element.containerId === "string"
		? element.containerId
		: null;
}

function validArrow(
	element: PathFocusElement,
	byId: ReadonlyMap<string, PathFocusElement>,
): ValidArrow | null {
	if (element.type !== "arrow") return null;
	const startId = bindingElementId(element.startBinding);
	const endId = bindingElementId(element.endBinding);
	if (!startId || !endId || !byId.has(startId) || !byId.has(endId)) return null;
	return { id: element.id, startId, endId };
}

/**
 * Projects one selected Excalidraw element onto its canonical arrow-bound
 * connected component. This reads only ids and bindings. It never annotates,
 * repairs, or otherwise changes the scene passed to it.
 */
export function projectConnectedPath(
	scene: readonly PathFocusElement[],
	selectedIds: readonly string[],
): ConnectedPathProjection {
	if (selectedIds.length === 0) {
		return { state: "no-path", reason: "empty", selectedId: null };
	}
	if (selectedIds.length > 1) {
		return { state: "no-path", reason: "multiple", selectedId: null };
	}

	const selectedId = selectedIds[0]!;
	const byId = new Map(scene.map((element) => [element.id, element]));
	const selected = byId.get(selectedId);
	if (!selected) return { state: "no-path", reason: "missing", selectedId };

	const arrows = new Map<string, ValidArrow>();
	const incident = new Map<string, ValidArrow[]>();
	for (const element of scene) {
		const arrow = validArrow(element, byId);
		if (!arrow) continue;
		arrows.set(arrow.id, arrow);
		for (const endpointId of new Set([arrow.startId, arrow.endId])) {
			const connected = incident.get(endpointId);
			if (connected) connected.push(arrow);
			else incident.set(endpointId, [arrow]);
		}
	}

	const selectedArrow = selected.type === "arrow" ? arrows.get(selected.id) : null;
	if (selected.type === "arrow" && !selectedArrow) {
		return { state: "no-path", reason: "broken", selectedId };
	}
	const selectedContainerId = containerId(selected);
	if (selected.type === "text" && selectedContainerId && !byId.has(selectedContainerId)) {
		return { state: "no-path", reason: "broken", selectedId };
	}
	const selectedContainer = selectedContainerId ? byId.get(selectedContainerId) : null;
	const selectedContainerArrow =
		selectedContainer?.type === "arrow" ? arrows.get(selectedContainer.id) : null;
	if (selectedContainer?.type === "arrow" && !selectedContainerArrow) {
		return { state: "no-path", reason: "broken", selectedId };
	}
	const seedArrow = selectedArrow ?? selectedContainerArrow;

	const seedIds = seedArrow
		? [seedArrow.startId, seedArrow.endId]
		: [selectedContainerId ?? selected.id];
	const visitedVertices = new Set<string>();
	const visitedArrows = new Set<string>();
	const queue = [...seedIds];
	if (seedArrow) visitedArrows.add(seedArrow.id);

	for (let index = 0; index < queue.length; index += 1) {
		const vertexId = queue[index]!;
		if (visitedVertices.has(vertexId)) continue;
		visitedVertices.add(vertexId);
		for (const arrow of incident.get(vertexId) ?? []) {
			visitedArrows.add(arrow.id);
			if (!visitedVertices.has(arrow.startId)) queue.push(arrow.startId);
			if (!visitedVertices.has(arrow.endId)) queue.push(arrow.endId);
		}
	}

	if (visitedArrows.size === 0) {
		return { state: "no-path", reason: "isolated", selectedId };
	}

	const focusedIds = new Set([...visitedVertices, ...visitedArrows]);
	for (const element of scene) {
		const labelContainerId = containerId(element);
		if (labelContainerId && focusedIds.has(labelContainerId)) focusedIds.add(element.id);
	}
	return {
		state: "connected",
		selectedId,
		elementIds: [...focusedIds].toSorted(),
	};
}

export function samePathFocusSnapshot(left: PathFocusSnapshot, right: PathFocusSnapshot): boolean {
	if (left.state !== right.state) return false;
	if (left.state === "inactive" && right.state === "inactive") return true;
	if (left.state === "no-path" && right.state === "no-path") {
		return left.reason === right.reason && left.selectedId === right.selectedId;
	}
	if (left.state !== "connected" || right.state !== "connected") return false;
	return (
		left.selectedId === right.selectedId &&
		left.elementIds.length === right.elementIds.length &&
		left.elementIds.every((id, index) => id === right.elementIds[index])
	);
}
