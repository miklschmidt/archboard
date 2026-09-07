import type { Response } from "express";
import { BoardHeldError } from "@/runtime/engine/board-lock";
import { readBoardContent } from "@/runtime/engine/board-io";
import { boards } from "@/runtime/engine/board-store";
import { logger } from "@/runtime/engine/logger";
import { presentElements } from "@/runtime/engine/presentation";
import type { ServerElement } from "@/runtime/engine/types";
import { EMPTY_CHECKOUT_SNAPSHOT } from "@/runtime/code-target";
import type { CheckoutSnapshot } from "@/runtime/code-target";
import { boardErrorBody, boardErrorStatus } from "@/server/canvas/lib/board-error";

/**
 * The checkout overlay this request already captured, or the empty one for a
 * route that captures none.
 * @param response The response the middleware put it on.
 * @returns The snapshot.
 */
function checkoutSnapshotFor(
	response: Readonly<
		Pick<
			Response<unknown, { readonly checkoutSnapshot?: Readonly<CheckoutSnapshot> | null }>,
			"locals"
		>
	>,
): CheckoutSnapshot {
	return response.locals.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT;
}

/**
 * Read the note state included with a write-boundary refusal.
 * @param board Canonical board key.
 * @param checkoutSnapshot Checkout overlay already captured for the request.
 * @returns Presented document and its persisted version.
 */
function refusalDocument(
	board: string,
	checkoutSnapshot: Readonly<CheckoutSnapshot> = EMPTY_CHECKOUT_SNAPSHOT,
): { document: ServerElement[]; version: number | null } {
	const state = boards.get(board);
	if (state === undefined) {
		throw new Error(`Board "${board}" is not open`);
	}
	const content = readBoardContent(state);
	return {
		document: presentElements(content.elements.values(), { boardKey: board, checkoutSnapshot }),
		version: content.version ?? null,
	};
}

/**
 * A failure's body, with the held board's current note attached when the
 * failure is that somebody else has it: a 409 is exactly when the three
 * outcomes are worth saying (ADR 0006).
 * @param error Whatever a route threw.
 * @param checkoutSnapshot The checkout overlay the document presents through.
 * @returns The response body.
 */
function contextualBoardErrorBody(
	error: unknown,
	checkoutSnapshot: Readonly<CheckoutSnapshot>,
): Record<string, unknown> {
	const body = boardErrorBody(error);
	if (!(error instanceof BoardHeldError) || !boards.has(error.board)) {
		return body;
	}
	return { ...body, ...refusalDocument(error.board, checkoutSnapshot) };
}

/**
 * Send the canonical board failure response.
 * @param response Express response carrying any captured checkout overlay.
 * @param error Failure being mapped.
 * @param what Optional operation context logged with the failure.
 */
function answerBoardError(response: Response, error: unknown, what?: string): void {
	if (what !== undefined && what.length > 0) {
		logger.error(what, error);
	}
	response
		.status(boardErrorStatus(error))
		.json(contextualBoardErrorBody(error, checkoutSnapshotFor(response)));
}

export { answerBoardError, boardErrorStatus, checkoutSnapshotFor, refusalDocument };
