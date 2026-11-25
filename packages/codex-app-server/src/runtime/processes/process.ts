import type { CodexProcess, CodexProcessOptions } from "#runtime/processes/process-contract.ts";
import { createProcessOwner } from "#runtime/processes/process-owner.ts";

/**
 * Production lifecycle entrypoint: one owner of the Codex app-server child, without test seams.
 * @param options - The executable, working directory and storage to own.
 * @returns The process owner.
 */
function createCodexProcess(options: CodexProcessOptions): CodexProcess {
	return createProcessOwner(options);
}

export { createCodexProcess };
