// The shape of an element the label rules reason about, and the few
// predicates every one of them starts from.

import type { RuntimeBoardElement, WritableVendorElement } from "@/shared/board-elements";

/** A `boundElements` entry: a shape's forward reference to a text or arrow. */
type BoundRef = RuntimeBoardElement["boundElements"] extends readonly (infer Ref)[] | null
	? Ref
	: never;

/**
 * The subset of an element this module reasons about. Deliberately structural
 * — server elements, Excalidraw elements and elements parsed out of a saved
 * `.excalidraw` file all satisfy it, and none of them need converting first.
 */
type OptionalIngress<T> = { [Key in keyof T]?: T[Key] | undefined };
type LabelCommon = Pick<WritableVendorElement, "id" | "type"> &
	OptionalIngress<Pick<WritableVendorElement, "isDeleted" | "x" | "y" | "width" | "height">> & {
		createdAt?: RuntimeBoardElement["createdAt"] | undefined;
		boundElements?: readonly Readonly<BoundRef>[] | null | undefined;
	};
type LabelTextFields = OptionalIngress<
	Pick<
		Extract<WritableVendorElement, { type: "text" }>,
		"containerId" | "text" | "textAlign" | "verticalAlign"
	>
>;
type LabelPoint = Extract<
	WritableVendorElement,
	{ type: "arrow" | "line" | "freedraw" }
>["points"][number];
type LabelPathFields = { points?: readonly Readonly<LabelPoint>[] | undefined };
type LabelledElement = LabelCommon & LabelTextFields & LabelPathFields;

/** The top-left a bound text must have, given the container it belongs to. */
interface BoundTextPlacement {
	x: number;
	y: number;
}

/**
 * Whether an element is a text element, tolerating the undefined a lookup
 * that found nothing returns.
 * @param element The element, or nothing.
 * @returns True for a text element.
 */
function isText(element: LabelledElement | undefined): boolean {
	return element?.type === "text";
}

/**
 * Whether an element is still on the board.
 * @param element The element.
 * @returns True when it is not deleted.
 */
function live(element: LabelledElement): boolean {
	return element.isDeleted !== true;
}

/**
 * Whether a container is a path rather than a shape, which changes where its
 * label hangs and how far from its anchor the label may sit.
 * @param element The container.
 * @returns True for an arrow or a line.
 */
function isLinear(element: LabelledElement): boolean {
	return element.type === "arrow" || element.type === "line";
}

/**
 * A coordinate a caller can compute with, rejecting the NaN and Infinity a
 * half-repaired board carries: placing a label from one of those would move
 * it somewhere nothing can find.
 * @param value The stored value.
 * @returns The number, or undefined when it is not a finite one.
 */
function num(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Elements by id, skipping anything without a string id.
 * @param elements The scene.
 * @returns The elements by id.
 */
function indexById(elements: readonly LabelledElement[]): Map<string, LabelledElement> {
	const byId = new Map<string, LabelledElement>();
	for (const element of elements) {
		if (typeof element.id === "string") {
			byId.set(element.id, element);
		}
	}
	return byId;
}

export {
	type BoundRef,
	type BoundTextPlacement,
	type LabelledElement,
	indexById,
	isLinear,
	isText,
	live,
	num,
};
