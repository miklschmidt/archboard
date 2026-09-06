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

const defaultCodexEpochFileSystem: CodexEpochFileSystem = {
	openSync: nodeFs.openSync,
	writeSync: nodeFs.writeSync,
	fsyncSync: nodeFs.fsyncSync,
	closeSync: nodeFs.closeSync,
	renameSync: nodeFs.renameSync,
	unlinkSync: nodeFs.unlinkSync,
	readFileSync: (path) => nodeFs.readFileSync(path),
	mkdirSync: nodeFs.mkdirSync,
	lstatSync: nodeFs.lstatSync,
	realpathSync: nodeFs.realpathSync,
};

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
 * One temp write, one fsync, one rename. A failure anywhere before the rename
 * leaves the previous manifest untouched and removes the temp file.
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
		let offset = 0;
		while (offset < bytes.byteLength) {
			const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
			if (!Number.isInteger(written) || written <= 0) {
				throw new Error("short write");
			}
			offset += written;
		}
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
