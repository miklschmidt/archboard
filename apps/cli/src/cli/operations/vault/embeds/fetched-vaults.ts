// The vault of a repository that this machine has no checkout of (ADR 0057).
//
// The check fetches the whole `.archboard/vault` directory of the default
// branch, shallow and sparse, with the person's own Git: their credential
// helpers, and their `url.<base>.insteadOf` rules, which also turn the HTTPS
// address into SSH for a person who prefers it. Git never prompts, so a CI run
// that has no credentials fails the fetch instead of waiting: no terminal
// prompt, no Git Credential Manager dialog, and no askpass program, for Git or
// for SSH. A credential helper, such as gh or the system keychain, answers
// without asking, so it still gives the credentials. Git reads no repository
// that the environment names, such as the one of a hook that runs the check.
//
// The cache is in the state directory, one checkout per commit:
// `<state>/fetched-vaults/<identity>/<commit>/.archboard/vault`, the layout the
// server serves (`isVaultLayout`). A commit's directory appears and goes whole,
// by a rename, so a directory that is there is complete. A commit the default branch
// is still at is read again without a fetch. When the remote cannot be reached,
// the newest cached commit is read, and the caller says so.
//
// Nothing writes to a cached vault: the server only lists and draws its boards.
// The server keeps memory by vault, so each cached commit is another vault to
// it, and a fetch of a new commit removes the older ones of the identity.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CHECK_MS, GIT_MS } from "@archboard/timing";
import { stateDir } from "@archboard/workspace/state-dir";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import { gitEnvironment } from "#cli/clients/git/git-environment.ts";

/** Where the vault of a repository identity was found, or why it was not. */
type FetchedVault =
	| {
			readonly ok: true;
			/** The vault directory, or undefined when the commit holds none. */
			readonly vault: string | undefined;
			readonly commit: string;
			/** Why the fetch failed, when the newest cached commit was read instead. */
			readonly fetchFailed?: string;
	  }
	| {
			readonly ok: false;
			/** `unfetchable`: the identity names no remote; `failed`: the fetch failed and nothing is cached. */
			readonly failure: "unfetchable" | "failed";
			readonly reason: string;
	  };

/** One segment of an identity that can be a directory and a part of a URL. */
const IDENTITY_SEGMENT = /^[\w.-]+$/u;

/** The name a fetch's own directory has until it lands under its commit. */
const INCOMING_PREFIX = ".incoming-";

/** A commit's name, which is the name of its directory in the cache. */
const COMMIT_NAME = /^[\da-f]{40}(?:[\da-f]{24})?$/u;

/**
 * Where an identity that names a host and a path on it, such as
 * `github.com/owner/name`, is fetched from and cached.
 * @param identity The repository identity.
 * @returns The HTTPS address, which a person's `insteadOf` rules can turn into
 * any other form, and the cache directory, with one directory per commit below
 * it; or undefined for an identity that names no remote, such as that of a
 * repository without one, which only its directory name identifies.
 */
function remoteOf(identity: string): { url: string; cache: string } | undefined {
	const segments = identity.split("/");
	// A segment named like a commit would put the cache of one identity inside
	// the cached checkout of another, in any case on a filesystem that ignores it.
	const named = segments.every(
		(segment) =>
			IDENTITY_SEGMENT.test(segment) &&
			segment !== "." &&
			segment !== ".." &&
			!COMMIT_NAME.test(segment.toLowerCase()),
	);
	return named && segments.length >= 2
		? { url: `https://${identity}`, cache: path.join(stateDir(), "fetched-vaults", ...segments) }
		: undefined;
}

/** What one Git command did. */
interface GitRun {
	readonly ok: boolean;
	readonly stdout: string;
	/** Why it failed, in Git's words, when it did. */
	readonly failure: string;
}

/**
 * Run one Git command of the fetch: never prompting, never acting on a
 * repository the environment names, bounded and cancelled with the command.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param signal Cancels it.
 * @param timeoutMs How long it may take.
 * @returns What it did.
 * @throws {Error} When the command was cancelled.
 */
async function runGit(
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
	timeoutMs: number,
): Promise<GitRun> {
	const env = gitEnvironment({
		GIT_TERMINAL_PROMPT: "0",
		GCM_INTERACTIVE: "never",
		GIT_ASKPASS: "",
		SSH_ASKPASS: "",
		SSH_ASKPASS_REQUIRE: "never",
	});
	signal.throwIfAborted();
	// Git runs in a process group of its own, and the whole group is ended: a
	// helper such as git-remote-https outlives a signal to Git alone, and it
	// holds Git's output open on a connection that never answers.
	const child = Bun.spawn(["git", ...args], {
		cwd,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env,
		detached: true,
	});
	const ended = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
	/** End Git and every helper it started. */
	const end = (): void => {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			// The group has already ended.
		}
	};
	ended.addEventListener("abort", end, { once: true });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]).finally(() => ended.removeEventListener("abort", end));
	signal.throwIfAborted();
	if (ended.aborted) {
		return { ok: false, stdout, failure: `git ${args[0]} did not answer in ${timeoutMs} ms` };
	}
	// Git's first fatal line says what went wrong; the lines after it give advice.
	const lines = stderr.split("\n").map((line) => line.trim());
	const said = lines.find((line) => /^(?:fatal|error): /u.test(line)) ?? lines.find(Boolean);
	return { ok: exitCode === 0, stdout, failure: said ?? `git ${args[0]} exited ${exitCode}` };
}

/**
 * The commit the default branch of a remote is at.
 * @param cache Where Git runs.
 * @param url The remote.
 * @param signal Cancels it.
 * @returns The commit, or why the remote did not say.
 */
async function defaultBranchCommit(
	cache: string,
	url: string,
	signal: AbortSignal,
): Promise<{ commit: string } | { failure: string }> {
	const run = await runGit(cache, ["ls-remote", url, "HEAD"], signal, CHECK_MS.vaultFetch);
	if (!run.ok) return { failure: run.failure };
	const commit = run.stdout.split(/\s/u)[0] ?? "";
	return COMMIT_NAME.test(commit) ? { commit } : { failure: `${url} names no default branch` };
}

/**
 * The Git commands that fetch the vault of the default branch into a new
 * checkout, and say which commit it holds, in order.
 * @param cache The identity's cache directory.
 * @param incoming The new checkout.
 * @param url The remote.
 * @returns Where each runs, how long it may take, and its arguments.
 */
function fetchSteps(
	cache: string,
	incoming: string,
	url: string,
): { cwd: string; timeoutMs: number; args: string[] }[] {
	const network = CHECK_MS.vaultFetch;
	const local = GIT_MS.command;
	return [
		// A symbolic link that the remote commits is checked out as a file that
		// holds its target, so no file of the vault leads out of the cache.
		{
			cwd: cache,
			timeoutMs: network,
			args: [
				"clone",
				"--quiet",
				"--config=core.symlinks=false",
				"--depth=1",
				"--filter=blob:none",
				"--no-checkout",
				url,
				incoming,
			],
		},
		{
			cwd: incoming,
			timeoutMs: local,
			args: ["sparse-checkout", "set", "--no-cone", `/${VAULT_DIRECTORY}/`],
		},
		// The checkout fetches the blobs of the vault, and only those.
		{ cwd: incoming, timeoutMs: network, args: ["checkout", "--quiet"] },
		// `origin` names the identity whatever a person's `insteadOf` rules turn
		// its address into, so the server reads the vault as that identity's.
		{ cwd: incoming, timeoutMs: local, args: ["config", `url.${url}.insteadOf`, url] },
		{ cwd: incoming, timeoutMs: local, args: ["rev-parse", "HEAD"] },
	];
}

/**
 * Fetch the vault of the default branch into a new directory, then put it in
 * the cache under its commit, whole.
 * @param cache The identity's cache directory.
 * @param identity The repository identity.
 * @param url The remote.
 * @param signal Cancels it.
 * @returns The commit fetched, or why the fetch failed.
 */
async function fetchInto(
	cache: string,
	identity: string,
	url: string,
	signal: AbortSignal,
): Promise<{ commit: string } | { failure: string }> {
	const incoming = path.join(cache, `${INCOMING_PREFIX}${randomUUID()}`);
	try {
		let last: GitRun | undefined;
		for (const step of fetchSteps(cache, incoming, url)) {
			// oxlint-disable-next-line no-await-in-loop -- each step needs the one before it
			last = await runGit(step.cwd, step.args, signal, step.timeoutMs);
			if (!last.ok) return { failure: last.failure };
		}
		const commit = last?.stdout.trim() ?? "";
		if (!COMMIT_NAME.test(commit)) return { failure: `${identity} checked out no commit` };
		land(incoming, path.join(cache, commit));
		return { commit };
	} finally {
		fs.rmSync(incoming, { recursive: true, force: true });
	}
}

/**
 * Put a fetched checkout in the cache under its commit, and remove the older
 * commits of the identity and what a killed fetch left. A commit another run
 * put there first stays.
 * @param incoming The fetched checkout.
 * @param target The commit's directory.
 */
function land(incoming: string, target: string): void {
	try {
		fs.renameSync(incoming, target);
	} catch (error) {
		if (!fs.existsSync(target)) throw error;
	}
	const now = new Date();
	fs.utimesSync(target, now, now);
	const cache = path.dirname(target);
	for (const commit of cachedCommits(cache)) {
		if (commit.directory !== target) removeCommit(cache, commit.directory);
	}
	removeKilledFetches(cache, now.getTime());
}

/**
 * Remove a cached commit. It leaves the commits' names by a rename first, so a
 * removal that is killed leaves no part of a commit under a commit's name.
 * @param cache The identity's cache directory.
 * @param directory The commit's directory.
 */
function removeCommit(cache: string, directory: string): void {
	const removing = path.join(cache, `${INCOMING_PREFIX}${randomUUID()}`);
	try {
		fs.renameSync(directory, removing);
	} catch (error) {
		// Another check removed it first.
		if (fs.existsSync(directory)) throw error;
		return;
	}
	fs.rmSync(removing, { recursive: true, force: true });
}

/**
 * Remove the directories of fetches that a killed check left, and none that a
 * running fetch still writes.
 * @param cache The identity's cache directory.
 * @param now The time in milliseconds.
 */
function removeKilledFetches(cache: string, now: number): void {
	for (const name of fs.readdirSync(cache).filter((one) => one.startsWith(INCOMING_PREFIX))) {
		const left = path.join(cache, name);
		const changed = fs.statSync(left, { throwIfNoEntry: false })?.mtimeMs ?? now;
		if (now - changed > CHECK_MS.fetchIncomingStale) fs.rmSync(left, { recursive: true, force: true });
	}
}

/**
 * The commits the cache holds for an identity, newest first.
 * @param cache The identity's cache directory.
 * @returns Each commit with its directory.
 */
function cachedCommits(cache: string): { commit: string; directory: string }[] {
	const names = fs.existsSync(cache) ? fs.readdirSync(cache) : [];
	return names
		.filter((name) => COMMIT_NAME.test(name))
		.flatMap((commit) => {
			const directory = path.join(cache, commit);
			// Another check can remove an older commit while this one lists them.
			const at = fs.statSync(directory, { throwIfNoEntry: false })?.mtimeMs;
			return at === undefined ? [] : [{ commit, directory, at }];
		})
		.toSorted((a, b) => b.at - a.at)
		.map(({ commit, directory }) => ({ commit, directory }));
}

/**
 * A cached commit, as the vault it holds.
 * @param cache The identity's cache directory.
 * @param commit The commit.
 * @param fetchFailed Why the fetch failed, when the commit stands in for the default branch.
 * @returns The vault.
 */
function cachedVault(cache: string, commit: string, fetchFailed?: string): FetchedVault {
	const vault = path.join(cache, commit, VAULT_DIRECTORY);
	return {
		ok: true,
		vault: fs.existsSync(vault) ? vault : undefined,
		commit,
		...(fetchFailed === undefined ? {} : { fetchFailed }),
	};
}

/**
 * The vault of the default branch of a repository identity: the cached commit
 * when the branch is still at it, else fetched, else the newest cached commit
 * when the remote cannot be reached.
 * @param identity The repository identity.
 * @param signal Cancels it.
 * @returns The vault and its commit, or why there is none.
 * @throws {Error} When the command was cancelled.
 */
async function fetchedVault(identity: string, signal: AbortSignal): Promise<FetchedVault> {
	const remote = remoteOf(identity);
	if (remote === undefined) {
		return {
			ok: false,
			failure: "unfetchable",
			reason: `${identity} names no remote to fetch its vault from`,
		};
	}
	const { url, cache } = remote;
	fs.mkdirSync(cache, { recursive: true });
	const fetched = await defaultBranchInCache(cache, identity, url, signal);
	if ("commit" in fetched) return cachedVault(cache, fetched.commit);
	const newest = cachedCommits(cache)[0];
	return newest === undefined
		? { ok: false, failure: "failed", reason: fetched.failure }
		: cachedVault(cache, newest.commit, fetched.failure);
}

/**
 * Put the commit the default branch is at in the cache, unless it is there.
 * @param cache The identity's cache directory.
 * @param identity The repository identity.
 * @param url The remote.
 * @param signal Cancels it.
 * @returns The commit, now in the cache, or why the remote did not give it.
 */
async function defaultBranchInCache(
	cache: string,
	identity: string,
	url: string,
	signal: AbortSignal,
): Promise<{ commit: string } | { failure: string }> {
	const tip = await defaultBranchCommit(cache, url, signal);
	if ("failure" in tip || fs.existsSync(path.join(cache, tip.commit))) return tip;
	return fetchInto(cache, identity, url, signal);
}

export { fetchedVault, remoteOf, type FetchedVault };
