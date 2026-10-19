import * as nodeFs from "node:fs";

interface CodexEpochFileSystem {
	readonly openSync: (path: string, flags: nodeFs.OpenMode, mode?: number) => number;
	readonly writeSync: (fd: number, data: Uint8Array, offset: number, length: number) => number;
	readonly fsyncSync: (fd: number) => void;
	readonly closeSync: (fd: number) => void;
	readonly renameSync: (oldPath: string, newPath: string) => void;
	readonly unlinkSync: (path: string) => void;
	readonly readFileSync: (path: string) => Uint8Array;
	readonly mkdirSync: (
		path: string,
		options: { readonly recursive: true; readonly mode: number },
	) => string | undefined;
	readonly lstatSync: (path: string) => nodeFs.Stats;
	readonly realpathSync: (path: string) => string;
}

/** The production file system, bound so the epoch store never reaches for globals. */
const defaultCodexEpochFileSystem: CodexEpochFileSystem = {
	openSync: nodeFs.openSync,
	writeSync: nodeFs.writeSync,
	fsyncSync: nodeFs.fsyncSync,
	closeSync: nodeFs.closeSync,
	renameSync: nodeFs.renameSync,
	unlinkSync: nodeFs.unlinkSync,
	/**
	 * Read a whole file as bytes.
	 * @param path - The file to read.
	 * @returns The file bytes.
	 */
	readFileSync: (path) => nodeFs.readFileSync(path),
	mkdirSync: nodeFs.mkdirSync,
	lstatSync: nodeFs.lstatSync,
	realpathSync: nodeFs.realpathSync,
};

/**
 * Create the epoch directory if needed and prove it is a private directory: not a symbolic
 * link, and not readable by anyone else.
 * @param fileSystem - The file-system seam.
 * @param directory - The epoch root.
 */
function ensureEpochDirectory(fileSystem: CodexEpochFileSystem, directory: string): void {
	fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const stats = fileSystem.lstatSync(directory);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error("epoch root is not a directory");
	}
	if ((stats.mode & 0o077) !== 0) {
		throw new Error("epoch root is accessible by group or other users");
	}
}

/**
 * The manifest text, or null when there is no usable manifest: missing, not a
 * regular file, unreadable, or not UTF-8. The caller treats null as "no prior
 * epochs", which is the safe direction (every earlier thread is inspect-only).
 * @param fileSystem - The file-system seam.
 * @param filePath - The manifest path.
 * @returns The manifest text, or null when there is no usable manifest.
 */
function readManifestText(fileSystem: CodexEpochFileSystem, filePath: string): string | null {
	try {
		const stats = fileSystem.lstatSync(filePath);
		if (stats.isSymbolicLink() || !stats.isFile()) {
			return null;
		}
		return new TextDecoder("utf-8", { fatal: true }).decode(fileSystem.readFileSync(filePath));
	} catch {
		return null;
	}
}

/**
 * Write every byte to an open descriptor, refusing a write that reports no progress rather
 * than looping forever.
 * @param fileSystem - The file-system seam.
 * @param descriptor - The open descriptor.
 * @param bytes - The bytes to write.
 */
function writeAllBytes(
	fileSystem: CodexEpochFileSystem,
	descriptor: number,
	bytes: Uint8Array,
): void {
	let offset = 0;
	while (offset < bytes.byteLength) {
		const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
		if (!Number.isInteger(written) || written <= 0) {
			throw new Error("short write");
		}
		offset += written;
	}
}

/**
 * One temp write, one fsync, one rename. A failure anywhere before the rename
 * leaves the previous manifest untouched and removes the temp file.
 * @param fileSystem - The file-system seam.
 * @param targetPath - The manifest path to publish.
 * @param temporaryPath - The temporary file written first.
 * @param contents - The manifest text.
 */
function writeFileAtomic(
	fileSystem: CodexEpochFileSystem,
	targetPath: string,
	temporaryPath: string,
	contents: string,
): void {
	const bytes = new TextEncoder().encode(contents);
	let descriptor: number | null = null;
	try {
		descriptor = fileSystem.openSync(temporaryPath, "wx", 0o600);
		writeAllBytes(fileSystem, descriptor, bytes);
		fileSystem.fsyncSync(descriptor);
		fileSystem.closeSync(descriptor);
		descriptor = null;
		fileSystem.renameSync(temporaryPath, targetPath);
	} catch (cause) {
		if (descriptor !== null) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				// The original failure is the one worth reporting.
			}
		}
		try {
			fileSystem.unlinkSync(temporaryPath);
		} catch {
			// A leftover temp file is harmless; the manifest itself is untouched.
		}
		throw cause;
	}
}

export {
	type CodexEpochFileSystem,
	defaultCodexEpochFileSystem,
	ensureEpochDirectory,
	readManifestText,
	writeFileAtomic,
};
