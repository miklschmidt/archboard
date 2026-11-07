// Turns a command failure into the process exit code and the stderr explanation the CLI
// contract promises, without trusting the thrown value's shape.
import { CliUsageError } from "#cli/contract/protocol/contract.ts";
import { type RouteOwner } from "#cli/routing/protocol/route.ts";

/**
 * Reads the machine-readable code a server refusal or transport failure carries.
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

const WELL_KNOWN_EXIT_CODES: Readonly<Record<string, number>> = {
	SERVER_UNREACHABLE: 3,
	BROWSER_REQUIRED: 4,
	CLAIM_REVOKED: 5,
	// The same for a vault: finding and naming one is the caller's to fix (ADR 0049).
	VAULT_NOT_FOUND: 2,
	VAULT_REQUIRED: 2,
	VAULT_UNREADABLE: 2,
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
 * refusal it lists, then the fixed codes for an unreachable server, a missing browser tab, a
 * refused model write and a missing model, and 1 for everything else.
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
	return code === undefined ? 1 : (WELL_KNOWN_EXIT_CODES[code] ?? 1);
}

/**
 * Writes the failure message to stderr, followed by usage for a usage error.
 * @param error - The thrown value.
 * @param usage - The usage line to print after a usage error.
 */
function reportFailure(error: unknown, usage: string): void {
	if (!isQuietError(error)) {
		process.stderr.write(`Error: ${errorMessage(error)}\n`);
	}
	if (error instanceof CliUsageError) {
		process.stderr.write(`Usage: ${usage}\n`);
	}
}

export { exitCodeFor, reportFailure };
