// The one thing the address bar is waiting on.
//
// Every board open goes through here, whoever asked for it: a restore's own
// step and a user's click are the same operation with a different owner, so
// there is one lifecycle to reason about and one thing outstanding at a time.
// That is what makes the last thing somebody asked for the last thing the
// server is given.
//
// An operation is not over when the server answers it. The answer says the
// note was read; the pane being told is a separate message, and settling on
// the first writes the address from a workspace that is about to change again.
// It is over when the pane has been seen to move — or when that pane is out of
// contact, since nothing better is coming.
//
// Where a pane is means its board and the repository the board is in: the same
// key in another repository is another board (ADR 0050), so a pane moving
// between them has moved.

import { boardIn, repositoryIn, type WorkspaceAddress } from "#ui/rules/board-routing/address.ts";
import type { AskedBoard, OpenedBoard } from "#ui/rules/board-routing/contracts.ts";
import type { NavigationIntent } from "#ui/state/board-routing/intent.ts";

/** Who asked for an operation. */
type Operator = { readonly kind: "restore"; readonly target: number } | { readonly kind: "user" };

/** What the server said, once it has said anything. */
type OperationAnswer = "opened" | "unreachable";

/** One board open, from the moment it is asked for until its pane has moved. */
interface Operation {
	readonly operator: Operator;
	readonly paneId: string;
	/** The board a restore asked for, so one it cannot reach can be named. */
	readonly asked: AskedBoard | null;
	/** What that pane was showing when it was asked, so its move is observable. */
	readonly from: string | null;
	/** The repository of that board, when it was asked. */
	readonly fromRepository: string | null;
	/** The server's answer, or null while it has not given one. */
	readonly answer: OperationAnswer | null;
	/**
	 * The board the server says it opened, as the server keys it. Its own answer
	 * rather than the request: an address may be spelled several ways, and only
	 * the vault knows which board a spelling resolves to (ADR 0004).
	 */
	readonly openedKey: string | null;
	/** The repository the server says the pane is in with that board. */
	readonly openedRepository: string | null;
	/**
	 * What the user asked for, when this is theirs. The operation owns it, so
	 * an expectation exists only between its pane moving and the address being
	 * written, and nobody else's change can be taken for their move.
	 */
	readonly intent: NavigationIntent | null;
}

/**
 * Begin an operation.
 * @param operator Who asked.
 * @param paneId The pane to move.
 * @param asked The board it is being pointed at, when a restore asked for one.
 * @param displayed What is on screen, for what that pane shows now.
 * @param intent What the user asked for, when this is theirs.
 * @returns The operation.
 */
function startOperation(
	operator: Operator,
	paneId: string,
	asked: AskedBoard | null,
	displayed: WorkspaceAddress,
	intent: NavigationIntent | null = null,
): Operation {
	return {
		operator,
		paneId,
		asked,
		from: boardIn(displayed, paneId),
		fromRepository: repositoryIn(displayed, paneId),
		answer: null,
		openedKey: null,
		openedRepository: null,
		intent,
	};
}

/**
 * Take the server's answer.
 * @param operation The operation.
 * @param answer What the server said.
 * @param opened The board it opened and the repository it put the pane in, when it opened one.
 * @returns The operation, answered.
 */
function operationAnswered(
	operation: Operation,
	answer: OperationAnswer,
	opened: OpenedBoard | null = null,
): Operation {
	return {
		...operation,
		answer,
		openedKey: opened?.boardKey ?? null,
		openedRepository: opened?.repository ?? null,
	};
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
	// That the pane moved at all is what says the open arrived. A pane already
	// showing the board the server opened, in the repository the server put it
	// in, has nothing to wait for: that is a user opening the board their pane
	// was on, which moves nothing and is still over. Every key and repository
	// here comes from the server, so the same board is the same string however
	// the request spelled the address.
	return (
		operationMovedPane(operation, displayed) ||
		(boardIn(displayed, operation.paneId) === operation.openedKey &&
			repositoryIn(displayed, operation.paneId) === operation.openedRepository) ||
		!ready(operation.paneId)
	);
}

/**
 * Whether the pane this operation moved is showing something else now. False
 * for an operation that succeeded without moving anything, which is a user
 * opening the board their pane was already on.
 * @param operation The operation.
 * @param displayed What is on screen now.
 * @returns True when the pane moved.
 */
function operationMovedPane(operation: Operation, displayed: WorkspaceAddress): boolean {
	return (
		boardIn(displayed, operation.paneId) !== operation.from ||
		repositoryIn(displayed, operation.paneId) !== operation.fromRepository
	);
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
