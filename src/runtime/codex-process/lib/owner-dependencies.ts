import { spawn as nodeSpawn } from "node:child_process";

import { verifyCodexExecutable } from "@/runtime/codex-process/lib/executable";
import type { CodexProcessTestOptions } from "@/runtime/codex-process/lib/process-contract";
import { createCodexProcessGroupOperations } from "@/runtime/codex-process/lib/process-group";
import { prepareCodexStorage } from "@/runtime/codex-process/lib/storage";
import type { SpawnChild, Timer } from "@/runtime/codex-process/lib/process-contract";

/** The resolved dependency seams, defaults applied. */
interface OwnerDependencies {
	readonly spawnChild: SpawnChild;
	readonly verifyExecutable: (executablePath: string) => ReturnType<typeof verifyCodexExecutable>;
	readonly prepareStorage: typeof prepareCodexStorage;
	readonly fileSystem: NonNullable<CodexProcessTestOptions["dependencies"]>["fileSystem"];
	readonly processGroup: ReturnType<typeof createCodexProcessGroupOperations>;
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => Timer;
	readonly cancel: (timer: Timer) => void;
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
		...resolveClock(dependencies),
	};
}

/**
 * Apply the production defaults to the clock seams the restart policy runs on.
 * @param dependencies - The injected seams, which may name none of them.
 * @returns The resolved clock and timer seams.
 */
function resolveClock(
	dependencies: NonNullable<CodexProcessTestOptions["dependencies"]>,
): Pick<OwnerDependencies, "now" | "schedule" | "cancel"> {
	return {
		now: dependencies.now ?? Date.now,
		schedule: dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs)),
		cancel: dependencies.cancel ?? ((timer) => clearTimeout(timer)),
	};
}

export { resolveDependencies };
export type { OwnerDependencies };
