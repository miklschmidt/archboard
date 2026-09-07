/**
 * Write the config to a private temporary file, fsync it, and rename it into place, so a
 * reader never observes a partially written config.
 * @param temporaryPath - The temporary file to write first.
 * @param configPath - The final config path.
 * @param configText - The canonical config bytes.
 * @param fileSystem - The file-system seam.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { errnoCode } from "@/runtime/codex-process/lib/errno-code";

import {
	CodexStorageError,
	defaultFileSystem,
	failure,
	withRetryCleanup,
	type CodexStorageFileSystem,
	type CodexStorageInput,
	type PreparedCodexStorage,
} from "@/runtime/codex-process/lib/storage-contract";
import {
	absolutePath,
	fsyncDirectory,
	isWithin,
	verifyOwnedRegularFile,
	verifyPrivateDirectory,
} from "@/runtime/codex-process/lib/storage-directories";

/** The file-system seam storage preparation runs against, injected by tests. */
interface CodexStoragePreparationOptions {
	readonly fileSystem?: CodexStorageFileSystem;
}

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
 * Write the config to a private temporary file, fsync it, and rename it into place, so a
 * reader never observes a partially written config.
 * @param temporaryPath - The temporary file written first.
 * @param configPath - The final config path.
 * @param configText - The canonical config bytes.
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
 * Whether two storage homes are the same directory or one contains the other, either of which
 * would let one store's writes reach the other.
 * @param codexHome - The canonical CODEX_HOME.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @returns True when they are not disjoint.
 */
function homesOverlap(codexHome: string, sqliteHome: string): boolean {
	return (
		codexHome === sqliteHome || isWithin(codexHome, sqliteHome) || isWithin(sqliteHome, codexHome)
	);
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
	if (homesOverlap(codexHome, sqliteHome))
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
function existingConfig(
	configPath: string,
	fileSystem: CodexStorageFileSystem,
): Buffer | undefined {
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
 * The function never returns: it always rethrows.
 * @param cause - The config failure.
 * @param configPath - The config path, for messages.
 * @param releaseLock - The lock release.
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
	options: CodexStoragePreparationOptions = {},
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

export {
	CodexStorageError,
	type CodexStorageFailureCode,
	type CodexStorageFileSystem,
	type CodexStorageInput,
	type PreparedCodexStorage,
} from "@/runtime/codex-process/lib/storage-contract";
