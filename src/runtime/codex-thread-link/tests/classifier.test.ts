import { describe, expect, test } from "bun:test";

import {
	CodexThreadLinkError,
	classifyCodexThreadLink,
	createCodexThreadLinkClassifier,
} from "../index.ts";
import {
	createIdentityAuthority,
	restoreIdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.ts";
import {
	currentEpoch,
	loadedPage,
	operationRecord,
	session,
	thread,
	threadPage,
	target,
	type ScriptedSession,
} from "./fixtures.ts";

function onePageSession(
	row: ReturnType<typeof thread>,
	loadedIds: readonly string[] = [row.id],
): ScriptedSession {
	return session(new Map([[null, threadPage([row])]]), new Map([[null, loadedPage(loadedIds)]]));
}

function ownedTarget(
	authority: ReturnType<typeof createIdentityAuthority>,
	rawThreadId = "target",
	operationId = "link-1",
	options: Parameters<typeof operationRecord>[3] = {},
) {
	const threadId = authority.decoder.adoptThreadId(rawThreadId);
	const record = operationRecord(authority, threadId, operationId, options);
	return target(authority, rawThreadId, { operationId, provenance: record });
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
		const authority = createIdentityAuthority();
		const other = thread(authority, "other");
		const wanted = thread(authority, "wanted");
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
			{ session: sessionFixture, currentEpoch: currentEpoch(authority) },
			ownedTarget(authority, "wanted"),
		);

		expect(result.link).toMatchObject({
			state: "executable",
			threadId: wanted.id,
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		});
		expect(result.thread).toBe(wanted);
		expect(sessionFixture.threadListRequests).toEqual([
			{
				cursor: null,
				limit: 100,
				sortKey: "recency_at",
				sortDirection: "desc",
				sourceKinds: ["cli", "vscode", "exec", "appServer"],
				archived: false,
				useStateDbOnly: false,
			},
			{
				cursor: "thread-page-2",
				limit: 100,
				sortKey: "recency_at",
				sortDirection: "desc",
				sourceKinds: ["cli", "vscode", "exec", "appServer"],
				archived: false,
				useStateDbOnly: false,
			},
		]);
		expect(sessionFixture.loadedListRequests).toEqual([
			{ cursor: null, limit: 100 },
			{ cursor: "loaded-page-2", limit: 100 },
		]);
	});

	test("does not infer a target from recency or a loaded-only row", async () => {
		const authority = createIdentityAuthority();
		const recent = thread(authority, "recent", { status: "active" });
		const targetId = authority.decoder.adoptThreadId("not-persisted");
		const result = await classifyCodexThreadLink(
			{
				session: session(
					new Map([[null, threadPage([recent])]]),
					new Map([[null, loadedPage([targetId])]]),
				),
				currentEpoch: currentEpoch(authority),
			},
			ownedTarget(authority, "not-persisted"),
		);

		expect(result.link.state).toBe("inspect_only");
		expect(result.link.reason).toBe("thread_list_missing");
		expect(result.link.loaded).toBe(true);
		expect(result.thread).toBeNull();
	});

	test("refuses duplicate rows and duplicate loaded membership", async () => {
		const authority = createIdentityAuthority();
		const wanted = thread(authority, "duplicate");
		const duplicateSession = session(
			new Map([[null, threadPage([wanted, wanted])]]),
			new Map([[null, loadedPage([wanted.id])]]),
		);
		const duplicatePersisted = await classifyCodexThreadLink(
			{ session: duplicateSession, currentEpoch: currentEpoch(authority) },
			ownedTarget(authority, "duplicate"),
		);
		const duplicateLoaded = await classifyCodexThreadLink(
			{
				session: session(
					new Map([[null, threadPage([wanted])]]),
					new Map([[null, loadedPage([wanted.id, wanted.id])]]),
				),
				currentEpoch: currentEpoch(authority),
			},
			ownedTarget(authority, "duplicate"),
		);

		expect(duplicatePersisted.link.reason).toBe("thread_list_ambiguous");
		expect(duplicateLoaded.link.reason).toBe("thread_loaded_list_ambiguous");
	});

	test("detects repeated cursors and malformed exhaustion pages", async () => {
		const authority = createIdentityAuthority();
		const wanted = thread(authority, "cursor-target");
		const persistedRepeat = await rejection(
			createCodexThreadLinkClassifier({
				session: session(
					new Map([
						[null, threadPage([wanted], "same")],
						["same", threadPage([], "same")],
					]),
					new Map([[null, loadedPage([wanted.id])]]),
				),
				currentEpoch: currentEpoch(authority),
			}).classify(ownedTarget(authority, "cursor-target")),
		);
		const loadedRepeat = await rejection(
			createCodexThreadLinkClassifier({
				session: session(
					new Map([[null, threadPage([wanted])]]),
					new Map([
						[null, loadedPage([wanted.id], "same")],
						["same", loadedPage([], "same")],
					]),
				),
				currentEpoch: currentEpoch(authority),
			}).classify(ownedTarget(authority, "cursor-target")),
		);
		const malformed = await rejection(
			createCodexThreadLinkClassifier({
				session: session(
					new Map([[null, { data: [], nextCursor: 7 } as never]]),
					new Map([[null, loadedPage([wanted.id])]]),
				),
				currentEpoch: currentEpoch(authority),
			}).classify(ownedTarget(authority, "cursor-target")),
		);

		expect(persistedRepeat.code).toBe("repeated_cursor");
		expect(loadedRepeat.code).toBe("repeated_cursor");
		expect(malformed.code).toBe("list_exhaustion_failure");
	});

	test("refuses a target that disappears from loaded membership", async () => {
		const authority = createIdentityAuthority();
		const wanted = thread(authority, "disappeared");
		const result = await classifyCodexThreadLink(
			{ session: onePageSession(wanted, []), currentEpoch: currentEpoch(authority) },
			ownedTarget(authority, "disappeared"),
		);

		expect(result.link).toMatchObject({
			state: "inspect_only",
			reason: "thread_loaded_list_missing",
		});
		expect(result.observation).toMatchObject({ persisted: true, loaded: false });
	});

	test("allows exactly the four top-level sources", async () => {
		const authority = createIdentityAuthority();
		for (const source of ["cli", "vscode", "exec", "appServer"] as const) {
			const row = thread(authority, `source-${source}`, { source });
			const result = await classifyCodexThreadLink(
				{ session: onePageSession(row), currentEpoch: currentEpoch(authority) },
				ownedTarget(authority, `source-${source}`),
			);
			expect(result.link.state).toBe("executable");
			expect(result.link.source).toBe(source);
		}
	});

	test("gives custom, subagent, and unknown sources distinct reasons", async () => {
		const authority = createIdentityAuthority();
		const cases = [
			[{ custom: "integration" }, "thread_source_custom"],
			[{ subAgent: "review" }, "thread_source_subagent"],
			["unknown", "thread_source_unknown"],
		] as const;
		for (const [source, expectedReason] of cases) {
			const rawId = `refused-${expectedReason}`;
			const row = thread(authority, rawId, { source });
			const result = await classifyCodexThreadLink(
				{ session: onePageSession(row), currentEpoch: currentEpoch(authority) },
				ownedTarget(authority, rawId),
			);
			expect(result.link).toMatchObject({ state: "inspect_only", reason: expectedReason });
		}
	});

	test("keeps status and direct-input refusals distinct", async () => {
		const authority = createIdentityAuthority();
		const cases = [
			["notLoaded", true, "thread_status_not_loaded"],
			["systemError", true, "thread_status_system_error"],
			["idle", false, "direct_input_false"],
			["idle", null, "direct_input_unknown"],
		] as const;
		for (const [status, canAcceptDirectInput, expectedReason] of cases) {
			const rawId = `status-${expectedReason}`;
			const row = thread(authority, rawId, { status, canAcceptDirectInput });
			const result = await classifyCodexThreadLink(
				{ session: onePageSession(row), currentEpoch: currentEpoch(authority) },
				ownedTarget(authority, rawId),
			);
			expect(result.link).toMatchObject({ state: "inspect_only", reason: expectedReason });
		}
	});

	test("reports missing persisted rows before join or capability state", async () => {
		const authority = createIdentityAuthority();
		const rawId = "absent";
		const id = authority.decoder.adoptThreadId(rawId);
		const result = await classifyCodexThreadLink(
			{
				session: session(new Map([[null, threadPage([])]]), new Map([[null, loadedPage([id])]])),
				currentEpoch: currentEpoch(authority),
			},
			ownedTarget(authority, rawId),
		);

		expect(result.link.reason).toBe("thread_list_missing");
		expect(result.observation).toMatchObject({ persisted: false, loaded: true });
	});

	test("returns stale-child and prior-epoch reasons before all join reasons", async () => {
		const oldAuthority = createIdentityAuthority();
		const oldRow = thread(oldAuthority, "old-thread");
		const replacement = createIdentityAuthority();
		const stale = await classifyCodexThreadLink(
			{ session: onePageSession(oldRow), currentEpoch: currentEpoch(replacement) },
			ownedTarget(oldAuthority, "old-thread"),
		);

		const sameChildNewEpoch = restoreIdentityAuthority({
			childId: oldAuthority.validator.childId,
			epoch: oldAuthority.issuer.mintChildEpoch(),
		});
		const prior = await classifyCodexThreadLink(
			{ session: onePageSession(oldRow), currentEpoch: currentEpoch(sameChildNewEpoch) },
			ownedTarget(oldAuthority, "old-thread"),
		);

		expect(stale.link.reason).toBe("stale_child");
		expect(prior.link.reason).toBe("prior_epoch");
	});

	test("marks absent provenance and outcome-unknown creation inspect-only", async () => {
		const authority = createIdentityAuthority();
		const row = thread(authority, "unknown-provenance");
		const missing = await classifyCodexThreadLink(
			{ session: onePageSession(row), currentEpoch: currentEpoch(authority) },
			target(authority, "unknown-provenance"),
		);
		const unknownStartRow = thread(authority, "unknown-start");
		const unknownStart = await classifyCodexThreadLink(
			{ session: onePageSession(unknownStartRow), currentEpoch: currentEpoch(authority) },
			ownedTarget(authority, "unknown-start", "start-unknown", {
				kind: "create_thread_initial_turn",
				outcome: "outcome_unknown",
				provenanceThreadId: null,
			}),
		);
		const ordinaryUnknownRow = thread(authority, "ordinary-unknown");
		const ordinaryUnknown = await classifyCodexThreadLink(
			{ session: onePageSession(ordinaryUnknownRow), currentEpoch: currentEpoch(authority) },
			ownedTarget(authority, "ordinary-unknown", "message-unknown", {
				kind: "send_message_to_thread",
				outcome: "outcome_unknown",
				provenanceThreadId: null,
			}),
		);

		expect(missing.link.reason).toBe("unknown_provenance");
		expect(unknownStart.link).toMatchObject({
			state: "inspect_only",
			reason: "thread_start_outcome_unknown",
		});
		expect(ordinaryUnknown.link.reason).toBe("unknown_provenance");
	});

	test("does not call an absent active epoch stale or executable", async () => {
		const authority = createIdentityAuthority();
		const row = thread(authority, "stopped-child");
		const result = await classifyCodexThreadLink(
			{ session: onePageSession(row), currentEpoch: () => null },
			ownedTarget(authority, "stopped-child"),
		);

		expect(result.link).toMatchObject({
			state: "inspect_only",
			childId: null,
			epoch: null,
			reason: "unknown_provenance",
		});
	});

	test("refuses a live epoch that changes while the lists are exhausted", async () => {
		const authority = createIdentityAuthority();
		const replacement = createIdentityAuthority();
		const row = thread(authority, "moving-target");
		let reads = 0;
		const result = await classifyCodexThreadLink(
			{
				session: onePageSession(row),
				currentEpoch: () => {
					reads += 1;
					return reads === 1 ? currentEpoch(authority) : currentEpoch(replacement);
				},
			},
			ownedTarget(authority, "moving-target"),
		);

		expect(result.link.reason).toBe("stale_child");
		expect(reads).toBe(2);
	});

	test("fails classification when a page transport cannot be exhausted", async () => {
		const authority = createIdentityAuthority();
		const error = await rejection(
			classifyCodexThreadLink(
				{
					session: session(
						new Map([[null, new Error("session closed")]]),
						new Map([[null, loadedPage([])]]),
					),
					currentEpoch: currentEpoch(authority),
				},
				ownedTarget(authority),
			),
		);

		expect(error.code).toBe("transport_failure");
	});
});
