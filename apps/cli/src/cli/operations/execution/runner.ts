import type { AnyCommandContract } from "#cli/protocol/contract/contract.ts";
import { executeCommand } from "#cli/operations/execution/execution.ts";
import type { AnsweredVault } from "#cli/protocol/contract/schemas.ts";

/**
 * Runs one command contract. This is the module's public entrypoint; the
 * execution steps behind it are private.
 * @param contract - The command to run.
 * @param argv - The arguments after the command path.
 * @param signal - The abort signal the command runs under.
 * @param vault - The vault the command addressed, which its handler is told
 * and every JSON object answer names; null or absent when it found none.
 */
export async function runCommand(
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
	vault: Readonly<AnsweredVault> | null = null,
): Promise<void> {
	await executeCommand(contract, argv, signal, vault);
}
