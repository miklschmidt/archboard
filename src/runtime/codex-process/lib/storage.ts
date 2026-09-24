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
import { acquireLock } from "@/runtime/codex-process/lib/storage-lock";
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
 * What every thread in the home runs under (TASK-314). Codex's auto-review mode: the sandbox is
 * the workspace, and whatever it refuses goes to a reviewer subagent that approves or denies it
 * instead of asking the user (Codex 0.155.1 `approvals_reviewer`, paired as its TUI pairs it
 * with on-request approvals and the workspace-write profile). Network access, because every
 * archboard command an agent runs reaches the server over localhost.
 */
const PERMISSIONS_CONFIG = [
	'approval_policy = "on-request"',
	'approvals_reviewer = "auto_review"',
	'sandbox_mode = "workspace-write"',
	"",
	"[sandbox_workspace_write]",
	"network_access = true",
	"",
].join("\n");

/**
 * The line that pins the sqlite home, which is all the config held before TASK-314.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @returns The line.
 */
function sqliteHomeLine(sqliteHome: string): string {
	return `sqlite_home = ${JSON.stringify(sqliteHome)}\n`;
}

/**
 * Render the strict config: the sqlite home and the permissions.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @returns The config text.
 */
function configTextFor(sqliteHome: string): string {
	return `${sqliteHomeLine(sqliteHome)}${PERMISSIONS_CONFIG}`;
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
 * Whether a config is archboard's own and may be replaced: the earlier form
 * naming this sqlite home, or either form naming a sqlite home that no longer
 * exists, which is what is left when the state directory holding both homes
 * was moved, since the config records the sqlite home as an absolute path.
 * Anything else, including our form naming another directory that still
 * exists, is somebody's config or a second store, and is refused.
 * @param configText - The config on disk.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @param fileSystem - The file-system seam.
 * @returns True when the config is archboard's own and out of date.
 */
function replaceableOwnConfig(
	configText: string,
	sqliteHome: string,
	fileSystem: CodexStorageFileSystem,
): boolean {
	const previous = ownConfigSqliteHome(configText);
	if (previous === undefined) return false;
	if (previous === sqliteHome) return true;
	try {
		fileSystem.lstatSync(previous);
		return false;
	} catch (cause) {
		return errnoCode(cause) === "ENOENT";
	}
}

/**
 * The sqlite home a config names, when the config is exactly what
 * `configTextFor` writes for an absolute path, or the one line it wrote
 * before TASK-314.
 * @param configText - The config on disk.
 * @returns The absolute sqlite home, or undefined for any other content.
 */
function ownConfigSqliteHome(configText: string): string | undefined {
	const previous = firstLineSqliteHome(configText);
	if (previous === undefined) return undefined;
	return [configTextFor(previous), sqliteHomeLine(previous)].includes(configText)
		? previous
		: undefined;
}

/**
 * The absolute sqlite home a config's first line names, as `sqliteHomeLine` writes it.
 * @param configText - The config on disk.
 * @returns The absolute sqlite home, or undefined when the first line is anything else.
 */
function firstLineSqliteHome(configText: string): string | undefined {
	const quoted = /^sqlite_home = ("(?:[^"\\]|\\.)*")\n/.exec(configText)?.[1];
	const previous = quoted === undefined ? undefined : parsedString(quoted);
	return previous !== undefined && path.isAbsolute(previous) ? previous : undefined;
}

/**
 * Decode a JSON string literal.
 * @param quoted - The literal, quotes included.
 * @returns The string, or undefined when it is not a valid string literal.
 */
function parsedString(quoted: string): string | undefined {
	try {
		const value: unknown = JSON.parse(quoted);
		return typeof value === "string" ? value : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Ensure the canonical config is on disk: keep a matching one, replace an
 * out-of-date one of archboard's own, refuse any other, publish and re-read a
 * missing one.
 * @param configPath - The config path.
 * @param sqliteHome - The canonical CODEX_SQLITE_HOME.
 * @param codexHome - The directory that receives the config.
 * @param fileSystem - The file-system seam.
 */
function ensureCanonicalConfig(
	configPath: string,
	sqliteHome: string,
	codexHome: string,
	fileSystem: CodexStorageFileSystem,
): void {
	const configText = configTextFor(sqliteHome);
	const existing = existingConfig(configPath, fileSystem)?.toString("utf8");
	if (existing === configText) return;
	if (existing !== undefined && !replaceableOwnConfig(existing, sqliteHome, fileSystem))
		throw failure(
			"config_conflict",
			configPath,
			`Pre-existing Codex config ${configPath} is not the one archboard writes. Refusing to overwrite it.`,
		);
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
 * Prepare two private Codex stores and publish the strict config.
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

	const owner =
		input.ownerDirectory === undefined
			? codexHome
			: verifyPrivateDirectory(
					path.resolve(input.ownerDirectory),
					"Codex owner directory",
					fileSystem,
				);
	const releaseLock = acquireLock(owner, fileSystem);
	const configPath = path.join(codexHome, "config.toml");
	const configText = configTextFor(sqliteHome);
	try {
		ensureCanonicalConfig(configPath, sqliteHome, codexHome, fileSystem);
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
