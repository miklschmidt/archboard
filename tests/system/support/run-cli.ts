import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { TEST_VAULT_CLI_TIMEOUT_MS } from "./timing.ts";

interface CanvasCliInput {
	readonly repoRoot: string;
	readonly vault: string;
	readonly base: string;
	readonly args: readonly string[];
	readonly input: string | undefined;
	/**
	 * Anything else this one invocation's environment has to carry.
	 *
	 * Per invocation rather than per suite, because what a command is attributed
	 * to is a fact about that command: `ARCHBOARD_PANE` says which pane an agent
	 * is acting for, and two invocations in one test may be acting for different
	 * ones.
	 */
	readonly env?: Readonly<Record<string, string>> | undefined;
}

interface CanvasCliResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export function runCanvasCli(options: CanvasCliInput): CanvasCliResult {
	const result = spawnSync(join(options.repoRoot, "bin/canvas"), options.args, {
		cwd: options.repoRoot,
		encoding: "utf8",
		input: options.input,
		timeout: TEST_VAULT_CLI_TIMEOUT_MS,
		killSignal: "SIGKILL",
		env: {
			...process.env,
			ARCHBOARD_VAULT: options.vault,
			EXPRESS_SERVER_URL: options.base,
			EXCALIDRAW_NO_AUTOSTART: "1",
			...options.env,
		},
	});
	if (result.error) throw result.error;
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}
