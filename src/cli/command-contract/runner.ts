import type { AnyCommandContract } from "./contract.js";
import { executeCommand } from "./lib/execution.js";

export async function runCommand(
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- The heterogeneous contract carries mutable Zod internals required by the executor.
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
): Promise<void> {
	await executeCommand(contract, argv, signal);
}
