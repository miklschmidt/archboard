// Dropping a stencil onto the board.
//
// A library item's elements are authored at whatever coordinates the artist
// used. Dropping a copy means: pick a fresh id for every element (so a second
// insert of the same item never collides with the first), rewrite every
// internal reference to an old id (group membership, arrow bindings, and the
// bound-text and bound-element lists) to match, and shift every element by the
// same offset so the group's own geometry survives untouched while its
// top-left corner lands where the caller asked.

import { extentOf } from "@/runtime/engine/geometry";
import { mintId } from "@/shared/ids/ids";
import type { NativeValue, RawElement } from "@/runtime/engine/lib/library-raw-element";

// The library site still serves items in Excalidraw's pre-split format, where
// what is now "arrow" (a connector, with bindings and arrowheads) was still
// called "draw". Nothing downstream understands that type name.
const NATIVE_TYPES: readonly NativeValue<"type">[] = [
	"rectangle",
	"ellipse",
	"diamond",
	"arrow",
	"text",
	"line",
	"freedraw",
	"image",
];

/**
 * Whether a stored type name is one the rest of the codebase understands.
 * @param type The type name from the library JSON.
 * @returns True when it is a native element type.
 */
function isNativeType(type: string | undefined): type is NativeValue<"type"> {
	return NATIVE_TYPES.some((known) => known === type);
}

/**
 * A stored element's type, in the vocabulary everything downstream uses.
 *
 * The library site still serves the pre-split format, where what is now
 * "arrow" was called "draw".
 * @param type The type name from the library JSON.
 * @returns The native type, defaulting to a rectangle for anything unknown.
 */
function normalizeType(type: string | undefined): NativeValue<"type"> {
	if (type === "draw") {
		return "arrow";
	}
	return isNativeType(type) ? type : "rectangle";
}

/** What every element of one drop needs in order to be rewritten. */
interface RemapContext {
	/** An old element id rewritten to its fresh one. */
	mapId: (id: string | undefined | null) => string | undefined | null;
	/** An old group id rewritten to its fresh one. */
	groupMap: ReadonlyMap<string, string>;
	/** A fresh id nothing in this drop has taken. */
	mint: () => string;
	dx: number;
	dy: number;
	attribution: Record<string, unknown>;
}

/**
 * A fresh id for every element in the stencil, so a second insert of the same
 * item never collides with the first.
 * @param elements The stencil's elements.
 * @param mint Where fresh ids come from.
 * @returns Old element id to new.
 */
function freshElementIds(elements: readonly RawElement[], mint: () => string): Map<string, string> {
	const idMap = new Map<string, string>();
	for (const el of elements) {
		if (typeof el.id === "string") {
			idMap.set(el.id, mint());
		}
	}
	return idMap;
}

/**
 * A fresh id for every group in the stencil, so the copy's shapes group with
 * each other rather than with the original's.
 * @param elements The stencil's elements.
 * @param mint Where fresh ids come from.
 * @returns Old group id to new.
 */
function freshGroupIds(elements: readonly RawElement[], mint: () => string): Map<string, string> {
	const groupMap = new Map<string, string>();
	for (const el of elements) {
		for (const g of el.groupIds ?? []) {
			if (!groupMap.has(g)) {
				groupMap.set(g, mint());
			}
		}
	}
	return groupMap;
}

/**
 * Rewrite the lists of ids one element holds: its groups, and the elements
 * bound to it.
 * @param el The element being placed, edited in place.
 * @param ctx What the drop is rewriting to.
 */
function remapCollections(el: RawElement, ctx: RemapContext): void {
	if (Array.isArray(el.groupIds)) {
		el.groupIds = el.groupIds.map((g) => ctx.groupMap.get(g) ?? g);
	}
	if (Array.isArray(el.boundElementIds)) {
		el.boundElementIds = el.boundElementIds.map((id) => ctx.mapId(id) ?? id);
	}
	if (Array.isArray(el.boundElements)) {
		el.boundElements = el.boundElements.map((b) => ({ ...b, id: ctx.mapId(b.id) ?? b.id }));
	}
}

/**
 * Rewrite the single ids one element holds: the container it labels, and the
 * frame it sits in.
 * @param el The element being placed, edited in place.
 * @param ctx What the drop is rewriting to.
 */
function remapParents(el: RawElement, ctx: RemapContext): void {
	if (typeof el.containerId === "string") {
		el.containerId = ctx.mapId(el.containerId) ?? el.containerId;
	}
	if (typeof el.frameId === "string") {
		el.frameId = ctx.mapId(el.frameId) ?? el.frameId;
	}
}

/**
 * One binding's element id, rewritten, or nothing when it points at something
 * outside the stencil.
 * @param elementId The bound element's old id.
 * @param mapId An old element id rewritten to its fresh one.
 * @returns The field to merge into the binding.
 */
function mappedElementId(
	elementId: string | undefined,
	mapId: RemapContext["mapId"],
): { elementId?: string } {
	const mapped = mapId(elementId);
	return mapped === null || mapped === undefined ? {} : { elementId: mapped };
}

/**
 * Rewrite a connector's two bindings.
 *
 * The binding is remapped and that is the whole of it. It used to be copied
 * into `start`/`end` as well, so that the server's routing — which read only
 * those — would see it; that routing reads the binding now, and the binding is
 * the one that carries the `focus` and `gap` the stencil's artist drew with
 * (TASK-088).
 * @param el The element being placed, edited in place.
 * @param ctx What the drop is rewriting to.
 */
function remapBindings(el: RawElement, ctx: RemapContext): void {
	if (el.startBinding && typeof el.startBinding === "object") {
		el.startBinding = {
			...el.startBinding,
			...mappedElementId(el.startBinding.elementId, ctx.mapId),
		};
	}
	if (el.endBinding && typeof el.endBinding === "object") {
		el.endBinding = { ...el.endBinding, ...mappedElementId(el.endBinding.elementId, ctx.mapId) };
	}
}

/**
 * One stencil element as the copy that lands on the board: fresh ids, every
 * internal reference rewritten to match, and shifted by the drop's offset.
 * @param raw The stored element.
 * @param ctx What the drop is rewriting to.
 * @returns The element to create.
 */
function placedElement(raw: RawElement, ctx: RemapContext): RawElement {
	const el = structuredClone(raw);
	el.type = normalizeType(el.type);
	el.id = ctx.mapId(el.id) ?? ctx.mint();
	el.x = (el.x ?? 0) + ctx.dx;
	el.y = (el.y ?? 0) + ctx.dy;
	remapCollections(el, ctx);
	remapBindings(el, ctx);
	remapParents(el, ctx);
	el.customData = { ...el.customData, ...ctx.attribution };
	return el;
}

/**
 * A stencil's elements as a copy to drop on the board, with its top-left
 * corner at the given point.
 * @param elements The stored elements.
 * @param targetX Where the copy's left edge lands.
 * @param targetY Where the copy's top edge lands.
 * @param attribution What to record on each element about where it came from.
 * @returns The elements to create.
 */
function remapStencil(
	elements: RawElement[],
	targetX: number,
	targetY: number,
	attribution: Record<string, unknown>,
): RawElement[] {
	const taken = new Set<string>();
	/**
	 * A fresh id nothing else in this drop has taken.
	 * @returns The id.
	 */
	const mint = (): string => {
		const id = mintId(taken);
		taken.add(id);
		return id;
	};
	const idMap = freshElementIds(elements, mint);
	const groupMap = freshGroupIds(elements, mint);
	/**
	 * One old id rewritten to its fresh one, leaving alone anything that points
	 * outside the stencil.
	 * @param id The old id.
	 * @returns The new id, or the same value when there is nothing to rewrite.
	 */
	const mapId = (id: string | undefined | null): string | undefined | null =>
		id === null || id === undefined ? id : (idMap.get(id) ?? id);

	// Where the stencil starts, so the drop lands under the pointer. Measured,
	// for the same reason as boundingBox above.
	const boxes = elements.map((element) => extentOf(element));
	const minX = Math.min(...boxes.map((b) => b.x));
	const minY = Math.min(...boxes.map((b) => b.y));
	const ctx: RemapContext = {
		mapId,
		groupMap,
		mint,
		dx: targetX - minX,
		dy: targetY - minY,
		attribution,
	};
	return elements.map((raw) => placedElement(raw, ctx));
}

export { type RemapContext, normalizeType, remapStencil };
