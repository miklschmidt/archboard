// Board links reuse the existing pane-open boundary. The server owns board
// address validation and vault resolution; level metadata is not navigation.

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import { openBoard } from "@/ui/canvas/api";
import { createCodeTargetLinkHandler, type CodeTargetLinkHandlerOptions } from "@/ui/code-target";

/** The clicked pane and the destinations for link outcomes. */
type CanvasLinkOptions = CodeTargetLinkHandlerOptions & {
	clientId: string;
	onBoardLinkError: (error: string) => void;
	/** The person is following a board link, so this move is one of theirs. */
	onBoardOpenRequested: (boardKey: string) => void;
};

/**
 * Follow a board key in the clicked pane, or delegate to the code-link handler.
 * @param options The pane and outcome callbacks.
 * @returns Excalidraw's link handler.
 */
function createCanvasLinkHandler(
	options: CanvasLinkOptions,
): NonNullable<ExcalidrawProps["onLinkOpen"]> {
	const codeLink = createCodeTargetLinkHandler(options);
	return (element, event): void => {
		const link = (element.link ?? "").trim();
		if (!link.startsWith("[[")) {
			codeLink(element, event);
			return;
		}
		event.preventDefault();
		const board = /^\[\[([^[\]#^|\r\n]+)\]\]$/.exec(link)?.[1]?.trim();
		if (!board) {
			options.onBoardLinkError(
				"Use [[board-key]] with the key from Board navigation, without an alias or heading/block anchor.",
			);
			return;
		}
		options.onBoardOpenRequested(board);
		void openBoard({ board, pane: options.clientId }).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			options.onBoardLinkError(
				`Could not open board "${board}". ${message} Check the target in Board navigation and try the link again.`,
			);
		});
	};
}

export { createCanvasLinkHandler };
