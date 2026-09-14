// Flask at exactly the pinned commits: one bare cache fetched from the
// pinned repository, and per-run checkouts cloned from it with the real
// origin recorded, so a binding's repository identity is github.com/pallets/flask
// on every run and the checkout is disposable.

import fs from "node:fs";
import path from "node:path";
import { SKILL_EVAL_GIT_TIMEOUT_MS } from "@/shared/timing/timing";
import { runProcess, sequentially } from "@/runtime/skill-evaluation/lib/process";

const GIT_ENV = { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" };

/**
 * Runs git and refuses a failure with its stderr.
 * @param args The arguments.
 * @param cwd Where.
 * @param signal Cancellation.
 * @returns Stdout, trimmed.
 */
async function git(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<string> {
	const result = await runProcess({
		argv: ["git", ...args],
		cwd,
		env: GIT_ENV,
		timeoutMs: SKILL_EVAL_GIT_TIMEOUT_MS,
		signal,
	});
	if (result.exitCode !== 0)
		throw new Error(
			`git ${args.join(" ")} failed (${result.exitCode ?? result.signalCode}): ${result.stderr.trim()}`,
		);
	return result.stdout.trim();
}

/**
 * Whether the cache holds a commit.
 * @param cache The bare cache.
 * @param commit The commit.
 * @returns True when it is there.
 */
async function holds(cache: string, commit: string): Promise<boolean> {
	const result = await runProcess({
		argv: ["git", "cat-file", "-e", `${commit}^{commit}`],
		cwd: cache,
		env: GIT_ENV,
		timeoutMs: SKILL_EVAL_GIT_TIMEOUT_MS,
	});
	return result.exitCode === 0;
}

/**
 * Fetches one pinned commit into the cache unless it is already there.
 * @param cache The bare cache.
 * @param repository The pinned repository URL.
 * @param commit The commit.
 * @param signal Cancellation.
 */
async function ensureCommit(
	cache: string,
	repository: string,
	commit: string,
	signal?: AbortSignal,
): Promise<void> {
	if (await holds(cache, commit)) return;
	await git(["fetch", "origin", commit], cache, signal);
	if (!(await holds(cache, commit)))
		throw new Error(`${repository} does not hold pinned commit ${commit}`);
}

/**
 * Makes sure the bare cache exists and holds every pinned commit, fetching
 * only when something is missing.
 * @param cache The bare cache directory.
 * @param repository The pinned repository URL.
 * @param commits The pinned commits.
 * @param signal Cancellation.
 */
async function ensureFlaskCache(
	cache: string,
	repository: string,
	commits: readonly string[],
	signal?: AbortSignal,
): Promise<void> {
	if (!fs.existsSync(path.join(cache, "HEAD"))) {
		fs.mkdirSync(path.dirname(cache), { recursive: true });
		await git(["clone", "--bare", repository, cache], path.dirname(cache), signal);
	}
	await sequentially(commits, (commit) => ensureCommit(cache, repository, commit, signal));
}

/**
 * A fresh checkout of one pinned commit for one run, sharing objects with the
 * cache and naming the real origin.
 * @param cache The bare cache.
 * @param repository The pinned repository URL.
 * @param commit The commit.
 * @param destination Where the checkout goes.
 * @param signal Cancellation.
 * @returns The commit the checkout is at, verified.
 */
async function checkoutFlask(
	cache: string,
	repository: string,
	commit: string,
	destination: string,
	signal?: AbortSignal,
): Promise<string> {
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	await git(
		["clone", "--shared", "--no-checkout", cache, destination],
		path.dirname(destination),
		signal,
	);
	await git(["remote", "set-url", "origin", repository], destination, signal);
	await git(["checkout", "--detach", commit], destination, signal);
	const head = await git(["rev-parse", "HEAD"], destination, signal);
	if (head !== commit) throw new Error(`${destination} is at ${head}, not the pinned ${commit}`);
	return head;
}

export { checkoutFlask, ensureFlaskCache };
