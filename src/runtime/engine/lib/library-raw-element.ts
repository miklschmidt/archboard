// A library element as it comes off disk.
//
// The stencil library's JSON is whatever a browser posted or a vault file
// holds, and its v1 format predates several of the fields the rest of the
// codebase takes for granted. So every field here is optional, and every
// reader checks the one field it wants rather than trusting the shape.

import type { RuntimeBoardElement } from "@/shared/board-elements";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

type NativeKeys<Element> = Element extends Element ? keyof Element : never;
type NativeValue<Key extends PropertyKey> = RuntimeBoardElement extends infer Element
	? Element extends RuntimeBoardElement
		? Key extends keyof Element
			? Element[Key]
			: never
		: never
	: never;

/** Partial library JSON, projected from native fields plus its legacy reference metadata. */
type RawElement = {
	[
		Key in Exclude<NativeKeys<RuntimeBoardElement>, "type" | "startBinding" | "endBinding">
	]?: NativeValue<Key>;
} & {
	type?: NativeValue<"type"> | "draw";
	startBinding?: Partial<NonNullable<NativeValue<"startBinding">>> | null;
	endBinding?: Partial<NonNullable<NativeValue<"endBinding">>> | null;
	boundElementIds?: string[];
};

/**
 * One element of a stored stencil.
 * @param value One entry of a stored item's `elements`.
 * @returns The element, or an empty one for anything that is not an object at
 * all: that measures as nothing and normalizes to a plain rectangle.
 */
function rawElementOf(value: unknown): RawElement {
	return isRecord(value) ? value : {};
}

export { type NativeValue, type RawElement, rawElementOf };
