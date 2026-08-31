import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexEpochStore, type EpochStageInput } from "../index.js";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);

describe("codex epoch settlement", () => {
	test("settles an unknown outcome only with its exact positive correlation", () => {
		const parent = mkdtempSync(join("/tmp", "archboard-codex-settlement-"));
		const root = join(parent, "epoch");
		const codexHome = join(parent, "codex-home");
		const sqliteHome = join(parent, "codex-sqlite");
		mkdirSync(root, { recursive: true, mode: 0o700 });
		mkdirSync(codexHome, { recursive: true, mode: 0o700 });
		mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
		try {
			const authority = createIdentityAuthority();
			const store = createCodexEpochStore({
				rootDirectory: root,
				codexHome,
				sqliteHome,
				now: () => 100,
			});
			store.startEpoch(input(authority, "epoch-start", "epoch_start"));
			const observedThread = authority.decoder.adoptThreadId("observed-thread");
			const unrelatedThread = authority.decoder.adoptThreadId("unrelated-thread");
			const staged = store.stageOperation(
				input(authority, "link-unknown", "link", store.snapshot().cas),
			);
			store.markOutcomeUnknown(staged, "response was lost", { threadId: observedThread });
			expect(() => store.confirmOutcome(staged, { threadId: unrelatedThread })).toThrowError(
				expect.objectContaining({ code: "unknown_provenance" }),
			);
			expect(store.snapshot().manifest.records.at(-1)?.status).toBe("inspect_only");
			const confirmed = store.confirmOutcome(staged, { threadId: observedThread });
			expect(confirmed.status).toBe("committed");
			expect(confirmed.outcome).toBe("delivered");
			expect(() =>
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "link-unknown",
				}),
			).toThrowError(expect.objectContaining({ code: "unknown_provenance" }));
			expect(
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "link-unknown",
					threadId: observedThread,
				}),
			).toMatchObject({ record: confirmed });
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("settles an initial turn only with its exact recorded thread and turn", () => {
		const parent = mkdtempSync(join("/tmp", "archboard-codex-settlement-"));
		const root = join(parent, "epoch");
		const codexHome = join(parent, "codex-home");
		const sqliteHome = join(parent, "codex-sqlite");
		mkdirSync(root, { recursive: true, mode: 0o700 });
		mkdirSync(codexHome, { recursive: true, mode: 0o700 });
		mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
		try {
			const authority = createIdentityAuthority();
			const store = createCodexEpochStore({
				rootDirectory: root,
				codexHome,
				sqliteHome,
				now: () => 100,
			});
			store.startEpoch(input(authority, "epoch-start", "epoch_start"));
			const observedThread = authority.decoder.adoptThreadId("observed-thread");
			const observedTurn = authority.decoder.adoptTurnId("observed-turn");
			const unrelatedTurn = authority.decoder.adoptTurnId("unrelated-turn");
			const staged = store.stageOperation(
				input(
					authority,
					"initial-turn-unknown",
					"create_thread_initial_turn",
					store.snapshot().cas,
				),
			);
			store.markOutcomeUnknown(staged, "response was lost", {
				threadId: observedThread,
				turnId: observedTurn,
			});

			expect(() =>
				store.confirmOutcome(staged, { threadId: observedThread, turnId: unrelatedTurn }),
			).toThrowError(expect.objectContaining({ code: "unknown_provenance" }));
			expect(store.snapshot().manifest.records.at(-1)?.status).toBe("inspect_only");
			const confirmed = store.confirmOutcome(staged, {
				threadId: observedThread,
				turnId: observedTurn,
			});
			expect(confirmed).toMatchObject({
				status: "committed",
				outcome: "delivered",
				provenance: { threadId: observedThread, turnId: observedTurn },
			});
			expect(
				store.assertCurrent({
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "initial-turn-unknown",
					threadId: observedThread,
				}),
			).toMatchObject({ record: confirmed });
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});
});

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
