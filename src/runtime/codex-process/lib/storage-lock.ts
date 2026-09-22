import path from "node:path";

import { errnoCode } from "@/runtime/codex-process/lib/errno-code";
import {
	failure,
	type CodexStorageError,
	type CodexStorageFileSystem,
} from "@/runtime/codex-process/lib/storage-contract";
import { ownerRecord, recordedOwnerIsGone, recordedOwnerPid } from "@/shared/process-observation";

/**
 * Build the lock-release retry for a lock file that is still held, so a caller can
 * release it explicitly after a failure.
 * @param lockPath - The lock file.
 * @param fileSystem - The file-system seam.
 * @returns The release retry, or undefined when there is nothing to release.
 */
function lockRetryCleanup(
	lockPath: string,
	fileSystem: CodexStorageFileSystem,
): (() => void) | undefined {
	try {
		fileSystem.unlinkSync(lockPath);
		return undefined;
	} catch {
		let released = false;
		return () => {
			if (released) return;
			fileSystem.unlinkSync(lockPath);
			released = true;
		};
	}
}

/**
 * Read a lock that is already present.
 * @param lockPath - The lock file.
 * @param fileSystem - The file-system seam.
 * @returns Its contents, or undefined when it cannot be read.
 */
function readLock(lockPath: string, fileSystem: CodexStorageFileSystem): string | undefined {
	try {
		return fileSystem.readFileSync(lockPath, "utf8");
	} catch {
		return undefined;
	}
}

/**
 * Set a dead owner's lock aside beside the live one, never deleting it: it is
 * the only record of which server died holding the roots. The file moved is
 * read again, and put back when it is not the one judged dead, which happens
 * only when another start took over the same stale lock first.
 * @param lockPath - The lock file.
 * @param record - The contents judged dead.
 * @param fileSystem - The file-system seam.
 * @returns True when the dead lock is out of the way.
 */
function setStaleLockAside(
	lockPath: string,
	record: string,
	fileSystem: CodexStorageFileSystem,
): boolean {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d+Z$/, "Z");
	const stalePath = `${lockPath}.stale-${stamp}-${process.pid}`;
	try {
		fileSystem.renameSync(lockPath, stalePath);
	} catch {
		return false;
	}
	if (readLock(stalePath, fileSystem) === record) return true;
	try {
		fileSystem.renameSync(stalePath, lockPath);
	} catch {
		/* The live owner's lock stays readable under its stale name. */
	}
	return false;
}

/** Whether the lock file was created, and what failed when it was not written. */
interface LockAttempt {
	readonly created: boolean;
	readonly cause?: unknown;
}

/**
 * Create the lock file exclusively and write this owner into it.
 * @param lockPath - The lock file.
 * @param fileSystem - The file-system seam.
 * @returns Whether the file was created, and what failed when it was not written.
 */
function createLock(lockPath: string, fileSystem: CodexStorageFileSystem): LockAttempt {
	let descriptor: number | undefined;
	let created = false;
	try {
		descriptor = fileSystem.openSync(lockPath, "wx", 0o600);
		created = true;
		fileSystem.writeFileSync(descriptor, ownerRecord(), { encoding: "utf8" });
		fileSystem.closeSync(descriptor);
		return { created };
	} catch (cause) {
		if (descriptor !== undefined) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				/* Preserve the primary lock failure. */
			}
		}
		return { created, cause };
	}
}

/**
 * Create the lock, and when another owner's lock is in the way and that owner
 * is gone, set it aside and create the lock once more.
 * @param lockPath - The lock file.
 * @param fileSystem - The file-system seam.
 * @returns The last attempt.
 */
function createOrTakeOverLock(lockPath: string, fileSystem: CodexStorageFileSystem): LockAttempt {
	const attempt = createLock(lockPath, fileSystem);
	if (attempt.created || errnoCode(attempt.cause) !== "EEXIST") return attempt;
	const record = readLock(lockPath, fileSystem);
	if (record === undefined || !recordedOwnerIsGone(record)) return attempt;
	if (!setStaleLockAside(lockPath, record, fileSystem)) return attempt;
	return createLock(lockPath, fileSystem);
}

/**
 * The refusal for a lock that could not be taken, naming the owner that holds it.
 * @param codexHome - The canonical CODEX_HOME.
 * @param lockPath - The lock file.
 * @param attempt - The failed attempt.
 * @param fileSystem - The file-system seam.
 * @returns The storage error to throw.
 */
function lockRefusal(
	codexHome: string,
	lockPath: string,
	attempt: LockAttempt,
	fileSystem: CodexStorageFileSystem,
): CodexStorageError {
	if (attempt.created)
		return failure(
			"lock",
			lockPath,
			`Could not write the dedicated Codex root lock at ${codexHome}.`,
			attempt.cause,
			lockRetryCleanup(lockPath, fileSystem),
		);
	const record = readLock(lockPath, fileSystem);
	const pid = record === undefined ? undefined : recordedOwnerPid(record);
	const owner = pid === undefined ? "the other owner" : `the other owner (pid ${pid})`;
	return failure(
		"lock",
		lockPath,
		`Dedicated Codex roots are locked or colliding at ${codexHome}. Stop ${owner} before retrying.`,
		attempt.cause,
	);
}

/**
 * Take the exclusive owner lock inside CODEX_HOME, taking over one whose
 * recorded owner is gone.
 * @param codexHome - The canonical CODEX_HOME.
 * @param fileSystem - The file-system seam.
 * @returns The idempotent release.
 */
export function acquireLock(codexHome: string, fileSystem: CodexStorageFileSystem): () => void {
	const lockPath = path.join(codexHome, ".archboard-codex-process.lock");
	const attempt = createOrTakeOverLock(lockPath, fileSystem);
	if (attempt.cause !== undefined) throw lockRefusal(codexHome, lockPath, attempt, fileSystem);
	let released = false;
	return () => {
		if (released) return;
		try {
			fileSystem.unlinkSync(lockPath);
			released = true;
		} catch (cause) {
			throw failure(
				"lock",
				lockPath,
				`Could not release the dedicated Codex root lock ${lockPath}.`,
				cause,
			);
		}
	};
}
