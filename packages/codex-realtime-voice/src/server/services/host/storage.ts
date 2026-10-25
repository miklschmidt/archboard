import { lstatSync, readlinkSync, type Stats } from "node:fs";
import path from "node:path";
import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";

export interface CodexWorkbenchStorageInput {
	readonly rootDirectory: string;
	readonly ownerDirectory?: string;
}

/** The most links one walk follows, as the kernel's own limit for one path lookup. */
const MOST_LINKS = 40;

/**
 * Whether an entry belongs to you or to root, so no other user made it.
 * @param stats The entry's own stats.
 * @param uid The current uid.
 * @returns True when you or root own it.
 */
function ownedByYouOrRoot(stats: Stats, uid: number): boolean {
	return stats.uid === uid || stats.uid === 0;
}

/**
 * Whether no other user can replace an entry of a directory: you or root own it, and only its
 * owner can write it or its sticky bit keeps each entry to the entry's owner, as on `/tmp`.
 * @param stats The directory's stats.
 * @param uid The current uid.
 * @returns True when the directory guards its entries.
 */
function guardsItsEntries(stats: Stats, uid: number): boolean {
	return (
		ownedByYouOrRoot(stats, uid) && ((stats.mode & 0o022) === 0 || (stats.mode & 0o1000) !== 0)
	);
}

/**
 * The stats of an entry that no other user can have put in its directory.
 * @param directory The real directory that holds the entry.
 * @param entry The entry's path.
 * @param uid The current uid.
 * @returns The entry's own stats, or undefined when it is missing or its directory does not
 * guard its entries.
 */
function guardedEntry(directory: string, entry: string, uid: number): Stats | undefined {
	if (!guardsItsEntries(lstatSync(directory), uid)) return undefined;
	return lstatSync(entry, { throwIfNoEntry: false });
}

/**
 * Resolve the links of a directory path that no other user can have planted or replaced: a link
 * that you or root own, reached only through directories that guard their entries. The walk
 * stops at the first entry it cannot trust or find and keeps the rest of the path as given, so a
 * link there stays for the private-directory check to refuse.
 * @param directory The absolute directory to resolve.
 * @param uid The current uid.
 * @param links The links followed so far.
 * @returns The path with those links resolved.
 */
function throughTrustedLinks(directory: string, uid: number, links = 0): string {
	const components = directory.split(path.sep).filter(Boolean);
	let current = path.parse(directory).root;
	for (const [index, component] of components.entries()) {
		const next = path.join(current, component);
		const stats = guardedEntry(current, next, uid);
		if (stats === undefined) return path.join(current, ...components.slice(index));
		if (stats.isSymbolicLink())
			return throughTrustedLink(next, stats, components.slice(index + 1), uid, links);
		current = next;
	}
	return current;
}

/**
 * Follow one link in a guarded directory when you or root own it.
 * @param link The link's path, in a real directory.
 * @param stats The link's own stats.
 * @param rest The path components below the link.
 * @param uid The current uid.
 * @param links The links followed before this one.
 * @returns The path with the trusted links resolved, or the link and the rest as given.
 */
function throughTrustedLink(
	link: string,
	stats: Stats,
	rest: readonly string[],
	uid: number,
	links: number,
): string {
	if (!ownedByYouOrRoot(stats, uid) || links >= MOST_LINKS) return path.join(link, ...rest);
	const target = path.resolve(path.dirname(link), readlinkSync(link));
	return throughTrustedLinks(path.join(target, ...rest), uid, links + 1);
}

/**
 * A host-given directory with the trusted links of its parent resolved, once. Such a link is
 * the machine's own layout, such as `/tmp` and `/var` on macOS: you or root made it, in
 * directories no other user can change. Any other link stays in the path, so the
 * private-directory check refuses it, as it refuses the directory itself when it is a link and a
 * link that appears in the path later.
 * @param directory The host-given directory.
 * @returns The directory below its parent with the trusted links resolved, or the resolved path
 * when the parent cannot be read (the private-directory check then names why).
 */
function belowRealParent(directory: string): string {
	const resolved = path.resolve(directory);
	const uid = process.platform === "win32" ? undefined : process.getuid?.();
	if (uid === undefined) return resolved;
	try {
		return path.join(throughTrustedLinks(path.dirname(resolved), uid), path.basename(resolved));
	} catch {
		return resolved;
	}
}

/**
 * Derive private Codex paths from the installation root and optional process owner directory.
 * @param input The installation root and optional owner directory.
 * @returns The private storage paths.
 */
export function workbenchStorage(input: CodexWorkbenchStorageInput): CodexWorkbenchStorage {
	const root = belowRealParent(input.rootDirectory);
	const ownerDirectory =
		input.ownerDirectory === undefined
			? path.join(root, "owner")
			: belowRealParent(input.ownerDirectory);
	const codexHome = path.join(root, "codex-home");
	return Object.freeze({
		root,
		ownerDirectory,
		codexHome,
		sqliteHome: path.join(root, "sqlite-home"),
		coordinatorDirectory: path.join(ownerDirectory, "coordinator"),
		epochRoot: path.join(ownerDirectory, "epoch"),
		configPath: path.join(codexHome, "config.toml"),
	});
}
