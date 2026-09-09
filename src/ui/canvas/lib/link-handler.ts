// Excalidraw's link handler over the two kinds of link an element can carry:
// a board link, which drills down in the clicked pane, and a code target,
// which opens in the person's editor.

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import { followBoardLink, isBoardLink, type BoardLinkOptions } from "@/ui/canvas/board-links";
import { createCodeTargetLinkHandler, type CodeTargetLinkHandlerOptions } from "@/ui/code-target";

/** The clicked pane and the destinations for link outcomes. */
type CanvasLinkOptions = CodeTargetLinkHandlerOptions & BoardLinkOptions;

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
		if (!isBoardLink(link)) {
			codeLink(element, event);
			return;
		}
		event.preventDefault();
		followBoardLink(options, link);
	};
}

export { createCanvasLinkHandler };
