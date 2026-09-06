// The two Excalidraw-shaped helpers the reporting runtime needs: which text
// element an editor is open on, and a scene update in the shape
// `updateScene` accepts. Split from `reporting.ts` for its size.

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { elementsForScene } from "@/ui/canvas/elements";
import type { SceneUpdate } from "@/ui/canvas/lib/reporting-state";
import { appStateForExcalidraw, sceneToExcalidraw } from "@/ui/canvas/lib/scene-boundary";

/**
 * The text element a person has an editor open on, if any.
 *
 * Excalidraw keeps the element it opened the editor for under the id it had
 * at the time. Rename that element and the textarea submits into an element
 * the scene no longer holds (TASK-098).
 * @param api Excalidraw's API, if mounted.
 * @returns The id under the editor, or null.
 */
function idUnderEditor(api: ExcalidrawImperativeAPI | null): string | null {
	const editing = api?.getAppState().editingTextElement;
	return editing ? editing.id : null;
}

/**
 * A scene update as Excalidraw's `updateScene` accepts it.
 * @param update What to apply.
 * @returns The update data.
 */
function sceneUpdateData(
	update: SceneUpdate,
): Parameters<ExcalidrawImperativeAPI["updateScene"]>[0] {
	return {
		...(update.elements ? { elements: elementsForScene(sceneToExcalidraw(update.elements)) } : {}),
		...(update.appState ? { appState: appStateForExcalidraw(update.appState) } : {}),
		captureUpdate:
			update.captureUpdate === "immediately"
				? CaptureUpdateAction.IMMEDIATELY
				: CaptureUpdateAction.NEVER,
	};
}

export { idUnderEditor, sceneUpdateData };
