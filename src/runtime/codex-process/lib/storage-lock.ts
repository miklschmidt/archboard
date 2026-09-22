import path from "node:path";

import { errnoCode } from "@/runtime/codex-process/lib/errno-code";
import {
	failure,
	type CodexStorageError,
	type CodexStorageFileSystem,
} from "@/runtime/codex-process/lib/storage-contract";
import { readProcessObservation } from "@/shared/process-observation";

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
 * The lock's contents for this process: its pid and, where the kernel can say,
 * the time it was born, so a later start can tell this owner from an unrelated
 * process that inherited the pid after a crash or a reboot.
 * @returns The lock text.
 */
function ownerRecord(): string {
	let startTime: string | undefined;
	try {
		startTime = readProcessObservation(process.pid)?.startTime;
	} catch {
		/* A host without process observation records the pid alone. */
	}
	return startTime === undefined ? `${process.pid}\n` : `${process.pid} ${startTime}\n`;
}

/**
 * Whether the owner a lock records is provably gone: its pid is absent or a
 * zombie, or now belongs to a process born at another time. A record that
 * cannot be read or a host that cannot observe processes counts as alive, so
 * doubt refuses rather than takes over.
 * @param record - The lock's contents.
 * @returns True only when the recorded owner cannot still hold the roots.
 */
function ownerIsGone(record: string): boolean {
	const [pidText, startTime] = record.trim().split(/\s+/);
	const pid = Number(pidText);
	if (!Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		return processIsGone(pid, startTime);
	} catch {
		return false;
	}
}

/**
 * Whether a process is absent, a zombie, or was born at another time than recorded.
 * @param pid - The recorded pid.
 * @param startTime - The recorded kernel start time, absent in a pid-only lock.
 * @returns True when the recorded process no longer runs.
 */
function processIsGone(pid: number, startTime: string | undefined): boolean {
	const observed = readProcessObservation(pid);
	if (observed === undefined || observed.state === "zombie") return true;
	return startTime !== undefined && observed.startTime !== startTime;
}

/**
 * The pid a lock records, for the refusal message.
 * @param record - The lock's contents, when they could be read.
 * @returns The pid text, or undefined when there is none.
 */
function recordedPid(record: string | undefined): string | undefined {
	const pid = record?.trim().split(/\s+/)[0];
	return pid === undefined || pid === "" ? undefined : pid;
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
	if (record === undefined || !ownerIsGone(record)) return attempt;
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
	const pid = recordedPid(readLock(lockPath, fileSystem));
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
