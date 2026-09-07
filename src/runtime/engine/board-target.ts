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
	 * The refusal a caller that named no board gets, with the boards it could
	 * have named.
	 * @param available The persisted board keys.
	 * @param what What needed a board, when the caller can be told.
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
	 * A named board that cannot resolve to one valid note.
	 * @param board The board key that was named.
	 * @param reason Why it did not resolve.
	 * @param message What to tell the caller.
	 * @param files The notes that were found, where any were.
	 * @param options The error this one is raised from, where there is one.
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
 * The refusal a caller that named no board reads: what it was for, what the
 * vault holds, and how to name one.
 * @param availableBoards The persisted board keys.
 * @param what What needed a board, when the caller can be told.
 * @returns The message.
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

/**
 * Whether this is the no-board-named refusal rather than some other failure.
 * @param error The thrown value.
 * @returns The refusal, or null.
 */
function boardRequiredOf(error: unknown): BoardRequiredError | null {
	return error instanceof BoardRequiredError ? error : null;
}

export { BoardRequiredError, type BoardResolutionFailure, BoardResolutionError, boardRequiredOf };
