// Operations on elements that already exist on the canvas: align, distribute,
// group, lock, duplicate. Each one reads the board from the server, works out
// where everything should go, and writes it back, so this module talks to the
// network and is server-side only.
//
// It used to be called `geometry.ts`, which is now the pure measurement module
// underneath it — the browser imports that one, and could not import anything
// that reaches for winston or a fetch client (TASK-038).
//
// ONE INTENT IS ONE WRITE. Every operation here reads the board once and writes
// once, whatever the number of elements it was given. Each used to fetch every
// element separately and then issue one PUT per element, which is twenty
// requests for one thing a person asked for — a nuisance today, lost updates
// once the note is the only copy of the board (ADR 0015), and twenty separate
// acquisitions of the board's lock with nineteen gaps between them (ADR 0016).

import type { ServerElement } from "./types.js";
import { mintId } from "../../shared/ids/ids.js";
import { applyElementChanges, batchCreateElementsOnCanvas, getElements } from "./canvas-client.js";
import { extentOf } from "./geometry.js";

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Direction = "horizontal" | "vertical";

/**
 * The elements an operation was aimed at, in the order they were named.
 *
 * Ids the board does not hold are dropped rather than refused, which is what
 * the per-element version did by accident (a PUT to a missing id 404'd and was
 * counted as a failure) and is what an operation over a stale selection wants:
 * arrange the boxes that are still there.
 */
async function targets(elementIds: string[]): Promise<ServerElement[]> {
	const board = new Map((await getElements()).map((element) => [element.id, element]));
	return elementIds
		.map((id) => board.get(id))
		.filter((element): element is ServerElement => !!element);
}

export async function alignElements(
	elementIds: string[],
	alignment: Alignment,
): Promise<{ aligned: boolean; elementIds: string[]; alignment: Alignment; successCount: number }> {
	const elementsToAlign = await targets(elementIds);

	if (elementsToAlign.length < 2) {
		throw new Error("Need at least 2 elements to align");
	}

	// Alignment is stated about edges, and an arrow's `x` is not its left edge —
	// it is wherever the arrow was started from, which for a leftward arrow is
	// its right edge (geometry.ts). So the target is worked out in extent space
	// and then applied as a translation of the stored origin, which moves a box
	// and an arrow by the same rule.
	const boxes = new Map(elementsToAlign.map((el) => [el.id, extentOf(el)]));
	const box = (el: ServerElement) => boxes.get(el.id)!;
	let edgeFn: (el: ServerElement) => { x?: number; y?: number };
	switch (alignment) {
		case "left": {
			const minX = Math.min(...elementsToAlign.map((el) => box(el).x));
			edgeFn = () => ({ x: minX });
			break;
		}
		case "right": {
			const maxRight = Math.max(...elementsToAlign.map((el) => box(el).x + box(el).width));
			edgeFn = (el) => ({ x: maxRight - box(el).width });
			break;
		}
		case "center": {
			const centers = elementsToAlign.map((el) => box(el).x + box(el).width / 2);
			const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
			edgeFn = (el) => ({ x: avgCenter - box(el).width / 2 });
			break;
		}
		case "top": {
			const minY = Math.min(...elementsToAlign.map((el) => box(el).y));
			edgeFn = () => ({ y: minY });
			break;
		}
		case "bottom": {
			const maxBottom = Math.max(...elementsToAlign.map((el) => box(el).y + box(el).height));
			edgeFn = (el) => ({ y: maxBottom - box(el).height });
			break;
		}
		case "middle": {
			const middles = elementsToAlign.map((el) => box(el).y + box(el).height / 2);
			const avgMiddle = middles.reduce((a, b) => a + b, 0) / middles.length;
			edgeFn = (el) => ({ y: avgMiddle - box(el).height / 2 });
			break;
		}
	}

	const upserts = elementsToAlign.map((el) => {
		const edge = edgeFn(el);
		return {
			id: el.id,
			...(edge.x === undefined ? {} : { x: el.x + (edge.x - box(el).x) }),
			...(edge.y === undefined ? {} : { y: el.y + (edge.y - box(el).y) }),
		};
	});
	await applyElementChanges({ upserts });

	return { aligned: true, elementIds, alignment, successCount: upserts.length };
}

export async function distributeElements(
	elementIds: string[],
	direction: Direction,
): Promise<{ distributed: boolean; elementIds: string[]; direction: Direction; count: number }> {
	const elementsToDist = await targets(elementIds);

	if (elementsToDist.length < 3) {
		throw new Error("Need at least 3 elements to distribute");
	}

	// Even gaps are gaps between edges, so this too reasons in extent space and
	// writes back a translation of the stored origin (see alignElements).
	const boxes = new Map(elementsToDist.map((el) => [el.id, extentOf(el)]));
	const box = (el: ServerElement) => boxes.get(el.id)!;
	const upserts: { id: string; x?: number; y?: number }[] = [];

	if (direction === "horizontal") {
		// Sort by x position
		elementsToDist.toSorted((a, b) => box(a).x - box(b).x);
		const first = elementsToDist[0]!;
		const last = elementsToDist[elementsToDist.length - 1]!;
		const totalSpan = box(last).x + box(last).width - box(first).x;
		const totalElementWidth = elementsToDist.reduce((sum, el) => sum + box(el).width, 0);
		const gap = (totalSpan - totalElementWidth) / (elementsToDist.length - 1);

		let currentX = box(first).x;
		for (const el of elementsToDist) {
			upserts.push({ id: el.id, x: el.x + (currentX - box(el).x) });
			currentX += box(el).width + gap;
		}
	} else {
		// Sort by y position
		elementsToDist.toSorted((a, b) => box(a).y - box(b).y);
		const first = elementsToDist[0]!;
		const last = elementsToDist[elementsToDist.length - 1]!;
		const totalSpan = box(last).y + box(last).height - box(first).y;
		const totalElementHeight = elementsToDist.reduce((sum, el) => sum + box(el).height, 0);
		const gap = (totalSpan - totalElementHeight) / (elementsToDist.length - 1);

		let currentY = box(first).y;
		for (const el of elementsToDist) {
			upserts.push({ id: el.id, y: el.y + (currentY - box(el).y) });
			currentY += box(el).height + gap;
		}
	}

	await applyElementChanges({ upserts });

	return { distributed: true, elementIds, direction, count: elementsToDist.length };
}

export async function setElementsLocked(
	elementIds: string[],
	locked: boolean,
): Promise<{ elementIds: string[]; successCount: number }> {
	const elementsToLock = await targets(elementIds);

	if (elementsToLock.length === 0) {
		throw new Error(
			`Failed to ${locked ? "lock" : "unlock"} any elements: none of ${elementIds.join(", ")} are on the board`,
		);
	}

	await applyElementChanges({ upserts: elementsToLock.map((el) => ({ id: el.id, locked })) });

	return { elementIds, successCount: elementsToLock.length };
}

// Group elements by appending a fresh groupId to each element's groupIds. The
// board is the source of truth for who is in a group — `groupIds` is a native
// Excalidraw field and it round-trips through the note — so every client sees
// the same groups and a group outlives whatever made it.
export async function groupElements(
	elementIds: string[],
): Promise<{ groupId: string; elementIds: string[]; successCount: number }> {
	const groupId = mintId();
	const elementsToGroup = await targets(elementIds);

	if (elementsToGroup.length === 0) {
		throw new Error(
			`Failed to group any elements: none of ${elementIds.join(", ")} are on the board`,
		);
	}

	// Append rather than replace, so an element can be in more than one group.
	await applyElementChanges({
		upserts: elementsToGroup.map((el) => ({
			id: el.id,
			groupIds: [...(el.groupIds || []), groupId],
		})),
	});

	return { groupId, elementIds, successCount: elementsToGroup.length };
}

// Ungroup by finding the group's members through their groupIds, which is the
// only place membership is recorded. It used to accept a seeded member list for
// groups a caller process had made and remembered; that map is gone, along with
// the two bugs it caused (TASK-064).
export async function ungroupElements(
	groupId: string,
): Promise<{ groupId: string; ungrouped: boolean; elementIds: string[]; successCount: number }> {
	const members = (await getElements()).filter((el) => (el.groupIds || []).includes(groupId));

	if (members.length === 0) {
		throw new Error(`Group ${groupId} not found`);
	}

	// Remove only this groupId, so the other groups an element is in survive.
	await applyElementChanges({
		upserts: members.map((el) => ({
			id: el.id,
			groupIds: (el.groupIds || []).filter((gid) => gid !== groupId),
		})),
	});

	const elementIds = members.map((el) => el.id);
	return { groupId, ungrouped: true, elementIds, successCount: elementIds.length };
}

export async function duplicateElements(
	elementIds: string[],
	offsetX = 20,
	offsetY = 20,
): Promise<{
	duplicates: ServerElement[];
	canvasElements: ServerElement[] | null;
	offsetX: number;
	offsetY: number;
}> {
	const originals = await targets(elementIds);
	// The originals, plus every copy made so far: a duplicate must not be handed
	// the name of something already on the board or of an earlier copy. The set
	// is threaded through the mapping rather than filled from it afterwards, so
	// each copy reserves its name at the moment it is minted.
	const taken = new Set<string>(elementIds);
	const duplicates: ServerElement[] = originals.map((original) => {
		const { createdAt, updatedAt, version, syncedAt, source, syncTimestamp, ...rest } =
			original as unknown as Record<string, unknown>;
		const copyId = mintId(taken);
		taken.add(copyId);
		return {
			...rest,
			id: copyId,
			x: original.x + offsetX,
			y: original.y + offsetY,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		} as ServerElement;
	});

	if (duplicates.length === 0) {
		throw new Error("No elements could be duplicated (none found)");
	}

	// Already one write, and one that returns what it created.
	const canvasElements = await batchCreateElementsOnCanvas(duplicates);
	if (!canvasElements) {
		throw new Error("Failed to duplicate elements: HTTP server unavailable");
	}
	return { duplicates, canvasElements: canvasElements.elements ?? [], offsetX, offsetY };
}
