import { describe, expect, test } from "bun:test";

import { type CoordinatorToolsServerRequest } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import {
	fixture,
	nextMicrotasks,
	responseEnvelope,
	type CoordinatorToolsFixture,
} from "#tests/runtime/voice/coordinator/tools-and-work/coordinator-tools/services/support.ts";

function dispatch(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return h.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

describe("stop_workhorses", () => {
	test("stops the tab session's work trees once and names what each stop observed", async () => {
		// The tab session has no workhorse the call could name, and the stop needs none.
		const h = fixture(undefined, []);
		const operationId = h.authorities.operation.issuer.mintOperationId();
		h.operation.setNextIssued(operationId);
		const child = h.identity.decoder.adoptThreadId("child-thread");
		h.stop.setResult([
			{
				checkout: "/work/payments",
				outcome: "partial",
				remaining: [{ threadId: child, state: "running" }],
			},
			{ checkout: "/work/shop", outcome: "stopped", remaining: [] },
			{ checkout: "/work/docs", outcome: "idle", remaining: [] },
		]);
		const request = h.request("stop_workhorses");
		const result = await dispatch(h, request);

		expect(result.attempted).toBe(true);
		expect(h.stop.calls.count).toBe(1);
		// The coordinator turn that asked is recorded, so it cannot start work again itself.
		expect(h.stop.calls.askedBy).toEqual([request.logicalCall.turnId]);
		expect(Object.values(h.operations.calls).flat()).toHaveLength(0);
		expect(h.spokenApproval.calls).toHaveLength(0);
		expect(responseEnvelope(result.response)).toEqual({
			tag: "ok",
			operationId: h.authorities.operation.decoder.serializeOperationId(operationId),
			value: {
				stopped: [
					{
						checkout: "/work/payments",
						outcome: "partial",
						remaining: [{ threadId: child, state: "running" }],
						recovery: ["inspect_workhorse", "stop_workhorses"],
					},
					{ checkout: "/work/shop", outcome: "stopped", remaining: [], recovery: [] },
					{ checkout: "/work/docs", outcome: "idle", remaining: [], recovery: [] },
				],
			},
		});
	});

	test("answers a tab session with no workhorse as an empty stop", async () => {
		const h = fixture();
		h.stop.setResult([]);
		const result = await dispatch(h, h.request("stop_workhorses"));
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "ok", value: { stopped: [] } });
	});

	test("refuses a stop that names a checkout before it stops anything", async () => {
		const h = fixture();
		const result = await dispatch(
			h,
			h.request("stop_workhorses", { arguments: { checkout: "/work/payments" } }),
		);
		expect(result.attempted).toBe(false);
		expect(h.stop.calls.count).toBe(0);
		expect(responseEnvelope(result.response)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
	});

	test("reports an unknown outcome when the stop fails after it began, and a refusal when it names one", async () => {
		const failed = fixture();
		failed.operations.setError(new Error("the Codex link dropped"));
		const unknown = await dispatch(failed, failed.request("stop_workhorses"));
		expect(unknown.attempted).toBe(true);
		expect(responseEnvelope(unknown.response)).toMatchObject({ tag: "outcome_unknown" });

		const refused = fixture();
		refused.operations.setError(Object.assign(new Error("stopping"), { code: "busy" }));
		const busy = await dispatch(refused, refused.request("stop_workhorses"));
		expect(responseEnvelope(busy.response)).toMatchObject({ tag: "refused", reason: "busy" });
	});

	test("turns a cancellation after the stop began into one uncertainty envelope", async () => {
		const h = fixture();
		h.operations.hold();
		const request = h.request("stop_workhorses");
		const pending = dispatch(h, request);
		await nextMicrotasks();
		expect(h.stop.calls.count).toBe(1);
		h.dispatcher.cancel(request.requestId, "browser_disconnect");
		h.operations.release();
		const result = await pending;

		expect(result.attempted).toBe(true);
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "outcome_unknown" });
		expect(h.stop.calls.count).toBe(1);
		expect(h.transport.writes).toHaveLength(1);
	});

	test("a replay of the same logical call does not stop again", async () => {
		const h = fixture();
		const request = h.request("stop_workhorses");
		const first = await dispatch(h, request);
		const again = await dispatch(h, request);
		expect(again).toBe(first);
		expect(h.stop.calls.count).toBe(1);
	});
});
