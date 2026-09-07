// Preparing the server's elements for Excalidraw, which is now nearly nothing.
//
// This file used to hold a conversion. Every server update went through
// `convertToExcalidrawElements`, Excalidraw's own converter, which expanded a
// `label` into a text element with an id it invented; and then through six
// passes of ours that put right what it had done — restoring the bindings it
// stripped, renaming the labels it had minted, re-centring the ones it had
// misplaced, and dropping the seeds it had already spent.
//
// That was the second converter. Under ADR 0015 there is one, it is
// `src/runtime/engine/expand-elements.ts`, it runs on the way in, and what a pane
// receives is already what Excalidraw renders. So there is nothing to convert
// here and nothing to correct.
//
// Measured, with this file doing no conversion: a twelve-element board written
// by the one converter and rendered in a real browser came back with **nothing
// changed** (`tests/system/browser/fixed-point-document.test.ts`). Every difference that check used
// to report — re-measured text, dropped `rawText`, rewritten `index`, arrows
// inset by half a stroke, freedraw handed `pressures` — was this file, not
// Excalidraw.
//
// What is left is a guard rather than a conversion: a reference to an element
// that is not in this server update would make Excalidraw throw, and a pane can
// legitimately receive a partial board.

import type {
	ExcalidrawElement,
	NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { ServerElement } from "@/ui/types";

/**
 * Strip the server's own bookkeeping, which is not board content and which
 * Excalidraw has no field for, and hand the element to Excalidraw as its own.
 * Keep native `version` and `versionNonce`: Excalidraw uses both for history.
 * @param element A validated element as the server sent it.
 * @returns The same element without runtime tracking keys, typed as Excalidraw's.
 */
const cleanElementForExcalidraw = (element: ServerElement): ExcalidrawElement => {
	const {
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...cleanElement
	} = element;
	// Excalidraw brands JSON numbers and strings at compile time, and the shared
	// element type deliberately strips those brands (`JsonWritable`) because the
	// server validated the wire. This is the one UI brand boundary; no compliant
	// spelling can re-brand without asserting.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return cleanElement as unknown as ExcalidrawElement;
};

const BINDABLE_TYPES: ReadonlySet<string> = new Set(["text", "arrow"]);

/**
 * Drop `boundElements` entries that point outside this server update.
 * @param element The element whose bindings are checked.
 * @param carried Ids of every element in the update.
 * @returns The element with only bindings Excalidraw can dereference, or `null` bindings.
 */
const repairBoundElements = (
	element: ExcalidrawElement,
	carried: ReadonlySet<string>,
): ExcalidrawElement => {
	if (element.boundElements === null) {
		return element;
	}
	const boundElements = element.boundElements.filter(
		(binding) => carried.has(binding.id) && BINDABLE_TYPES.has(binding.type),
	);
	return { ...element, boundElements: boundElements.length === 0 ? null : boundElements };
};

/**
 * Drop a text element's `containerId` when its container is not in this update.
 * @param element The element whose container is checked.
 * @param carried Ids of every element in the update.
 * @returns The element, detached from an absent container.
 */
const repairContainer = (
	element: ExcalidrawElement,
	carried: ReadonlySet<string>,
): ExcalidrawElement => {
	if (element.type !== "text" || element.containerId === null || carried.has(element.containerId)) {
		return element;
	}
	return { ...element, containerId: null };
};

/**
 * Drop references to elements this server update does not carry.
 *
 * A pane may hold part of a board — a merge that has not caught up, a
 * server update that names only what changed — and Excalidraw dereferences a
 * `containerId` and every `boundElements` entry as it renders. Pointing at
 * something that is not there is the one shape it will not survive, so the
 * pointer goes rather than the render.
 * @param elements The elements in one server update.
 * @returns Copies whose bindings and containers all resolve within the update.
 */
const validateAndFixBindings = (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] => {
	const carried: ReadonlySet<string> = new Set(elements.map((element) => element.id));
	return elements.map((element) => repairContainer(repairBoundElements(element, carried), carried));
};

/**
 * What this pane hands Excalidraw.
 *
 * The name has kept its shape while what it does has shrunk to a guard,
 * because every caller means the same thing by it: these are the elements, put
 * them on the canvas.
 * @param elements The cleaned elements of one server update.
 * @returns The elements Excalidraw can render without dangling references.
 */
const elementsForScene = (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] => {
	if (elements.length === 0) {
		return [];
	}
	return validateAndFixBindings(elements);
};

/**
 * Whether Excalidraw should still draw this element.
 * @param element Any element of the scene.
 * @returns True when the element has not been deleted.
 */
const isNonDeletedElement = (element: ExcalidrawElement): element is NonDeletedExcalidrawElement =>
	!element.isDeleted;

export { cleanElementForExcalidraw, elementsForScene, isNonDeletedElement };
