import { describe, expect, test } from "bun:test";

import {
	CodexThreadLinkError,
	classifyCodexThreadLink,
	createCodexThreadLinkClassifier,
	type ThreadLinkTarget,
} from "../index.ts";
import {
	createIdentityAuthority,
	restoreIdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.ts";
import {
	currentEpoch,
	loadedPage,
	session,
	thread,
	threadPage,
	type ScriptedSession,
} from "./fixtures.ts";
import {
	realEpochFixture,
	type RealEpochFixture,
	type RealEpochOptions,
} from "./epoch-fixtures.ts";

function onePageSession(
	row: ReturnType<typeof thread>,
	loadedIds: readonly string[] = [row.id],
): ScriptedSession {
	return session(new Map([[null, threadPage([row])]]), new Map([[null, loadedPage(loadedIds)]]));
}

async function withFixture<T>(
	options: RealEpochOptions,
	action: (fixture: RealEpochFixture) => Promise<T>,
): Promise<T> {
	const fixture = realEpochFixture(createIdentityAuthority(), options);
	try {
		return await action(fixture);
	} finally {
		fixture.cleanup();
	}
}

function targetWithoutAttachedProof(fixture: RealEpochFixture): ThreadLinkTarget {
	return {
		threadId: fixture.target.threadId,
		childId: fixture.target.childId,
		epoch: fixture.target.epoch,
		operationId: fixture.target.operationId,
	};
}

async function rejection(promise: Promise<unknown>): Promise<CodexThreadLinkError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof CodexThreadLinkError) return error;
		throw error;
	}
	throw new Error("expected thread-link classification to fail");
}

describe("codex thread-link classification", () => {
	test("exhausts both pages and joins by exact ThreadId with literal queries", async () => {
		await withFixture({ threadId: "wanted" }, async (fixture) => {
			const other = thread(fixture.authority, "other");
			const wanted = thread(fixture.authority, "wanted");
			const sessionFixture = session(
				new Map([
					[null, threadPage([other], "thread-page-2")],
					["thread-page-2", threadPage([wanted])],
				]),
				new Map([
					[null, loadedPage([other.id], "loaded-page-2")],
					["loaded-page-2", loadedPage([wanted.id])],
				]),
			);
			const result = await classifyCodexThreadLink(
				{ session: sessionFixture, epoch: fixture.store },
				fixture.target,
			);

			expect(result.link).toMatchObject({
				state: "executable",
				threadId: wanted.id,
				childId: fixture.authority.validator.childId,
				epoch: fixture.authority.validator.epoch,
				loaded: true,
				canAcceptDirectInput: true,
				reason: null,
			});
			expect(result.thread).toEqual(wanted);
			expect(result.proof).toEqual(fixture.proof);
			expect(sessionFixture.threadListRequests).toHaveLength(2);
			expect(sessionFixture.loadedListRequests).toEqual([
				{ cursor: null, limit: 100 },
				{ cursor: "loaded-page-2", limit: 100 },
			]);
			expect(sessionFixture.threadListRequests[0]).toMatchObject({
				cursor: null,
				limit: 100,
				sortKey: "recency_at",
				sortDirection: "desc",
				sourceKinds: ["cli", "vscode", "exec", "appServer"],
				archived: false,
				useStateDbOnly: false,
			});
		});
	});

	test("does not infer a target from recency or a loaded-only row", async () => {
		await withFixture({ threadId: "not-persisted" }, async (fixture) => {
			const recent = thread(fixture.authority, "recent", { status: "active" });
			const result = await classifyCodexThreadLink(
				{
					session: session(
						new Map([[null, threadPage([recent])]]),
						new Map([[null, loadedPage([fixture.target.threadId])]]),
					),
					epoch: fixture.store,
				},
				fixture.target,
			);
			expect(result.link).toMatchObject({
				state: "inspect_only",
				reason: "thread_list_missing",
				loaded: true,
			});
			expect(result.thread).toBeNull();
		});
	});

	test("refuses duplicate rows, duplicate membership, and repeated cursors", async () => {
		await withFixture({ threadId: "target" }, async (fixture) => {
			const row = thread(fixture.authority, "target");
			const duplicatePersisted = await classifyCodexThreadLink(
				{
					session: session(
						new Map([[null, threadPage([row, row])]]),
						new Map([[null, loadedPage([row.id])]]),
					),
					epoch: fixture.store,
				},
				fixture.target,
			);
			const duplicateLoaded = await classifyCodexThreadLink(
				{ session: onePageSession(row, [row.id, row.id]), epoch: fixture.store },
				fixture.target,
			);
			const persistedRepeat = await rejection(
				createCodexThreadLinkClassifier({
					session: session(
						new Map([
							[null, threadPage([row], "same")],
							["same", threadPage([], "same")],
						]),
						new Map([[null, loadedPage([row.id])]]),
					),
					epoch: fixture.store,
				}).classify(fixture.target),
			);
			const loadedRepeat = await rejection(
				createCodexThreadLinkClassifier({
					session: session(
						new Map([[null, threadPage([row])]]),
						new Map([
							[null, loadedPage([row.id], "same")],
							["same", loadedPage([], "same")],
						]),
					),
					epoch: fixture.store,
				}).classify(fixture.target),
			);

			expect(duplicatePersisted.link.reason).toBe("thread_list_ambiguous");
			expect(duplicateLoaded.link.reason).toBe("thread_loaded_list_ambiguous");
			expect(persistedRepeat.code).toBe("repeated_cursor");
			expect(loadedRepeat.code).toBe("repeated_cursor");
		});
	});

	test("refuses a target that disappears from loaded membership", async () => {
		await withFixture({ threadId: "disappeared" }, async (fixture) => {
			const row = thread(fixture.authority, "disappeared");
			const result = await classifyCodexThreadLink(
				{ session: onePageSession(row, []), epoch: fixture.store },
				fixture.target,
			);
			expect(result.link).toMatchObject({
				state: "inspect_only",
				reason: "thread_loaded_list_missing",
			});
		});
	});

	test("allows the four top-level sources and refuses nested source variants", async () => {
		await withFixture({}, async (fixture) => {
			for (const source of ["cli", "vscode", "exec", "appServer"] as const) {
				const row = thread(fixture.authority, "target", { source });
				const result = await classifyCodexThreadLink(
					{ session: onePageSession(row), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link).toMatchObject({ state: "executable", source });
			}
			for (const [source, reason] of [
				[{ custom: "integration" }, "thread_source_custom"],
				[{ subAgent: "review" }, "thread_source_subagent"],
				["unknown", "thread_source_unknown"],
			] as const) {
				const row = thread(fixture.authority, "target", { source });
				const result = await classifyCodexThreadLink(
					{ session: onePageSession(row), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link).toMatchObject({ state: "inspect_only", reason });
			}
		});
	});

	test("keeps notLoaded, systemError, false, and null capability refusals distinct", async () => {
		await withFixture({}, async (fixture) => {
			for (const [status, canAcceptDirectInput, reason] of [
				["notLoaded", true, "thread_status_not_loaded"],
				["systemError", true, "thread_status_system_error"],
				["idle", false, "direct_input_false"],
				["idle", null, "direct_input_unknown"],
			] as const) {
				const row = thread(fixture.authority, "target", { status, canAcceptDirectInput });
				const result = await classifyCodexThreadLink(
					{ session: onePageSession(row), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link).toMatchObject({ state: "inspect_only", reason });
			}
		});
	});

	test("returns stale-child and prior-epoch before lower list reasons", async () => {
		const oldAuthority = createIdentityAuthority();
		const fixture = realEpochFixture(oldAuthority, { threadId: "target" });
		try {
			const row = thread(oldAuthority, "target", {
				source: { custom: "foreign" },
				status: "systemError",
				canAcceptDirectInput: false,
			});
			const replacement = createIdentityAuthority();
			const stale = await classifyCodexThreadLink(
				{
					session: onePageSession(row, [row.id, row.id]),
					currentEpoch: currentEpoch(replacement),
					epoch: fixture.store,
				},
				fixture.target,
			);
			const sameChildNewEpoch = restoreIdentityAuthority({
				childId: oldAuthority.validator.childId,
				epoch: oldAuthority.issuer.mintChildEpoch(),
			});
			const prior = await classifyCodexThreadLink(
				{
					session: onePageSession(row, [row.id, row.id]),
					currentEpoch: currentEpoch(sameChildNewEpoch),
					epoch: fixture.store,
				},
				fixture.target,
			);
			expect(stale.link.reason).toBe("stale_child");
			expect(prior.link.reason).toBe("prior_epoch");
		} finally {
			fixture.cleanup();
		}
	});

	test("uses the authored thread-start condition, not a turn/start or alias kind", async () => {
		await withFixture(
			{
				operationId: "thread-loss",
				kind: "not-an-alias",
				rpc: "thread/start",
				unknownReason: "thread/start settlement was lost",
			},
			async (fixture) => {
				const result = await classifyCodexThreadLink(
					{ session: onePageSession(thread(fixture.authority, "target")), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link.reason).toBe("thread_start_outcome_unknown");
			},
		);
		await withFixture(
			{
				operationId: "turn-loss",
				kind: "create_thread_initial_turn",
				rpc: "turn/start",
				unknownReason: "The initial turn settlement was lost.",
			},
			async (fixture) => {
				const result = await classifyCodexThreadLink(
					{ session: onePageSession(thread(fixture.authority, "target")), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link.reason).toBe("unknown_provenance");
			},
		);
	});

	test("treats caller provenance as evidence and rejects stale, forged, and mismatched evidence", async () => {
		await withFixture({}, async (fixture) => {
			const row = thread(fixture.authority, "target");
			const options = { session: onePageSession(row), epoch: fixture.store };
			const missing = await classifyCodexThreadLink(options, targetWithoutAttachedProof(fixture));
			const missingRecord = await classifyCodexThreadLink(options, {
				...fixture.target,
				operationId: "missing-operation",
				provenance: null,
			});
			const staleAuthority = createIdentityAuthority();
			const stale = await classifyCodexThreadLink(
				{ ...options, currentEpoch: currentEpoch(staleAuthority) },
				fixture.target,
			);
			const forgedRevision = await classifyCodexThreadLink(options, {
				...fixture.target,
				provenance: { ...fixture.proof!, manifestRevision: fixture.proof!.manifestRevision + 1 },
			});
			const staleRecord = {
				...fixture.proof!.record,
				provenance: {
					...fixture.proof!.record.provenance,
					threadId: fixture.authority.decoder.adoptThreadId("other-thread"),
				},
			};
			const staleEvidence = await classifyCodexThreadLink(options, {
				...fixture.target,
				provenance: staleRecord,
			});
			const wrongStatus = {
				...fixture.proof!.record,
				status: "inspect_only" as const,
				outcome: "outcome_unknown" as const,
			};
			const mismatched = await classifyCodexThreadLink(options, {
				...fixture.target,
				provenance: wrongStatus,
			});
			const invalidOutcomePair = await classifyCodexThreadLink(options, {
				...fixture.target,
				provenance: {
					...fixture.proof!.record,
					status: "committed",
					outcome: "outcome_unknown",
				},
			});
			const malformed = await classifyCodexThreadLink(options, {
				...fixture.target,
				provenance: { record: { nope: true }, manifestRevision: 1 } as never,
			});

			expect(missing.link.state).toBe("executable");
			expect(missingRecord.link.reason).toBe("unknown_provenance");
			expect(stale.link.reason).toBe("stale_child");
			expect(forgedRevision.link.reason).toBe("unknown_provenance");
			expect(staleEvidence.link.reason).toBe("unknown_provenance");
			expect(mismatched.link.reason).toBe("unknown_provenance");
			expect(invalidOutcomePair.link.reason).toBe("unknown_provenance");
			expect(malformed.link.reason).toBe("unknown_provenance");
		});
	});

	test("returns inspect-only when no active epoch exists or the live epoch changes", async () => {
		const authority = createIdentityAuthority();
		const row = thread(authority, "stopped-child");
		const stopped = await classifyCodexThreadLink(
			{ session: onePageSession(row), currentEpoch: () => null },
			{ threadId: row.id, childId: authority.validator.childId, epoch: authority.validator.epoch },
		);
		expect(stopped.link).toMatchObject({ state: "inspect_only", reason: "unknown_provenance" });

		const replacement = createIdentityAuthority();
		let reads = 0;
		const moving = await classifyCodexThreadLink(
			{
				session: onePageSession(row),
				currentEpoch: () => {
					reads += 1;
					return reads === 1 ? currentEpoch(authority) : currentEpoch(replacement);
				},
			},
			{ threadId: row.id, childId: authority.validator.childId, epoch: authority.validator.epoch },
		);
		expect(moving.link.reason).toBe("stale_child");
		expect(reads).toBe(2);
	});

	test("fails classification when a page transport cannot be exhausted", async () => {
		await withFixture({}, async (fixture) => {
			const error = await rejection(
				classifyCodexThreadLink(
					{
						session: session(
							new Map([[null, new Error("session closed")]]),
							new Map([[null, loadedPage([])]]),
						),
						epoch: fixture.store,
					},
					fixture.target,
				),
			);
			expect(error.code).toBe("transport_failure");
		});
	});

	test("returns transitively immutable replacements of the observed thread", async () => {
		await withFixture({}, async (fixture) => {
			const source = { custom: "integration" };
			const nestedItem = { type: "userMessage", content: [{ type: "text", text: "hello" }] };
			const row = {
				...thread(fixture.authority, "target", { source }),
				turns: [
					{
						id: fixture.authority.decoder.adoptTurnId("turn-1"),
						items: [nestedItem],
					},
				],
			} as never;
			const result = await classifyCodexThreadLink(
				{ session: onePageSession(row), epoch: fixture.store },
				fixture.target,
			);

			source.custom = "mutated";
			nestedItem.content[0]!.text = "mutated";
			expect(result.thread).toMatchObject({
				source: { custom: "integration" },
				turns: [{ items: [{ content: [{ text: "hello" }] }] }],
			});
			expect(Object.isFrozen(result.thread)).toBe(true);
			expect(Object.isFrozen(result.thread?.source)).toBe(true);
			expect(Object.isFrozen(result.thread?.turns)).toBe(true);
			expect(Object.isFrozen(result.thread?.turns[0]?.items)).toBe(true);
			expect(Object.isFrozen(result.link)).toBe(true);
			expect(Object.isFrozen(result.observation)).toBe(true);
			expect(Object.isFrozen(result.proof)).toBe(true);
		});
	});
});
