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
// `repo add <dir>` records each checkout explicitly. Older registry files may
// hold an `observed` source; those entries remain readable.
//
// An entry also holds the language servers that an agent configured for that
// checkout (`repo language-server`, ADR 0046). They belong to the checkout, so
// they stay while the same root registers again, go when the identity registers
// at another root, and go with `repo forget`. Every change reads the file and
// writes it whole, so `repo` commands that run together take turns on a lock.
//
// Nothing is discovered by scanning the filesystem. A registry that guesses is
// the ambient working directory again with extra steps: the whole point is that
// each new entry traces back to the checkout somebody registered.

import fs from "fs";
import path from "path";
import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import { inspectCheckout } from "@/runtime/engine/git";
import { stateDir } from "@/runtime/engine/state-dir";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";
import { LOCK_LEASE_MS, LOCK_POLL_MS } from "@/shared/timing/timing";
import {
	LanguageServersSchema,
	type ConfigurableLanguage,
	type ConfiguredServer,
	type LanguageServers,
} from "@/shared/language-servers/index";

/** New entries are declared; observed is retained for existing registry files. */
type RepoSource = "declared" | "observed";

interface RegisteredRepo {
	/** Repository identity: host/owner/name, or a directory name for a remoteless repo. */
	repo: string;
	/** Absolute path to the checkout on this machine. */
	root: string;
	source: RepoSource;
	addedAt: string;
	/**
	 * The language servers an agent configured for this checkout (ADR 0046,
	 * TASK-433). Forgetting the checkout forgets them, and registering the same
	 * root again keeps them.
	 */
	servers?: LanguageServers;
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
 * the caller can register the checkout again with `repo add`.
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
		...serversOf(entry["servers"]),
	};
}

/**
 * The servers a stored entry holds, as the field they go in. A server that is
 * not valid says nothing, so it is dropped with its siblings, and the entry
 * stays.
 * @param stored The stored value.
 * @returns The field, or none when there are no servers.
 */
function serversOf(stored: unknown): { servers?: LanguageServers } {
	const parsed = LanguageServersSchema.safeParse(stored);
	return parsed.success && Object.keys(parsed.data).length > 0 ? { servers: parsed.data } : {};
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

// Atomic, so a reader never sees half a file. The result reports whether the
// filesystem accepted the write.
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
 * Whether a lock directory has stood for longer than its lease.
 * @param lock The lock directory.
 * @returns True when its holder is gone; false while it stands, or when it is already gone.
 */
function isAbandoned(lock: string): boolean {
	try {
		return Date.now() - fs.statSync(lock).mtimeMs > LOCK_LEASE_MS;
	} catch {
		return false;
	}
}

/**
 * Make the lock directory.
 * @param lock The lock directory.
 * @returns True when this process made it, false when another process holds it.
 * @throws {unknown} Whatever else stopped the directory from being made.
 */
function makeLock(lock: string): boolean {
	try {
		fs.mkdirSync(lock);
		return true;
	} catch (error) {
		if (isRecord(error) && stringAt(error, "code") === "EEXIST") return false;
		throw error;
	}
}

/**
 * Take the lock, waiting while another process holds it. The lock is a lease
 * like a board lock: it lapses after `LOCK_LEASE_MS`, so a process that died
 * while it held the lock costs the next change one lease. A waiter asks again
 * every `LOCK_POLL_MS`.
 * @param lock The lock directory.
 * @returns True when this process holds the lock. False when the directory
 * cannot be made at all, so the write goes without a lock, as quietly as it
 * fails.
 */
function takeLock(lock: string): boolean {
	try {
		fs.mkdirSync(path.dirname(lock), { recursive: true });
		while (!makeLock(lock)) {
			if (isAbandoned(lock)) fs.rmSync(lock, { recursive: true, force: true });
			else Bun.sleepSync(LOCK_POLL_MS);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Run a change of the registry alone. A change reads the file and writes it
 * whole, so two that run together lose one of them: `repo language-server`
 * for two languages, called at the same time, would keep one.
 * @param change Reads the registry and writes it.
 * @returns What the change returned.
 */
function locked<T>(change: () => T): T {
	const lock = `${registryPath()}.lock`;
	const held = takeLock(lock);
	try {
		return change();
	} finally {
		if (held) fs.rmSync(lock, { recursive: true, force: true });
	}
}

/**
 * Record one entry, replacing whatever the registry held for that identity.
 * The servers an agent configured stay while the checkout stays: a checkout
 * at another root is another place, where nobody configured a server.
 * @param entry The entry to record.
 */
function upsert(entry: Omit<RegisteredRepo, "servers">): void {
	locked(() => {
		const before = readRegistry();
		const previous = before.find((existing) => existing.repo === entry.repo);
		const kept = previous?.root === entry.root ? previous.servers : undefined;
		const entries = before.filter((existing) => existing.repo !== entry.repo);
		entries.push(kept === undefined ? entry : { ...entry, servers: kept });
		write(entries.toSorted(byRepo));
	});
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
 * "This directory is that repository." Register a checkout explicitly.
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
async function declareRepo(
	dir: string,
	options: DeclareOptions = {},
): Promise<RegisteredRepo & { source: "declared" }> {
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
	const entry = {
		repo: checkout.identity,
		root: checkout.root,
		source: "declared" as const,
		addedAt: new Date().toISOString(),
	};
	upsert(entry);
	return entry;
}

/**
 * Drop an entry.
 * @param repo The repository identity to forget.
 * @returns False when there was nothing to drop, or the write failed.
 */
function forgetRepo(repo: string): boolean {
	return locked(() => {
		const entries = readRegistry();
		const kept = entries.filter((entry) => entry.repo !== repo);
		if (kept.length === entries.length) {
			return false;
		}
		return write(kept);
	});
}

/**
 * Set the server of one language for a registered checkout, or remove it.
 * @param repo The repository identity.
 * @param language The language.
 * @param server Its command and arguments, or undefined to remove it.
 * @returns The entry as it now stands, or undefined when the identity is not registered.
 * @throws {RepoRegistryError} When the registry cannot be written: the caller
 * asked for the change, so it hears that nothing changed.
 */
function setLanguageServer(
	repo: string,
	language: ConfigurableLanguage,
	server: ConfiguredServer | undefined,
): RegisteredRepo | undefined {
	return locked(() => {
		const entries = readRegistry();
		const entry = entries.find((candidate) => candidate.repo === repo);
		if (entry === undefined) return undefined;
		const { [language]: _replaced, ...others } = entry.servers ?? {};
		const servers: LanguageServers =
			server === undefined ? others : { ...others, [language]: server };
		const { servers: _before, ...bare } = entry;
		const updated = Object.keys(servers).length === 0 ? bare : { ...bare, servers };
		if (!write(entries.map((candidate) => (candidate.repo === repo ? updated : candidate)))) {
			throw new RepoRegistryError(
				`Could not write ${registryPath()}, so nothing changed. Check that you can write to it.`,
			);
		}
		return updated;
	});
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
	forgetRepo,
	setLanguageServer,
	knownRepoNames,
};
