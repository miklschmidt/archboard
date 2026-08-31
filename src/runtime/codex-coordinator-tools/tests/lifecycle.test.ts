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

	test("does not answer a request after child disconnect or host disposal", async () => {
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
		expect(disposed.transport.writes).toHaveLength(0);
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
			operationId: `operation-${String(request.requestId)}`,
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
			operationId: `operation-${String(request.requestId)}`,
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
			operationId: `operation-${String(unknownRequest.requestId)}`,
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
