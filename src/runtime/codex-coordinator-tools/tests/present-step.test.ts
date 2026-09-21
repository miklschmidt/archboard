// Presenting a walkthrough step through the coordinator's typed tool.
//
// What is guarded is what a narrator depends on: the step handed back is the one the host said
// arrived, a step that is not on screen is refused with the host's reason instead of being
// described anyway, a retried wire call never moves the pane twice, and a cancelled call stops
// waiting on the pane.

import { describe, expect, test } from "bun:test";

import type { CoordinatorToolsServerRequest } from "../index.js";
import {
	ARRIVED_STEP,
	copyRequest,
	fixture,
	nextMicrotasks,
	responseEnvelope,
	type CoordinatorToolsFixture,
} from "./support.js";

function dispatch(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return h.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

describe("present_step", () => {
	test("hands back the step the host said arrived, naming only what the model may name", async () => {
		const h = fixture();
		const result = await dispatch(
			h,
			h.request("present_step", { arguments: { step: 2, walkthrough: "For the board" } }),
		);
		expect(result.response.success).toBe(true);
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "ok", value: ARRIVED_STEP });
		expect(h.presentation.calls.map((call) => call.input)).toEqual([
			{ step: 2, walkthrough: "For the board" },
		]);
		// Presenting is no workhorse effect and no spoken approval.
		expect(h.operations.calls.delegate).toHaveLength(0);
		expect(h.spokenApproval.calls).toHaveLength(0);
	});

	test("takes a call that names no step, which asks the host for the next one", async () => {
		const h = fixture();
		const result = await dispatch(h, h.request("present_step", { arguments: {} }));
		expect(result.response.success).toBe(true);
		expect(h.presentation.calls.map((call) => call.input)).toEqual([{}]);
	});

	test("refuses with the host's reason when the step is not on screen", async () => {
		const h = fixture();
		h.presentation.setOutcome({
			tag: "refused",
			reason: "busy",
			message: "A person stepped the presentation by hand.",
		});
		const result = await dispatch(h, h.request("present_step"));
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "refused", reason: "busy" });
	});

	test("refuses a pane or board named by the model before anything is presented", async () => {
		const h = fixture();
		const result = await dispatch(
			h,
			h.request("present_step", { arguments: { step: 1, pane: "left" } }),
		);
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "refused" });
		expect(h.presentation.calls).toHaveLength(0);
	});

	test("answers a retried wire call from the first attempt without moving the pane again", async () => {
		const h = fixture();
		const request = h.request("present_step");
		const first = await dispatch(h, request);
		const retry = {
			...copyRequest(request),
			requestId: h.identity.decoder.adoptJsonRpcRequestId("present-retry"),
		};
		const second = await dispatch(h, {
			...retry,
			correlation: h.identity.decoder.createWireRequestCorrelation({
				requestId: retry.requestId,
			}),
		});
		expect(responseEnvelope(second.response)).toEqual(responseEnvelope(first.response));
		expect(h.presentation.calls).toHaveLength(1);
	});

	test("stops waiting on the pane when the call is cancelled, and reports no step", async () => {
		const h = fixture();
		h.presentation.waitForAbort();
		const request = h.request("present_step");
		const pending = dispatch(h, request);
		await nextMicrotasks();
		expect(h.presentation.calls).toHaveLength(1);
		h.dispatcher.cancel(request.requestId, "caller_turn_interrupted");
		const result = await pending;
		expect(h.presentation.calls[0]?.signal.aborted).toBe(true);
		expect(responseEnvelope(result.response)).toMatchObject({ tag: "refused" });
	});
});
