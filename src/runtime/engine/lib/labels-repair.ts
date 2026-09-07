// Making each container's label singular again after the duplication loop
// of TASK-024 left copies behind.

import {
	type BoundRef,
	type LabelledElement,
	indexById,
	isText,
	live,
} from "@/runtime/engine/lib/labels-model";

/** One container that ended up with more bound text elements than it can show. */
interface DuplicateLabel {
	containerId: string;
	containerType: string;
	/** The text element the container keeps — the one Excalidraw renders. */
	keep: string;
	/** The copies nobody can see, which every later pass would keep breeding. */
	remove: string[];
	text: string;
}

/** A container's `boundElements` rewritten to name exactly one text. */
interface Rebind {
	id: string;
	boundElements: BoundRef[];
}

interface LabelRepairPlan {
	duplicates: DuplicateLabel[];
	/** Text element ids to delete, across every container. */
	removeIds: string[];
	/** Containers whose `boundElements` still name a text that must go. */
	rebind: Rebind[];
	/** Bound texts whose container is gone: reported, never deleted. */
	orphanIds: string[];
}

/**
 * The text a container keeps: the first text in its own `boundElements`,
 * because that is the one Excalidraw draws, else the oldest of its texts,
 * which is the original the loop copied.
 * @param container The container.
 * @param textIds The container's texts.
 * @param byId Elements by id.
 * @returns The keeper's id.
 */
function keeperOf(
	container: LabelledElement,
	textIds: readonly string[],
	byId: ReadonlyMap<string, LabelledElement>,
): string {
	const textIdSet = new Set(textIds);
	const refs = Array.isArray(container.boundElements) ? container.boundElements : [];
	const named = refs.find((ref) => ref.type === "text" && textIdSet.has(ref.id));
	return named?.id ?? oldest(textIds, byId);
}

/**
 * The container's list rewritten to name the keeper once, when it names a
 * doomed text, fails to name the keeper, or names more than one text. Arrow
 * bindings in the same list are left alone.
 * @param container The container.
 * @param containerId Its id.
 * @param keep The keeper's id.
 * @param remove The texts being deleted.
 * @returns The rebind, or undefined when the list is already right.
 */
function rebindFor(
	container: LabelledElement,
	containerId: string,
	keep: string,
	remove: readonly string[],
): Rebind | undefined {
	const current = Array.isArray(container.boundElements) ? container.boundElements : [];
	const gone = new Set(remove);
	const texts = current.filter((ref) => ref.type === "text");
	const namesDoomed = current.some((ref) => gone.has(ref.id));
	const namesKeeper = texts.some((ref) => ref.id === keep);
	if (!namesDoomed && namesKeeper && texts.length <= 1) {
		return undefined;
	}
	const boundElements: BoundRef[] = current.filter((ref) => ref.type !== "text");
	boundElements.push({ id: keep, type: "text" });
	return { id: containerId, boundElements };
}

/**
 * One container's duplicate labels, as the record a repair reports.
 * @param container The container.
 * @param containerId Its id.
 * @param keep The keeper's id.
 * @param remove The copies.
 * @param byId Elements by id.
 * @returns The duplicate record.
 */
function describeDuplicate(
	container: LabelledElement,
	containerId: string,
	keep: string,
	remove: string[],
	byId: ReadonlyMap<string, LabelledElement>,
): DuplicateLabel {
	return {
		containerId,
		containerType: container.type,
		keep,
		remove,
		text: byId.get(keep)?.text ?? "",
	};
}

/**
 * Whether a text names a container the board does not hold.
 * @param element The element.
 * @param byId Elements by id.
 * @returns True for a live text whose container is gone.
 */
function isOrphan(element: LabelledElement, byId: ReadonlyMap<string, LabelledElement>): boolean {
	const container = element.containerId;
	if (typeof container !== "string" || !container) {
		return false;
	}
	return isText(element) && live(element) && !byId.has(container);
}

/**
 * Live texts whose container is not on the board.
 * @param elements The scene.
 * @param byId Elements by id.
 * @returns Their ids.
 */
function orphansOf(
	elements: readonly LabelledElement[],
	byId: ReadonlyMap<string, LabelledElement>,
): string[] {
	const orphanIds: string[] = [];
	for (const element of elements) {
		if (isOrphan(element, byId)) {
			orphanIds.push(element.id);
		}
	}
	return orphanIds;
}

/**
 * What it would take to make each container's label singular again.
 *
 * The keeper is the first text in the container's own `boundElements`, because
 * that is the one Excalidraw draws — keeping any other one would silently
 * change what the board says. Where the container names none of them (its list
 * was lost in a sync), the oldest text wins: it is the original, and the copies
 * are what the loop added.
 * @param elements The scene.
 * @param labelled Live bound texts per container.
 * @returns The plan.
 */
function planLabelRepair(
	elements: readonly LabelledElement[],
	labelled: ReadonlyMap<string, string[]>,
): LabelRepairPlan {
	const byId = indexById(elements);
	const duplicates: DuplicateLabel[] = [];
	const removeIds: string[] = [];
	const rebind: Rebind[] = [];
	for (const [containerId, textIds] of labelled) {
		const container = byId.get(containerId);
		if (!container) {
			continue;
		}
		const keep = keeperOf(container, textIds, byId);
		const remove = textIds.filter((id) => id !== keep);
		if (remove.length > 0) {
			duplicates.push(describeDuplicate(container, containerId, keep, remove, byId));
			removeIds.push(...remove);
		}
		const rebound = rebindFor(container, containerId, keep, remove);
		if (rebound) {
			rebind.push(rebound);
		}
	}
	return { duplicates, removeIds, rebind, orphanIds: orphansOf(elements, byId) };
}

/**
 * The text created first, by `createdAt`; the first id when none says.
 * @param ids The texts.
 * @param byId Elements by id.
 * @returns The oldest text's id.
 */
function oldest(ids: readonly string[], byId: ReadonlyMap<string, LabelledElement>): string {
	let best = ids[0] ?? "";
	for (const id of ids) {
		if (isOlder(createdAtOf(byId, id), createdAtOf(byId, best))) {
			best = id;
		}
	}
	return best;
}

/**
 * When an element says it was created, where it says so at all.
 * @param byId Elements by id.
 * @param id The element.
 * @returns The timestamp, or undefined.
 */
function createdAtOf(byId: ReadonlyMap<string, LabelledElement>, id: string): string | undefined {
	const value = byId.get(id)?.createdAt;
	return typeof value === "string" ? value : undefined;
}

/**
 * Whether one timestamp precedes another. An element that says nothing is
 * never the older, so a board where only the copies are stamped keeps the
 * text it already had.
 * @param a The candidate's timestamp.
 * @param b The current best's timestamp.
 * @returns True when the candidate wins.
 */
function isOlder(a: string | undefined, b: string | undefined): boolean {
	if (a === undefined) {
		return false;
	}
	return b === undefined || a < b;
}

export { type DuplicateLabel, type LabelRepairPlan, planLabelRepair };
