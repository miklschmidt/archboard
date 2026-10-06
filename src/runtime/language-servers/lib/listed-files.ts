// The files of a checkout that Git lists under some pathspecs, for a row that
// finds what its server needs in a checkout: the solution of a .NET checkout,
// or whether Git tracks a virtual environment, which would make its
// interpreter a file the checkout ships.
//
// Git reads the index and the working tree and starts no other program. It
// takes no index lock, so it never makes a commit in the checkout fail, and a
// timeout from `timing.ts` ends a Git that hangs. A checkout Git cannot list
// lists nothing.

import { CODE_CHECK_GIT_TIMEOUT_MS } from "@/shared/timing/timing";

/**
 * The files Git lists in a checkout under pathspecs.
 * @param root The checkout.
 * @param pathspecs What to list, as Git's pathspecs.
 * @param untracked Also list the new files Git does not ignore, not only the tracked ones.
 * @returns Each path relative to the checkout, with `/` between names.
 */
async function listedFiles(
	root: string,
	pathspecs: readonly string[],
	untracked: boolean,
): Promise<string[]> {
	const which = untracked ? ["--cached", "--others", "--exclude-standard"] : ["--cached"];
	const child = Bun.spawn(["git", "ls-files", "-z", ...which, "--", ...pathspecs], {
		cwd: root,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
		timeout: CODE_CHECK_GIT_TIMEOUT_MS,
	});
	const [listed, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	if (exitCode !== 0) return [];
	return listed.split("\0").filter((file) => file !== "");
}

export { listedFiles };
