import * as nodeFs from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { LOCK_LEASE_MS } from "../../../shared/timing/timing.js";
import { assertNoDuplicateKeys } from "./manifest-json.js";

export interface CodexEpochFileSystem {
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

export const defaultCodexEpochFileSystem: CodexEpochFileSystem = {
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

export type DurableWritePhase =
	| "target_stat"
	| "temp_open"
	| "temp_write"
	| "temp_fsync"
	| "temp_close"
	| "publish"
	| "directory_open"
	| "directory_fsync"
	| "directory_close";

export class DurableStorageError extends Error {
	readonly phase: DurableWritePhase;
	override readonly cause: unknown;

	constructor(phase: DurableWritePhase, cause: unknown) {
		super(`durable epoch storage failed during ${phase}`);
		this.name = "DurableStorageError";
		this.phase = phase;
		this.cause = cause;
	}
}

export interface DurableLock {
	readonly release: () => void;
}

interface LockRecord {
	readonly pid: number;
	readonly token: string;
	readonly acquiredAtMs: number;
	readonly untilMs: number;
}

export function ensureEpochDirectory(fileSystem: CodexEpochFileSystem, directory: string): void {
	try {
		fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const stats = fileSystem.lstatSync(directory);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error("epoch root is not a directory");
		}
		if ((stats.mode & 0o077) !== 0) {
			throw new Error("epoch root is accessible by group or other users");
		}
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith("epoch root")) {
			throw cause;
		}
		throw new DurableStorageError("target_stat", cause);
	}
}

export function readUtf8File(fileSystem: CodexEpochFileSystem, filePath: string): string | null {
	try {
		const stats = fileSystem.lstatSync(filePath);
		if (stats.isSymbolicLink() || !stats.isFile()) {
			throw new Error("epoch manifest is not a regular file");
		}
		const bytes = fileSystem.readFileSync(filePath);
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (cause) {
		if (isMissing(cause)) {
			return null;
		}
		if (cause instanceof Error && cause.message === "epoch manifest is not a regular file") {
			throw cause;
		}
		throw new DurableStorageError("target_stat", cause);
	}
}

export function writeFileAtomicDurable(
	fileSystem: CodexEpochFileSystem,
	targetPath: string,
	temporaryPath: string,
	contents: string,
): void {
	const bytes = new TextEncoder().encode(contents);
	let descriptor: number | null = null;
	let temporaryCreated = false;
	let published = false;
	try {
		assertPublishTarget(fileSystem, targetPath);
		descriptor = fileSystem.openSync(temporaryPath, "wx", 0o600);
		temporaryCreated = true;
		writeAll(fileSystem, descriptor, bytes);
		try {
			fileSystem.fsyncSync(descriptor);
		} catch (cause) {
			throw new DurableStorageError("temp_fsync", cause);
		}
		try {
			fileSystem.closeSync(descriptor);
			descriptor = null;
		} catch (cause) {
			throw new DurableStorageError("temp_close", cause);
		}
		try {
			fileSystem.renameSync(temporaryPath, targetPath);
			published = true;
		} catch (cause) {
			throw new DurableStorageError("publish", cause);
		}
		fsyncDirectory(fileSystem, dirname(targetPath));
	} catch (cause) {
		if (descriptor !== null) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				// The original write failure is the evidence the caller must preserve.
			}
		}
		let cleanupFailure: unknown;
		if (!published && temporaryCreated) {
			try {
				fileSystem.unlinkSync(temporaryPath);
			} catch (cleanupError) {
				if (!isMissing(cleanupError)) {
					cleanupFailure = cleanupError;
				}
			}
		}
		const primary =
			cause instanceof DurableStorageError ? cause : new DurableStorageError("temp_open", cause);
		if (cleanupFailure !== undefined) {
			throw new DurableStorageError(
				primary.phase,
				new AggregateError(
					[primary.cause, cleanupFailure],
					"temporary-file cleanup failed after the primary durability error",
				),
			);
		}
		throw primary;
	}
}

export function writeEpochStateDurable(
	fileSystem: CodexEpochFileSystem,
	rootDirectory: string,
	manifestPath: string,
	recordsPath: string,
	contents: string,
	order: "manifest-first" | "records-first",
	temporaryId: number,
): number {
	const write = (path: string, label: string): void => {
		const temporaryPath = join(
			rootDirectory,
			`.epoch-${label}.${process.pid}.${temporaryId++}.${randomUUID()}.tmp`,
		);
		writeFileAtomicDurable(fileSystem, path, temporaryPath, contents);
	};
	if (order === "records-first") {
		write(recordsPath, "records");
		write(manifestPath, "manifest");
	} else {
		write(manifestPath, "manifest");
		write(recordsPath, "records");
	}
	return temporaryId;
}

export function acquireDurableLock(
	fileSystem: CodexEpochFileSystem,
	lockPath: string,
	lockDirectory: string,
): DurableLock {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return createLock(fileSystem, lockPath, lockDirectory);
		} catch (cause) {
			if (!isAlreadyExists(cause)) {
				throw cause;
			}
			const existing = readLock(fileSystem, lockPath);
			if (existing === "missing") {
				continue;
			}
			if (existing === "invalid" || !expiredDeadLock(existing)) {
				throw new Error("epoch lock is already held", { cause });
			}
			return recoverExpiredLock(fileSystem, lockPath, lockDirectory, existing);
		}
	}
	throw new Error("epoch lock is already held");
}

function recoverExpiredLock(
	fileSystem: CodexEpochFileSystem,
	lockPath: string,
	lockDirectory: string,
	observed: LockRecord,
): DurableLock {
	const guard = acquireRecoveryGuard(fileSystem, `${lockPath}.recovery`);
	let recovered: DurableLock | undefined;
	let failure: unknown;
	try {
		const current = readLock(fileSystem, lockPath);
		if (
			current === "missing" ||
			current === "invalid" ||
			!sameLock(current, observed) ||
			!expiredDeadLock(current)
		) {
			throw new Error("epoch lock is already held");
		}
		fileSystem.unlinkSync(lockPath);
		fsyncDirectory(fileSystem, lockDirectory);
		try {
			recovered = createLock(fileSystem, lockPath, lockDirectory);
		} catch (error) {
			if (isAlreadyExists(error)) {
				throw new Error("epoch lock is already held", { cause: error });
			}
			throw error;
		}
	} catch (error) {
		failure = error;
	}
	try {
		guard.release();
	} catch (error) {
		if (failure === undefined) {
			failure = error;
		}
	}
	if (failure !== undefined) {
		throw failure;
	}
	return recovered as DurableLock;
}

function acquireRecoveryGuard(fileSystem: CodexEpochFileSystem, guardPath: string): DurableLock {
	let descriptor: number;
	try {
		descriptor = fileSystem.openSync(guardPath, "wx", 0o600);
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw new Error("epoch lock is already held", { cause: error });
		}
		throw new DurableStorageError("temp_open", error);
	}
	let released = false;
	return {
		release: () => {
			if (released) {
				return;
			}
			released = true;
			fileSystem.closeSync(descriptor);
			fileSystem.unlinkSync(guardPath);
		},
	};
}

function sameLock(left: LockRecord, right: LockRecord): boolean {
	return (
		left.pid === right.pid &&
		left.token === right.token &&
		left.acquiredAtMs === right.acquiredAtMs &&
		left.untilMs === right.untilMs
	);
}

function createLock(
	fileSystem: CodexEpochFileSystem,
	lockPath: string,
	lockDirectory: string,
): DurableLock {
	const acquiredAtMs = Date.now();
	const record: LockRecord = {
		pid: process.pid,
		token: randomUUID(),
		acquiredAtMs,
		untilMs: acquiredAtMs + LOCK_LEASE_MS,
	};
	let descriptor: number | null = null;
	try {
		descriptor = fileSystem.openSync(lockPath, "wx", 0o600);
		writeAll(fileSystem, descriptor, new TextEncoder().encode(`${JSON.stringify(record)}\n`));
		try {
			fileSystem.fsyncSync(descriptor);
		} catch (cause) {
			throw new DurableStorageError("temp_fsync", cause);
		}
		fsyncDirectory(fileSystem, lockDirectory);
	} catch (cause) {
		if (descriptor !== null) {
			try {
				fileSystem.closeSync(descriptor);
			} catch {
				// Preserve the lock when cleanup itself is uncertain.
			}
		}
		if (cause instanceof DurableStorageError) {
			throw cause;
		}
		if (isAlreadyExists(cause)) {
			throw cause;
		}
		throw new DurableStorageError("temp_open", cause);
	}

	let released = false;
	return {
		release: () => {
			if (released) {
				return;
			}
			const current = readLock(fileSystem, lockPath);
			if (current !== "missing" && current !== "invalid" && current.token !== record.token) {
				throw new Error("epoch lock ownership was replaced");
			}
			released = true;
			if (descriptor !== null) {
				fileSystem.closeSync(descriptor);
				descriptor = null;
			}
			if (current === "missing") {
				throw new Error("epoch lock disappeared before cleanup");
			}
			if (current === "invalid") {
				throw new Error("epoch lock became unreadable before cleanup");
			}
			fileSystem.unlinkSync(lockPath);
			fsyncDirectory(fileSystem, lockDirectory);
		},
	};
}

function readLock(
	fileSystem: CodexEpochFileSystem,
	lockPath: string,
): LockRecord | "missing" | "invalid" {
	try {
		const stats = fileSystem.lstatSync(lockPath);
		if (stats.isSymbolicLink() || !stats.isFile()) {
			return "invalid";
		}
		const raw = new TextDecoder("utf-8", { fatal: true }).decode(fileSystem.readFileSync(lockPath));
		assertNoDuplicateKeys(raw);
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed) ||
			Object.keys(parsed).length !== 4 ||
			!Object.hasOwn(parsed, "pid") ||
			!Object.hasOwn(parsed, "token") ||
			!Object.hasOwn(parsed, "acquiredAtMs") ||
			!Object.hasOwn(parsed, "untilMs")
		) {
			return "invalid";
		}
		const record = parsed as Record<string, unknown>;
		if (
			!Number.isSafeInteger(record["pid"]) ||
			(record["pid"] as number) <= 0 ||
			typeof record["token"] !== "string" ||
			!/^[-a-f0-9]{36}$/u.test(record["token"]) ||
			!Number.isSafeInteger(record["acquiredAtMs"]) ||
			!Number.isSafeInteger(record["untilMs"]) ||
			(record["untilMs"] as number) < (record["acquiredAtMs"] as number)
		) {
			return "invalid";
		}
		const canonical =
			JSON.stringify({
				pid: record["pid"],
				token: record["token"],
				acquiredAtMs: record["acquiredAtMs"],
				untilMs: record["untilMs"],
			}) + "\n";
		if (canonical !== raw) {
			return "invalid";
		}
		return Object.freeze({
			pid: record["pid"] as number,
			token: record["token"] as string,
			acquiredAtMs: record["acquiredAtMs"] as number,
			untilMs: record["untilMs"] as number,
		});
	} catch (cause) {
		return isMissing(cause) ? "missing" : "invalid";
	}
}

function expiredDeadLock(record: LockRecord): boolean {
	if (record.pid === process.pid) {
		return false;
	}
	try {
		process.kill(record.pid, 0);
		return false;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") {
			return true;
		}
		return record.untilMs <= Date.now();
	}
}

function isAlreadyExists(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function writeAll(fileSystem: CodexEpochFileSystem, descriptor: number, bytes: Uint8Array): void {
	let offset = 0;
	while (offset < bytes.byteLength) {
		let written: number;
		try {
			written = fileSystem.writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
		} catch (cause) {
			throw new DurableStorageError("temp_write", cause);
		}
		if (!Number.isInteger(written) || written <= 0) {
			throw new DurableStorageError("temp_write", new Error("short write"));
		}
		offset += written;
	}
}

function fsyncDirectory(fileSystem: CodexEpochFileSystem, directory: string): void {
	let descriptor: number;
	try {
		descriptor = fileSystem.openSync(directory, "r");
	} catch (cause) {
		throw new DurableStorageError("directory_open", cause);
	}
	try {
		fileSystem.fsyncSync(descriptor);
	} catch (cause) {
		try {
			fileSystem.closeSync(descriptor);
		} catch {
			// Keep the primary fsync error as the caller-visible evidence.
		}
		throw new DurableStorageError("directory_fsync", cause);
	}
	try {
		fileSystem.closeSync(descriptor);
	} catch (cause) {
		throw new DurableStorageError("directory_close", cause);
	}
}

function assertPublishTarget(fileSystem: CodexEpochFileSystem, targetPath: string): void {
	try {
		const stats = fileSystem.lstatSync(targetPath);
		if (stats.isSymbolicLink() || !stats.isFile()) {
			throw new Error("epoch manifest is not a regular file");
		}
	} catch (cause) {
		if (isMissing(cause)) {
			return;
		}
		if (cause instanceof Error && cause.message === "epoch manifest is not a regular file") {
			throw cause;
		}
		throw new DurableStorageError("target_stat", cause);
	}
}

function isMissing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
