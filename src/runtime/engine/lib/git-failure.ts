// How a Git command fails.
//
// Which stage it failed at is the useful fact, not the message: a caller that
// treats a non-zero exit as an answer (there is no remote, this is not a
// repository) has to be able to tell that from a command that could not start
// or had to be killed.

/** Which stage of running a Git command went wrong. */
type GitFailure = "aborted" | "cleanup" | "exit" | "output" | "signal" | "spawn" | "timeout";

/** A Git command that did not produce a usable result. */
class GitCommandError extends Error {
	/**
	 * Refuse a Git command, naming the stage it failed at.
	 * @param failure Which stage failed.
	 * @param message What to tell the caller.
	 * @param exitCode Git's exit status, when it got as far as exiting.
	 */
	constructor(
		readonly failure: GitFailure,
		message: string,
		readonly exitCode?: number,
	) {
		super(message);
		this.name = "GitCommandError";
	}
}

export { type GitFailure, GitCommandError };
