// Which of the two depictions of a board a card should draw. Pure, and the
// only place the question is answered (TASK-167).

import type { MountedPreviewSnapshot, PreviewSource } from "@/ui/board-preview";

/** What is available to depict one board. */
interface PreviewSources {
	/** The scene a pane is holding for this board, when one is. */
	readonly mounted: MountedPreviewSnapshot | null;
	/** The server's snapshot, as the cache holds it. */
	readonly cached: PreviewSource | undefined;
	/** Whether a pane holds this board right now. */
	readonly held: boolean;
}

/**
 * The depiction to draw.
 *
 * A pane's own scene wins while that pane holds the board: it is what the
 * person is looking at, and the server's copy of a board being edited is
 * behind by definition (ADR 0015, ADR 0022). Because the two live in separate
 * stores, a snapshot asked for before a pane adopted the board and answered
 * after it cannot displace the live scene; it is simply not chosen. Until the
 * pane has produced its first frame the cached snapshot still shows, so
 * opening a board does not blank the card that was already there.
 * @param sources What is available to depict the board.
 * @returns The scene to draw, or null when there is nothing yet.
 */
function previewSourceFor(sources: PreviewSources): PreviewSource | null {
	const mounted = sources.held ? sources.mounted : null;
	return mounted ?? sources.cached ?? null;
}

export { previewSourceFor, type PreviewSources };
