// Where the focused elements are on a pane's stage, in viewport pixels, so the
// shell's dimming can leave them clear. Presentation only: nothing here
// touches the board.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import type { PathFocusOverlay, ViewportRectangle } from "@/ui/path-focus";

/** The stage's placement in the page. */
interface StageRect {
	left: number;
	top: number;
}

/** Breathing room around a focused shape, in viewport pixels. */
const PADDING = 6;

/**
 * Whether an element's extent is its points rather than its box.
 * @param element The element.
 * @returns True for arrows, lines and freedraw strokes.
 */
function isLinear(element: ExcalidrawElement): boolean {
	return element.type === "arrow" || element.type === "line" || element.type === "freedraw";
}

/**
 * The scene-space bounds of an element: its box, or its points for a stroke.
 * @param element The element.
 * @returns Left, top, width and height in scene units.
 */
function sceneBounds(element: ExcalidrawElement): ViewportRectangle {
	if (!isLinear(element) || !("points" in element) || element.points.length === 0) {
		return { x: element.x, y: element.y, width: element.width, height: element.height };
	}
	const xs = element.points.map((point) => element.x + point[0]);
	const ys = element.points.map((point) => element.y + point[1]);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * One element's rectangle on the stage.
 * @param element The element.
 * @param appState Excalidraw's camera.
 * @param stage The stage's placement.
 * @returns The padded rectangle in viewport pixels.
 */
function viewportRectangle(
	element: ExcalidrawElement,
	appState: AppState,
	stage: StageRect,
): ViewportRectangle {
	const zoom = appState.zoom.value;
	const offsetX = appState.offsetLeft - stage.left;
	const offsetY = appState.offsetTop - stage.top;
	const bounds = sceneBounds(element);
	const pad = isLinear(element) ? PADDING + (element.strokeWidth * zoom) / 2 : PADDING;
	return {
		x: (bounds.x + appState.scrollX) * zoom + offsetX - pad,
		y: (bounds.y + appState.scrollY) * zoom + offsetY - pad,
		width: Math.max(1, bounds.width * zoom) + pad * 2,
		height: Math.max(1, bounds.height * zoom) + pad * 2,
	};
}

/**
 * The overlay for a pane's focused elements.
 * @param paneId The pane.
 * @param elements The focused elements, as Excalidraw holds them.
 * @param appState Excalidraw's camera.
 * @param stage The stage's placement in the page.
 * @returns The overlay.
 */
function projectPathFocusOverlay(
	paneId: string,
	elements: readonly ExcalidrawElement[],
	appState: AppState,
	stage: StageRect,
): PathFocusOverlay {
	return {
		paneId,
		rectangles: elements.map((element) => viewportRectangle(element, appState, stage)),
	};
}

export { projectPathFocusOverlay, type StageRect };
