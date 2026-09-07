// The checkout registry: which repositories exist on this machine, and where.
//
// A binding is a logical address, a repository identity plus a path inside it
// (CONTEXT.md), because the vault spans repositories and is not co-located
// with any of them (ADR 0004). That leaves one thing unanswered on every
// machine that opens a board: where `github.com/acme/payments` actually is
// here. ADR 0004 promised a machine-local registry for it and never built one;
// this is it, and ADR 0011 says why it is the thing that replaces resolving
// against a working directory.
//
// It holds one entry per repository identity, and it is deliberately small:
//
//   declared   somebody ran `repo add <dir>` and said "this is that repo"
//   observed   archboard resolved a binding through this checkout and kept it
//
// Nothing is discovered by scanning the filesystem. A registry that guesses is
// the ambient working directory again with extra steps: the whole point is that
// every entry traces back to something a person named or something archboard
// actually saw.

import fs from "fs";
import path from "path";
import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import { inspectCheckout } from "@/runtime/engine/git";
import { stateDir } from "@/runtime/engine/state-dir";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";

type RepoSource = "declared" | "observed";

interface RegisteredRepo {
	/** Repository identity: host/owner/name, or a directory name for a remoteless repo. */
	repo: string;
	/** Absolute path to the checkout on this machine. */
	root: string;
	source: RepoSource;
	addedAt: string;
}

interface RegisteredRepoStatus extends RegisteredRepo {
	/** Whether the checkout is still there. A stale entry is reported, never silently dropped. */
	exists: boolean;
}

const FILE_NAME = "repos.json";

/**
 * Where the registry is kept. `ARCHBOARD_REPOS` overrides it, which is how the
 * tests avoid writing into the machine's real registry and how a second
 * archboard on one machine keeps its own.
 *
 * Read at call time rather than at import, so setting the variable in a spawned
 * process, or in a test, actually takes effect.
 * @returns The path to the registry file.
 */
function registryPath(): string {
	return process.env["ARCHBOARD_REPOS"] || path.join(stateDir(), FILE_NAME);
}

/**
 * One stored entry, when it names both a repository and a checkout.
 *
 * An entry without both says nothing, so it is dropped rather than repaired:
 * the registry is rebuilt by ordinary work.
 * @param entry The stored entry.
 * @returns The entry, or null when it is not one.
 */
function normalize(entry: unknown): RegisteredRepo | null {
	if (!isRecord(entry)) {
		return null;
	}
	const repo = stringAt(entry, "repo");
	const root = stringAt(entry, "root");
	if (!repo || !root) {
		return null;
	}
	return {
		repo,
		root: path.resolve(root),
		source: entry["source"] === "declared" ? "declared" : "observed",
		addedAt: stringAt(entry, "addedAt") ?? new Date().toISOString(),
	};
}

/**
 * Order the registry by repository identity, so the file reads the same way
 * every time it is written.
 * @param a One entry.
 * @param b The other.
 * @returns Their order.
 */
const byRepo = (a: RegisteredRepo, b: RegisteredRepo): number =>
	a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0;

/**
 * The entry list a parsed registry holds, in either shape it has been written
 * in: a bare array, or an object with a `repos` key.
 * @param parsed The parsed file.
 * @returns The entries, or none.
 */
function registryEntries(parsed: unknown): unknown[] {
	if (Array.isArray(parsed)) {
		return parsed;
	}
	const repos = isRecord(parsed) ? parsed["repos"] : undefined;
	return Array.isArray(repos) ? repos : [];
}

/**
 * The stored entries, one per repository identity and in a stable order.
 * @param list The stored entries.
 * @returns The usable ones, last write per identity winning.
 */
function uniqueByRepo(list: readonly unknown[]): RegisteredRepo[] {
	const seen = new Map<string, RegisteredRepo>();
	for (const item of list) {
		const entry = normalize(item);
		if (entry) {
			seen.set(entry.repo, entry);
		}
	}
	return [...seen.values()].toSorted(byRepo);
}

/**
 * Every entry, whether or not its checkout is still on disk. Never throws.
 *
 * A corrupt registry is a cache miss, not a crash: bindings still resolve from
 * absolute paths, and the next write rewrites the file.
 * @returns The entries.
 */
function readRegistry(): RegisteredRepo[] {
	let raw: string;
	try {
		raw = fs.readFileSync(registryPath(), "utf-8");
	} catch {
		return [];
	}
	try {
		return uniqueByRepo(registryEntries(JSON.parse(raw)));
	} catch {
		return [];
	}
}

/**
 * Whether a checkout is still on this machine.
 * @param root The recorded path.
 * @returns True when a directory is there.
 */
function isCheckout(root: string): boolean {
	try {
		return fs.statSync(root).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Every entry plus whether its checkout is still there.
 * @returns The entries, each with its existence.
 */
function listRepos(): RegisteredRepoStatus[] {
	return readRegistry().map((entry) =>
		Object.assign({}, entry, { exists: isCheckout(entry.root) }),
	);
}

// Atomic, so a reader never sees half a file, and quiet, so a registry on a
// read-only filesystem degrades to "archboard learns nothing" rather than
// failing a promotion that was otherwise fine.
//
// The temp-file-and-rename used to be written out here. It is `writeFileAtomic`
// now, shared with the board note and the library, because a repository with
// two atomic-write idioms has one of them going stale (TASK-061).
/**
 * Replace the registry file with these entries.
 * @param entries What the registry should now hold.
 * @returns True when it was written, false when the filesystem refused.
 */
function write(entries: RegisteredRepo[]): boolean {
	const file = registryPath();
	const body = JSON.stringify(entries, null, 2) + "\n";
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomic(file, body);
		return true;
	} catch {
		return false;
	}
}

/**
 * Record one entry, replacing whatever the registry held for that identity.
 * @param entry The entry to record.
 */
function upsert(entry: RegisteredRepo): void {
	const entries = readRegistry().filter((existing) => existing.repo !== entry.repo);
	entries.push(entry);
	entries.toSorted(byRepo);
	write(entries);
}

/**
 * The checkout for a repository identity, but only while it is still there.
 * @param repo The repository identity.
 * @returns Its root on this machine, or undefined.
 */
function checkoutFor(repo: string): string | undefined {
	const entry = readRegistry().find((candidate) => candidate.repo === repo);
	if (!entry) {
		return undefined;
	}
	return isCheckout(entry.root) ? entry.root : undefined;
}

/** A refusal a caller can put in front of a person as it stands. */
class RepoRegistryError extends Error {}

/** How a caller cancels the git call a declaration has to make. */
interface DeclareOptions {
	signal?: AbortSignal;
}

/**
 * "This directory is that repository." The deliberate half of the registry.
 *
 * The identity comes from git rather than from the caller: two people naming
 * the same clone differently is the one thing that would make the address
 * space useless, and git already has an answer that is the same everywhere.
 * @param dir The checkout to register.
 * @param options How to cancel the git call.
 * @returns The entry that was recorded.
 * @throws {RepoRegistryError} When the directory is missing, or is not inside
 * a git repository and so has no identity to register under.
 */
async function declareRepo(dir: string, options: DeclareOptions = {}): Promise<RegisteredRepo> {
	const target = path.resolve(dir);
	if (!isCheckout(target)) {
		throw new RepoRegistryError(`${target} is not a directory on this machine.`);
	}
	const checkout = await inspectCheckout(target, options);
	if (!checkout) {
		throw new RepoRegistryError(
			`${target} is not inside a git repository, so there is no repository identity to register it under. ` +
				"A binding names a repo plus a path inside it; a bare directory cannot be either.",
		);
	}
	const entry: RegisteredRepo = {
		repo: checkout.identity,
		root: checkout.root,
		source: "declared",
		addedAt: new Date().toISOString(),
	};
	upsert(entry);
	return entry;
}

/**
 * What archboard learned by resolving a real path: this identity lives here.
 *
 * The registry fills itself from ordinary work, so the second promotion into a
 * repo can name it instead of pointing at it. A declared entry is never
 * overwritten, because a person's answer outranks an observation, and neither
 * is an observed entry whose checkout is still on disk, because two clones of
 * one repo should not have the registry flapping between them.
 * @param repo The repository identity.
 * @param root Where it was found on this machine.
 */
function rememberRepo(repo: string, root: string): void {
	const resolved = path.resolve(root);
	const existing = readRegistry().find((entry) => entry.repo === repo);
	if (existing && (existing.source === "declared" || isCheckout(existing.root))) {
		return;
	}
	upsert({ repo, root: resolved, source: "observed", addedAt: new Date().toISOString() });
}

/**
 * Drop an entry.
 * @param repo The repository identity to forget.
 * @returns False when there was nothing to drop, or the write failed.
 */
function forgetRepo(repo: string): boolean {
	const entries = readRegistry();
	const kept = entries.filter((entry) => entry.repo !== repo);
	if (kept.length === entries.length) {
		return false;
	}
	return write(kept);
}

/**
 * The identities the caller can name right now, for a message that has to list
 * them.
 * @returns The identities whose checkouts are still on this machine.
 */
function knownRepoNames(): string[] {
	return listRepos()
		.filter((entry) => entry.exists)
		.map((entry) => entry.repo);
}

export {
	type RepoSource,
	type RegisteredRepo,
	type RegisteredRepoStatus,
	registryPath,
	readRegistry,
	listRepos,
	checkoutFor,
	RepoRegistryError,
	declareRepo,
	rememberRepo,
	forgetRepo,
	knownRepoNames,
};
