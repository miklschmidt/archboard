// The Excalidraw-shaped helpers the reporting runtime needs: which text
// element an editor is open on, how the note replaces the scene with that
// editor closed, and a scene update in the shape `updateScene` accepts. Split
// from `reporting.ts` for its size.

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { elementsForScene } from "@/ui/canvas/elements";
import type {
	ChangeReportingEvent,
	SceneElement,
	SceneUpdate,
} from "@/ui/canvas/lib/reporting-state";
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

/**
 * Close Excalidraw's text editor if one is open on the stage. Excalidraw keeps
 * the editor's textarea until it is submitted, whatever the scene holds, and
 * submits it on blur.
 * @param stage The pane's element, or null before it mounts.
 */
function closeTextEditor(stage: HTMLElement | null): void {
	const editor = stage?.querySelector("textarea.excalidraw-wysiwyg");
	if (editor instanceof HTMLTextAreaElement) {
		editor.blur();
	}
}

/**
 * Show exactly the note (ADR 0022). A withdrawn edit carries nothing over:
 * the element under an open editor was withheld from a report the note has
 * since moved past, so it is as optimistic as the rest. Excalidraw's editor
 * writes its draft into whichever element of its id the scene holds when it
 * closes, so it is closed while that element is absent, and the note is shown
 * whole afterwards.
 * @param api Excalidraw's API, if mounted.
 * @param stage The pane's element, if mounted.
 * @param elements The note's document.
 * @param dispatch Where the scene updates go.
 */
function showNoteScene(
	api: ExcalidrawImperativeAPI | null,
	stage: HTMLElement | null,
	elements: SceneElement[],
	dispatch: (event: ChangeReportingEvent) => void,
): void {
	if (!api) {
		return;
	}
	/**
	 * Replace the scene with no local state kept and no editor open.
	 * @param shown The elements to show.
	 */
	const replace = (shown: SceneElement[]): void => {
		dispatch({
			type: "server_update_requested",
			update: { elements: shown, appState: { editingTextElement: null }, captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
	};
	const editing = idUnderEditor(api);
	if (editing !== null) {
		replace(elements.filter((element) => element.id !== editing));
		closeTextEditor(stage);
	}
	replace(elements);
}

export { idUnderEditor, sceneUpdateData, showNoteScene };
