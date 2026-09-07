// Writing a file so that a reader sees the old one or the new one, never a
// partial (ADR 0015, TASK-061).
//
// `fs.writeFileSync` truncates the destination and then fills it. Everything
// between those two steps is a window in which the file on disk is a prefix of
// what it is about to be, and a vault is a directory other programs watch:
// Obsidian, a sync client, another editor. A crash, a full disk or a kill
// signal in that window leaves the truncation and not the content.
//
// A rename has no such window. The destination is never opened for writing at
// all — the bytes go to a temp file, and one `rename` swaps a directory entry.
// POSIX requires that swap to be atomic with respect to anyone reading the
// path, and it leaves a reader that already had the file open holding the
// whole old file rather than a truncated one.
//
// **The fsync is deliberate and is more than half the cost of a write.**
// `docs/design/server-is-the-truth.md` measures the whole read-modify-write
// cycle at 6.21 ms for 55 elements and 9.75 ms for 300, of which this
// fsync-and-rename is 5.15 to 5.25 ms and does not vary with size. It buys the
// half of the guarantee a bare rename does not give: a rename is atomic to
// readers, but a crash before the data has reached the disk can leave the new
// name pointing at a short or empty file. Under ADR 0015 the note is the only
// copy of a board, so that is the board, gone. The cost was accepted when
// ADR 0015 was accepted. Nobody should optimise it away without reopening it.

import fs from "node:fs";
import path from "node:path";

/**
 * The temp file's name, which matters as much as the mechanism.
 *
 * A vault is a directory a human looks at, so the temp file is a dotfile:
 * Obsidian hides it, and `listBoards` skips every entry starting with a dot
 * before it even reaches the `.excalidraw.md` test. It also keeps a `.tmp`
 * suffix, so nothing that walks a vault by extension can mistake it for a
 * board. The pid keeps two processes writing the same path apart.
 * @param file The destination being written.
 * @returns The temp path to write through.
 */
function tempPathFor(file: string): string {
	const dir = path.dirname(file);
	return path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
}

/** Which file a name pointed at, so a later look can tell it is still that one. */
interface FileIdentity {
	dev: number;
	ino: number;
}

/**
 * Close a file handle, where there is one, without turning a cleanup failure
 * into the failure the caller hears about.
 * @param handle The handle, or nothing.
 */
function closeQuietly(handle: number | undefined): void {
	if (handle === undefined) {
		return;
	}
	try {
		fs.closeSync(handle);
	} catch {
		/* already gone */
	}
}

/**
 * Remove a file that may never have existed.
 * @param file The path to remove.
 */
function unlinkQuietly(file: string): void {
	try {
		fs.unlinkSync(file);
	} catch {
		/* never created, or already gone */
	}
}

/**
 * Remove the temp name once the destination has been committed.
 *
 * A transient cleanup failure after the hard-link commit is not a publication
 * failure, so the removal is retried once; a second failure is left to the
 * caller, which by then already knows the commit stands.
 * @param tmp The temp path.
 */
function removeTempAfterCommit(tmp: string): void {
	try {
		fs.unlinkSync(tmp);
	} catch {
		fs.unlinkSync(tmp);
	}
}

/**
 * Whether a name still points at the file this call committed.
 * @param file The destination.
 * @param identity What the committed inode was.
 * @returns True when the destination is still that inode.
 */
function sameFile(file: string, identity: FileIdentity | undefined): boolean {
	if (identity === undefined) {
		return false;
	}
	try {
		const stats = fs.lstatSync(file);
		return stats.dev === identity.dev && stats.ino === identity.ino;
	} catch {
		/* missing or no longer the inode this call committed */
		return false;
	}
}

/**
 * Decide what a failure after the commit point actually means.
 *
 * The hard link either happened or it did not. If the destination is still the
 * inode this call published, whatever failed afterwards was cleanup, and the
 * publication stands. If it is not, somebody else's file is there and the
 * original failure is the truth.
 * @param file The destination.
 * @param tmp The temp path.
 * @param identity What the committed inode was.
 * @param error What was thrown after the commit.
 * @throws {unknown} The original error, when the destination is no longer ours.
 */
function keepCommitOrThrow(
	file: string,
	tmp: string,
	identity: FileIdentity | undefined,
	error: unknown,
): void {
	const stillOurs = sameFile(file, identity);
	unlinkQuietly(tmp);
	if (!stillOurs) {
		throw error;
	}
	fsyncDir(path.dirname(file));
}

/**
 * Write `data` to `file` atomically: temp file, fsync, rename.
 *
 * Throws what the underlying write threw, having removed the temp file first,
 * so a failure leaves the destination exactly as it was and the directory no
 * untidier than it found it.
 * @param file Where the bytes go.
 * @param data The bytes.
 * @throws {unknown} Whatever the underlying write threw.
 */
function writeFileAtomic(file: string, data: string | Buffer): void {
	const tmp = tempPathFor(file);
	let handle: number | undefined;
	try {
		handle = fs.openSync(tmp, "w");
		fs.writeFileSync(handle, data);
		// Before the rename, not after: this is the step that makes the new name
		// point at whole content on the far side of a power cut.
		fs.fsyncSync(handle);
		fs.closeSync(handle);
		handle = undefined;
		fs.renameSync(tmp, file);
		fsyncDir(path.dirname(file));
	} catch (error) {
		closeQuietly(handle);
		unlinkQuietly(tmp);
		throw error;
	}
}

/**
 * Publish whole bytes atomically without replacing an existing destination.
 *
 * The hard link is the commit point: it either creates `file` as another name
 * for the fully synced temp inode or fails with EEXIST. This is the narrow
 * artifact-set counterpart to the replace-in-place note writer above.
 * @param file Where the bytes go.
 * @param data The bytes.
 * @throws {unknown} Whatever the underlying write threw, unless the commit stands.
 */
function writeFileAtomicExclusive(file: string, data: string | Buffer): void {
	const tmp = tempPathFor(file);
	let handle: number | undefined;
	let committed = false;
	let committedIdentity: FileIdentity | undefined;
	try {
		handle = fs.openSync(tmp, "w");
		fs.writeFileSync(handle, data);
		fs.fsyncSync(handle);
		const tempStats = fs.fstatSync(handle);
		committedIdentity = { dev: tempStats.dev, ino: tempStats.ino };
		fs.closeSync(handle);
		handle = undefined;
		fs.linkSync(tmp, file);
		committed = true;
		removeTempAfterCommit(tmp);
		fsyncDir(path.dirname(file));
	} catch (error) {
		closeQuietly(handle);
		if (committed) {
			keepCommitOrThrow(file, tmp, committedIdentity, error);
			return;
		}
		unlinkQuietly(tmp);
		throw error;
	}
}

// The rename itself is a directory change, and it is durable only once the
// directory has been synced. Best effort: opening a directory for reading is
// not portable, and a platform that refuses gives up durability of the rename
/**
 * Make a directory's own change durable.
 *
 * The rename itself is a directory change, and it is durable only once the
 * directory has been synced. Best effort: opening a directory for reading is
 * not portable, and a platform that refuses gives up durability of the rename
 * rather than of the write, which is the smaller of the two.
 * @param dir The directory whose entry changed.
 */
function fsyncDir(dir: string): void {
	let handle: number | undefined;
	try {
		handle = fs.openSync(dir, "r");
		fs.fsyncSync(handle);
	} catch {
		/* not supported here */
	} finally {
		if (handle !== undefined) {
			try {
				fs.closeSync(handle);
			} catch {
				/* ignore */
			}
		}
	}
}

export { tempPathFor, writeFileAtomic, writeFileAtomicExclusive };
