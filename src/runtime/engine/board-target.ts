// What happens to a caller that names no board.
//
// It is refused. There is no active board to fall back to, no last-opened
// pointer, no environment variable, and no "the pane you were looking at" —
// every one of those is the same mistake, which is a write resolving against
// ambient state that the caller cannot see and did not set. The board is part
// of what you are asking for, so you say it.
//
// This costs a flag on every call and buys the one property worth having: a
// write can never land on a board the caller did not name. A canvas with two
// panes on two boards has no answer to "the board", and inventing one that is
// right most of the time is the failure mode that takes longest to notice.
//
// The refusal has to be usable, not merely correct — a missing board is a
// mistake made at the keyboard, and the moment of the mistake is when the list
// of boards is worth printing. See ADR 0009.

class BoardRequiredError extends Error {
	readonly code = "BOARD_REQUIRED";
	readonly status = 400;
	/** Persisted board keys the caller can choose from. */
	readonly available: string[];

	/**
	 *
	 */
	constructor(available: string[], what?: string) {
		super(boardRequiredMessage(available, what));
		this.name = "BoardRequiredError";
		this.available = available;
	}
}

type BoardResolutionFailure = "missing" | "ambiguous" | "malformed" | "conflicting";

/** A named board address that cannot resolve to one valid note in the vault. */
class BoardResolutionError extends Error {
	readonly code = "BOARD_RESOLUTION_FAILED";
	readonly status: number;

	/**
	 *
	 */
	constructor(
		readonly board: string,
		readonly reason: BoardResolutionFailure,
		message: string,
		readonly files: readonly string[] = [],
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "BoardResolutionError";
		this.status = reason === "missing" ? 404 : reason === "malformed" ? 422 : 409;
	}
}

/**
 *
 */
function boardRequiredMessage(availableBoards: string[], what?: string): string {
	const subject = what ? `${what} needs a board` : "This needs a board";
	const available =
		availableBoards.length > 0
			? `The vault currently holds: ${availableBoards.join(", ")}.`
			: "The vault currently holds no named board.";
	return (
		`${subject}, and none was named. Nothing was done. ` +
		"Pass one — `--board <key>` on the command line or `?board=<key>` on the API. " +
		`${available} \`board list\` shows what the vault holds. ` +
		"There is no default board on purpose: a board is part of what you are asking for (ADR 0020)."
	);
}

/** Is this the refusal, rather than some other failure? */
function boardRequiredOf(error: unknown): BoardRequiredError | null {
	return error instanceof BoardRequiredError ? error : null;
}

export { BoardRequiredError, type BoardResolutionFailure, BoardResolutionError, boardRequiredOf };
