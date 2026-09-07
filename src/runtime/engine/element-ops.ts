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

import type { ServerElement } from "@/runtime/engine/types";
import { mintId } from "@/shared/ids/ids";
import {
	applyElementChanges,
	batchCreateElementsOnCanvas,
	getElements,
} from "@/runtime/engine/canvas-client";
import {
	type Alignment,
	type Direction,
	alignmentMoves,
	distributionMoves,
} from "@/runtime/engine/lib/element-ops-arrange";

/**
 * The elements an operation was aimed at, in the order they were named.
 *
 * Ids the board does not hold are dropped rather than refused, which is what
 * the per-element version did by accident (a PUT to a missing id 404'd and was
 * counted as a failure) and is what an operation over a stale selection wants:
 * arrange the boxes that are still there.
 * @param elementIds The elements, as the caller named them.
 * @returns The ones the board holds.
 */
async function targets(elementIds: string[]): Promise<ServerElement[]> {
	const board = new Map((await getElements()).map((element) => [element.id, element]));
	return elementIds
		.map((id) => board.get(id))
		.filter((element): element is ServerElement => !!element);
}

/**
 * Align a set of elements on one edge or centre.
 * @param elementIds The elements, as the caller named them.
 * @param alignment Which edge or centre they align on.
 * @returns What was aligned, and how many elements moved.
 * @throws {Error} When fewer than two of the named elements are on the board.
 */
async function alignElements(
	elementIds: string[],
	alignment: Alignment,
): Promise<{ aligned: boolean; elementIds: string[]; alignment: Alignment; successCount: number }> {
	const elementsToAlign = await targets(elementIds);
	if (elementsToAlign.length < 2) {
		throw new Error("Need at least 2 elements to align");
	}
	const upserts = alignmentMoves(elementsToAlign, alignment);
	await applyElementChanges({ upserts });
	return { aligned: true, elementIds, alignment, successCount: upserts.length };
}

/**
 * Leave even gaps between a set of elements, along one axis.
 * @param elementIds The elements, as the caller named them.
 * @param direction Which axis to space them along.
 * @returns What was distributed, and how many elements moved.
 * @throws {Error} When fewer than three of the named elements are on the board.
 */
async function distributeElements(
	elementIds: string[],
	direction: Direction,
): Promise<{ distributed: boolean; elementIds: string[]; direction: Direction; count: number }> {
	const elementsToDist = await targets(elementIds);
	if (elementsToDist.length < 3) {
		throw new Error("Need at least 3 elements to distribute");
	}
	await applyElementChanges({ upserts: distributionMoves(elementsToDist, direction) });
	return { distributed: true, elementIds, direction, count: elementsToDist.length };
}

/**
 * Lock or unlock a set of elements, so a person cannot move them by accident.
 * @param elementIds The elements, as the caller named them.
 * @param locked Whether to lock or unlock them.
 * @returns What was locked, and how many elements it reached.
 * @throws {Error} When none of the named elements are on the board.
 */
async function setElementsLocked(
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

/**
 * Group a set of elements by appending a fresh group id to each.
 *
 * The board is the source of truth for who is in a group — `groupIds` is a
 * native Excalidraw field and it round-trips through the note — so every
 * client sees the same groups and a group outlives whatever made it. The id is
 * appended rather than replacing what is there, so an element can be in more
 * than one group.
 * @param elementIds The elements, as the caller named them.
 * @returns The group's id, and how many elements joined it.
 * @throws {Error} When none of the named elements are on the board.
 */
async function groupElements(
	elementIds: string[],
): Promise<{ groupId: string; elementIds: string[]; successCount: number }> {
	const groupId = mintId();
	const elementsToGroup = await targets(elementIds);
	if (elementsToGroup.length === 0) {
		throw new Error(
			`Failed to group any elements: none of ${elementIds.join(", ")} are on the board`,
		);
	}
	await applyElementChanges({
		upserts: elementsToGroup.map((el) => ({
			id: el.id,
			groupIds: [...el.groupIds, groupId],
		})),
	});
	return { groupId, elementIds, successCount: elementsToGroup.length };
}

/**
 * Break one group up.
 *
 * Its members are found through their own `groupIds`, which is the only place
 * membership is recorded. This used to accept a seeded member list for groups
 * a caller process had made and remembered; that map is gone, along with the
 * two bugs it caused (TASK-064). Only this group id is removed, so the other
 * groups an element is in survive.
 * @param groupId The group.
 * @returns Which elements were in it.
 * @throws {Error} When no element on the board is in that group.
 */
async function ungroupElements(
	groupId: string,
): Promise<{ groupId: string; ungrouped: boolean; elementIds: string[]; successCount: number }> {
	const members = (await getElements()).filter((el) => el.groupIds.includes(groupId));
	if (members.length === 0) {
		throw new Error(`Group ${groupId} not found`);
	}
	await applyElementChanges({
		upserts: members.map((el) => ({
			id: el.id,
			groupIds: el.groupIds.filter((gid) => gid !== groupId),
		})),
	});
	const elementIds = members.map((el) => el.id);
	return { groupId, ungrouped: true, elementIds, successCount: elementIds.length };
}

/**
 * One copy of an element, offset from the original and stamped as new.
 * @param original The element being copied.
 * @param offsetX How far right the copy sits.
 * @param offsetY How far down.
 * @param taken The names already spoken for, extended with the copy's own.
 * @returns The copy.
 */
function copyOf(
	original: ServerElement,
	offsetX: number,
	offsetY: number,
	taken: Set<string>,
): ServerElement {
	const rest: Record<string, unknown> = Object.fromEntries(Object.entries(original));
	for (const field of [
		"createdAt",
		"updatedAt",
		"version",
		"syncedAt",
		"source",
		"syncTimestamp",
	]) {
		delete rest[field];
	}
	const copyId = mintId(taken);
	taken.add(copyId);
	const now = new Date().toISOString();
	// The copy is the original's own fields with a new name, place and stamp;
	// the write boundary validates it before anything persists it.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completed by the write-ingress converter
	return {
		...rest,
		id: copyId,
		x: original.x + offsetX,
		y: original.y + offsetY,
		createdAt: now,
		updatedAt: now,
		version: 1,
	} as unknown as ServerElement;
}

/**
 * Copy a set of elements, offset from the originals.
 * @param elementIds The elements, as the caller named them.
 * @param offsetX How far right the copies sit.
 * @param offsetY How far down.
 * @returns The copies as they were sent and as the board now holds them.
 * @throws {Error} When none of the named elements are on the board, or the
 * canvas cannot confirm the write.
 */
async function duplicateElements(
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
	const duplicates = originals.map((original) => copyOf(original, offsetX, offsetY, taken));
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

export {
	type Alignment,
	type Direction,
	alignElements,
	distributeElements,
	setElementsLocked,
	groupElements,
	ungroupElements,
	duplicateElements,
};
