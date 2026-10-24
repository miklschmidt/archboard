// One read-only Git command and its output, for a command that reads what a
// checkout tracks or what its history holds. Git reads the repository of the
// directory it runs in, never one that the environment names.

import { GIT_COMMAND_TIMEOUT_MS } from "@archboard/timing";
import { gitEnvironment } from "#cli/clients/git/git-environment.ts";

/**
 * Run one Git command that only reads, to its end.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param signal Cancels the command.
 * @returns What Git printed, or undefined when it exited non-zero: no repository, no such revision.
 * @throws {Error} When Git was cancelled or did not answer in time.
 */
async function gitOutput(
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
): Promise<Buffer | undefined> {
	const child = Bun.spawn(["git", ...args], {
		cwd,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "ignore",
		// A reading must not take the index lock that `git status` refreshes.
		env: gitEnvironment({ GIT_OPTIONAL_LOCKS: "0" }),
		signal: AbortSignal.any([signal, AbortSignal.timeout(GIT_COMMAND_TIMEOUT_MS)]),
	});
	const [stdout, exitCode] = await Promise.all([
		new Response(child.stdout).arrayBuffer(),
		child.exited,
	]);
	if (child.signalCode !== null) {
		throw new Error(
			`git ${args[0] ?? ""} in ${cwd} did not answer: it ended by ${child.signalCode}.`,
		);
	}
	return exitCode === 0 ? Buffer.from(stdout) : undefined;
}

export { gitOutput };
