import type { AnyCommandContract } from "./contract.js";
import { executeCommand } from "./lib/execution.js";

export async function runCommand(
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
): Promise<void> {
	await executeCommand(contract, argv, signal);
}
