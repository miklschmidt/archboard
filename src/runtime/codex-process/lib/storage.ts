import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
	readonly retryCleanup?: () => void;

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

function failure(
	code: CodexStorageFailureCode,
	target: string,
	message: string,
	cause?: unknown,
	retryCleanup?: () => void,
): CodexStorageError {
	return new CodexStorageError({ code, target, message, cause, retryCleanup });
}

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

function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative.length > 0 &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

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
			if ((cause as NodeJS.ErrnoException).code === "ENOENT") break;
			throw failure(
				"invalid_path",
				current,
				`Could not inspect Codex storage path component ${current}.`,
				cause,
			);
		}
	}
}

function currentUserId(): number | undefined {
	if (process.platform === "win32") return undefined;
	return process.getuid?.();
}

function verifyPrivateDirectory(
	candidate: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): string {
	assertNoSymlinkComponents(candidate, fileSystem);
	let stats: fs.Stats;
	try {
		stats = fileSystem.lstatSync(candidate);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT")
			throw failure("invalid_path", candidate, `Could not inspect ${name} ${candidate}.`, cause);
		try {
			fileSystem.mkdirSync(candidate, { mode: 0o700, recursive: false });
		} catch (mkdirCause) {
			throw failure(
				"collision",
				candidate,
				`Could not create dedicated ${name} ${candidate}; the root may be locked, unwritable, or colliding.`,
				mkdirCause,
			);
		}
		try {
			stats = fileSystem.lstatSync(candidate);
		} catch (inspectCause) {
			throw failure(
				"invalid_path",
				candidate,
				`Could not inspect newly created ${name} ${candidate}.`,
				inspectCause,
			);
		}
	}
	if (stats.isSymbolicLink())
		throw failure("symlink", candidate, `Refusing symlink ${name} ${candidate}.`);
	if (!stats.isDirectory())
		throw failure("not_directory", candidate, `${name} ${candidate} is not a directory.`);
	const owner = currentUserId();
	if (owner === undefined && process.platform !== "win32")
		throw failure("ownership", candidate, `Could not prove ownership of ${name} ${candidate}.`);
	if (owner !== undefined && stats.uid !== owner)
		throw failure(
			"ownership",
			candidate,
			`${name} ${candidate} is owned by uid ${stats.uid}, not the current uid ${owner}.`,
		);
	if (process.platform !== "win32" && (stats.mode & 0o777) !== 0o700)
		throw failure(
			"permissions",
			candidate,
			`Dedicated ${name} ${candidate} must have mode 0700, received ${(stats.mode & 0o777).toString(8).padStart(4, "0")}.`,
		);
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
		let retryCleanup: (() => void) | undefined;
		if (created) {
			try {
				fileSystem.unlinkSync(lockPath);
			} catch {
				let released = false;
				retryCleanup = () => {
					if (released) return;
					fileSystem.unlinkSync(lockPath);
					released = true;
				};
			}
		}
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

function verifyOwnedRegularFile(
	file: string,
	name: string,
	fileSystem: CodexStorageFileSystem,
): void {
	let stats: fs.Stats;
	try {
		stats = fileSystem.lstatSync(file);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ENOENT")
			throw failure("config_read", file, `${name} ${file} does not exist.`, cause);
		throw failure("config_read", file, `Could not inspect ${name} ${file}.`, cause);
	}
	if (stats.isSymbolicLink()) throw failure("symlink", file, `Refusing symlink ${name} ${file}.`);
	if (!stats.isFile())
		throw failure("config_conflict", file, `${name} ${file} is not a regular file.`);
	const owner = currentUserId();
	if (owner !== undefined && stats.uid !== owner)
		throw failure(
			"ownership",
			file,
			`${name} ${file} is owned by uid ${stats.uid}, not the current uid ${owner}.`,
		);
	if (process.platform !== "win32" && (stats.mode & 0o777) !== 0o600)
		throw failure(
			"permissions",
			file,
			`${name} ${file} must have mode 0600, received ${(stats.mode & 0o777).toString(8).padStart(4, "0")}.`,
		);
}

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

function writeConfigAtomically(
	configPath: string,
	configText: string,
	codexHome: string,
	fileSystem: CodexStorageFileSystem,
): void {
	const temporaryPath = path.join(codexHome, `.config.toml.${process.pid}.${randomUUID()}.tmp`);
	let descriptor: number | undefined;
	try {
		descriptor = fileSystem.openSync(temporaryPath, "wx", 0o600);
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
		fileSystem.closeSync(descriptor);
		descriptor = undefined;
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
		fsyncDirectory(codexHome, fileSystem);
	} catch (cause) {
		if (descriptor !== undefined) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				/* Preserve the primary config failure. */
			}
		}
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

function configTextFor(sqliteHome: string): string {
	return `sqlite_home = ${JSON.stringify(sqliteHome)}\n`;
}

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
	const codexHome = absolutePath(
		input.codexHome ?? (root === undefined ? undefined : path.join(root, "codex-home")),
		"codexHome",
	);
	const sqliteHome = absolutePath(
		input.sqliteHome ?? (root === undefined ? undefined : path.join(root, "sqlite-home")),
		"sqliteHome",
	);
	return { root, codexHome, sqliteHome };
}

/**
 * Prepare two private Codex stores and publish the one-line strict config.
 * The returned lock remains held until `release` is called.
 */
export function prepareCodexStorage(
	input: CodexStorageInput,
	options: { readonly fileSystem?: CodexStorageFileSystem } = {},
): PreparedCodexStorage {
	const fileSystem = options.fileSystem ?? defaultFileSystem();
	const resolved = resolveInputs(input, fileSystem);
	const codexHome = verifyPrivateDirectory(resolved.codexHome, "CODEX_HOME", fileSystem);
	const sqliteHome = verifyPrivateDirectory(resolved.sqliteHome, "CODEX_SQLITE_HOME", fileSystem);
	if (
		codexHome === sqliteHome ||
		isWithin(codexHome, sqliteHome) ||
		isWithin(sqliteHome, codexHome)
	)
		throw failure(
			"collision",
			codexHome,
			"CODEX_HOME and CODEX_SQLITE_HOME must be separate sibling roots.",
		);
	if (resolved.root !== undefined) {
		const canonicalRoot = fileSystem.realpathSync(resolved.root);
		if (!isWithin(canonicalRoot, codexHome) || !isWithin(canonicalRoot, sqliteHome))
			throw failure(
				"invalid_path",
				canonicalRoot,
				"Dedicated Codex roots must remain inside rootDirectory.",
			);
	}

	const releaseLock = acquireLock(codexHome, fileSystem);
	const configPath = path.join(codexHome, "config.toml");
	const configText = configTextFor(sqliteHome);
	try {
		let existing: Buffer | undefined;
		try {
			verifyOwnedRegularFile(configPath, "Codex config", fileSystem);
			existing = Buffer.from(fileSystem.readFileSync(configPath));
		} catch (cause) {
			if (!(cause instanceof CodexStorageError) || cause.code !== "config_read") throw cause;
			if ((cause.cause as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw cause;
		}
		if (existing !== undefined) {
			if (existing.toString("utf8") !== configText)
				throw failure(
					"config_conflict",
					configPath,
					`Pre-existing Codex config ${configPath} conflicts with the canonical sqlite_home. Refusing to overwrite it.`,
				);
		} else {
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
	} catch (cause) {
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

	let released = false;
	return Object.freeze({
		codexHome,
		sqliteHome,
		configPath,
		configText,
		release: () => {
			if (released) return;
			releaseLock();
			released = true;
		},
	});
}
