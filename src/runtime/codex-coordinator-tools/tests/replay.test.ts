import { describe, expect, test } from "bun:test";

import { COORDINATOR_REPLAY_LIMITS, type CoordinatorToolsServerRequest } from "../index.js";
import type { DynamicServerRequest } from "../../codex-transport/index.js";
import {
	copyRequest,
	fixture,
	nextMicrotasks,
	responseEnvelope,
	type CoordinatorToolsFixture,
} from "./support.js";

function replayRequest(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
	label: string,
	argumentsValue: DynamicServerRequest["params"]["arguments"] = request.params.arguments,
): ReturnType<CoordinatorToolsFixture["request"]> {
	const requestId = h.identity.decoder.adoptJsonRpcRequestId(label);
	return {
		...copyRequest(request),
		requestId,
		correlation: h.identity.decoder.createWireRequestCorrelation({ requestId }),
		params: { ...request.params, arguments: argumentsValue },
	};
}

function dispatch(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return h.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

describe("coordinator logical replay ownership", () => {
	test("refuses changed delegate, queue, and voice input on only the alias wire", async () => {
		const delegate = fixture();
		const delegateOwner = delegate.request("delegate_to_workhorse");
		await dispatch(delegate, delegateOwner);
		const changedDelegate = await dispatch(
			delegate,
			replayRequest(delegate, delegateOwner, "changed-delegate", {
				input: "different delegate text",
				transcriptDelta: "spoken context",
			}),
		);
		expect(changedDelegate.response.success).toBe(false);
		expect(responseEnvelope(changedDelegate.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(delegate.operations.calls.delegate).toHaveLength(1);

		const queue = fixture();
		const queueOwner = queue.request("manage_workhorse_queue");
		await dispatch(queue, queueOwner);
		const changedQueue = await dispatch(
			queue,
			replayRequest(queue, queueOwner, "changed-queue", {
				operation: "add",
				prompt: "different queue operation",
			}),
		);
		expect(changedQueue.response.success).toBe(false);
		expect(responseEnvelope(changedQueue.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(queue.operations.calls.manageQueue).toHaveLength(1);

		const voice = fixture();
		const voiceOwner = voice.request("resolve_spoken_approval", {
			arguments: { verdict: "accept" },
		});
		await dispatch(voice, voiceOwner);
		const changedVoice = await dispatch(
			voice,
			replayRequest(voice, voiceOwner, "changed-voice", { verdict: "decline" }),
		);
		expect(changedVoice.response.success).toBe(false);
		expect(responseEnvelope(changedVoice.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(voice.spokenApproval.calls).toHaveLength(1);
	});

	test("normalizes exact parsed input before sharing one concurrent result", async () => {
		const h = fixture();
		h.operations.hold();
		const ownerRequest = h.request("delegate_to_workhorse");
		const aliasRequest = replayRequest(h, ownerRequest, "normalized-alias", {
			transcriptDelta: "spoken context",
			input: "delegate input",
		});
		const ownerPending = dispatch(h, ownerRequest);
		const aliasPending = dispatch(h, aliasRequest);
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.operations.release();
		const [owner, alias] = await Promise.all([ownerPending, aliasPending]);
		expect(alias.response).toEqual(owner.response);
		expect(h.transport.writes).toHaveLength(2);
	});

	test("bounds live aliases and tombstones one overflow refusal", async () => {
		const h = fixture();
		h.operations.hold();
		const ownerRequest = h.request("delegate_to_workhorse");
		const ownerPending = dispatch(h, ownerRequest);
		const aliasRequests = Array.from(
			{ length: COORDINATOR_REPLAY_LIMITS.aliasesPerLiveLogicalCall + 1 },
			(_, index) => replayRequest(h, ownerRequest, `bounded-live-alias-${index}`),
		);
		const aliases = aliasRequests.map((request) => dispatch(h, request));
		await nextMicrotasks();
		const overflowRequest = aliasRequests.at(-1)!;
		const overflow = await aliases.at(-1)!;
		expect(overflow.response.success).toBe(false);
		expect(responseEnvelope(overflow.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(h.dispatcher.replayState()).toMatchObject({
			liveWireCount: 1 + COORDINATOR_REPLAY_LIMITS.aliasesPerLiveLogicalCall,
			retainedWireCount: 1,
			liveLogicalCount: 1,
			retainedLogicalCount: 0,
		});
		const repeated = await dispatch(h, overflowRequest);
		const copied = await dispatch(h, copyRequest(overflowRequest));
		expect(repeated).toEqual(overflow);
		expect(copied).toEqual(overflow);
		expect(
			h.transport.writes.filter(({ request }) => request.requestId === overflowRequest.requestId),
		).toHaveLength(1);
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.operations.release();
		await Promise.all([ownerPending, ...aliases.slice(0, -1)]);
		const afterOwner = await dispatch(h, copyRequest(overflowRequest));
		expect(afterOwner).toEqual(overflow);
		expect(afterOwner.response).not.toEqual((await ownerPending).response);
		expect(
			h.transport.writes.filter(({ request }) => request.requestId === overflowRequest.requestId),
		).toHaveLength(1);
		expect(h.operations.calls.delegate).toHaveLength(1);
	});

	test("bounds compact wire tombstones and retains no large queue prompt", async () => {
		const h = fixture();
		const prompt = "q".repeat(16_384);
		const ownerRequest = h.request("manage_workhorse_queue", {
			arguments: { operation: "add", prompt },
		});
		await dispatch(h, ownerRequest);
		for (let index = 0; index <= COORDINATOR_REPLAY_LIMITS.retainedWireCalls; index++) {
			await dispatch(h, replayRequest(h, ownerRequest, `terminal-alias-${index}`));
		}

		expect(h.operations.calls.manageQueue).toHaveLength(1);
		expect(h.dispatcher.replayState()).toEqual({
			liveWireCount: 0,
			retainedWireCount: COORDINATOR_REPLAY_LIMITS.retainedWireCalls,
			liveLogicalCount: 0,
			retainedLogicalCount: 1,
			retainedFingerprintBytes: 64,
		});
	});

	test("caches success and refusal terminals inside the current-call window", async () => {
		const success = fixture();
		const successOwner = success.request("inspect_workhorse");
		const firstSuccess = await dispatch(success, successOwner);
		const lateSuccess = await dispatch(
			success,
			replayRequest(success, successOwner, "late-success"),
		);
		expect(lateSuccess.response).toEqual(firstSuccess.response);
		expect(success.operations.calls.inspect).toHaveLength(1);

		const refusal = fixture();
		refusal.operations.setError(new Error("read refused"));
		const refusalOwner = refusal.request("inspect_workhorse");
		const firstRefusal = await dispatch(refusal, refusalOwner);
		const lateRefusal = await dispatch(
			refusal,
			replayRequest(refusal, refusalOwner, "late-refusal"),
		);
		expect(lateRefusal.response).toEqual(firstRefusal.response);
		expect(refusal.operations.calls.inspect).toHaveLength(1);
	});

	test("evicts stale current-call terminals and never resurrects their effect", async () => {
		const h = fixture();
		const oldRequest = h.request("delegate_to_workhorse");
		await dispatch(h, oldRequest);
		expect(h.dispatcher.replayState().retainedLogicalCount).toBe(1);
		h.request("inspect_workhorse");
		const stale = await dispatch(h, replayRequest(h, oldRequest, "post-eviction-replay"));
		expect(stale.response.success).toBe(false);
		expect(responseEnvelope(stale.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(h.operations.calls.delegate).toHaveLength(1);
		expect(h.dispatcher.replayState().retainedLogicalCount).toBe(0);
	});

	test("clears epoch replay ownership on child exit and dispose", async () => {
		const child = fixture();
		await dispatch(child, child.request("inspect_workhorse"));
		child.dispatcher.onChildExit({
			child: child.identity.validator.childId,
			epoch: child.identity.validator.epoch,
		});
		expect(child.dispatcher.replayState()).toEqual({
			liveWireCount: 0,
			retainedWireCount: 0,
			liveLogicalCount: 0,
			retainedLogicalCount: 0,
			retainedFingerprintBytes: 0,
		});

		const disposed = fixture();
		await dispatch(disposed, disposed.request("inspect_workhorse"));
		disposed.dispatcher.dispose();
		expect(disposed.dispatcher.replayState()).toEqual({
			liveWireCount: 0,
			retainedWireCount: 0,
			liveLogicalCount: 0,
			retainedLogicalCount: 0,
			retainedFingerprintBytes: 0,
		});
	});
});
