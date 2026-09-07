import fs from "node:fs";
import path from "node:path";

import { errnoCode } from "@/runtime/codex-process/lib/errno-code";
import {
	CodexStorageError,
	failure,
	type CodexStorageFileSystem,
} from "@/runtime/codex-process/lib/storage-contract";

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
 * Verify that a path is a private regular file this user owns, refusing a symlink, a
 * directory, or a file another user could read or replace.
 * @param file - The file to verify.
 * @param name - What the file is, for messages.
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

export {
	absolutePath,
	assertNoSymlinkComponents,
	canonicalDirectory,
	createPrivateDirectory,
	fsyncDirectory,
	isWithin,
	verifyOwnedRegularFile,
	verifyPrivateDirectory,
};
