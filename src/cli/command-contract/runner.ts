import type { AnyCommandContract } from "./contract.js";
import { CommanderArgvParser } from "./lib/commander-adapter.js";
import { executeCommand } from "./lib/execution.js";
import { processCommandHost } from "./lib/host.js";
import { productionPrerequisites } from "./lib/prerequisites.js";

const parser = new CommanderArgvParser();

export async function runCommand(
	contract: AnyCommandContract,
	argv: readonly string[],
): Promise<void> {
	await executeCommand(contract, argv, {
		parser,
		host: processCommandHost,
		prerequisites: productionPrerequisites,
	});
}
