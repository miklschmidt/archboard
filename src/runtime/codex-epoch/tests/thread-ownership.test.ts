import { describe, expect, test } from "bun:test";

import {
	createIdentityAuthority,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	EPOCH_THREAD_ATTACH_OPERATION,
	emptyManifest,
	resolveThreadOwnershipProvenance,
	type EpochOperationRecord,
} from "../index.js";

describe("codex epoch thread ownership provenance", () => {
	test("accepts only the authored ownership contracts and ignores a later read", () => {
		const authority = createIdentityAuthority();
		const createdThread = authority.decoder.adoptThreadId("created-thread");
		const forkedThread = authority.decoder.adoptThreadId("forked-thread");
		const attachedThread = authority.decoder.adoptThreadId("attached-thread");
		const records = [
			record(createdThread, "create", "create_thread", "thread/start"),
			record(createdThread, "read", "read", "thread/read"),
			record(forkedThread, "fork", "fork_thread", "thread/fork"),
			record(attachedThread, "attach", "thread_link", "thread/read"),
		];
		const manifest = Object.freeze({
			...emptyManifest(),
			revision: records.length,
			records,
		});

		expect(resolveThreadOwnershipProvenance(manifest, createdThread)).toMatchObject({
			ownership: "created",
			record: { correlation: { operationId: "create" } },
		});
		expect(resolveThreadOwnershipProvenance(manifest, forkedThread)?.ownership).toBe("created");
		expect(resolveThreadOwnershipProvenance(manifest, attachedThread)?.ownership).toBe("attached");
		expect(
			resolveThreadOwnershipProvenance(manifest, authority.decoder.adoptThreadId("unowned-thread")),
		).toBeNull();
	});

	test("resolves the exact descriptor an attach stages, and nothing beside it", () => {
		const authority = createIdentityAuthority();
		const attachedThread = authority.decoder.adoptThreadId("foreign-thread");
		const staged = record(
			attachedThread,
			"attach",
			EPOCH_THREAD_ATTACH_OPERATION.kind,
			EPOCH_THREAD_ATTACH_OPERATION.rpc,
		);
		const manifest = Object.freeze({ ...emptyManifest(), revision: 1, records: [staged] });
		// The attach path stages this descriptor; a record the table does not
		// recognise leaves a foreign thread permanently unowned.
		expect(resolveThreadOwnershipProvenance(manifest, attachedThread)).toMatchObject({
			ownership: "attached",
			record: { operation: { id: "attach" } },
		});
		for (const wrong of [
			record(attachedThread, "attach", "attached", EPOCH_THREAD_ATTACH_OPERATION.rpc),
			record(attachedThread, "attach", EPOCH_THREAD_ATTACH_OPERATION.kind, "thread/resume"),
		]) {
			expect(
				resolveThreadOwnershipProvenance(
					Object.freeze({ ...emptyManifest(), revision: 1, records: [wrong] }),
					attachedThread,
				),
			).toBeNull();
		}
	});
});

function record(
	threadId: ThreadId,
	operationId: string,
	kind: string,
	rpc: string,
): EpochOperationRecord {
	const authority = createIdentityAuthority();
	return {
		correlation: {
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			operationId,
		},
		operation: { id: operationId, kind, rpc },
		status: "committed",
		outcome: "delivered",
		provenance: {
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			threadId,
			turnId: null,
			threadSource: "appServer",
			workspaceRoot: "/workspace/archboard",
			instructionHash: "1".repeat(64),
			manifestHash: "2".repeat(64),
			confirmedAtMs: 1,
		},
		reason: null,
		createdAtMs: 1,
		updatedAtMs: 1,
	};
}
