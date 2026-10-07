import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { TEST_VAULT_CLI_TIMEOUT_MS } from "./timing.ts";

interface ServerCliInput {
	readonly repoRoot: string;
	readonly vault: string;
	readonly base: string;
	readonly args: readonly string[];
	readonly input: string | undefined;
	/**
	 * Anything else this one invocation's environment has to carry.
	 *
	 * Per invocation rather than per suite, because a command's environment is a
	 * fact about that command and two invocations in one test may need different
	 * ones.
	 */
	readonly env?: Readonly<Record<string, string>> | undefined;
}

interface ServerCliResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stdoutBytes: Buffer;
	readonly stderr: string;
}

export function runServerCli(options: ServerCliInput): ServerCliResult {
	const result = spawnSync(join(options.repoRoot, "bin/archboard"), options.args, {
		cwd: options.repoRoot,
		input: options.input,
		timeout: TEST_VAULT_CLI_TIMEOUT_MS,
		killSignal: "SIGKILL",
		env: {
			...process.env,
			ARCHBOARD_VAULT: options.vault,
			ARCHBOARD_URL: options.base,
			ARCHBOARD_NO_AUTOSTART: "1",
			...options.env,
		},
	});
	if (result.error) throw result.error;
	return {
		status: result.status,
		stdout: result.stdout?.toString("utf8") ?? "",
		stdoutBytes: result.stdout ?? Buffer.alloc(0),
		stderr: result.stderr?.toString("utf8") ?? "",
	};
}
