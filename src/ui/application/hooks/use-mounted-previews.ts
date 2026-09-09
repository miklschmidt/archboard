// The preview of a board a pane is holding, taken from that pane's own scene
// rather than from the server (ADR 0015): what the person is looking at is
// what the navigator shows. Kept by board key, replaced when the pane says its
// scene changed, and read only while a pane still holds that board.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PANE_DEBOUNCE_MS } from "@/shared/timing/timing";
import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import { fingerprintMountedPreview, type MountedPreviewSnapshot } from "@/ui/board-preview";

/** The mounted scenes by board key, and the pane event that refreshes one. */
interface MountedPreviews {
	/** The scene each held board is currently showing, by board key. */
	readonly byBoard: Readonly<Record<string, MountedPreviewSnapshot>>;
	/**
	 * A pane's scene changed: preview the board it holds from that pane, once
	 * the scene has stopped moving.
	 * @param paneId The pane.
	 */
	readonly previewMounted: (paneId: string) => void;
}

/** Where a mounted preview goes. */
type SetMountedPreview = (preview: MountedPreviewSnapshot) => void;

/**
 * Preview the board one pane holds, from its mounted scene.
 * @param paneId The pane.
 * @param handles The pane sessions.
 * @param setPreview Where the preview goes.
 */
async function previewFromPane(
	paneId: string,
	handles: PaneHandles,
	setPreview: SetMountedPreview,
): Promise<void> {
	const scene = handles.session(paneId)?.previewController.read() ?? null;
	if (scene === null) {
		return;
	}
	const fingerprint = await fingerprintMountedPreview(scene);
	setPreview({
		kind: "mounted",
		board: scene.board,
		fingerprint,
		elements: scene.elements,
		files: scene.files,
	});
}

/**
 * The mounted previews.
 * @param handles The pane sessions, which hold the scenes.
 * @returns The previews and the pane event that refreshes one.
 */
function useMountedPreviews(handles: PaneHandles): MountedPreviews {
	const [byBoard, setByBoard] = useState<Readonly<Record<string, MountedPreviewSnapshot>>>({});
	const timers = useRef(new Map<string, number>());

	const setPreview = useCallback<SetMountedPreview>((preview) => {
		setByBoard((current) => ({ ...current, [preview.board]: preview }));
	}, []);

	const previewMounted = useCallback(
		(paneId: string): void => {
			const pending = timers.current.get(paneId);
			if (pending !== undefined) {
				window.clearTimeout(pending);
			}
			timers.current.set(
				paneId,
				window.setTimeout(() => {
					timers.current.delete(paneId);
					void previewFromPane(paneId, handles, setPreview);
				}, PANE_DEBOUNCE_MS),
			);
		},
		[handles, setPreview],
	);

	useEffect(() => {
		const owned = timers.current;
		return () => {
			for (const timer of owned.values()) {
				window.clearTimeout(timer);
			}
			owned.clear();
		};
	}, []);

	return useMemo(() => ({ byBoard, previewMounted }), [byBoard, previewMounted]);
}

export { useMountedPreviews, type MountedPreviews };
