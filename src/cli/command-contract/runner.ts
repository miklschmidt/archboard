import type { AnyCommandContract } from "./contract.js";
import { executeCommand } from "./lib/execution.js";

export async function runCommand(
	contract: AnyCommandContract,
	argv: readonly string[],
	signal: AbortSignal | undefined = undefined,
): Promise<void> {
	await executeCommand(contract, argv, signal);
}
