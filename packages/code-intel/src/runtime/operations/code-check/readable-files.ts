// The files of a checkout that the code check may read (ADR 0046).
//
// It reads only what Git does not ignore: the tracked files, and the new files
// that Git does not ignore. So a binding to a directory never reads
// `node_modules`, build output or an ignored `.env` file. One `git ls-files`
// per checkout lists them, with uncommitted edits, because the check reads the
// files on disk. Code facts never read Terraform state, its backups, variable
// files or the `.terraform` directory, even where Git tracks them
// (`neverRead`): they can hold secrets in plain text, and the Archboard server
// answers any request from this machine.
//
// The command reads the index and the working tree and starts no other
// program. The caller's signal ends it when a request hangs up or a server stops.

/**
 * The files of one checkout that Git does not ignore, relative to its root.
 * @param root The checkout's root.
 * @param signal Cancels the listing.
 * @returns Each path, with `/` between names.
 * @throws {Error} When Git cannot list the checkout or ends on a signal.
 */
async function listReadableFiles(root: string, signal: AbortSignal): Promise<Set<string>> {
	signal.throwIfAborted();
	const child = Bun.spawn(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
		cwd: root,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		// A reading must not take the index lock that a refresh takes, or it
		// would make somebody's commit in that checkout fail.
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
		signal,
	});
	const [listed, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	signal.throwIfAborted();
	if (child.signalCode !== null) {
		throw new Error(`git ls-files in ${root} ended by ${child.signalCode}.`);
	}
	if (exitCode !== 0) throw new Error(`git ls-files in ${root} failed: ${stderr.trim()}`);
	return new Set(listed.split("\0").filter((path) => path !== ""));
}

export { listReadableFiles };
