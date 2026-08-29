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

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ServerElement } from "../types";

// The server's own bookkeeping, which is not board content and which
// Excalidraw has no field for.
export const cleanElementForExcalidraw = (element: ServerElement): Partial<ExcalidrawElement> => {
	const {
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		version: _version,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...cleanElement
	} = element;
	return cleanElement as Partial<ExcalidrawElement>;
};

/**
 * Drop references to elements this server update does not carry.
 *
 * A pane may hold part of a board — a merge that has not caught up, a
 * server update that names only what changed — and Excalidraw dereferences a
 * `containerId` and every `boundElements` entry as it renders. Pointing at
 * something that is not there is the one shape it will not survive, so the
 * pointer goes rather than the render.
 */
const validateAndFixBindings = (
	elements: Partial<ExcalidrawElement>[],
): Partial<ExcalidrawElement>[] => {
	const elementMap = new Map(elements.map((el) => [el.id!, el]));

	return elements.map((element) => {
		// A loose view on purpose: boundElements and containerId only exist on some
		// members of the element union, and this function runs before we know which.
		const fixedElement = { ...element } as Record<string, unknown>;

		if (fixedElement.boundElements) {
			if (Array.isArray(fixedElement.boundElements)) {
				const boundElements = fixedElement.boundElements.filter((binding: unknown) => {
					if (!binding || typeof binding !== "object") return false;
					const record = binding as Record<string, unknown>;
					if (typeof record.id !== "string" || typeof record.type !== "string") return false;
					if (!elementMap.has(record.id)) return false;
					if (!["text", "arrow"].includes(record.type)) return false;
					return true;
				});
				fixedElement.boundElements = boundElements;
				if (boundElements.length === 0) {
					fixedElement.boundElements = null;
				}
			} else {
				fixedElement.boundElements = null;
			}
		}

		if (typeof fixedElement.containerId === "string" && !elementMap.has(fixedElement.containerId)) {
			fixedElement.containerId = null;
		}

		return fixedElement;
	});
};

/**
 * What this pane hands Excalidraw.
 *
 * The name has kept its shape while what it does has shrunk to a guard,
 * because every caller means the same thing by it: these are the elements, put
 * them on the canvas.
 */
export const elementsForScene = (
	elements: Partial<ExcalidrawElement>[],
): Partial<ExcalidrawElement>[] => {
	if (elements.length === 0) return [];
	return validateAndFixBindings(elements);
};
