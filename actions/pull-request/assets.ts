// Commit the pictures of a pull request to an orphan branch, so a comment can embed them by
// address. Git does the work; the token goes in a header and never in an address or a log.

import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { run } from "../shared/process.ts";
import type { ProcessResult } from "../shared/process.ts";

/** Where to push, and what. */
interface AssetPush {
	/** GITHUB_SERVER_URL. */
	readonly server: string;
	/** `owner/name`. */
	readonly repository: string;
	readonly token: string;
	readonly branch: string;
	/** The folder on the branch, such as `pr-12/3f9a…`. */
	readonly folder: string;
	/** The pull request's folder: older heads below it are replaced. */
	readonly pullRequestFolder: string;
	/** Files to publish, by the name they get in the folder. */
	readonly files: Readonly<Record<string, string>>;
}

const ATTEMPTS = 3;

/**
 * Run git in the scratch clone, with the token in a header.
 * @param push What to push.
 * @param clone The clone's directory.
 * @param args The git arguments.
 * @returns The result.
 */
function git(push: AssetPush, clone: string, args: readonly string[]): ProcessResult {
	const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${push.token}`).toString("base64")}`;
	return run(
		"git",
		["-c", `http.${push.server}/.extraheader=${header}`, "-c", "core.hooksPath=/dev/null", ...args],
		{ cwd: clone, env: { GIT_TERMINAL_PROMPT: "0" } },
	);
}

/**
 * The first line of a failure, with the token removed.
 * @param push What was pushed.
 * @param result The failed result.
 * @returns A short reason.
 */
function reasonOf(push: AssetPush, result: ProcessResult): string {
	const line =
		result.stderr.split("\n").find((one) => one.trim() !== "") ?? `exit ${String(result.exitCode)}`;
	return line.replaceAll(push.token, "***").trim();
}

/**
 * Put the commit on top of the branch: fetch it when it exists, else start it with no parent.
 * @param push What to push.
 * @param clone The clone's directory.
 */
function checkoutBranch(push: AssetPush, clone: string): void {
	const fetched = git(push, clone, ["fetch", "--depth=1", "origin", push.branch]);
	if (fetched.exitCode === 0) git(push, clone, ["checkout", "-q", "-B", push.branch, "FETCH_HEAD"]);
}

/**
 * Write the files, commit them and push.
 * @param push What to push.
 * @param clone The clone's directory.
 * @returns The push's result.
 */
function commitAndPush(push: AssetPush, clone: string): ProcessResult {
	rmSync(join(clone, push.pullRequestFolder), { recursive: true, force: true });
	mkdirSync(join(clone, push.folder), { recursive: true });
	for (const [name, source] of Object.entries(push.files))
		cpSync(source, join(clone, push.folder, name));
	git(push, clone, ["add", "--all"]);
	const commit = git(push, clone, [
		"-c",
		"user.name=github-actions[bot]",
		"-c",
		"user.email=41898282+github-actions[bot]@users.noreply.github.com",
		"commit",
		"-q",
		"-m",
		`archboard: pictures for ${push.folder}`,
	]);
	if (commit.exitCode !== 0) return commit;
	return git(push, clone, ["push", "-q", "origin", `HEAD:refs/heads/${push.branch}`]);
}

/**
 * Publish the pictures. A branch moved by another run is fetched again, up to a few times.
 * @param push What to push.
 * @returns undefined when the pictures are on the branch, else why they are not.
 */
function pushAssets(push: AssetPush): string | undefined {
	const clone = mkdtempSync(join(tmpdir(), "archboard-assets-"));
	try {
		git(push, clone, ["init", "-q", "-b", push.branch]);
		git(push, clone, ["remote", "add", "origin", `${push.server}/${push.repository}.git`]);
		let last: ProcessResult = { exitCode: 1, stdout: "", stderr: "" };
		for (let attempt = 0; attempt < ATTEMPTS && last.exitCode !== 0; attempt += 1) {
			checkoutBranch(push, clone);
			last = commitAndPush(push, clone);
		}
		return last.exitCode === 0 ? undefined : reasonOf(push, last);
	} finally {
		rmSync(clone, { recursive: true, force: true });
	}
}

export { pushAssets, type AssetPush };
