import type { AnyCommandContract } from "@/cli/command-contract/contract";
import { executeCommand } from "@/cli/command-contract/lib/execution";

/**
 * Runs one command contract. This is the module's public entrypoint; the
 * execution steps behind it are private.
 * @param contract - The command to run.
 * @param argv - The arguments after the command path.
 * @param signal - The abort signal the command runs under.
 */
export async function runCommand(
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
): Promise<void> {
	await executeCommand(contract, argv, signal);
}
