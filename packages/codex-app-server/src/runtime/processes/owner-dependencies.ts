import { spawn as nodeSpawn } from "node:child_process";

import { verifyCodexExecutable } from "#runtime/services/executable.ts";
import type { CodexProcessTestOptions } from "#runtime/processes/process-contract.ts";
import { createCodexProcessGroupOperations } from "@archboard/process/codex-group";
import { prepareCodexStorage } from "#runtime/store/storage.ts";
import type { SpawnChild } from "#runtime/processes/process-contract.ts";

/** The resolved dependency seams, defaults applied. */
interface OwnerDependencies {
	readonly spawnChild: SpawnChild;
	readonly verifyExecutable: (executablePath: string) => ReturnType<typeof verifyCodexExecutable>;
	readonly prepareStorage: typeof prepareCodexStorage;
	readonly fileSystem: NonNullable<CodexProcessTestOptions["dependencies"]>["fileSystem"];
	readonly processGroup: ReturnType<typeof createCodexProcessGroupOperations>;
}

/**
 * Apply the production defaults to the injectable seams.
 * @param options - The process options.
 * @returns The resolved dependencies.
 */
function resolveDependencies(options: CodexProcessTestOptions): OwnerDependencies {
	const dependencies = options.dependencies ?? {};
	return {
		spawnChild: dependencies.spawn ?? nodeSpawn,
		verifyExecutable: dependencies.verifyExecutable ?? verifyCodexExecutable,
		prepareStorage: dependencies.prepareStorage ?? prepareCodexStorage,
		fileSystem: dependencies.fileSystem,
		processGroup: dependencies.processGroup ?? createCodexProcessGroupOperations(),
	};
}

export { resolveDependencies };
export type { OwnerDependencies };
