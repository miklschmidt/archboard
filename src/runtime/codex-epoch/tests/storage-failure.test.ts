import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexEpochStore,
	defaultCodexEpochFileSystem,
	type CodexEpochFileSystem,
	type EpochStageInput,
} from "../index.js";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);
const ATOMIC_PHASES = [
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
type AtomicPhase = (typeof ATOMIC_PHASES)[number];

describe("codex epoch durability boundaries", () => {
	test("fails closed at every records-first atomic boundary", () => {
		for (const phase of ATOMIC_PHASES) {
			withState((state) => {
				const beforeCodex = sentinel(state.codexHome);
				const beforeSqlite = sentinel(state.sqliteHome);
				const authority = createIdentityAuthority();
				const store = makeStore(state, failingFileSystem(state, { phase, target: "records" }));

				expectDurabilityFailure(() =>
					store.stageEpoch(input(authority, `stage-${phase}`, "epoch_start")),
				);
				expectRestartIsEmptyOrCorrupt(
					state,
					phase === "target_stat" ||
						phase === "temp_open" ||
						phase === "temp_write" ||
						phase === "temp_fsync" ||
						phase === "temp_close" ||
						phase === "publish",
				);
				expect(sentinel(state.codexHome)).toEqual(beforeCodex);
				expect(sentinel(state.sqliteHome)).toEqual(beforeSqlite);
			});
		}
	});

	test("fails closed at every manifest-first commit boundary", () => {
		for (const phase of ATOMIC_PHASES) {
			withState((state) => {
				const beforeCodex = sentinel(state.codexHome);
				const beforeSqlite = sentinel(state.sqliteHome);
				const authority = createIdentityAuthority();
				const prepared = makeStore(state);
				prepared.startEpoch(input(authority, "epoch-start", "epoch_start"));
				const threadId = authority.decoder.adoptThreadId(`thread-${phase}`);
				const transaction = prepared.stageOperation(
					input(authority, `commit-${phase}`, "link", prepared.snapshot().cas),
				);
				const store = makeStore(state, failingFileSystem(state, { phase, target: "manifest" }));

				expectDurabilityFailure(() => store.commitOperation(transaction, { threadId }));
				const restarted = makeStore(state).snapshot;
				if (
					phase === "directory_open" ||
					phase === "directory_fsync" ||
					phase === "directory_close"
				) {
					expect(() => restarted()).toThrowError(
						expect.objectContaining({ code: "corrupt_manifest" }),
					);
				} else {
					expect(restarted().manifest.records.at(-1)?.status).toBe("staged");
				}
				expect(sentinel(state.codexHome)).toEqual(beforeCodex);
				expect(sentinel(state.sqliteHome)).toEqual(beforeSqlite);
			});
		}
	});

	test("preserves the primary fsync failure when temp cleanup also fails", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(
				state,
				failingFileSystem(state, { phase: "temp_fsync", target: "records", failCleanup: true }),
			);
			let failure: unknown;
			try {
				store.stageEpoch(input(authority, "cleanup-failure", "epoch_start"));
			} catch (error) {
				failure = error;
			}
			expect(failure).toMatchObject({ code: "durability_failed" });
			expect(failure).toMatchObject({ cause: { phase: "temp_fsync" } });
			expect(readdirSync(state.root).some((entry) => entry.endsWith(".tmp"))).toBe(true);
		});
	});
});

interface TestState {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
}

interface FailureOptions {
	readonly phase: AtomicPhase;
	readonly target: "manifest" | "records";
	readonly failCleanup?: boolean;
}

function withState<T>(callback: (state: TestState) => T): T {
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

function makeStore(state: TestState, fileSystem?: CodexEpochFileSystem) {
	return createCodexEpochStore({
		rootDirectory: state.root,
		codexHome: state.codexHome,
		sqliteHome: state.sqliteHome,
		fileSystem,
		now: () => 100,
	});
}

function input(
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

function failingFileSystem(state: TestState, options: FailureOptions): CodexEpochFileSystem {
	const descriptors = new Map<number, string>();
	const targetPath = join(state.root, `epoch-${options.target}.json`);
	const targetTempPrefix = join(state.root, `.epoch-${options.target}.`);
	let publishedTarget: string | null = null;
	let injected = false;
	let cleanupInjected = false;
	let targetStatReads = 0;
	const shouldFail = (condition: boolean): void => {
		if (condition && !injected) {
			injected = true;
			throw new Error(`injected ${options.phase} failure`);
		}
	};
	const isTargetTemp = (path: string): boolean =>
		path.startsWith(targetTempPrefix) && path.endsWith(".tmp");
	return {
		...defaultCodexEpochFileSystem,
		lstatSync: (path) => {
			if (path === targetPath) {
				targetStatReads++;
				shouldFail(options.phase === "target_stat" && targetStatReads >= 2);
			}
			return defaultCodexEpochFileSystem.lstatSync(path);
		},
		openSync: (path, flags, mode) => {
			shouldFail(options.phase === "temp_open" && isTargetTemp(path));
			shouldFail(
				options.phase === "directory_open" &&
					path === state.root &&
					publishedTarget === options.target,
			);
			const descriptor = defaultCodexEpochFileSystem.openSync(path, flags, mode);
			descriptors.set(descriptor, path);
			return descriptor;
		},
		writeSync: (descriptor, data, offset, length) => {
			shouldFail(options.phase === "temp_write" && isTargetTemp(descriptors.get(descriptor) ?? ""));
			return defaultCodexEpochFileSystem.writeSync(descriptor, data, offset, length);
		},
		fsyncSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "";
			shouldFail(options.phase === "temp_fsync" && isTargetTemp(path));
			shouldFail(
				options.phase === "directory_fsync" &&
					path === state.root &&
					publishedTarget === options.target,
			);
			return defaultCodexEpochFileSystem.fsyncSync(descriptor);
		},
		closeSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "";
			shouldFail(options.phase === "temp_close" && isTargetTemp(path));
			shouldFail(
				options.phase === "directory_close" &&
					path === state.root &&
					publishedTarget === options.target,
			);
			defaultCodexEpochFileSystem.closeSync(descriptor);
			descriptors.delete(descriptor);
		},
		renameSync: (oldPath, newPath) => {
			shouldFail(options.phase === "publish" && newPath === targetPath);
			defaultCodexEpochFileSystem.renameSync(oldPath, newPath);
			if (newPath === targetPath) {
				publishedTarget = options.target;
			}
		},
		unlinkSync: (path) => {
			if (options.failCleanup === true && isTargetTemp(path) && !cleanupInjected) {
				cleanupInjected = true;
				throw new Error("injected temp cleanup failure");
			}
			return defaultCodexEpochFileSystem.unlinkSync(path);
		},
	};
}

function expectDurabilityFailure(action: () => unknown): void {
	expect(action).toThrowError(expect.objectContaining({ code: "durability_failed" }));
}

function expectRestartIsEmptyOrCorrupt(state: TestState, expectEmpty: boolean): void {
	const restarted = makeStore(state);
	if (expectEmpty) {
		expect(restarted.snapshot().manifest.revision).toBe(0);
	} else {
		expect(() => restarted.snapshot()).toThrowError(
			expect.objectContaining({ code: "corrupt_manifest" }),
		);
	}
}

interface Sentinel {
	readonly bytes: string;
	readonly inode: number;
	readonly mode: number;
	readonly entries: readonly string[];
}

function sentinel(directory: string): Sentinel {
	const file = join(directory, readdirSync(directory).toSorted()[0]!);
	const stats = statSync(file);
	return {
		bytes: readFileSync(file, "utf8"),
		inode: stats.ino,
		mode: stats.mode,
		entries: readdirSync(directory).toSorted(),
	};
}
