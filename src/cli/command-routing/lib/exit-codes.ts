// Turns a command failure into the process exit code and the stderr explanation the CLI
// contract promises, without trusting the thrown value's shape.
import { CliUsageError } from "@/cli/command-contract/contract";
import {
	BOARD_REFUSAL_CODES,
	boardHoldSeen,
	formatBoardRefusal,
} from "@/runtime/engine/canvas-client";
import { type RouteOwner } from "@/cli/command-routing/lib/route";

/**
 * Reads the machine-readable code a canvas refusal or transport failure carries.
 * @param error - The thrown value.
 * @returns The string code, or undefined when the value carries none.
 */
function errorCodeOf(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return undefined;
	}
	return typeof error.code === "string" ? error.code : undefined;
}

/**
 * Whether the failure asked not to be printed, because it already said its piece.
 * @param error - The thrown value.
 * @returns True when the value carries a truthy `quiet` mark.
 */
function isQuietError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "quiet" in error && Boolean(error.quiet);
}

/**
 * The human-readable message of a thrown value.
 * @param error - The thrown value.
 * @returns The Error message, or the value rendered as text when it is not an Error.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the code names a refused board write: the note stays unwritten, whether another
 * holder, a revoked claim, a moved version or a changed note stopped it.
 * @param code - The error code, if any.
 * @returns True for a board-write refusal.
 */
function isBoardRefusalCode(code: string | undefined): boolean {
	return code === "BOARD_CONFLICT" || (code !== undefined && BOARD_REFUSAL_CODES.has(code));
}

const WELL_KNOWN_EXIT_CODES: Readonly<Record<string, number>> = {
	CANVAS_UNREACHABLE: 3,
	BROWSER_REQUIRED: 4,
	// A missing board is a mistake at the keyboard, like any other usage error.
	BOARD_REQUIRED: 2,
};

/**
 * The exit code a command's contract declares for a refusal code.
 * @param command - The command that ran, when one was selected.
 * @param code - The error code, if any.
 * @returns The declared exit, or undefined when the contract does not list the code.
 */
function declaredExit(
	command: RouteOwner | undefined,
	code: string | undefined,
): number | undefined {
	if (command === undefined || code === undefined) {
		return undefined;
	}
	return command.contract.refusals.find((refusal) => refusal.code === code)?.exit;
}

/**
 * Maps a failure to the process exit code: 2 for usage, the contract's declared exit for a
 * refusal it lists, then the fixed codes for an unreachable canvas, a missing browser tab, a
 * refused board write and a missing board, and 1 for everything else.
 * @param error - The thrown value.
 * @param command - The command that ran, when one was selected.
 * @returns The exit code.
 */
function exitCodeFor(error: unknown, command?: RouteOwner): number {
	if (error instanceof CliUsageError) {
		return 2;
	}
	const code = errorCodeOf(error);
	const declared = declaredExit(command, code);
	if (declared !== undefined) {
		return declared;
	}
	// Every refusal leaves the board unwritten, so they share the exit status a
	// script already watches for. The attached body says whether another holder,
	// a revoked claim, a moved version or a changed note stopped it.
	if (isBoardRefusalCode(code)) {
		return 5;
	}
	return code === undefined ? 1 : (WELL_KNOWN_EXIT_CODES[code] ?? 1);
}

/**
 * Writes the failure to stderr: the message (or the formatted board refusal), then, when a
 * refused write left work held on the canvas, what happens to everything drawn from here on.
 * @param error - The thrown value.
 * @param usage - The usage line to print after a usage error.
 */
function reportFailure(error: unknown, usage: string): void {
	if (!isQuietError(error)) {
		process.stderr.write(`Error: ${formatBoardRefusal(error) ?? errorMessage(error)}\n`);
	}
	// A refused write does not stop the board being drawn on, it stops the
	// board being saved (ADR 0006, TASK-079). The refusal above has already
	// listed the three outcomes, so this says only the part it does not: what
	// happens to everything drawn between now and the choice.
	const held = boardHoldSeen();
	if (held && isBoardRefusalCode(errorCodeOf(error))) {
		process.stderr.write(
			`"${held.board}" has stopped saving. Changes from here are held on the canvas ` +
				"and reach no note until one of those three is run.\n",
		);
	}
	if (error instanceof CliUsageError) {
		process.stderr.write(`Usage: archboard ${usage}\n`);
	}
}

export { exitCodeFor, reportFailure };
