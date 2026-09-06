// What one pane's scene looks like to the shell: the selection projected for
// the inspector, path focus and where its elements are on the stage, the
// theme Excalidraw's own menu picked, and a preview of the mounted scene. All
// presentation: nothing here writes the board.

import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { MountedBoardPreviewController, MountedBoardPreviewScene } from "@/ui/board-preview";
import { projectPathFocusOverlay } from "@/ui/canvas/lib/path-focus-overlay";
import type {
	CanvasTheme,
	PanePathFocusSnapshot,
	PaneSelectionSnapshot,
} from "@/ui/canvas/lib/session-contracts";
import {
	projectConnectedPath,
	samePathFocusOverlay,
	samePathFocusSnapshot,
	type PathFocusOverlay,
	type PathFocusSnapshot,
} from "@/ui/path-focus";
import { projectSelection, sameSelectionProjection } from "@/ui/selection-inspector";

/** What the projection reads and tells. */
interface SceneProjectionHost {
	readonly paneId: string;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly boardKey: () => string | null;
	readonly stage: () => HTMLElement | null;
	readonly theme: () => CanvasTheme;
	readonly onThemeChange: ((theme: CanvasTheme) => void) | undefined;
	readonly onSelection: ((paneId: string, snapshot: PaneSelectionSnapshot) => void) | undefined;
	readonly onPathFocus: ((paneId: string, snapshot: PanePathFocusSnapshot) => void) | undefined;
	readonly onPathFocusOverlay:
		| ((paneId: string, overlay: PathFocusOverlay | null) => void)
		| undefined;
}

/** One pane's scene projection. */
interface SceneProjection {
	/** Excalidraw reported a change: project selection, focus and theme. */
	readonly changed: (appState: AppState) => void;
	readonly focusPath: () => void;
	readonly exitPathFocus: () => void;
	/** Clear the selection in Excalidraw's app state; presentation only. */
	readonly clearSelection: () => void;
	/** The pane is on another board now: focus ends, selection is re-published. */
	readonly boardChanged: () => void;
	/** The stage moved or resized; the overlay follows. */
	readonly refreshOverlay: () => void;
	readonly previewController: MountedBoardPreviewController;
}

/**
 * The selected ids in an app state.
 * @param appState Excalidraw's app state.
 * @returns The ids marked selected.
 */
function selectedIds(appState: AppState): string[] {
	return Object.keys(appState.selectedElementIds);
}

/**
 * Create the scene projection for one pane.
 * @param host What the projection reads and tells.
 * @returns The projection.
 */
function createSceneProjection(host: SceneProjectionHost): SceneProjection {
	let selection: PaneSelectionSnapshot | null = null;
	let focus: PathFocusSnapshot = { kind: "inactive" };
	let overlay: PathFocusOverlay | null = null;

	/**
	 * Publish a selection when it differs from the last one published.
	 * @param next The selection now.
	 */
	function publishSelection(next: PaneSelectionSnapshot): void {
		if (
			selection?.boardKey === next.boardKey &&
			sameSelectionProjection(selection.projection, next.projection)
		) {
			return;
		}
		selection = next;
		host.onSelection?.(host.paneId, next);
	}

	/**
	 * Publish an overlay when it differs from the last one published.
	 * @param next The overlay now, or null while focus is off.
	 */
	function publishOverlay(next: PathFocusOverlay | null): void {
		const same =
			next === null ? overlay === null : overlay !== null && samePathFocusOverlay(overlay, next);
		if (same) {
			return;
		}
		overlay = next;
		host.onPathFocusOverlay?.(host.paneId, next);
	}

	/** Recompute where the focused elements are on the stage. */
	function refreshOverlay(): void {
		const api = host.api();
		const stage = host.stage();
		if (!api || !stage || focus.kind !== "connected") {
			publishOverlay(null);
			return;
		}
		const focused = new Set(focus.elementIds);
		const elements = api.getSceneElements().filter((element) => focused.has(element.id));
		const rect = stage.getBoundingClientRect();
		publishOverlay(
			projectPathFocusOverlay(host.paneId, elements, api.getAppState(), {
				left: rect.left,
				top: rect.top,
			}),
		);
	}

	/**
	 * Apply a focus snapshot, publishing it when it changed.
	 * @param next The snapshot now.
	 */
	function applyFocus(next: PathFocusSnapshot): void {
		if (!samePathFocusSnapshot(focus, next)) {
			focus = next;
			host.onPathFocus?.(host.paneId, { boardKey: host.boardKey(), snapshot: next });
		}
		refreshOverlay();
	}

	/** Dim everything not connected to the selected element. */
	function focusPath(): void {
		const api = host.api();
		if (api) {
			applyFocus(projectConnectedPath(api.getSceneElements(), selectedIds(api.getAppState())));
		}
	}

	/** Focus is off. */
	function exitPathFocus(): void {
		applyFocus({ kind: "inactive" });
	}

	/**
	 * Clear Excalidraw's selection: app state only, so the scene and the note
	 * are untouched. Excalidraw reports the change, which empties the
	 * inspector and ends path focus through the ordinary path.
	 */
	function clearSelection(): void {
		host.api()?.updateScene({ appState: { selectedElementIds: {} } });
	}

	/**
	 * Follow the selection while focus is on: it moves with it, and ends with it.
	 * @param ids The selected ids now.
	 */
	function followSelection(ids: readonly string[]): void {
		if (focus.kind === "inactive") {
			return;
		}
		const api = host.api();
		if (ids.length === 0 || !api) {
			exitPathFocus();
			return;
		}
		applyFocus(projectConnectedPath(api.getSceneElements(), ids));
	}

	/**
	 * Excalidraw reported a change.
	 * @param appState Excalidraw's app state.
	 */
	function changed(appState: AppState): void {
		if (appState.theme !== host.theme()) {
			host.onThemeChange?.(appState.theme);
		}
		const ids = selectedIds(appState);
		const scene = host.api()?.getSceneElements() ?? [];
		publishSelection({ boardKey: host.boardKey(), projection: projectSelection(scene, ids) });
		followSelection(ids);
	}

	/** The pane is on another board now. */
	function boardChanged(): void {
		exitPathFocus();
		publishSelection({ boardKey: host.boardKey(), projection: { kind: "empty" } });
	}

	/**
	 * What the mounted pane holds, for a navigator preview.
	 * @returns The scene, or null before the canvas mounted or before it has a board.
	 */
	function read(): MountedBoardPreviewScene | null {
		const api = host.api();
		const board = host.boardKey();
		if (!api || board === null) {
			return null;
		}
		return { board, elements: api.getSceneElements(), files: api.getFiles() };
	}

	return {
		changed,
		focusPath,
		exitPathFocus,
		clearSelection,
		boardChanged,
		refreshOverlay,
		previewController: { read },
	};
}

export { createSceneProjection, selectedIds, type SceneProjection, type SceneProjectionHost };
