// Activating a code target: the binding-derived link on a board element, or
// the inspector's button. Either way the board and element identity go to the
// server, which owns the binding, the opener and the checkout registry; the
// browser never reads a local path.

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import {
	parseInternalCodeTargetUrl,
	type CodeTargetNotice,
	type CodeTargetOpenFailure,
	type CodeTargetOpenSuccess,
} from "@/shared/code-target";
import { openCodeTarget } from "@/ui/canvas/api";

/** Excalidraw's link handler. */
type LinkHandler = NonNullable<ExcalidrawProps["onLinkOpen"]>;

/** What a link handler needs. */
interface CodeTargetLinkHandlerOptions {
	boardKey: string | null;
	onSuccess: (reply: CodeTargetOpenSuccess) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

/** What an activation needs. */
interface CodeTargetActivationOptions extends CodeTargetLinkHandlerOptions {
	elementId: string;
}

/**
 * The notice for a typed failure.
 * @param reply The failure.
 * @returns The notice, with the failure's actions.
 */
function failureNotice(reply: CodeTargetOpenFailure): CodeTargetNotice {
	return { kind: "error", message: reply.error, actions: reply.actions ?? [] };
}

/**
 * The notice for a link that does not belong where it was activated.
 * @param message Plain words.
 * @returns The notice, with no actions.
 */
function mismatch(message: string): CodeTargetNotice {
	return { kind: "error", message, actions: [] };
}

/**
 * Open an element's code target, reporting the typed outcome.
 * @param options The board, the element and where outcomes go.
 */
function activateCodeTarget(options: CodeTargetActivationOptions): void {
	const { boardKey, elementId, onSuccess, onFailure } = options;
	if (boardKey === null || boardKey === "") {
		onFailure(mismatch("No board is available for this code target."));
		return;
	}
	void openCodeTarget({ board: boardKey, element: elementId }).then((reply) => {
		if (reply.success) {
			onSuccess(reply);
		} else {
			onFailure(failureNotice(reply));
		}
		return reply;
	});
}

/**
 * Excalidraw's link handler for code links. Ordinary links are left to
 * Excalidraw; a reserved link is activated only on the board and element it
 * names, and never fetched otherwise.
 * @param options The board and where outcomes go.
 * @returns The handler.
 */
function createCodeTargetLinkHandler(options: CodeTargetLinkHandlerOptions): LinkHandler {
	const { boardKey, onSuccess, onFailure } = options;
	return (element, event): void => {
		const request = element.link ? parseInternalCodeTargetUrl(element.link) : null;
		if (!request) {
			return;
		}
		event.preventDefault();
		if (request.board !== boardKey) {
			onFailure(mismatch("The link belongs to another board."));
			return;
		}
		if (request.element !== element.id) {
			onFailure(mismatch("The link belongs to another element."));
			return;
		}
		activateCodeTarget({
			boardKey: request.board,
			elementId: request.element,
			onSuccess,
			onFailure,
		});
	};
}

export {
	activateCodeTarget,
	createCodeTargetLinkHandler,
	type CodeTargetActivationOptions,
	type CodeTargetLinkHandlerOptions,
};
