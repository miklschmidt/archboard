import type { Response } from "express";
import { BoardHeldError } from "../../../runtime/engine/board-lock.js";
import { readBoardContent } from "../../../runtime/engine/board-io.js";
import { boards } from "../../../runtime/engine/board-store.js";
import logger from "../../../runtime/engine/logger.js";
import { presentElements } from "../../../runtime/engine/presentation.js";
import type { ServerElement } from "../../../runtime/engine/types.js";
import { EMPTY_CHECKOUT_SNAPSHOT } from "../../../runtime/code-target/index.js";
import type { CheckoutSnapshot } from "../../../runtime/code-target/index.js";
import { boardErrorBody, boardErrorStatus } from "./board-error.js";

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
 *
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
 *
 * @param response Express response carrying any captured checkout overlay.
 * @param error Failure being mapped.
 * @param what Optional operation context logged with the failure.
 */
// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- The authoritative Express response must be mutated through status/json.
function answerBoardError(response: Response, error: unknown, what?: string): void {
	if (what !== undefined && what.length > 0) {
		logger.error(what, error);
	}
	response
		.status(boardErrorStatus(error))
		.json(contextualBoardErrorBody(error, checkoutSnapshotFor(response)));
}

export { answerBoardError, boardErrorStatus, checkoutSnapshotFor, refusalDocument };
