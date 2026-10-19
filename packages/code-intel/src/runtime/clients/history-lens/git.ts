// Running Git for the history lens.
//
// The engine's own `git` keeps at most 64 KB of output, which is right for a
// probe and far too little for a walk of a year of commits or a batch of board
// file versions. So the lens runs its commands here, with the whole output, a
// caller's signal: a request that hangs up,
// or a server that stops, ends the command. The lens runs only `git log`,
// `git rev-list`, `git rev-parse`, `git merge-base`, `git cat-file` and
// `git check-ignore`. None of them starts another program, so killing the one
// process ends the work.

/** How a caller cancels a command, and what it writes to the command's input. */
interface GitRunOptions {
	readonly signal?: AbortSignal | undefined;
	readonly input?: string;
}

/** What one command answered. */
interface GitRun {
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: string;
}

/**
 * Start one Git command.
 * @param root The checkout it runs in.
 * @param args Git's arguments.
 * @param options The caller's signal, and the input to write.
 * @returns The running command.
 */
function spawnGit(root: string, args: readonly string[], options: GitRunOptions) {
	// A person who sets `log.showSignature` makes every `git log` run GPG for
	// each commit and print its verdict among the records the lens reads.
	return Bun.spawn(["git", "-c", "log.showSignature=false", ...args], {
		cwd: root,
		stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
		stdout: "pipe",
		stderr: "pipe",
		// A reading must not take the index lock that `git status` refreshes,
		// or it would make somebody's commit in that checkout fail.
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

/**
 * Run one Git command to its end.
 * @param root The checkout it runs in.
 * @param args Git's arguments.
 * @param options The caller's signal, and the input to write.
 * @returns Its exit code and its whole output.
 * @throws {unknown} The signal's reason when the caller cancelled it, or an
 * error when Git could not start or ended on a signal.
 */
async function runGit(
	root: string,
	args: readonly string[],
	options: GitRunOptions,
): Promise<GitRun> {
	options.signal?.throwIfAborted();
	const child = spawnGit(root, args, options);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).bytes(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	options.signal?.throwIfAborted();
	if (child.signalCode !== null) {
		throw new Error(`git ${args.join(" ")} in ${root} ended by ${child.signalCode}.`);
	}
	return { exitCode, stdout, stderr };
}

/**
 * Run a command whose failure is a fault.
 * @param root The checkout it runs in.
 * @param args Git's arguments.
 * @param options The caller's signal, and the input to write.
 * @returns Its output.
 * @throws {Error} When Git exits with anything but 0.
 */
async function gitBytes(
	root: string,
	args: readonly string[],
	options: GitRunOptions,
): Promise<Uint8Array> {
	const run = await runGit(root, args, options);
	if (run.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} in ${root} failed: ${run.stderr.trim()}`);
	}
	return run.stdout;
}

/**
 * Run a command whose failure is a fault, as text.
 * @param root The checkout it runs in.
 * @param args Git's arguments.
 * @param options The caller's signal, and the input to write.
 * @returns Its output, decoded as UTF-8.
 */
async function gitText(
	root: string,
	args: readonly string[],
	options: GitRunOptions,
): Promise<string> {
	return new TextDecoder().decode(await gitBytes(root, args, options));
}

/**
 * Run a command whose exit code is the answer: 0 is yes, any other is no.
 * @param root The checkout it runs in.
 * @param args Git's arguments.
 * @param options The caller's signal.
 * @returns Whether it exited 0.
 */
async function gitSays(
	root: string,
	args: readonly string[],
	options: GitRunOptions,
): Promise<boolean> {
	return (await runGit(root, args, options)).exitCode === 0;
}

/**
 * Run a command whose failure means there is no answer, such as a directory
 * that is in no repository or a ref that does not resolve.
 * @param root Where it runs.
 * @param args Git's arguments.
 * @param options The caller's signal.
 * @returns Its trimmed output, or undefined when it exited with anything but 0.
 */
async function gitAnswer(
	root: string,
	args: readonly string[],
	options: GitRunOptions,
): Promise<string | undefined> {
	const run = await runGit(root, args, options);
	return run.exitCode === 0 ? new TextDecoder().decode(run.stdout).trim() : undefined;
}

export { type GitRunOptions, gitAnswer, gitBytes, gitSays, gitText };
