import { describe, expect, test } from "bun:test";

import { CodexWorkhorseOperationsError } from "../../codex-workhorse-operations/index.js";
import { CodexCoordinatorToolsError, type CoordinatorToolsServerRequest } from "../index.js";
import {
	copyRequest,
	fixture,
	nextMicrotasks,
	responseEnvelope,
	type CoordinatorToolsFixture,
} from "./support.js";

function dispatch(
	fixtureValue: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return fixtureValue.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

function replayRequest(
	fixtureValue: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
	label: string,
): ReturnType<CoordinatorToolsFixture["request"]> {
	const requestId = fixtureValue.identity.decoder.adoptJsonRpcRequestId(label);
	return {
		...copyRequest(request),
		requestId,
		correlation: fixtureValue.identity.decoder.createWireRequestCorrelation({ requestId }),
	};
}

describe("coordinator dynamic-tool lifecycle", () => {
	test("cancels in the pre-effect window without invoking a mutation", async () => {
		const h = fixture();
		const request = h.request("delegate_to_workhorse");
		const pending = dispatch(h, request);
		h.dispatcher.cancel(request.requestId, "caller_turn_interrupted");
		const result = await pending;

		expect(result.attempted).toBe(false);
		expect(h.operations.calls.delegate).toHaveLength(0);
		expect(h.transport.writes).toHaveLength(1);
		expect(result.response.success).toBe(false);
		expect(responseEnvelope(result.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
	});

	test("suppresses only a disconnected child and still answers an owned call during disposal", async () => {
		const child = fixture();
		const childRequest = child.request("inspect_workhorse");
		const childPending = dispatch(child, childRequest);
		child.dispatcher.onChildExit({
			child: child.identity.validator.childId,
			epoch: child.identity.validator.epoch,
		});
		const childResult = await childPending;
		expect(childResult.attempted).toBe(false);
		expect(child.operations.calls.inspect).toHaveLength(0);
		expect(child.transport.writes).toHaveLength(0);

		const disposed = fixture();
		const disposedRequest = disposed.request("inspect_workhorse");
		const disposedPending = dispatch(disposed, disposedRequest);
		disposed.dispatcher.dispose();
		const disposedResult = await disposedPending;
		expect(disposedResult.attempted).toBe(false);
		expect(disposed.operations.calls.inspect).toHaveLength(0);
		expect(disposed.transport.writes).toHaveLength(1);
	});

	test("keeps one writable terminal response when disposed during reads, mutations, or response delivery", async () => {
		const reading = fixture();
		reading.operations.hold();
		const readPending = dispatch(reading, reading.request("inspect_workhorse"));
		await nextMicrotasks();
		expect(reading.operations.calls.inspect).toHaveLength(1);
		reading.dispatcher.dispose();
		reading.operations.release();
		const readResult = await readPending;
		expect(responseEnvelope(readResult.response)).toMatchObject({ tag: "refused" });
		expect(reading.operations.calls.inspect).toHaveLength(1);
		expect(reading.transport.writes).toHaveLength(1);

		const mutating = fixture();
		mutating.operations.hold();
		const mutationPending = dispatch(mutating, mutating.request("delegate_to_workhorse"));
		await nextMicrotasks();
		expect(mutating.operations.calls.delegate).toHaveLength(1);
		mutating.dispatcher.dispose();
		mutating.operations.release();
		const mutationResult = await mutationPending;
		expect(responseEnvelope(mutationResult.response)).toMatchObject({ tag: "outcome_unknown" });
		expect(mutating.operations.calls.delegate).toHaveLength(1);
		expect(mutating.transport.writes).toHaveLength(1);

		const delivered = fixture();
		delivered.transport.hold();
		const deliveredPending = dispatch(delivered, delivered.request("inspect_workhorse"));
		await nextMicrotasks();
		await nextMicrotasks();
		await nextMicrotasks();
		await nextMicrotasks();
		expect(delivered.operations.calls.inspect).toHaveLength(1);
		expect(delivered.transport.writes).toHaveLength(1);
		delivered.dispatcher.dispose();
		delivered.transport.release();
		const deliveredResult = await deliveredPending;
		expect(responseEnvelope(deliveredResult.response)).toMatchObject({ tag: "ok" });
		expect(delivered.transport.writes).toHaveLength(1);
	});

	test("turns cancellation after a mutation starts into one uncertainty envelope", async () => {
		const h = fixture();
		h.operations.hold();
		const request = h.request("delegate_to_workhorse");
		const pending = dispatch(h, request);
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.dispatcher.cancel(request.requestId, "browser_disconnect");
		h.operations.release();
		const result = await pending;

		expect(result.attempted).toBe(true);
		expect(responseEnvelope(result.response)).toMatchObject({
			tag: "outcome_unknown",
			operationId: h.authorities.operation.decoder.serializeOperationId(
				h.operations.calls.delegate[0]!.operationId!,
			),
		});
		expect(h.transport.writes).toHaveLength(1);
		expect(h.operations.calls.delegate).toHaveLength(1);
	});

	test("conservatively reports an unknown mutation when authority changes during the call", async () => {
		const h = fixture();
		h.operations.hold();
		const request = h.request("steer_workhorse");
		const pending = dispatch(h, request);
		await nextMicrotasks();
		expect(h.operations.calls.steer).toHaveLength(1);
		h.authority.setCall(null);
		h.operations.release();
		const result = await pending;

		expect(responseEnvelope(result.response)).toMatchObject({
			tag: "outcome_unknown",
			operationId: h.authorities.operation.decoder.serializeOperationId(
				h.operations.calls.steer[0]!.operationId!,
			),
		});
		expect(h.transport.writes).toHaveLength(1);
	});

	test("does not retry after child exit while an operation is in flight", async () => {
		const h = fixture();
		h.operations.hold();
		const request = h.request("inspect_workhorse");
		const pending = dispatch(h, request);
		await nextMicrotasks();
		expect(h.operations.calls.inspect).toHaveLength(1);
		h.dispatcher.onChildExit({
			child: h.identity.validator.childId,
			epoch: h.identity.validator.epoch,
		});
		h.operations.release();
		const result = await pending;

		expect(result.attempted).toBe(true);
		expect(h.operations.calls.inspect).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(0);
	});

	test("maps typed operation failures without inventing a successful value", async () => {
		const h = fixture();
		h.operations.setError(new CodexWorkhorseOperationsError("not_ready", "workhorse unavailable"));
		const refused = await dispatch(h, h.request("inspect_workhorse"));
		expect(refused.response.success).toBe(true);
		expect(responseEnvelope(refused.response)).toMatchObject({
			tag: "refused",
			reason: "not_ready",
			message: "workhorse unavailable",
		});

		const unknown = fixture();
		unknown.operations.setError(new Error("mutation result was lost"));
		const unknownRequest = unknown.request("delegate_to_workhorse");
		const unknownResult = await dispatch(unknown, unknownRequest);
		expect(responseEnvelope(unknownResult.response)).toMatchObject({
			tag: "outcome_unknown",
			operationId: unknown.authorities.operation.decoder.serializeOperationId(
				unknown.operations.calls.delegate[0]!.operationId!,
			),
		});

		const notDelivered = fixture();
		notDelivered.operations.setError(
			new CodexWorkhorseOperationsError("transport_failure", "not sent", {
				outcome: "not_delivered",
			}),
		);
		const notDeliveredResult = await dispatch(
			notDelivered,
			notDelivered.request("delegate_to_workhorse"),
		);
		expect(responseEnvelope(notDeliveredResult.response)).toMatchObject({
			tag: "refused",
			reason: "system_error",
		});
	});

	test("rejects a second object with the same request identity and retains one result", async () => {
		const h = fixture();
		const request = h.request("inspect_workhorse");
		const first = await dispatch(h, request);
		const duplicate = copyRequest(request);
		const duplicateError = await dispatch(h, duplicate).catch((error: unknown) => error);
		expect(duplicateError).toMatchObject({
			name: "CodexCoordinatorToolsError",
			code: "duplicate",
		});
		expect(first.attempted).toBe(true);
		expect(h.operations.calls.inspect).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(1);
	});

	test("settles concurrent logical replays on both wire requests with one effect", async () => {
		const h = fixture();
		h.operations.hold();
		const firstRequest = h.request("delegate_to_workhorse");
		const secondRequest = replayRequest(h, firstRequest, "logical-retry-request");
		const firstPending = dispatch(h, firstRequest);
		const secondPending = dispatch(h, secondRequest);
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.operations.release();
		const [first, second] = await Promise.all([firstPending, secondPending]);
		expect(second.response).toEqual(first.response);
		expect(h.operations.calls.delegate).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(2);
		expect(new Set(h.transport.writes.map(({ request }) => request))).toEqual(
			new Set([firstRequest, secondRequest]),
		);
		expect(responseEnvelope(second.response)).toMatchObject({
			operationId: responseEnvelope(first.response).operationId,
		});
	});

	test("settles a late logical replay from the cached result without another effect", async () => {
		const h = fixture();
		const firstRequest = h.request("delegate_to_workhorse");
		const first = await dispatch(h, firstRequest);
		const lateRequest = replayRequest(h, firstRequest, "late-logical-retry");
		const late = await dispatch(h, lateRequest);

		expect(late.response).toEqual(first.response);
		expect(h.operations.calls.delegate).toHaveLength(1);
		expect(h.transport.writes.map(({ request }) => request)).toEqual([firstRequest, lateRequest]);
	});

	test("isolates alias cancellation from the logical owner effect and response", async () => {
		const h = fixture();
		h.operations.hold();
		const ownerRequest = h.request("delegate_to_workhorse");
		const aliasRequest = replayRequest(h, ownerRequest, "cancelled-logical-retry");
		const ownerPending = dispatch(h, ownerRequest);
		const aliasPending = dispatch(h, aliasRequest);
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.dispatcher.cancel(aliasRequest.requestId, "caller_turn_interrupted");
		const alias = await aliasPending;
		expect(responseEnvelope(alias.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(h.transport.writes).toHaveLength(1);
		expect(h.transport.writes[0]!.request).toBe(aliasRequest);

		h.operations.release();
		const owner = await ownerPending;
		expect(responseEnvelope(owner.response)).toMatchObject({ tag: "ok" });
		expect(h.operations.calls.delegate).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(2);
		expect(h.transport.writes.filter(({ request }) => request === aliasRequest)).toHaveLength(1);
	});

	test("settles each logical replay once when either wire response write fails", async () => {
		for (const failed of ["owner", "alias"] as const) {
			const h = fixture();
			h.operations.hold();
			const ownerRequest = h.request("delegate_to_workhorse");
			const aliasRequest = replayRequest(h, ownerRequest, `failed-${failed}-logical-retry`);
			h.transport.failFor(failed === "owner" ? ownerRequest : aliasRequest);
			const ownerPending = dispatch(h, ownerRequest);
			const aliasPending = dispatch(h, aliasRequest);
			await nextMicrotasks();
			h.operations.release();
			const [owner, alias] = await Promise.all([ownerPending, aliasPending]);

			expect(alias.response).toEqual(owner.response);
			expect(h.operations.calls.delegate).toHaveLength(1);
			expect(h.transport.writes).toHaveLength(2);
			expect(new Set(h.transport.writes.map(({ request }) => request))).toEqual(
				new Set([ownerRequest, aliasRequest]),
			);
		}
	});

	test("retires two logical replay wire owners without writes on exact child exit", async () => {
		const h = fixture();
		h.operations.hold();
		const ownerRequest = h.request("delegate_to_workhorse");
		const aliasRequest = replayRequest(h, ownerRequest, "disconnected-logical-retry");
		const ownerPending = dispatch(h, ownerRequest);
		const aliasPending = dispatch(h, aliasRequest);
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		h.dispatcher.onChildExit({
			child: h.identity.validator.childId,
			epoch: h.identity.validator.epoch,
		});
		const [owner, alias] = await Promise.all([ownerPending, aliasPending]);
		expect(owner.attempted).toBe(true);
		expect(alias.attempted).toBe(false);
		expect(h.transport.writes).toHaveLength(0);
		h.operations.release();
		await nextMicrotasks();
		expect(h.operations.calls.delegate).toHaveLength(1);
		expect(h.transport.writes).toHaveLength(0);
	});

	test("disposes idempotently and rejects new dispatches", async () => {
		const h = fixture();
		h.dispatcher.dispose();
		h.dispatcher.dispose();
		const request = h.request("inspect_workhorse");
		const error = await dispatch(h, request).catch((value: unknown) => value);
		expect(error).toBeInstanceOf(CodexCoordinatorToolsError);
		expect(h.operations.calls.inspect).toHaveLength(0);
		expect(h.transport.writes).toHaveLength(0);
	});
});
