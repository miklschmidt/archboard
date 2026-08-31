import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexEpochStore,
	defaultCodexEpochFileSystem,
	type CodexEpochFileSystem,
	type CodexEpochStore,
	type EpochCasToken,
	type EpochStageInput,
} from "../index.js";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);

describe("codex epoch ownership", () => {
	test("stages and commits a new epoch with durable provenance", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			const input = epochInput(authority, "epoch-start", "epoch_start");

			const staged = store.stageEpoch(input);
			expect(staged.record.status).toBe("staged");
			expect(store.snapshot().manifest.activeEpoch).toBeNull();
			expect(readFileSync(store.manifestPath, "utf8")).toBe(
				readFileSync(store.recordsPath, "utf8"),
			);

			const committed = store.commitEpoch(staged);
			expect(committed.status).toBe("committed");
			expect(committed.outcome).toBe("delivered");
			expect(committed.provenance.workspaceRoot).toBe("/workspace/archboard");
			expect(committed.provenance.instructionHash).toBe(INSTRUCTION_HASH);
			expect(committed.provenance.manifestHash).toBe(MANIFEST_HASH);
			expect(store.snapshot().manifest.activeEpoch).toEqual({
				childId: authority.validator.childId,
				epoch: authority.validator.epoch,
				operationId: "epoch-start",
			});
		});
	});

	test("serializes link, create, and fork effects with exact CAS", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
			const thread = authority.decoder.adoptThreadId("thread-1");
			const turn = authority.decoder.adoptTurnId("turn-1");

			const link = store.stageOperation(
				effectInput(authority, "link-1", "link", store.snapshot().cas),
			);
			const linked = store.commitOperation(link, {
				threadId: thread,
				threadSource: "appServer",
			});
			expect(linked.provenance.threadId).toBe(thread);
			expect(
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "link-1",
					threadId: thread,
				}).record,
			).toEqual(linked);

			const create = store.stageOperation(
				effectInput(authority, "create-1", "create_thread", store.snapshot().cas),
			);
			store.commitOperation(create, { threadId: thread, turnId: turn });

			const fork = store.stageOperation(
				effectInput(authority, "fork-1", "fork_thread", store.snapshot().cas),
			);
			const forked = store.commitOperation(fork, { threadId: thread });
			expect(forked.operation.kind).toBe("fork_thread");
			expect(store.snapshot().manifest.records).toHaveLength(4);

			expect(() =>
				store.stageOperation(effectInput(authority, "link-1", "fork_thread", store.snapshot().cas)),
			).toThrowError(expect.objectContaining({ code: "invalid_transition" }));
		});
	});

	test("rejects stale writers and same-generation races", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			const competingStore = makeStore(state);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
			const stale = store.snapshot().cas;
			const first = store.stageOperation(effectInput(authority, "link-1", "link", stale));
			const secondInput = effectInput(authority, "fork-1", "fork", stale);

			expect(() => competingStore.stageOperation(secondInput)).toThrowError(
				expect.objectContaining({ code: "conflict" }),
			);
			store.rollbackOperation(first, "effect rejected before settlement");
		});
	});

	test("persists rollback and outcome_unknown tombstones without retry", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));

			const rollback = store.stageOperation(
				effectInput(authority, "rollback-1", "other", store.snapshot().cas),
			);
			const rolledBack = store.rollbackOperation(rollback, "pre-effect validation failed");
			expect(rolledBack.status).toBe("rolled_back");
			expect(rolledBack.outcome).toBe("not_delivered");

			const unknown = store.stageOperation(
				effectInput(authority, "create-unknown", "create_thread", store.snapshot().cas),
			);
			const tombstone = store.markOutcomeUnknown(unknown, "thread/start settlement was lost");
			expect(tombstone.status).toBe("inspect_only");
			expect(tombstone.outcome).toBe("outcome_unknown");
			expect(tombstone.provenance.threadId).toBeNull();
			expect(() =>
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "create-unknown",
				}),
			).toThrowError(expect.objectContaining({ code: "inspect_only" }));
			expect(
				store.canExecute({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "create-unknown",
				}),
			).toBe(false);
		});
	});

	test("makes replacement children inspect-only and rejects late old writers", () => {
		withState((state) => {
			const firstAuthority = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(epochInput(firstAuthority, "epoch-start-a", "epoch_start"));
			const oldThread = firstAuthority.decoder.adoptThreadId("lost-thread");
			const oldCommitted = store.stageOperation(
				effectInput(firstAuthority, "old-committed", "link", store.snapshot().cas),
			);
			store.commitOperation(oldCommitted, { threadId: oldThread });
			const oldOperation = store.stageOperation(
				effectInput(firstAuthority, "old-link", "link", store.snapshot().cas),
			);
			store.markOutcomeUnknown(oldOperation, "link settlement was lost", { threadId: oldThread });

			const replacementAuthority = createIdentityAuthority();
			store.startEpoch(
				epochInput(replacementAuthority, "epoch-start-b", "epoch_start", store.snapshot().cas),
			);

			expect(() =>
				store.assertCurrent({
					childId: firstAuthority.validator.childId,
					epoch: firstAuthority.validator.epoch,
					operationId: "old-link",
					threadId: oldThread,
				}),
			).toThrowError(expect.objectContaining({ code: "stale_child" }));
			expect(() =>
				store.assertCurrent({
					childId: replacementAuthority.validator.childId,
					epoch: replacementAuthority.validator.epoch,
					operationId: "old-committed",
					threadId: oldThread,
				}),
			).toThrowError(expect.objectContaining({ code: "stale_child" }));
			expect(() => store.commitOperation(oldOperation, { threadId: oldThread })).toThrowError(
				expect.objectContaining({ code: "conflict" }),
			);
			expect(
				store.canExecute({
					childId: replacementAuthority.validator.childId,
					epoch: replacementAuthority.validator.epoch,
					operationId: "old-link",
					threadId: oldThread,
				}),
			).toBe(false);
			expect(
				store
					.snapshot()
					.manifest.records.some(
						(record) =>
							record.correlation.operationId === "old-link" && record.status === "inspect_only",
					),
			).toBe(true);
		});
	});

	test("fails closed for corrupt, truncated, non-UTF-8, duplicate, and mismatched state", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
			const originalManifest = readFileSync(store.manifestPath);
			const originalRecords = readFileSync(store.recordsPath);

			writeFileSync(store.manifestPath, Buffer.concat([originalManifest.subarray(0, 20)]));
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);
			writeFileSync(store.manifestPath, Buffer.from([0xff, 0xfe, 0xfd]));
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);
			writeFileSync(store.manifestPath, originalManifest);
			writeFileSync(
				store.recordsPath,
				Buffer.from(originalRecords.toString().replace('"schema":1', '"schema":1,"schema":1')),
			);
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);
			writeFileSync(store.recordsPath, originalRecords);
			writeFileSync(
				store.recordsPath,
				Buffer.from(originalRecords.toString().replace(/"revision":\d+/u, '"revision":999')),
			);
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);

			writeFileSync(store.recordsPath, originalRecords);
			rmSync(store.manifestPath);
			symlinkSync(store.recordsPath, store.manifestPath);
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);
		});
	});

	test("publishes records before the active manifest and preserves fsync failures", () => {
		withState((state) => {
			const calls: string[] = [];
			const fileSystem = recordingFileSystem(calls, state.root);
			const authority = createIdentityAuthority();
			const store = makeStore(state, fileSystem);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
			const recordsPublish = calls.findIndex((call) => call === "rename:epoch-records.json");
			const manifestPublish = calls.findIndex((call) => call === "rename:epoch-manifest.json");
			expect(recordsPublish).toBeGreaterThanOrEqual(0);
			expect(manifestPublish).toBeGreaterThan(recordsPublish);
			const recordsDirectoryFsync = calls.findIndex(
				(call, index) => call === "fsync-dir:root" && index > recordsPublish,
			);
			const manifestDirectoryFsync = calls.findIndex(
				(call, index) => call === "fsync-dir:root" && index > manifestPublish,
			);
			expect(recordsDirectoryFsync).toBeGreaterThan(recordsPublish);
			expect(manifestDirectoryFsync).toBeGreaterThan(manifestPublish);

			const failureCalls: string[] = [];
			const failingFs = recordingFileSystem(failureCalls, state.root, {
				failTempFsyncFor: ".epoch-records.",
			});
			const failingStore = makeStore(state, failingFs);
			const nextAuthority = createIdentityAuthority();
			expect(() =>
				failingStore.stageEpoch(
					epochInput(nextAuthority, "crash-start", "epoch_start", failingStore.snapshot().cas),
				),
			).toThrowError(expect.objectContaining({ code: "durability_failed" }));
			expect(failureCalls.some((call) => call.includes("fsync-temp:.epoch-records."))).toBe(true);
			expect(() => failingStore.snapshot()).not.toThrow();
		});
	});

	test("does not touch either Codex store, including on refusal and corruption", () => {
		withState((state) => {
			const beforeCodex = sentinel(state.codexHome);
			const beforeSqlite = sentinel(state.sqliteHome);
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
			const staged = store.stageOperation(
				effectInput(authority, "rollback", "other", store.snapshot().cas),
			);
			store.rollbackOperation(staged, "not delivered");
			const replacement = createIdentityAuthority();
			store.startEpoch(epochInput(replacement, "replacement", "epoch_start", store.snapshot().cas));
			expect(() =>
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "rollback",
				}),
			).toThrow();
			writeFileSync(store.manifestPath, "broken\n");
			expect(() => store.snapshot()).toThrowError(
				expect.objectContaining({ code: "corrupt_manifest" }),
			);
			expect(sentinel(state.codexHome)).toEqual(beforeCodex);
			expect(sentinel(state.sqliteHome)).toEqual(beforeSqlite);
		});
	});

	test("refuses an epoch root that overlaps Codex storage", () => {
		withState((state) => {
			expect(() =>
				createCodexEpochStore({
					rootDirectory: state.codexHome,
					codexHome: state.codexHome,
					sqliteHome: state.sqliteHome,
				}),
			).toThrowError(expect.objectContaining({ code: "outside_codex_storage" }));
		});
	});

	test("refuses a live competing process through the durable lease", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(state);
			writeFileSync(
				store.lockPath,
				JSON.stringify({
					pid: process.pid,
					token: "00000000-0000-4000-8000-000000000000",
					acquiredAtMs: Date.now(),
					untilMs: Date.now() + 30_000,
				}),
			);
			expect(() => store.stageEpoch(epochInput(authority, "blocked", "epoch_start"))).toThrowError(
				expect.objectContaining({ code: "locked" }),
			);
		});
	});
});

interface TestState {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
}

function withState<T>(callback: (state: TestState) => T): T {
	const root = mkdtempSync(join("/tmp", "archboard-codex-epoch-"));
	const state: TestState = {
		root: join(root, "epoch"),
		codexHome: join(root, "codex-home"),
		sqliteHome: join(root, "codex-sqlite"),
	};
	mkdirSync(state.root, { recursive: true, mode: 0o700 });
	mkdirSync(state.codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(state.sqliteHome, { recursive: true, mode: 0o700 });
	writeFileSync(join(state.codexHome, "sentinel.db"), "codex-state");
	writeFileSync(join(state.sqliteHome, "sentinel.sqlite"), "sqlite-state");
	try {
		return callback(state);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function makeStore(state: TestState, fileSystem?: CodexEpochFileSystem): CodexEpochStore {
	return createCodexEpochStore({
		rootDirectory: state.root,
		codexHome: state.codexHome,
		sqliteHome: state.sqliteHome,
		fileSystem,
		now: () => 100,
	});
}

function epochInput(
	authority: ReturnType<typeof createIdentityAuthority>,
	operationId: string,
	kind: string,
	expected?: EpochCasToken,
): EpochStageInput {
	return {
		childId: authority.validator.childId,
		epoch: authority.validator.epoch,
		operationId,
		kind,
		rpc: "epoch/start",
		workspaceRoot: "/workspace/archboard",
		instructionHash: INSTRUCTION_HASH,
		manifestHash: MANIFEST_HASH,
		expected,
	};
}

function effectInput(
	authority: ReturnType<typeof createIdentityAuthority>,
	operationId: string,
	kind: string,
	expected: EpochCasToken,
): EpochStageInput {
	return {
		...epochInput(authority, operationId, kind, expected),
		rpc: "turn/start",
	};
}

interface FsyncFailure {
	readonly failTempFsyncFor?: string;
}

function recordingFileSystem(
	calls: string[],
	root: string,
	failure?: FsyncFailure,
): CodexEpochFileSystem {
	const descriptors = new Map<number, string>();
	return {
		...defaultCodexEpochFileSystem,
		openSync: (path, flags, mode) => {
			const descriptor = defaultCodexEpochFileSystem.openSync(path, flags, mode);
			descriptors.set(descriptor, path);
			calls.push(`open:${path.split("/").pop()}`);
			return descriptor;
		},
		writeSync: (descriptor, data, offset, length) => {
			const path = descriptors.get(descriptor) ?? "unknown";
			calls.push(`write:${path.split("/").pop()}`);
			return defaultCodexEpochFileSystem.writeSync(descriptor, data, offset, length);
		},
		fsyncSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "unknown";
			const name = path.split("/").pop() ?? path;
			if (path === root) {
				calls.push("fsync-dir:root");
			} else if (name.endsWith(".tmp")) {
				calls.push(`fsync-temp:${name}`);
			} else {
				calls.push(`fsync:${name}`);
			}
			if (failure?.failTempFsyncFor !== undefined && name.includes(failure.failTempFsyncFor)) {
				throw new Error("injected temp fsync failure");
			}
			defaultCodexEpochFileSystem.fsyncSync(descriptor);
		},
		closeSync: (descriptor) => {
			const path = descriptors.get(descriptor) ?? "unknown";
			calls.push(`close:${path.split("/").pop()}`);
			defaultCodexEpochFileSystem.closeSync(descriptor);
			descriptors.delete(descriptor);
		},
		renameSync: (oldPath, newPath) => {
			calls.push(`rename:${newPath.split("/").pop()}`);
			defaultCodexEpochFileSystem.renameSync(oldPath, newPath);
		},
	};
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
