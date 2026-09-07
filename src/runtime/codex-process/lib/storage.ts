import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { errnoCode } from "@/runtime/codex-process/lib/errno-code";

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
	constructor(init: {
		readonly code: CodexStorageFailureCode;
		readonly target: string;
		readonly message: string;
		readonly cause?: unknown;
		readonly retryCleanup?: () => void;
	}) {
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

/**
 * Require a nonempty, NUL-free absolute path and normalise it.
 * @param candidate - The caller-supplied path, untrusted.
 * @param name - The option name, for the message.
 * @returns The resolved absolute path.
 */
function absolutePath(candidate: unknown, name: string): string {
	if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0"))
		throw failure(
			"invalid_path",
			String(candidate),
			`${name} must be a nonempty NUL-free absolute path.`,
		);
	if (!path.isAbsolute(candidate))
		throw failure(
			"invalid_path",
			candidate,
			`${name} must be absolute, received ${JSON.stringify(candidate)}.`,
		);
	return path.resolve(candidate);
}

/**
 * Decide whether one path lies strictly inside another.
 * @param parent - The containing directory.
 * @param child - The path to test.
 * @returns True when the child is below the parent and not the parent itself.
 */
function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative.length > 0 &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

/**
 * Walk every existing component of a path and refuse a symlink anywhere in
 * it, so a private root cannot be redirected elsewhere.
 * @param candidate - The absolute path to walk.
 * @param fileSystem - The file-system seam.
 */
function assertNoSymlinkComponents(candidate: string, fileSystem: CodexStorageFileSystem): void {
	const parsed = path.parse(candidate);
	let current = parsed.root;
	for (const component of candidate.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
		current = path.join(current, component);
		try {
			if (fileSystem.lstatSync(current).isSymbolicLink())
				throw failure(
					"symlink",
					current,
					`Refusing symlink-escaped Codex storage path component ${current}.`,
				);
		} catch (cause) {
			if (cause instanceof CodexStorageError) throw cause;
			if (errnoCode(cause) === "ENOENT") break;
			throw failure(
				"invalid_path",
				current,
				`Could not inspect Codex storage path component ${current}.`,
				cause,
			);
		}
	}
}

/**
 * Read the current uid where the platform has one.
 * @returns The uid, or undefined on Windows or when unavailable.
 */
function currentUserId(): number | undefined {
	if (process.platform === "win32") return undefined;
	return process.getuid?.();
}

/**
 * Create a missing private directory. A concurrent canvas start may create it
 * first; that is tolerated because the exclusive owner lock decides later.
 * @param candidate - The directory to create.
 * @param name - The role of the directory, for messages.
 * @param fileSystem - The file-system seam.
 * @returns The stats of the directory that now exists.
 */
function createPrivateDirectory(
	candidate: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): fs.Stats {
	try {
		fileSystem.mkdirSync(candidate, { mode: 0o700, recursive: false });
	} catch (mkdirCause) {
		if (errnoCode(mkdirCause) !== "EEXIST")
			throw failure(
				"collision",
				candidate,
				`Could not create dedicated ${name} ${candidate}; the root may be locked, unwritable, or colliding.`,
				mkdirCause,
			);
	}
	try {
		return fileSystem.lstatSync(candidate);
	} catch (inspectCause) {
		throw failure(
			"invalid_path",
			candidate,
			`Could not inspect newly created ${name} ${candidate}.`,
			inspectCause,
		);
	}
}

/**
 * Stat a private directory, creating it when absent.
 * @param candidate - The directory path.
 * @param name - The role of the directory, for messages.
 * @param fileSystem - The file-system seam.
 * @returns The directory's lstat result.
 */
function statOrCreateDirectory(
	candidate: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): fs.Stats {
	try {
		return fileSystem.lstatSync(candidate);
	} catch (cause) {
		if (errnoCode(cause) !== "ENOENT")
			throw failure("invalid_path", candidate, `Could not inspect ${name} ${candidate}.`, cause);
		return createPrivateDirectory(candidate, name, fileSystem);
	}
}

/**
 * Require a path to be owned by the current user.
 * @param stats - The path's stats.
 * @param target - The path, for messages.
 * @param name - The role of the path, for messages.
 * @param required - Whether an unknowable uid is itself a refusal.
 */
function assertOwnedByCurrentUser(
	stats: fs.Stats,
	target: string,
	name: string,
	required: boolean,
): void {
	const owner = currentUserId();
	if (owner === undefined && required && process.platform !== "win32")
		throw failure("ownership", target, `Could not prove ownership of ${name} ${target}.`);
	if (owner !== undefined && stats.uid !== owner)
		throw failure(
			"ownership",
			target,
			`${name} ${target} is owned by uid ${stats.uid}, not the current uid ${owner}.`,
		);
}

/**
 * Require an exact permission mode outside Windows.
 * @param stats - The path's stats.
 * @param target - The path, for messages.
 * @param description - The role of the path, for messages.
 * @param mode - The required mode bits.
 */
function assertExactMode(stats: fs.Stats, target: string, description: string, mode: number): void {
	if (process.platform !== "win32" && (stats.mode & 0o777) !== mode)
		throw failure(
			"permissions",
			target,
			`${description} must have mode ${mode.toString(8).padStart(4, "0")}, received ${(stats.mode & 0o777).toString(8).padStart(4, "0")}.`,
		);
}

/**
 * Canonicalise a verified directory.
 * @param candidate - The directory path.
 * @param name - The role of the directory, for messages.
 * @param fileSystem - The file-system seam.
 * @returns The real absolute path.
 */
function canonicalDirectory(
	candidate: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): string {
	try {
		const canonical = fileSystem.realpathSync(candidate);
		if (!path.isAbsolute(canonical))
			throw failure("invalid_path", candidate, `Canonical ${name} ${candidate} is not absolute.`);
		return canonical;
	} catch (cause) {
		if (cause instanceof CodexStorageError) throw cause;
		throw failure("invalid_path", candidate, `Could not canonicalize ${name} ${candidate}.`, cause);
	}
}

/**
 * Prove a directory is a private 0700 directory owned by the current user,
 * creating it when missing, and return its canonical path.
 * @param candidate - The directory path.
 * @param name - The role of the directory, for messages.
 * @param fileSystem - The file-system seam.
 * @returns The canonical directory path.
 */
function verifyPrivateDirectory(
	candidate: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): string {
	assertNoSymlinkComponents(candidate, fileSystem);
	const stats = statOrCreateDirectory(candidate, name, fileSystem);
	if (stats.isSymbolicLink())
		throw failure("symlink", candidate, `Refusing symlink ${name} ${candidate}.`);
	if (!stats.isDirectory())
		throw failure("not_directory", candidate, `${name} ${candidate} is not a directory.`);
	assertOwnedByCurrentUser(stats, candidate, name, true);
	assertExactMode(stats, candidate, `Dedicated ${name} ${candidate}`, 0o700);
	return canonicalDirectory(candidate, name, fileSystem);
}

/**
 * Build the lock-release retry for a lock file that was created but could
 * not be removed while unwinding.
 * @param lockPath - The lock file.
 * @param fileSystem - The file-system seam.
 * @returns The retry, or undefined when the file was removed already.
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
 * Take the exclusive owner lock inside CODEX_HOME.
 * @param codexHome - The canonical CODEX_HOME.
 * @param fileSystem - The file-system seam.
 * @returns The idempotent release.
 */
function acquireLock(codexHome: string, fileSystem: CodexStorageFileSystem): () => void {
	const lockPath = path.join(codexHome, ".archboard-codex-process.lock");
	let descriptor: number | undefined;
	let created = false;
	try {
		descriptor = fileSystem.openSync(lockPath, "wx", 0o600);
		created = true;
		fileSystem.writeFileSync(descriptor, `${process.pid}\n`, { encoding: "utf8" });
		fileSystem.closeSync(descriptor);
		descriptor = undefined;
	} catch (cause) {
		if (descriptor !== undefined) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				/* Preserve the primary lock failure. */
			}
		}
		const retryCleanup = created ? lockRetryCleanup(lockPath, fileSystem) : undefined;
		throw failure(
			"lock",
			lockPath,
			`Dedicated Codex roots are locked or colliding at ${codexHome}. Stop the other owner before retrying.`,
			cause,
			retryCleanup,
		);
	}
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

/**
 * Prove a config file is a regular 0600 file owned by the current user.
 * @param file - The file path.
 * @param name - The role of the file, for messages.
 * @param fileSystem - The file-system seam.
 */
function verifyOwnedRegularFile(
	file: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): void {
	let stats: fs.Stats;
	try {
		stats = fileSystem.lstatSync(file);
	} catch (cause) {
		if (errnoCode(cause) === "ENOENT")
			throw failure("config_read", file, `${name} ${file} does not exist.`, cause);
		throw failure("config_read", file, `Could not inspect ${name} ${file}.`, cause);
	}
	if (stats.isSymbolicLink()) throw failure("symlink", file, `Refusing symlink ${name} ${file}.`);
	if (!stats.isFile())
		throw failure("config_conflict", file, `${name} ${file} is not a regular file.`);
	assertOwnedByCurrentUser(stats, file, name, false);
	assertExactMode(stats, file, `${name} ${file}`, 0o600);
}

/**
 * Fsync a directory so a rename into it is durable.
 * @param directory - The directory to sync.
 * @param fileSystem - The file-system seam.
 */
function fsyncDirectory(directory: string, fileSystem: CodexStorageFileSystem): void {
	let descriptor: number | undefined;
	let problem: unknown;
	try {
		descriptor = fileSystem.openSync(directory, "r");
		fileSystem.fsyncSync(descriptor);
	} catch (cause) {
		problem = cause;
	} finally {
		if (descriptor !== undefined) {
			try {
				fileSystem.closeSync(descriptor);
			} catch (cause) {
				problem ??= cause;
			}
		}
	}
	if (problem !== undefined)
		throw failure(
			"config_fsync",
			directory,
			`Could not fsync the Codex config directory ${directory}.`,
			problem,
		);
}

/**
 * Write the config bytes to a temporary file, fsync it, close it and rename
 * it into place.
 * @param temporaryPath - The exclusive temporary file.
 * @param configPath - The final config path.
 * @param configText - The config bytes.
 * @param fileSystem - The file-system seam.
 */
function publishConfig(
	temporaryPath: string,
	configPath: string,
	configText: string,
	fileSystem: CodexStorageFileSystem,
): void {
	const descriptor = fileSystem.openSync(temporaryPath, "wx", 0o600);
	try {
		fileSystem.writeFileSync(descriptor, Buffer.from(configText, "utf8"));
		try {
			fileSystem.fsyncSync(descriptor);
		} catch (cause) {
			throw failure(
				"config_fsync",
				configPath,
				`Could not fsync the temporary Codex config for ${configPath}.`,
				cause,
			);
		}
	} catch (cause) {
		try {
			fileSystem.closeSync(descriptor);
		} catch {
			/* Preserve the primary config failure. */
		}
		throw cause;
	}
	fileSystem.closeSync(descriptor);
	try {
		fileSystem.renameSync(temporaryPath, configPath);
	} catch (cause) {
		throw failure(
			"config_rename",
			configPath,
			`Could not atomically rename the Codex config into place at ${configPath}.`,
			cause,
		);
	}
}

/**
 * Publish the strict config atomically, removing the temporary file on any
 * failure and classifying unexplained failures as config writes.
 * @param configPath - The final config path.
 * @param configText - The config bytes.
 * @param codexHome - The directory that receives the rename.
 * @param fileSystem - The file-system seam.
 */
function writeConfigAtomically(
	configPath: string,
	configText: string,
	codexHome: string,
	fileSystem: CodexStorageFileSystem,
): void {
	const temporaryPath = path.join(codexHome, `.config.toml.${process.pid}.${randomUUID()}.tmp`);
	try {
		publishConfig(temporaryPath, configPath, configText, fileSystem);
		fsyncDirectory(codexHome, fileSystem);
	} catch (cause) {
		try {
			fileSystem.unlinkSync(temporaryPath);
		} catch {
			/* The rename may already have published it, or creation may have failed. */
		}
		if (cause instanceof CodexStorageError) throw cause;
		throw failure(
			"config_write",
			configPath,
			`Could not atomically write the Codex config at ${configPath}.`,
			cause,
		);
	}
}

/**
 * Render the one-line strict config that pins the sqlite home.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @returns The config text.
 */
function configTextFor(sqliteHome: string): string {
	return `sqlite_home = ${JSON.stringify(sqliteHome)}\n`;
}

/**
 * Derive one home from an explicit option or from the storage root.
 * @param explicit - The explicit option, when given.
 * @param root - The verified root, when given.
 * @param child - The child directory name under the root.
 * @param name - The option name, for messages.
 * @returns The absolute home path.
 */
function homeFrom(
	explicit: string | undefined,
	root: string | undefined,
	child: string,
	name: string,
): string {
	return absolutePath(explicit ?? (root === undefined ? undefined : path.join(root, child)), name);
}

/**
 * Resolve the two Codex homes from the caller's input, verifying the root
 * directory when one is given.
 * @param input - The caller's storage options.
 * @param fileSystem - The file-system seam.
 * @returns The absolute homes and the verified root, when any.
 */
function resolveInputs(
	input: CodexStorageInput,
	fileSystem: CodexStorageFileSystem,
): {
	readonly root?: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
} {
	const root =
		input.rootDirectory === undefined
			? undefined
			: absolutePath(input.rootDirectory, "rootDirectory");
	if (root !== undefined) verifyPrivateDirectory(root, "Codex storage root", fileSystem);
	const codexHome = homeFrom(input.codexHome, root, "codex-home", "codexHome");
	const sqliteHome = homeFrom(input.sqliteHome, root, "sqlite-home", "sqliteHome");
	return {
		...(root === undefined ? {} : { root }),
		codexHome,
		sqliteHome,
	};
}

/**
 * Refuse homes that coincide, nest, or escape the storage root.
 * @param codexHome - The canonical CODEX_HOME.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @param root - The verified root, when any.
 * @param fileSystem - The file-system seam.
 */
function assertSeparateRoots(
	codexHome: string,
	sqliteHome: string,
	root: string | undefined,
	fileSystem: CodexStorageFileSystem,
): void {
	if (codexHome === sqliteHome || isWithin(codexHome, sqliteHome) || isWithin(sqliteHome, codexHome))
		throw failure(
			"collision",
			codexHome,
			"CODEX_HOME and CODEX_SQLITE_HOME must be separate sibling roots.",
		);
	if (root === undefined) return;
	const canonicalRoot = fileSystem.realpathSync(root);
	if (!isWithin(canonicalRoot, codexHome) || !isWithin(canonicalRoot, sqliteHome))
		throw failure(
			"invalid_path",
			canonicalRoot,
			"Dedicated Codex roots must remain inside rootDirectory.",
		);
}

/**
 * Read a pre-existing config, or nothing when the file is absent.
 * @param configPath - The config path.
 * @param fileSystem - The file-system seam.
 * @returns The existing bytes, or undefined when the file does not exist.
 */
function existingConfig(configPath: string, fileSystem: CodexStorageFileSystem): Buffer | undefined {
	try {
		verifyOwnedRegularFile(configPath, "Codex config", fileSystem);
		return Buffer.from(fileSystem.readFileSync(configPath));
	} catch (cause) {
		if (!(cause instanceof CodexStorageError) || cause.code !== "config_read") throw cause;
		if (errnoCode(cause.cause) !== "ENOENT") throw cause;
		return undefined;
	}
}

/**
 * Ensure the canonical config is on disk: keep a matching one, refuse a
 * conflicting one, publish and re-read a missing one.
 * @param configPath - The config path.
 * @param configText - The canonical config bytes.
 * @param codexHome - The directory that receives the config.
 * @param fileSystem - The file-system seam.
 */
function ensureCanonicalConfig(
	configPath: string,
	configText: string,
	codexHome: string,
	fileSystem: CodexStorageFileSystem,
): void {
	const existing = existingConfig(configPath, fileSystem);
	if (existing !== undefined) {
		if (existing.toString("utf8") !== configText)
			throw failure(
				"config_conflict",
				configPath,
				`Pre-existing Codex config ${configPath} conflicts with the canonical sqlite_home. Refusing to overwrite it.`,
			);
		return;
	}
	writeConfigAtomically(configPath, configText, codexHome, fileSystem);
	verifyOwnedRegularFile(configPath, "Codex config", fileSystem);
	const published = Buffer.from(fileSystem.readFileSync(configPath)).toString("utf8");
	if (published !== configText)
		throw failure(
			"config_conflict",
			configPath,
			`Published Codex config ${configPath} did not match the canonical bytes.`,
		);
}

/**
 * Release the lock while unwinding a config failure, and rethrow the failure
 * carrying the release retry when the release itself failed.
 * @param cause - The config failure.
 * @param configPath - The config path, for messages.
 * @param releaseLock - The lock release.
 * @returns Never; always throws.
 */
function unwindConfigFailure(cause: unknown, configPath: string, releaseLock: () => void): never {
	let retryCleanup: (() => void) | undefined;
	try {
		releaseLock();
	} catch {
		/* Preserve the lock-release capability for an explicit recovery retry. */
		retryCleanup = releaseLock;
	}
	if (cause instanceof CodexStorageError) {
		if (retryCleanup) throw withRetryCleanup(cause, retryCleanup);
		throw cause;
	}
	throw failure(
		"config_write",
		configPath,
		`Could not prepare Codex config ${configPath}.`,
		cause,
		retryCleanup,
	);
}

/**
 * Prepare two private Codex stores and publish the one-line strict config.
 * The returned lock remains held until `release` is called.
 * @param input - The storage root or the two explicit homes.
 * @param options - An injectable file-system seam.
 * @returns The canonical homes, the published config and the lock release.
 */
export function prepareCodexStorage(
	input: CodexStorageInput,
	options: { readonly fileSystem?: CodexStorageFileSystem } = {},
): PreparedCodexStorage {
	const fileSystem = options.fileSystem ?? defaultFileSystem();
	const resolved = resolveInputs(input, fileSystem);
	const codexHome = verifyPrivateDirectory(resolved.codexHome, "CODEX_HOME", fileSystem);
	const sqliteHome = verifyPrivateDirectory(resolved.sqliteHome, "CODEX_SQLITE_HOME", fileSystem);
	assertSeparateRoots(codexHome, sqliteHome, resolved.root, fileSystem);

	const releaseLock = acquireLock(codexHome, fileSystem);
	const configPath = path.join(codexHome, "config.toml");
	const configText = configTextFor(sqliteHome);
	try {
		ensureCanonicalConfig(configPath, configText, codexHome, fileSystem);
	} catch (cause) {
		unwindConfigFailure(cause, configPath, releaseLock);
	}

	let released = false;
	/**
	 * Release the owner lock once; later calls are no-ops.
	 */
	const release = (): void => {
		if (released) return;
		releaseLock();
		released = true;
	};
	return Object.freeze({ codexHome, sqliteHome, configPath, configText, release });
}
