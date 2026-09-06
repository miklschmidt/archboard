import type { AnyCommandContract } from "@/cli/command-contract/contract";
import { executeCommand } from "@/cli/command-contract/lib/execution";

export async function runCommand(
	contract: Readonly<AnyCommandContract>,
	argv: readonly string[],
	signal?: Readonly<AbortSignal>,
): Promise<void> {
	await executeCommand(contract, argv, signal);
}
