// Retained pictures require the local renderer installed by replay.

import type { QueryClient } from "@tanstack/react-query";

import {
	ReadingError,
	type DocumentEntry,
	type SemanticRender,
	type SemanticRenderRequest,
} from "#ui/clients/canvas/reads/drawings.ts";

/** A way of getting pictures. */
interface PictureSource {
	/**
	 * One variant of one model, drawn.
	 * @param request The model, variant and view.
	 * @param client The tab's cache, for the model and policy it is drawn from.
	 * @param signal Cancels a read the picture waits on.
	 * @returns The drawing, or the news that there is nothing to draw.
	 */
	readonly draw: (
		request: SemanticRenderRequest,
		client: QueryClient,
		signal: AbortSignal,
	) => Promise<SemanticRender>;
	/**
	 * Told the legacy boards the server lists in one vault, whenever it lists them.
	 * @param vault The vault.
	 * @param models The legacy boards, with their versions.
	 * @param client The tab's cache, for drawing listed legacy boards ahead.
	 */
	readonly listed?: (vault: string, models: readonly DocumentEntry[], client: QueryClient) => void;
}

let current: PictureSource | null = null;

/**
 * The source pictures come from now.
 * @returns The source.
 * @throws {ReadingError} When replay has not installed its local renderer.
 */
function pictureSource(): PictureSource {
	if (current === null)
		throw new ReadingError(
			"BOARD_UNREADABLE",
			"Start the local renderer before drawing a retained recording.",
		);
	return current;
}

/**
 * Take pictures from another source from now on.
 * @param source The source.
 */
function takePicturesFrom(source: PictureSource): void {
	current = source;
}

export { pictureSource, takePicturesFrom, type PictureSource };
