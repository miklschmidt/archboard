import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexEpochStore,
	type CodexEpochFileSystem,
	type CodexEpochStore,
	type EpochStageInput,
} from "../index.js";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);

describe("codex epoch review remediations", () => {
	test("rejects a parent symlink into Codex storage before creating the epoch root", () => {
		const parent = mkdtempSync(join("/tmp", "archboard-codex-parent-link-"));
		const codexHome = join(parent, "codex-home");
		const sqliteHome = join(parent, "codex-sqlite");
		const linkedParent = join(parent, "linked-parent");
		mkdirSync(codexHome, { recursive: true, mode: 0o700 });
		mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
		writeFileSync(join(codexHome, "sentinel.db"), "codex-state", { mode: 0o600 });
		writeFileSync(join(sqliteHome, "sentinel.sqlite"), "sqlite-state", { mode: 0o600 });
		symlinkSync(codexHome, linkedParent, "dir");
		const beforeCodex = treeSentinel(codexHome);
		const beforeSqlite = treeSentinel(sqliteHome);
		let failure: unknown;
		try {
			createCodexEpochStore({
				rootDirectory: join(linkedParent, "epoch"),
				codexHome,
				sqliteHome,
			});
		} catch (error) {
			failure = error;
		}
		try {
			expect(failure).toMatchObject({ code: "outside_codex_storage" });
			expect(treeSentinel(codexHome)).toEqual(beforeCodex);
			expect(treeSentinel(sqliteHome)).toEqual(beforeSqlite);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("refuses a fresh replacement operation that reuses a tombstoned thread", () => {
		withState((state) => {
			const first = createIdentityAuthority();
			const store = makeStore(state);
			store.startEpoch(input(first, "epoch-a", "epoch_start"));
			const tombstonedThread = first.decoder.adoptThreadId("tombstoned-thread");
			const uncertain = store.stageOperation(
				input(first, "uncertain-a", "link", store.snapshot().cas),
			);
			store.markOutcomeUnknown(uncertain, "settlement was lost", {
				threadId: tombstonedThread,
			});

			const replacement = createIdentityAuthority();
			store.startEpoch(input(replacement, "epoch-b", "epoch_start", store.snapshot().cas));
			const fresh = store.stageOperation(
				input(replacement, "fresh-b", "link", store.snapshot().cas),
			);
			expect(() => store.commitOperation(fresh, { threadId: tombstonedThread })).toThrowError(
				expect.objectContaining({ code: "inspect_only" }),
			);
			const records = store.snapshot().manifest.records;
			expect(
				records.find((record) => record.correlation.operationId === "uncertain-a"),
			).toMatchObject({ status: "inspect_only", outcome: "outcome_unknown" });
			expect(records.find((record) => record.correlation.operationId === "fresh-b")).toMatchObject({
				status: "staged",
				outcome: "pending",
			});
		});
	});
});

interface TestState {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
}

function withState<T>(callback: (state: TestState) => T): T {
	const parent = mkdtempSync(join("/tmp", "archboard-codex-remediation-"));
	const state: TestState = {
		root: join(parent, "epoch"),
		codexHome: join(parent, "codex-home"),
		sqliteHome: join(parent, "codex-sqlite"),
	};
	mkdirSync(state.root, { recursive: true, mode: 0o700 });
	mkdirSync(state.codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(state.sqliteHome, { recursive: true, mode: 0o700 });
	try {
		return callback(state);
	} finally {
		rmSync(parent, { recursive: true, force: true });
	}
}

function makeStore(state: TestState, fileSystem?: CodexEpochFileSystem): CodexEpochStore {
	return createCodexEpochStore({
		rootDirectory: state.root,
		codexHome: state.codexHome,
		sqliteHome: state.sqliteHome,
		...(fileSystem === undefined ? {} : { fileSystem }),
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
		...(expected === undefined ? {} : { expected }),
	};
}

interface TreeSentinel {
	readonly inode: number;
	readonly mode: number;
	readonly entries: readonly {
		readonly name: string;
		readonly bytes: string;
		readonly inode: number;
		readonly mode: number;
	}[];
}

function treeSentinel(directory: string): TreeSentinel {
	const root = lstatSync(directory);
	return {
		inode: root.ino,
		mode: root.mode,
		entries: readdirSync(directory)
			.toSorted()
			.map((name) => {
				const path = join(directory, name);
				const stats = lstatSync(path);
				return {
					name,
					bytes: stats.isFile() ? readFileSync(path, "utf8") : "<non-file>",
					inode: stats.ino,
					mode: stats.mode,
				};
			}),
	};
}
