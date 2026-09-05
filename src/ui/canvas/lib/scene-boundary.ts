// The one place the pane's typed scene meets Excalidraw's. The server
// validated every element on the wire and Excalidraw brands its own at compile
// time; neither side can be re-spelled as the other without asserting, so the
// assertions live here, named, and nowhere else in the session.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { cleanElementForExcalidraw } from "@/ui/canvas/elements";
import type { SceneElement } from "@/ui/canvas/lib/reporting-state";
import type { ServerElement } from "@/ui/types";

/**
 * Excalidraw's elements as the reporting reducer reads them.
 * @param elements What Excalidraw holds.
 * @returns The same elements, typed as the pane's scene.
 */
function sceneFromExcalidraw(elements: readonly ExcalidrawElement[]): readonly SceneElement[] {
	// Excalidraw's brands are compile-time; the shared element type strips them.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return elements as unknown as readonly SceneElement[];
}

/**
 * The pane's scene as Excalidraw's `updateScene` accepts it.
 * @param elements The pane's scene.
 * @returns The same elements, typed as Excalidraw's.
 */
function sceneToExcalidraw(elements: readonly SceneElement[]): readonly ExcalidrawElement[] {
	// The inverse brand boundary of `sceneFromExcalidraw`.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return elements as unknown as readonly ExcalidrawElement[];
}

/**
 * Server elements as the pane's scene: stripped of bookkeeping, brand-free.
 * @param elements The elements a server message carries.
 * @returns The pane's scene elements.
 */
function sceneFromServer(elements: readonly ServerElement[]): SceneElement[] {
	return [...sceneFromExcalidraw(elements.map(cleanElementForExcalidraw))];
}

/**
 * App state for `updateScene`, from the plain record a viewport request
 * carries: zoom and scroll fields by Excalidraw's own names. Excalidraw merges
 * what is given and keeps the rest, so the record need not be complete.
 * @param appState The requested fields.
 * @returns The same record, typed as Excalidraw's app state.
 */
function appStateForExcalidraw(appState: Record<string, unknown>): AppState {
	// Excalidraw brands its zoom value and `updateScene` is typed over the whole
	// app state; the request names the same fields unbranded and partially.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return appState as unknown as AppState;
}

export { appStateForExcalidraw, sceneFromExcalidraw, sceneFromServer, sceneToExcalidraw };
