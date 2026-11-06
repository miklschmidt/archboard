// The files of a checkout that Git lists under some pathspecs, for a row that
// finds what its server needs in a checkout: the solution of a .NET checkout.
//
// Git reads the index and the working tree and starts no other program. It
// takes no index lock, so it never makes a commit in the checkout fail, and a
// caller's cancellation ends the command. A checkout Git cannot list
// gives no answer, which is not the same as no file.

/**
 * The files Git lists in a checkout under pathspecs: the tracked ones, and
 * the new ones that Git does not ignore.
 * @param root The checkout.
 * @param pathspecs What to list, as Git's pathspecs.
 * @param signal Cancels the listing.
 * @returns Each path relative to the checkout, with `/` between names, or
 * undefined when Git cannot list the checkout or the caller cancels it.
 */
async function listedFiles(
	root: string,
	pathspecs: readonly string[],
	signal: AbortSignal,
): Promise<string[] | undefined> {
	try {
		const child = Bun.spawn(
			["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...pathspecs],
			{
				cwd: root,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
				signal,
			},
		);
		const [listed, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
		if (exitCode !== 0 || child.signalCode !== null) return undefined;
		return listed.split("\0").filter((file) => file !== "");
	} catch {
		return undefined;
	}
}

export { listedFiles };
