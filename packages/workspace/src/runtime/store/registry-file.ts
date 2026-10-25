// The registry file: what it holds, how it is read and how a change of it is
// written. The operations that people and commands ask for are in
// `repo-registry.ts`; nothing else reads or writes this file.
//
// The file is one JSON array of entries keyed by directory. A checkout entry
// names its repository identity, a vault entry names its registry name. Every
// change reads the file and writes it whole, so two that run together take
// turns on a lock.

import fs from "fs";
import path from "path";
import { writeFileAtomic } from "#runtime/store/atomic-write.ts";
import { stateDir } from "#runtime/services/state-dir.ts";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { LanguageServersSchema, type LanguageServers } from "#runtime/store/language-servers.ts";

/** New entries are declared; observed is retained for existing registry files. */
type RepoSource = "declared" | "observed";

interface RegisteredRepo {
	/** Repository identity: host/owner/name, or the directory name of the main checkout for a remoteless repo. */
	repo: string;
	/** Absolute path to the checkout on this machine. */
	root: string;
	source: RepoSource;
	addedAt: string;
	/**
	 * Whether this is the checkout that this machine reads for its identity.
	 * An identity has at most one, and may have none after the chosen checkout
	 * was forgotten.
	 */
	chosen: boolean;
	/**
	 * The language servers an agent configured for this checkout (ADR 0046,
	 * TASK-433). Forgetting the checkout forgets them, and registering the same
	 * root again keeps them.
	 */
	servers?: LanguageServers;
}

/** A directory outside any git checkout that holds `.archboard/vault`. */
interface UntrackedVault {
	/** What the registry calls it: the base name of the directory, made unique on this machine. */
	name: string;
	root: string;
	addedAt: string;
}

interface Registry {
	checkouts: RegisteredRepo[];
	vaults: UntrackedVault[];
}

/** Whether the directory of an entry is still on this machine. A gone entry is reported, never dropped. */
interface Existence {
	exists: boolean;
}

type RegisteredRepoStatus = RegisteredRepo & Existence;
type UntrackedVaultStatus = UntrackedVault & Existence;

/** A refusal a caller can put in front of a person as it stands. */
class RepoRegistryError extends Error {}

/** The filesystem refused the registry, so nothing changed. */
class RegistryWriteError extends Error {}

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
 * One stored checkout, when it names both a repository and a directory.
 *
 * An entry from before checkouts could be chosen has no `chosen` field and
 * reads as chosen: it was the one checkout of its identity. An entry without a
 * repository and a directory says nothing, so it is dropped rather than
 * repaired.
 * @param entry The stored entry.
 * @returns The checkout, or null when it is not one.
 */
function checkoutOf(entry: Record<string, unknown>): RegisteredRepo | null {
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
		chosen: entry["chosen"] !== false,
		...serversOf(entry["servers"]),
	};
}

/**
 * One stored untracked vault, when it names both a registry name and a directory.
 * @param entry The stored entry.
 * @returns The vault, or null when it is not one.
 */
function vaultOf(entry: Record<string, unknown>): UntrackedVault | null {
	const name = stringAt(entry, "name");
	const root = stringAt(entry, "root");
	if (!name || !root || stringAt(entry, "repo")) {
		return null;
	}
	return {
		name,
		root: path.resolve(root),
		addedAt: stringAt(entry, "addedAt") ?? new Date().toISOString(),
	};
}

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
 * Keep the last entry for each directory, in the order each directory first
 * appeared.
 * @param entries The entries.
 * @returns One entry per directory.
 */
function uniqueByRoot<T extends { root: string }>(entries: readonly T[]): T[] {
	return [...new Map(entries.map((entry) => [entry.root, entry])).values()];
}

/**
 * Keep the first chosen checkout of each identity chosen, so an identity never
 * has two.
 * @param checkouts The checkouts.
 * @returns The same checkouts with at most one chosen for each identity.
 */
function oneChosenEach(checkouts: readonly RegisteredRepo[]): RegisteredRepo[] {
	const taken = new Set<string>();
	return checkouts.map((checkout) => {
		if (!checkout.chosen) {
			return checkout;
		}
		if (taken.has(checkout.repo)) {
			return { ...checkout, chosen: false };
		}
		taken.add(checkout.repo);
		return checkout;
	});
}

/**
 * Order a string for a registry that reads the same way every time it is written.
 * @param a One key.
 * @param b The other.
 * @returns Their order.
 */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Put the entries in the order the file keeps them: checkouts by identity then
 * directory, vaults by name.
 * @param registry The registry.
 * @returns The same entries in that order.
 */
const inFileOrder = (registry: Registry): Registry => ({
	checkouts: registry.checkouts.toSorted((a, b) => byKey(a.repo, b.repo) || byKey(a.root, b.root)),
	vaults: registry.vaults.toSorted((a, b) => byKey(a.name, b.name)),
});

/**
 * Every entry, whether or not its directory is still on disk. Never throws.
 *
 * A corrupt registry is a cache miss, not a crash: bindings still resolve from
 * absolute paths, and the next write rewrites the file.
 * @returns The checkouts and untracked vaults.
 */
function readRegistry(): Registry {
	let entries: unknown[];
	try {
		entries = registryEntries(JSON.parse(fs.readFileSync(registryPath(), "utf-8")));
	} catch {
		return { checkouts: [], vaults: [] };
	}
	const records = entries.filter(isRecord);
	return inFileOrder({
		checkouts: oneChosenEach(
			uniqueByRoot(records.map(checkoutOf).filter((entry) => entry !== null)),
		),
		vaults: uniqueByRoot(records.map(vaultOf).filter((entry) => entry !== null)),
	});
}

/**
 * Whether a directory is still on this machine.
 * @param root The recorded path.
 * @returns True when a directory is there.
 */
function isDirectory(root: string): boolean {
	try {
		return fs.statSync(root).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Replace the registry file with these entries. Atomic, so a reader never
 * sees half a file (TASK-061).
 * @param registry What the registry should now hold.
 * @throws {RegistryWriteError} When the filesystem refused, so nothing changed.
 */
function writeRegistry(registry: Registry): void {
	const file = registryPath();
	const ordered = inFileOrder(registry);
	const entries = [...ordered.checkouts, ...ordered.vaults];
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomic(file, JSON.stringify(entries, null, 2) + "\n");
	} catch {
		throw new RegistryWriteError(
			`Could not write ${file}, so nothing changed. Check that you can write to it.`,
		);
	}
}

/**
 * Whether a lock directory has stood for longer than its lease.
 * @param lock The lock directory.
 * @returns True when its holder is gone; false while it stands, or when it is already gone.
 */
function isAbandoned(lock: string): boolean {
	try {
		return Date.now() - fs.statSync(lock).mtimeMs > BOARD_LOCK_MS.lease;
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
 * like a board lock: it lapses after `BOARD_LOCK_MS.lease`, so a process that died
 * while it held the lock costs the next change one lease. A waiter asks again
 * every `BOARD_LOCK_MS.poll`.
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
			else Bun.sleepSync(BOARD_LOCK_MS.poll);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Change the registry alone: read it, let the change edit it, write it whole.
 * A change that edits nothing writes nothing. Two changes that run together
 * would lose one of them, as `repo language-server` for two languages, called at
 * the same time, would keep one.
 * @param change Edits the registry it is given and returns what the caller wants back.
 * @returns What the change returned.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
function changeRegistry<T>(change: (registry: Registry) => T): T {
	const lock = `${registryPath()}.lock`;
	const held = takeLock(lock);
	try {
		const registry = readRegistry();
		const before = JSON.stringify(registry);
		const result = change(registry);
		if (JSON.stringify(registry) !== before) writeRegistry(registry);
		return result;
	} finally {
		if (held) fs.rmSync(lock, { recursive: true, force: true });
	}
}

export {
	type RepoSource,
	type RegisteredRepo,
	type RegisteredRepoStatus,
	type UntrackedVault,
	type UntrackedVaultStatus,
	type Registry,
	RepoRegistryError,
	RegistryWriteError,
	registryPath,
	readRegistry,
	isDirectory,
	changeRegistry,
};
