import fs from "node:fs";

export interface CodexStorageInput {
	readonly rootDirectory?: string;
	readonly codexHome?: string;
	readonly sqliteHome?: string;
}

export interface CodexStorageFileSystem {
	readonly lstatSync: typeof fs.lstatSync;
	readonly statSync: typeof fs.statSync;
	readonly mkdirSync: typeof fs.mkdirSync;
	readonly openSync: typeof fs.openSync;
	readonly writeFileSync: typeof fs.writeFileSync;
	readonly fsyncSync: typeof fs.fsyncSync;
	readonly closeSync: typeof fs.closeSync;
	readonly renameSync: typeof fs.renameSync;
	readonly unlinkSync: typeof fs.unlinkSync;
	readonly readFileSync: typeof fs.readFileSync;
	readonly realpathSync: typeof fs.realpathSync;
}

export type CodexStorageFailureCode =
	| "invalid_path"
	| "symlink"
	| "not_directory"
	| "ownership"
	| "permissions"
	| "collision"
	| "lock"
	| "config_conflict"
	| "config_read"
	| "config_write"
	| "config_fsync"
	| "config_rename";

/** What a failed storage preparation records about itself. */
interface CodexStorageErrorInit {
	readonly code: CodexStorageFailureCode;
	readonly target: string;
	readonly message: string;
	readonly cause?: unknown;
	/** The lock release, when the failure happened after the lock was taken. */
	readonly retryCleanup?: () => void;
}

export class CodexStorageError extends Error {
	readonly code: CodexStorageFailureCode;
	readonly target: string;
	/** Present when config preparation failed after the lock was acquired. */
	readonly retryCleanup: (() => void) | undefined;

	/**
	 * Record which path failed which storage check, and keep the lock-release
	 * capability when the failure happened after the lock was taken.
	 * @param init - Failure code, target path, message, optional cause and retry cleanup.
	 */
	constructor(init: CodexStorageErrorInit) {
		super(init.message, { cause: init.cause });
		this.name = "CodexStorageError";
		this.code = init.code;
		this.target = init.target;
		this.retryCleanup = init.retryCleanup;
	}
}

/**
 * Attach a lock-release retry to a failure that left the lock held.
 * @param error - The primary storage failure.
 * @param retryCleanup - Releases the lock on a later explicit attempt.
 * @returns A copy of the failure that carries the retry capability.
 */
function withRetryCleanup(error: CodexStorageError, retryCleanup: () => void): CodexStorageError {
	return new CodexStorageError({
		code: error.code,
		target: error.target,
		message: `${error.message} The storage lock could not be released while unwinding this failure; invoke retryCleanup before retrying preparation.`,
		cause: error.cause,
		retryCleanup,
	});
}

export interface PreparedCodexStorage {
	readonly codexHome: string;
	readonly sqliteHome: string;
	readonly configPath: string;
	readonly configText: string;
	readonly release: () => void;
}

/**
 * Bind the real file system operations the storage checks need.
 * @returns The production file-system seam.
 */
function defaultFileSystem(): CodexStorageFileSystem {
	return {
		lstatSync: fs.lstatSync.bind(fs),
		statSync: fs.statSync.bind(fs),
		mkdirSync: fs.mkdirSync.bind(fs),
		openSync: fs.openSync.bind(fs),
		writeFileSync: fs.writeFileSync.bind(fs),
		fsyncSync: fs.fsyncSync.bind(fs),
		closeSync: fs.closeSync.bind(fs),
		renameSync: fs.renameSync.bind(fs),
		unlinkSync: fs.unlinkSync.bind(fs),
		readFileSync: fs.readFileSync.bind(fs),
		realpathSync: fs.realpathSync.bind(fs),
	};
}

/**
 * Build a storage failure without spreading undefined optional fields.
 * @param code - The failure classification.
 * @param target - The path that failed.
 * @param message - The human-readable reason.
 * @param cause - The underlying failure, when any.
 * @param retryCleanup - The lock-release retry, when the lock is still held.
 * @returns The storage error.
 */
function failure(
	code: CodexStorageFailureCode,
	target: string,
	message: string,
	cause?: unknown,
	retryCleanup?: () => void,
): CodexStorageError {
	return new CodexStorageError({
		code,
		target,
		message,
		...(cause === undefined ? {} : { cause }),
		...(retryCleanup === undefined ? {} : { retryCleanup }),
	});
}

export { defaultFileSystem, failure, withRetryCleanup };
