import type { Answer, AnyCommandContract } from "#cli/contract/protocol/contract.ts";
import { executeCommand } from "#cli/contract/operations/execution.ts";
import type { AnsweredVault } from "#cli/contract/protocol/schemas.ts";

/**
 * Runs one command contract. This is the module's public entrypoint; the
 * execution steps behind it are private.
 * @param contract - The command to run.
 * @param argv - The arguments after the command path.
 * @param signal - The abort signal the command runs under.
 * @param vault - The vault the command addressed, which its handler is told
 * and every JSON object answer names; null or absent when it found none.
 * @param checkout - The checkout without a vault that a command which runs
 * without one runs in; null or absent otherwise.
 * @param answer - Who reads the answer: JSON for an agent, or text for a person.
 */
export async function runCommand(
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
	vault: Readonly<AnsweredVault> | null = null,
	checkout: string | null = null,
	answer: Answer = "json",
): Promise<void> {
	await executeCommand(contract, argv, signal, vault, checkout, answer);
}
