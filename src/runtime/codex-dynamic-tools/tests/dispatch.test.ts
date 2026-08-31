import { describe, expect, test } from "bun:test";

import { createCodexDynamicTools, decodeDynamicCursor } from "../index.js";
import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import {
	CALLER_WIRE_ID,
	CHECKOUT_ROOT,
	FakeApproval,
	dynamicDecision,
	optionsFor,
	requestFor,
	setupAuthorities,
	thread,
	threadForkResult,
	threadStartResult,
	turn,
	turnResult,
} from "./support.js";

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("fixture expected an object");
	return Object.fromEntries(Object.entries(value));
}

describe("codex dynamic dispatcher", () => {
	test("creates a thread and initial turn with the authored bodies", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const createdThread = thread(authorities, "created-thread");
		const createdTurn = turn(authorities, "created-turn");
		fixture.session.threadStartResult = threadStartResult(createdThread);
		fixture.session.turnStartResult = turnResult(createdTurn);
		const request = requestFor(authorities, caller, "create_thread", { prompt: "create it" });
		const tools = createCodexDynamicTools(fixture.options);

		const response = await tools.dispatch(request);
		const parsed = parseDynamicToolCallResponse("create_thread", response);
		const createEnvelope = record(parsed.envelope);
		if (createEnvelope.tag !== "ok") throw new Error("create fixture did not succeed");
		const createValue = record(createEnvelope.value);
		const createInitialTurn = record(createValue.initialTurn);
		if (createInitialTurn.delivery !== "delivered")
			throw new Error("create fixture did not deliver its initial turn");

		expect(createValue.threadId).toBe(String(createdThread.id));
		expect(createInitialTurn.turnId).toBe(String(createdTurn.id));
		expect(fixture.session.calls.map(({ method }) => method)).toEqual([
			"thread/start",
			"turn/start",
		]);
		expect(fixture.session.calls[0]?.params).toEqual({
			cwd: CHECKOUT_ROOT,
			runtimeWorkspaceRoots: [CHECKOUT_ROOT],
			serviceName: "archboard",
			developerInstructions: expect.any(String),
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: "archboard",
			dynamicTools: expect.any(Array),
			experimentalRawEvents: false,
		});
		const turnParams = record(fixture.session.calls[1]?.params);
		const additionalContext = record(turnParams.additionalContext);
		const archboardContext = record(additionalContext.archboard);
		if (typeof turnParams.clientUserMessageId !== "string")
			throw new Error("create fixture did not send an operation identity");
		expect(turnParams.threadId).toBe(createdThread.id);
		expect(turnParams.input).toEqual([{ type: "text", text: "create it", text_elements: [] }]);
		expect(turnParams.turnTrigger).toBe("archboard");
		expect(archboardContext.kind).toBe("application");
		expect(archboardContext.value).toContain(`"id":"${turnParams.clientUserMessageId}"`);
		expect(fixture.approval.presented).toHaveLength(1);
		expect(fixture.epoch.stages).toHaveLength(2);
		expect(fixture.epoch.settlements.map(({ outcome }) => outcome)).toEqual([
			"delivered",
			"delivered",
		]);
		expect(fixture.operationIds.consumed).toHaveLength(2);
		expect(fixture.operationIds.retired).toHaveLength(0);
		for (const operationId of fixture.operationIds.consumed)
			expect(() => fixture.operationIds.validateCurrentUnconsumedOperationId(operationId)).toThrow(
				/terminal/,
			);
		const unrelatedOperationId = fixture.operationIds.issueCanonicalOperationId();
		expect(() =>
			fixture.operationIds.validateCurrentUnconsumedOperationId(unrelatedOperationId),
		).not.toThrow();
		fixture.operationIds.retireCanonicalOperationId(unrelatedOperationId);
		expect(fixture.lifecycle.assertions).toEqual([
			"before_approval",
			"after_approval",
			"before_effect",
			"before_effect",
		]);
		expect(fixture.transportResponses).toHaveLength(1);
	});

	test("self-fork ignores the caller boundary and uses the executing turn id", async () => {
		const { authorities, caller, selfTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(CALLER_WIRE_ID, selfTarget);
		fixture.threadAuthority.boundary = caller.turnId;
		const forkedThread = thread(authorities, "forked-thread");
		fixture.session.threadForkResult = threadForkResult(forkedThread);
		fixture.session.turnStartResult = turnResult(turn(authorities, "forked-turn"));
		const request = requestFor(authorities, caller, "fork_thread", {
			threadId: CALLER_WIRE_ID,
			beforeTurnId: "caller-supplied-boundary",
			prompt: "continue here",
		});

		const response = await createCodexDynamicTools(fixture.options).dispatch(request);
		const parsed = parseDynamicToolCallResponse("fork_thread", response);
		if (parsed.envelope.tag !== "ok") throw new Error("self-fork fixture did not succeed");
		const forkParams = record(
			fixture.session.calls.find(({ method }) => method === "thread/fork")?.params,
		);

		expect(forkParams.threadId).toBe(caller.threadId);
		expect(forkParams.beforeTurnId).toBe(caller.turnId);
		expect(forkParams.beforeTurnId).not.toBe("caller-supplied-boundary");
		expect(record(parsed.envelope).value).toMatchObject({ threadId: String(forkedThread.id) });
	});

	test("approval_required is terminal and declined approval has no effect", async () => {
		const { authorities, caller } = setupAuthorities();
		const cancelledApproval = new FakeApproval((request) =>
			dynamicDecision(request, { outcome: "cancelled", cause: "call_cancelled" }, 100),
		);
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval });
		const request = requestFor(authorities, caller, "create_thread", { prompt: "wait for me" });

		const tools = createCodexDynamicTools(fixture.options);
		const first = await tools.dispatch(request);
		const second = await tools.dispatch(request);
		const parsed = parseDynamicToolCallResponse("create_thread", first);
		if (parsed.envelope.tag !== "approval_required")
			throw new Error("cancelled approval did not remain terminal");
		expect(second).toBe(first);
		expect(cancelledApproval.presented).toHaveLength(1);
		expect(cancelledApproval.settled).toHaveLength(1);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
		expect(fixture.operationIds.retired).toHaveLength(2);
		expect(fixture.operationIds.consumed).toHaveLength(0);
		for (const operationId of fixture.operationIds.retired)
			expect(() => fixture.operationIds.validateCurrentUnconsumedOperationId(operationId)).toThrow(
				/terminal/,
			);
		expect(fixture.transportResponses).toHaveLength(1);

		const declinedApproval = new FakeApproval((approval) =>
			dynamicDecision(approval, { outcome: "declined", cause: "person_declined" }, 100),
		);
		const declinedFixture = optionsFor(authorities, caller, { approval: declinedApproval });
		const declined = await createCodexDynamicTools(declinedFixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "no" }, "declined"),
		);
		const declinedParsed = parseDynamicToolCallResponse("create_thread", declined);
		if (declinedParsed.envelope.tag !== "refused") throw new Error("decline was not a refusal");
		expect(declinedParsed.envelope.reason).toBe("approval_declined");
		expect(declinedFixture.session.calls).toHaveLength(0);
		expect(declinedFixture.epoch.stages).toHaveLength(0);
		expect(declinedFixture.operationIds.retired).toHaveLength(2);
		expect(declinedFixture.operationIds.consumed).toHaveLength(0);
	});

	test("preserves confirmed thread identity when the initial turn is rejected or uncertain", async () => {
		const { authorities, caller } = setupAuthorities();
		const rejected = optionsFor(authorities, caller);
		const rejectedThread = thread(authorities, "rejected-thread");
		rejected.session.threadStartResult = threadStartResult(rejectedThread);
		rejected.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"not_delivered",
			"turn was rejected",
		);
		const rejectedResponse = await createCodexDynamicTools(rejected.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "rejected" }, "rejected"),
		);
		const rejectedParsed = parseDynamicToolCallResponse("create_thread", rejectedResponse);
		if (rejectedParsed.envelope.tag !== "ok") throw new Error("rejected create was not returned");
		expect(record(rejectedParsed.envelope).value).toMatchObject({
			threadId: String(rejectedThread.id),
			initialTurn: { delivery: "not_delivered" },
		});

		const uncertain = optionsFor(authorities, caller);
		const uncertainThread = thread(authorities, "uncertain-thread");
		uncertain.session.threadStartResult = threadStartResult(uncertainThread);
		uncertain.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"outcome_unknown",
			"turn settlement was lost",
		);
		const uncertainResponse = await createCodexDynamicTools(uncertain.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "uncertain" }, "uncertain"),
		);
		const uncertainParsed = parseDynamicToolCallResponse("create_thread", uncertainResponse);
		if (uncertainParsed.envelope.tag !== "ok") throw new Error("uncertain create was not returned");
		expect(record(uncertainParsed.envelope).value).toMatchObject({
			threadId: String(uncertainThread.id),
			state: "inspect_only",
			initialTurn: { delivery: "outcome_unknown" },
		});
		expect(rejected.operationIds.consumed).toHaveLength(2);
		expect(rejected.operationIds.retired).toHaveLength(0);
		expect(uncertain.operationIds.consumed).toHaveLength(2);
		expect(uncertain.operationIds.retired).toHaveLength(0);
	});

	test("sends one idle-target turn and never retries an uncertain response", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.turnStartResult = turnResult(turn(authorities, "sent-turn"));
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "send once",
			}),
		);
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);
		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: { threadId: otherTarget.wireThreadId, delivery: "delivered" },
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual(["turn/start"]);
		expect(fixture.session.calls[0]?.params).toMatchObject({
			threadId: otherTarget.threadId,
			input: [{ type: "text", text: "send once", text_elements: [] }],
			turnTrigger: "archboard",
		});
		expect(fixture.epoch.stages).toHaveLength(1);
		expect(fixture.epoch.settlements).toHaveLength(1);
		expect(fixture.lifecycle.assertions).toEqual([
			"before_approval",
			"after_approval",
			"before_effect",
		]);

		const uncertain = optionsFor(authorities, caller);
		uncertain.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		uncertain.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"outcome_unknown",
			"send settlement was lost",
		);
		const uncertainResponse = await createCodexDynamicTools(uncertain.options).dispatch(
			requestFor(
				authorities,
				caller,
				"send_message_to_thread",
				{
					threadId: otherTarget.wireThreadId,
					prompt: "send once",
				},
				"send-uncertain",
			),
		);
		const uncertainParsed = parseDynamicToolCallResponse(
			"send_message_to_thread",
			uncertainResponse,
		);
		expect(uncertainParsed.envelope).toMatchObject({ tag: "outcome_unknown" });
		expect(uncertain.session.calls).toHaveLength(1);
		expect(uncertain.epoch.settlements.map(({ outcome }) => outcome)).toEqual(["outcome_unknown"]);
	});

	test("stale post-approval caller revalidation refuses before a remote mutation", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.revalidateCallerError = Object.assign(
			new Error("child epoch changed"),
			{ code: "stale_child" },
		);
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "stale" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);
		if (parsed.envelope.tag !== "refused") throw new Error("stale call was not refused");
		expect(parsed.envelope.reason).toBe("stale_child");
		expect(response.success).toBe(true);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
		expect(fixture.operationIds.retired).toHaveLength(2);
		expect(fixture.operationIds.consumed).toHaveLength(0);
	});

	test("invalid envelope is a failed boundary response and transport is attempted once", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const request = requestFor(authorities, caller, "list_threads", {});
		const invalidRequest = {
			...request,
			params: { ...request.params, unexpected: true },
		};

		const response = await createCodexDynamicTools(fixture.options).dispatch(invalidRequest);
		const parsed = parseDynamicToolCallResponse("list_threads", response);
		if (parsed.envelope.tag !== "refused") throw new Error("invalid envelope was not refused");
		expect(response.success).toBe(false);
		expect(parsed.envelope.reason).toBe("invalid_call");
		expect(fixture.transportResponses).toHaveLength(1);
		expect(fixture.transportResponses[0]?.owner).toBe("codex-dynamic-tools");
	});

	test("list response cursor is opaque and bound to the caller epoch and query", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.threadListPages.set(null, {
			data: [otherTarget.linkClassification!.thread!],
			nextCursor: "server-next",
			backwardsCursor: null,
		});
		fixture.session.loadedListPages.set(null, { data: [otherTarget.threadId], nextCursor: null });
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "list_threads", { limit: 1 }),
		);
		const parsed = parseDynamicToolCallResponse("list_threads", response);
		expect(parsed.envelope).toMatchObject({ tag: "ok" });
		const cursor = record(record(parsed.envelope).value).nextCursor;
		if (typeof cursor !== "string") throw new Error("list fixture did not return its next cursor");
		const binding = decodeDynamicCursor(cursor);

		expect(binding.method).toBe("thread/list");
		expect(binding.direction).toBe("desc");
		expect(binding.child).toBe(String(caller.childId));
		expect(binding.epoch).toBe(String(caller.epoch));
		expect(JSON.parse(binding.query)).toEqual({ limit: 1 });
		expect(fixture.session.calls[0]?.params).toEqual({
			cursor: null,
			limit: 1,
			sortKey: "recency_at",
			sortDirection: "desc",
			sourceKinds: ["cli", "vscode", "exec", "appServer"],
			archived: false,
			useStateDbOnly: false,
		});
		expect(fixture.session.calls[1]?.params).toEqual({ cursor: null, limit: 100 });
	});

	test("read exhausts authority pages and fetches one item page per returned turn", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.threadListPages.set(null, {
			data: [otherTarget.linkClassification!.thread!],
			nextCursor: null,
			backwardsCursor: null,
		});
		fixture.session.loadedListPages.set(null, { data: [otherTarget.threadId], nextCursor: null });
		const returnedTurn = turn(authorities, "read-turn");
		fixture.session.turnsPages.set(null, {
			data: [returnedTurn],
			nextCursor: null,
			backwardsCursor: null,
		});
		fixture.session.itemPages.set(String(returnedTurn.id), {
			data: [],
			nextCursor: null,
			backwardsCursor: null,
		});

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "read_thread", {
				threadId: otherTarget.wireThreadId,
				turnLimit: 1,
				includeOutputs: true,
			}),
		);
		const parsed = parseDynamicToolCallResponse("read_thread", response);
		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: {
				threadId: otherTarget.wireThreadId,
				turns: [
					{
						turnId: String(returnedTurn.id),
						status: "completed",
						summary: "completed · user: hello from fixture · assistant: none",
						outputsIncluded: true,
						outputsTruncated: false,
					},
				],
				nextCursor: null,
			},
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual([
			"thread/list",
			"thread/loaded/list",
			"thread/turns/list",
			"thread/items/list",
		]);
		expect(fixture.session.calls[0]?.params).toEqual({
			cursor: null,
			limit: 100,
			sortKey: "recency_at",
			sortDirection: "desc",
			sourceKinds: ["cli", "vscode", "exec", "appServer"],
			archived: false,
			useStateDbOnly: false,
		});
		expect(fixture.session.calls[1]?.params).toEqual({ cursor: null, limit: 100 });
		expect(fixture.session.calls[2]?.params).toEqual({
			threadId: otherTarget.threadId,
			cursor: null,
			limit: 1,
			sortDirection: "desc",
			itemsView: "summary",
		});
		expect(fixture.session.calls[3]?.params).toEqual({
			threadId: otherTarget.threadId,
			turnId: returnedTurn.id,
			cursor: null,
			limit: 100,
			sortDirection: "asc",
		});

		const noOutputs = optionsFor(authorities, caller);
		noOutputs.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		noOutputs.session.threadListPages.set(null, {
			data: [otherTarget.linkClassification!.thread!],
			nextCursor: null,
			backwardsCursor: null,
		});
		noOutputs.session.loadedListPages.set(null, { data: [otherTarget.threadId], nextCursor: null });
		noOutputs.session.turnsPages.set(null, {
			data: [returnedTurn],
			nextCursor: null,
			backwardsCursor: null,
		});
		await createCodexDynamicTools(noOutputs.options).dispatch(
			requestFor(
				authorities,
				caller,
				"read_thread",
				{
					threadId: otherTarget.wireThreadId,
					includeOutputs: false,
				},
				"read-no-outputs",
			),
		);
		expect(noOutputs.session.calls.map(({ method }) => method)).toEqual([
			"thread/list",
			"thread/loaded/list",
			"thread/turns/list",
		]);
	});
});
