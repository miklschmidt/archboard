import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { OwnedServer } from "./owned-server.ts";
import { callerVaultCleared, holderOf } from "./test-vault.ts";
import { TEST_VAULT_CLI_TIMEOUT_MS } from "./timing.ts";

interface ServerCliInput {
	readonly repoRoot: string;
	/** The server the command talks to. The command uses its registry. */
	readonly server: Pick<OwnedServer, "base" | "vault" | "registry">;
	/**
	 * The vault the command finds, because it runs in the directory that holds
	 * it. The server's own vault, unless a test addresses another one.
	 */
	readonly vault?: string | undefined;
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
		cwd: holderOf(options.vault ?? options.server.vault),
		input: options.input,
		timeout: TEST_VAULT_CLI_TIMEOUT_MS,
		killSignal: "SIGKILL",
		env: {
			...process.env,
			...callerVaultCleared,
			ARCHBOARD_REPOS: options.server.registry,
			ARCHBOARD_URL: options.server.base,
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
