// A shape's `boundElements` names the arrows bound to it, which is the
// reverse of what an arrow's bindings say. The conversion restates the
// forward references from the bindings so both directions agree.

import { isRecord } from "@/runtime/engine/lib/unknown-record";

/** A `boundElements` entry for an arrow. */
interface ArrowRef {
	type: string;
	id: string;
}

/**
 * The element id a binding names, when it names one.
 * @param binding The `startBinding` or `endBinding` value.
 * @returns The bound element's id, or undefined.
 */
function boundElementId(binding: unknown): string | undefined {
	if (!isRecord(binding)) {
		return undefined;
	}
	const id = binding["elementId"];
	return typeof id === "string" ? id : undefined;
}

/**
 * Every arrow bound to each shape, keyed by the shape's id.
 * @param elements The converted elements.
 * @returns Arrow refs per shape id, in element order.
 */
function arrowsByShape(elements: readonly Record<string, unknown>[]): Map<string, ArrowRef[]> {
	const byShape = new Map<string, ArrowRef[]>();
	for (const el of elements) {
		for (const key of ["startBinding", "endBinding"]) {
			const shapeId = boundElementId(el[key]);
			if (shapeId === undefined) {
				continue;
			}
			const refs = byShape.get(shapeId) ?? [];
			refs.push({ type: "arrow", id: String(el["id"]) });
			byShape.set(shapeId, refs);
		}
	}
	return byShape;
}

/**
 * The ids a shape's `boundElements` already carries. Skipping them matters for
 * re-exported expanded scenes, where every export cycle would otherwise append
 * duplicate entries.
 * @param el The shape.
 * @returns The ids named.
 */
function existingRefIds(el: Record<string, unknown>): Set<string | undefined> {
	const bound = Array.isArray(el["boundElements"]) ? el["boundElements"] : [];
	return new Set(
		bound.map((b: unknown) => (isRecord(b) && typeof b["id"] === "string" ? b["id"] : undefined)),
	);
}

/**
 * Add to each shape's `boundElements` the arrows whose bindings name it.
 * @param elements The converted elements, edited in place.
 */
function attachArrowRefs(elements: readonly Record<string, unknown>[]): void {
	const byShape = arrowsByShape(elements);
	for (const el of elements) {
		const arrowRefs = byShape.get(String(el["id"]));
		if (!arrowRefs) {
			continue;
		}
		const existing = existingRefIds(el);
		const additions = arrowRefs.filter((b) => !existing.has(b.id));
		if (additions.length > 0) {
			el["boundElements"] = [
				...(Array.isArray(el["boundElements"]) ? el["boundElements"] : []),
				...additions,
			];
		}
	}
}

export { attachArrowRefs };
