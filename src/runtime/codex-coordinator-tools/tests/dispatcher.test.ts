import { describe, expect, test } from "bun:test";

import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	COORDINATOR_TOOL_MANIFEST_DIGESTS,
	DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	DynamicToolResponseSchema,
	UnknownDynamicToolResponseSchema,
} from "../../codex-coordinator-tool-contract/index.js";
import {
	approvalRequiredResponse,
	COORDINATOR_DYNAMIC_DISPATCHERS,
	okResponse,
	outcomeUnknownResponse,
	parseResponseText,
	refusedResponse,
	type CoordinatorToolsServerRequest,
	type DynamicToolResponse,
} from "../index.js";
import {
	fixture,
	nextMicrotasks,
	responseEnvelope,
	responseValue,
	type CoordinatorToolsFixture,
} from "./support.js";

function dispatch(
	fixtureValue: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return fixtureValue.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

function envelope(response: DynamicToolResponse): Record<string, unknown> {
	return responseEnvelope(response);
}

function validateResponse(response: DynamicToolResponse): void {
	if (response.success) DynamicToolResponseSchema.parse(response);
	else UnknownDynamicToolResponseSchema.parse(response);
}

describe("coordinator dynamic-tool dispatcher", () => {
	test("publishes the two reviewed dispatcher registrations", () => {
		expect(COORDINATOR_DYNAMIC_DISPATCHERS).toEqual([
			{
				owner: "codex-coordinator-tools",
				namespace: "archboard_workhorse",
				manifestHash: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
			},
			{
				owner: "codex-coordinator-tools",
				namespace: "archboard_voice",
				manifestHash: ARCHBOARD_VOICE_MANIFEST_SHA256,
			},
		]);
		expect(COORDINATOR_TOOL_MANIFEST_DIGESTS).toEqual({
			workhorse: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
			voice: ARCHBOARD_VOICE_MANIFEST_SHA256,
		});
		expect(ARCHBOARD_WORKHORSE_TOOL_NAMES).toHaveLength(4);
		expect(ARCHBOARD_VOICE_TOOL_NAMES).toEqual(["resolve_spoken_approval"]);
	});

	test("routes every workhorse tool through its matching operation port", async () => {
		const h = fixture();
		const inspectRequest = h.request("inspect_workhorse");
		const inspect = await dispatch(h, inspectRequest);
		const delegateRequest = h.request("delegate_to_workhorse");
		const delegate = await dispatch(h, delegateRequest);
		const queueRequest = h.request("manage_workhorse_queue", {
			arguments: { operation: "update", submissionId: "submission-1", prompt: "updated prompt" },
		});
		const queue = await dispatch(h, queueRequest);
		const steerRequest = h.request("steer_workhorse");
		const steer = await dispatch(h, steerRequest);

		expect(inspect.attempted).toBe(true);
		expect(delegate.attempted).toBe(true);
		expect(queue.attempted).toBe(true);
		expect(steer.attempted).toBe(true);
		expect(h.operations.calls.inspect).toHaveLength(1);
		expect(h.operations.calls.inspect[0]).toMatchObject({ call: inspectRequest.logicalCall });
		expect(h.operations.calls.delegate[0]).toMatchObject({
			call: delegateRequest.logicalCall,
			input: "delegate input",
			transcriptDelta: "spoken context",
		});
		expect(h.operations.calls.manageQueue[0]).toMatchObject({
			call: queueRequest.logicalCall,
			operation: "update",
			submissionId: "submission-1",
			prompt: "updated prompt",
		});
		expect(h.operations.calls.steer[0]).toMatchObject({
			call: steerRequest.logicalCall,
			expectedTurnId: h.expectedTurnId,
			input: "steer input",
		});
		expect(envelope(inspect.response)).toEqual({
			tag: "ok",
			operationId: `operation-${String(inspectRequest.requestId)}`,
			value: {
				threadId: h.workhorseThreadId,
				status: "idle",
				activeTurnId: null,
				queuedSubmissionIds: [],
			},
		});
		expect(envelope(delegate.response)).toMatchObject({
			tag: "ok",
			value: {
				mode: "started",
				clientUserMessageId: "client-user-message",
				queuedSubmissionId: null,
				turnId: h.expectedTurnId,
			},
		});
		expect(envelope(queue.response)).toMatchObject({
			tag: "ok",
			value: { operation: "update", queuedSubmissionIds: [] },
		});
		expect(envelope(steer.response)).toEqual({
			tag: "ok",
			operationId: `operation-${String(steerRequest.requestId)}`,
			value: { turnId: h.expectedTurnId, delivery: "delivered" },
		});
		expect(h.transport.writes).toHaveLength(4);
		expect(h.timeline).toEqual([
			"workhorse.inspect",
			"transport.respond",
			"workhorse.delegate",
			"transport.respond",
			"workhorse.manageQueue",
			"transport.respond",
			"workhorse.steer",
			"transport.respond",
		]);
	});

	test("routes voice only through the spoken gate and preserves its settlement", async () => {
		const h = fixture();
		const request = h.request("resolve_spoken_approval", {
			arguments: { verdict: "decline" },
		});
		h.spokenApproval.setResult({
			tag: "ok",
			value: { verdict: "decline", settlement: "outcome_unknown" },
		});
		const result = await dispatch(h, request);

		expect(result.attempted).toBe(true);
		expect(h.spokenApproval.calls).toEqual([request]);
		expect(h.operations.calls.inspect).toHaveLength(0);
		expect(h.operations.calls.delegate).toHaveLength(0);
		expect(h.operations.calls.manageQueue).toHaveLength(0);
		expect(h.operations.calls.steer).toHaveLength(0);
		expect(envelope(result.response)).toEqual({
			tag: "ok",
			operationId: "classifier-operation",
			value: { verdict: "decline", settlement: "outcome_unknown" },
		});
		expect(h.timeline).toEqual(["voice.resolve", "transport.respond"]);
	});

	test("preserves gate refusals for later classifier, fallback, final-user, second-slot, and stale-session states", async () => {
		const cases = [
			["later classifier turn", "invalid_call"],
			["visual fallback", "unsupported"],
			["final-user authority", "unknown_provenance"],
			["second slot", "busy"],
			["stale realtime session", "unknown_provenance"],
		] as const;
		for (const [label, reason] of cases) {
			const h = fixture();
			const request = h.request("resolve_spoken_approval");
			h.spokenApproval.setResult({
				tag: "refused",
				reason,
				message: `${label} refused by the spoken gate`,
			});
			const result = await dispatch(h, request);
			validateResponse(result.response);
			expect(result.response.success).toBe(true);
			expect(envelope(result.response)).toMatchObject({ tag: "refused", reason });
			expect(h.operations.calls.inspect).toHaveLength(0);
			expect(h.transport.writes).toHaveLength(1);
		}
	});

	test("constructs canonical one-item envelopes for success, refusal, approval, and uncertainty", () => {
		const h = fixture();
		const ok = okResponse("inspect_workhorse", "operation-1", {
			threadId: h.workhorseThreadId,
			status: "idle",
			activeTurnId: null,
			queuedSubmissionIds: [],
		});
		const refused = refusedResponse("invalid_call", "bad identity", true);
		const approval = approvalRequiredResponse("operation-2", "Review the effect");
		const unknown = outcomeUnknownResponse("operation-3");
		for (const response of [ok, refused, approval, unknown]) {
			validateResponse(response);
			expect(response.contentItems).toHaveLength(1);
			expect(response.contentItems[0]?.type).toBe("inputText");
			expect(parseResponseText(response)).toEqual(response);
			expect(Object.isFrozen(response)).toBe(true);
		}
		expect(ok.success).toBe(true);
		expect(refused.success).toBe(false);
		expect(envelope(unknown)).toEqual({
			tag: "outcome_unknown",
			operationId: "operation-3",
			message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
		});
		expect(responseValue(approval)).toEqual({
			tag: "approval_required",
			operationId: "operation-2",
			summary: "Review the effect",
		});
	});

	test("writes one response attempt even when the transport rejects it", async () => {
		const h = fixture();
		h.transport.failWrites = true;
		const request = h.request("inspect_workhorse");
		const first = await dispatch(h, request);
		const second = await dispatch(h, request);
		expect(second).toBe(first);
		expect(h.operations.calls.inspect).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(1);
	});

	test("accepts the exhaustive transport listener without creating a second response", async () => {
		const h = fixture();
		const request = h.request("inspect_workhorse");
		h.dispatcher.onServerRequest(request);
		await nextMicrotasks();
		await nextMicrotasks();
		expect(h.operations.calls.inspect).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(1);
		expect(h.timeline).toEqual(["workhorse.inspect", "transport.respond"]);
	});
});
