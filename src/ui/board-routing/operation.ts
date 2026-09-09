// The one thing the address bar is waiting on.
//
// Every board open goes through here, whoever asked for it: a restore's own
// step and a person's click are the same operation with a different owner, so
// there is one lifecycle to reason about and one thing outstanding at a time.
// That is what makes the last thing somebody asked for the last thing the
// server is given.
//
// An operation is not over when the server answers it. The answer says the
// note was read; the pane being told is a separate message, and settling on
// the first writes the address from a workspace that is about to change again.
// It is over when the pane has been seen to move — or when that pane is out of
// contact, since nothing better is coming.

import { boardIn, sameBoardKey, type WorkspaceAddress } from "@/ui/board-routing/address";
import type { NavigationIntent } from "@/ui/board-routing/intent";

/** Who asked for an operation. */
type Operator = { readonly kind: "restore"; readonly target: number } | { readonly kind: "person" };

/** What the server said, once it has said anything. */
type OperationAnswer = "opened" | "unreachable";

/** One board open, from the moment it is asked for until its pane has moved. */
interface Operation {
	readonly operator: Operator;
	readonly paneId: string;
	readonly boardKey: string;
	/** What that pane was showing when it was asked, so its move is observable. */
	readonly from: string | null;
	/** The server's answer, or null while it has not given one. */
	readonly answer: OperationAnswer | null;
	/**
	 * What the person asked for, when this is theirs. The operation owns it, so
	 * an expectation exists only between its pane moving and the address being
	 * written, and nobody else's change can be taken for their move.
	 */
	readonly intent: NavigationIntent | null;
}

/**
 * Begin an operation.
 * @param operator Who asked.
 * @param paneId The pane to move.
 * @param boardKey The board it is being pointed at.
 * @param displayed What is on screen, for what that pane shows now.
 * @param intent What the person asked for, when this is theirs.
 * @returns The operation.
 */
function startOperation(
	operator: Operator,
	paneId: string,
	boardKey: string,
	displayed: WorkspaceAddress,
	intent: NavigationIntent | null = null,
): Operation {
	return {
		operator,
		paneId,
		boardKey,
		from: boardIn(displayed, paneId),
		answer: null,
		intent,
	};
}

/**
 * Take the server's answer.
 * @param operation The operation.
 * @param answer What the server said.
 * @returns The operation, answered.
 */
function operationAnswered(operation: Operation, answer: OperationAnswer): Operation {
	return { ...operation, answer };
}

/**
 * Whether the operation is over: the server has answered, and a board it said
 * it opened is being shown by the pane that asked for it. A pane out of
 * contact is not waited on, because nothing more is coming to it.
 * @param operation The operation.
 * @param displayed What is on screen now.
 * @param ready Whether a pane has reached the server.
 * @returns True when nothing more is expected of it.
 */
function operationSettled(
	operation: Operation,
	displayed: WorkspaceAddress,
	ready: (paneId: string) => boolean,
): boolean {
	if (operation.answer === null) {
		return false;
	}
	if (operation.answer === "unreachable") {
		return true;
	}
	const shown = boardIn(displayed, operation.paneId);
	// That the pane moved at all is what says the open arrived: which board it
	// lands on is the server's answer, not the request's. A pane already showing
	// the board that was asked for has nothing to wait for — that is a person
	// opening the board their pane was on, which moves nothing and is still over.
	return (
		shown !== operation.from || sameBoardKey(shown, operation.boardKey) || !ready(operation.paneId)
	);
}

/**
 * Whether the pane this operation moved is showing something else now. False
 * for an operation that succeeded without moving anything, which is a person
 * opening the board their pane was already on.
 * @param operation The operation.
 * @param displayed What is on screen now.
 * @returns True when the pane moved.
 */
function operationMovedPane(operation: Operation, displayed: WorkspaceAddress): boolean {
	return boardIn(displayed, operation.paneId) !== operation.from;
}

export {
	operationAnswered,
	operationMovedPane,
	operationSettled,
	startOperation,
	type Operation,
	type OperationAnswer,
	type Operator,
};
