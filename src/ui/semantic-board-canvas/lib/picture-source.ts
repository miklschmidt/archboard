// Where a pane's pictures come from.
//
// A page that runs the renderer draws them itself, from the board it read
// (TASK-247). Anything that has not started a renderer asks the canvas
// server's render route, which answers identically: both run `renderBoard`.
// The page chooses once, at start, before anything is drawn.

import type { QueryClient } from "@tanstack/react-query";

import {
	fetchSemanticRender,
	type SemanticBoardEntry,
	type SemanticRender,
	type SemanticRenderRequest,
} from "@/ui/semantic-board-canvas/api/semantic-boards";

/** A way of getting pictures. */
interface PictureSource {
	/**
	 * One variant of one board, drawn.
	 * @param request The board, variant, view and theme.
	 * @param client The tab's cache, for the board and policy it is drawn from.
	 * @param signal Cancels a read the picture waits on.
	 * @returns The drawing, or the news that there is nothing to draw.
	 */
	readonly draw: (
		request: SemanticRenderRequest,
		client: QueryClient,
		signal: AbortSignal,
	) => Promise<SemanticRender>;
	/**
	 * Told the boards the server lists, whenever it lists them.
	 * @param boards The boards, with their versions.
	 */
	readonly listed?: (boards: readonly SemanticBoardEntry[]) => void;
}

const fromServer: PictureSource = {
	/**
	 * Ask the canvas server's render route.
	 * @param request The board, variant, view and theme.
	 * @param _client Unused: the server reads the board itself.
	 * @param signal Cancels the request.
	 * @returns The drawing, or the news that there is nothing to draw.
	 */
	draw: (request, _client, signal) => fetchSemanticRender(request, signal),
};

let current: PictureSource = fromServer;

/**
 * The source pictures come from now.
 * @returns The source.
 */
function pictureSource(): PictureSource {
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
