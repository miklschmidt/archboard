import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import type { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexEpochStore,
	defaultCodexEpochFileSystem,
	type CodexEpochFileSystem,
	type EpochStageInput,
} from "../index.js";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);
export const ATOMIC_PHASES = [
	"target_stat",
	"temp_open",
	"temp_write",
	"temp_fsync",
	"temp_close",
	"publish",
	"directory_open",
	"directory_fsync",
	"directory_close",
] as const;
export type AtomicPhase = (typeof ATOMIC_PHASES)[number];
export type StateTarget = "manifest" | "records";

export interface TestState {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
}

export interface FailureOptions {
	readonly phase: AtomicPhase;
	readonly target: StateTarget;
	readonly failCleanup?: boolean;
}

export function withState<T>(callback: (state: TestState) => T): T {
	const parent = mkdtempSync(join("/tmp", "archboard-codex-failure-"));
	const state: TestState = {
		root: join(parent, "epoch"),
		codexHome: join(parent, "codex-home"),
		sqliteHome: join(parent, "codex-sqlite"),
	};
	mkdirSync(state.root, { recursive: true, mode: 0o700 });
	mkdirSync(state.codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(state.sqliteHome, { recursive: true, mode: 0o700 });
	writeSentinel(state.codexHome, "codex-state");
	writeSentinel(state.sqliteHome, "sqlite-state");
	try {
		return callback(state);
	} finally {
		rmSync(parent, { recursive: true, force: true });
	}
}

function writeSentinel(directory: string, contents: string): void {
	const path = join(directory, "sentinel");
	const descriptor = defaultCodexEpochFileSystem.openSync(path, "w", 0o600);
	try {
		defaultCodexEpochFileSystem.writeSync(
			descriptor,
			new TextEncoder().encode(contents),
			0,
			contents.length,
		);
	} finally {
		defaultCodexEpochFileSystem.closeSync(descriptor);
	}
}

export function makeStore(state: TestState, fileSystem?: CodexEpochFileSystem) {
	return createCodexEpochStore({
		rootDirectory: state.root,
		codexHome: state.codexHome,
		sqliteHome: state.sqliteHome,
		fileSystem,
		now: () => 100,
	});
}

export function input(
	authority: ReturnType<typeof createIdentityAuthority>,
	operationId: string,
	kind: string,
	expected?: EpochStageInput["expected"],
): EpochStageInput {
	return {
		childId: authority.validator.childId,
		epoch: authority.validator.epoch,
		operationId,
		kind,
		rpc: kind === "epoch_start" ? "epoch/start" : "turn/start",
		workspaceRoot: "/workspace/archboard",
		instructionHash: INSTRUCTION_HASH,
		manifestHash: MANIFEST_HASH,
		expected,
	};
}

export function injectedFileSystem(
	state: TestState,
	options?: FailureOptions,
): CodexEpochFileSystem {
	const descriptors = new Map<number, string>();
	const target = options?.target;
	const targetPath = target === undefined ? "" : join(state.root, `epoch-${target}.json`);
	const targetTempPrefix = target === undefined ? "" : join(state.root, `.epoch-${target}.`);
	let publishedTarget: string | null = null;
	let injected = false;
	let cleanupInjected = false;
	let targetStatReads = 0;
	const shouldFail = (condition: boolean): void => {
		if (condition && !injected) {
			injected = true;
			throw new Error(`injected ${options?.phase} failure`);
		}
	};
	const isTargetTemp = (path: string): boolean =>
		target !== undefined && path.startsWith(targetTempPrefix) && path.endsWith(".tmp");
	return {
		...defaultCodexEpochFileSystem,
		lstatSync: (path) => {
			if (path === targetPath) {
				targetStatReads++;
				shouldFail(options?.phase === "target_stat" && targetStatReads >= 2);
			}
			return defaultCodexEpochFileSystem.lstatSync(path);
		},
		openSync: (path, flags, mode) => {
			shouldFail(options?.phase === "temp_open" && isTargetTemp(path));
			shouldFail(
				options?.phase === "directory_open" && path === state.root && publishedTarget === target,
			);
			const descriptor = defaultCodexEpochFileSystem.openSync(path, flags, mode);
			descriptors.set(descriptor, path);
			return descriptor;
		},
		writeSync: (descriptor, data, offset, length) => {
			shouldFail(
				options?.phase === "temp_write" && isTargetTemp(descriptors.get(descriptor) ?? ""),
			);
			return defaultCodexEpochFileSystem.writeSync(descriptor, data, offset, length);
		},
		fsyncSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "";
			shouldFail(options?.phase === "temp_fsync" && isTargetTemp(path));
			shouldFail(
				options?.phase === "directory_fsync" && path === state.root && publishedTarget === target,
			);
			// The matrix owns phase behavior. epoch.test.ts owns real fsync and publish ordering.
		},
		closeSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "";
			defaultCodexEpochFileSystem.closeSync(descriptor);
			descriptors.delete(descriptor);
			shouldFail(options?.phase === "temp_close" && isTargetTemp(path));
			shouldFail(
				options?.phase === "directory_close" && path === state.root && publishedTarget === target,
			);
		},
		renameSync: (oldPath, newPath) => {
			shouldFail(options?.phase === "publish" && newPath === targetPath);
			defaultCodexEpochFileSystem.renameSync(oldPath, newPath);
			if (newPath === targetPath) publishedTarget = target ?? null;
		},
		unlinkSync: (path) => {
			if (options?.failCleanup === true && isTargetTemp(path) && !cleanupInjected) {
				cleanupInjected = true;
				throw new Error("injected temp cleanup failure");
			}
			return defaultCodexEpochFileSystem.unlinkSync(path);
		},
	};
}

export interface Sentinel {
	readonly bytes: string;
	readonly inode: number;
	readonly mode: number;
	readonly entries: readonly string[];
}

export function sentinel(directory: string): Sentinel {
	const file = join(directory, readdirSync(directory).toSorted()[0]!);
	const stats = statSync(file);
	return {
		bytes: readFileSync(file, "utf8"),
		inode: stats.ino,
		mode: stats.mode,
		entries: readdirSync(directory).toSorted(),
	};
}
