// Which depiction of one board a card draws, and the server read behind it.
//
// The precedence is the point. A board a pane holds is drawn from that pane's
// mounted scene, which is what the person is actually looking at; every other
// board from the server's snapshot. They are two stores, not one slot, so a
// snapshot asked for before a pane adopted the board and answered after cannot
// overwrite the live scene: it lands in the cache and loses the choice. While a
// pane holds a board nothing is fetched for it, and the snapshot already in
// hand still shows until the pane's first frame arrives rather than blanking.

import { useQuery } from "@tanstack/react-query";

import { boardPreviewQuery } from "@/ui/board-catalog/lib/queries";
import { previewSourceFor } from "@/ui/board-catalog/preview-source";
import type { MountedPreviewSnapshot, PreviewSource } from "@/ui/board-preview";

/** What is known about one board's depiction outside the cache. */
interface BoardPreviewInputs {
	/** The board key, which the server snapshot is cached under. */
	readonly boardKey: string;
	/** The scene a pane last reported for this board, or null when none has. */
	readonly mounted: MountedPreviewSnapshot | null;
	/** Whether a pane holds this board, which is what stops the server read. */
	readonly held: boolean;
}

/**
 * The scene to draw for one board.
 * @param inputs The board, its mounted scene and whether a pane holds it.
 * @returns The scene, or null while there is nothing to draw yet.
 */
function useBoardPreviewSource(inputs: BoardPreviewInputs): PreviewSource | null {
	const { boardKey, mounted, held } = inputs;
	const snapshot = useQuery({ ...boardPreviewQuery(boardKey), enabled: !held });
	return previewSourceFor({ mounted, cached: snapshot.data, held });
}

export { useBoardPreviewSource, type BoardPreviewInputs };
