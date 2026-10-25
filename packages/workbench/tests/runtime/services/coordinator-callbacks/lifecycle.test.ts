import { describe, expect, test } from "bun:test";

import { archboardContextOf } from "#runtime/rules/coordinator-callbacks/normalize.ts";
import {
	CALLBACK_BUFFER_LIMIT,
	createCodexCoordinatorCallbacks,
} from "#runtime/services/coordinator-callbacks/callbacks.ts";
import {
	close,
	harness,
	operationEvent,
	semanticInput,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

describe("coordinator callback lifecycle", () => {
	test("with voice live, only an operation outcome nobody can vouch for reaches the coordinator, and nothing else reaches anybody", async () => {
		const h = harness(true);
		// A turn that ended or waits on the user is workhorse news from the thread (TASK-321).
		for (const type of [
			"accepted",
			"queued",
			"started",
			"progress",
			"attention",
			"completed",
			"failed",
		] as const) {
			const result = await h.callbacks.enqueue(operationEvent(h.ids, type));
			expect(result).toMatchObject({ outcome: "not_delivered", path: "silent" });
		}
		const unknown = await h.callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
		expect(unknown).toMatchObject({ outcome: "delivered", path: "coordinator_turn" });
		for (const source of [h.semantic.focus, h.semantic.selection]) {
			// A focus or a selection nobody's hand made is never put into a speech model's context.
			const result = await h.callbacks.enqueue(source);
			expect(result.outcome).toBe("not_delivered");
			expect(result.path).toBe("silent");
		}
		// No callback envelope reaches the voice session from any path.
		expect(h.realtimeRequests).toHaveLength(0);
		expect(h.reports).toHaveLength(1);
		close(h);
	});

	// TASK-293: a speech model says what it is given out loud, and an envelope of identities and a
	// serialized brief is what it used to be given. Every kind and both channels go through here.
	test("the voice model is only ever given a news sentence, never a callback envelope, quiet or as speech", async () => {
		const h = harness(true);
		h.state.narrated = "architecture";
		const base = semanticInput(h.ids, true);
		const deliveries = [];
		// One at a time: two reports of one kind queued together coalesce, which is not this test's.
		const sources = [
			...(
				["accepted", "started", "progress", "completed", "failed", "outcome_unknown"] as const
			).map((type) => operationEvent(h.ids, type)),
			h.semantic.change,
			h.semantic.focus,
			h.semantic.selection,
		];
		for (const source of sources) {
			deliveries.push(await h.callbacks.enqueue(source));
		}
		// A published event is queued as it is published, so these come after the rest.
		const picked = h.semantic.publisher.publishPaneSelection({
			...base,
			pane: { ...base.pane, userChanged: ["selection"] },
		});
		deliveries.push(await h.callbacks.enqueue(picked));
		const moved = h.semantic.publisher.publishPaneFocus({
			...base,
			pane: { ...base.pane, agentSwitch: { from: "Payments", by: null } },
		});
		deliveries.push(await h.callbacks.enqueue(moved));
		const sentences = deliveries.flatMap(({ callback }) => {
			const news = callback?.kind === "host_context" ? archboardContextOf(callback)?.news : null;
			return news === null || news === undefined ? [] : [news.sentence];
		});

		expect(new Set(h.realtimeRequests.map((request) => request.channel))).toEqual(
			new Set(["speech"]),
		);
		expect(h.realtimeRequests.length).toBe(sentences.length);
		for (const request of h.realtimeRequests) {
			expect(sentences).toContain(request.params.text);
			expect(request.params.text).not.toContain("{");
		}
		close(h);
	});

	test("preserves FIFO when a callback emits another callback", async () => {
		const h = harness(true);
		const second = operationEvent(h.ids, "outcome_unknown");
		let emitted = false;
		h.setMutationHook(() => {
			if (emitted) {
				return;
			}
			emitted = true;
			h.operations.emit(second);
		});
		const first = operationEvent(h.ids, "outcome_unknown");
		await h.callbacks.enqueue(first);
		await h.callbacks.flush();
		expect(h.reports).toHaveLength(2);
		expect(
			h.callbacks
				.inspect()
				.map((delivery) =>
					delivery.callback?.kind === "operation"
						? delivery.callback.correlation.operationId
						: null,
				),
		).toEqual([first.correlation.operationId, second.correlation.operationId]);
		close(h);
	});

	test("bounds pending work, coalesces telemetry, and settles disposal", async () => {
		const h = harness(false);
		const firstFocus = structuredClone(h.semantic.focus);
		const secondFocus = structuredClone(h.semantic.focus);
		Reflect.set(secondFocus.focus, "capturedAtMs", secondFocus.focus.capturedAtMs + 1);
		const firstFocusResult = h.callbacks.enqueue(firstFocus);
		const secondFocusResult = h.callbacks.enqueue(secondFocus);
		expect((await firstFocusResult).reason).toBe("coalesced");
		expect((await secondFocusResult).path).toBe("silent");
		const pending = Array.from({ length: CALLBACK_BUFFER_LIMIT + 1 }, () =>
			h.callbacks.enqueue(operationEvent(h.ids, "progress")),
		);
		const results = await Promise.all(pending);
		expect(results.some((delivery) => delivery.reason === "buffer_overflow")).toBe(true);
		const next = h.callbacks.enqueue(operationEvent(h.ids, "attention"));
		h.callbacks.dispose();
		expect((await next).reason).toBe("disposed");
		close(h);
	});

	test("reports the exact-generation prefix omitted by bounded settled history", async () => {
		const h = harness(true);
		const callbacks = createCodexCoordinatorCallbacks({
			...h.options,
			settledLedgerLimit: 2,
		});
		for (const type of ["accepted", "started", "completed"] as const) {
			await callbacks.enqueue(operationEvent(h.ids, type));
		}
		const generation = h.state.generation;
		if (generation === null) {
			throw new Error("The callback harness has no realtime generation.");
		}

		expect(callbacks.inspectHistory(generation)).toMatchObject({
			omittedPrefixCount: 1,
			deliveries: [{ sourceOrder: 1 }, { sourceOrder: 2 }],
		});
		callbacks.dispose();
		close(h);
	});

	test("cleans earlier subscriptions when a later source listener registration fails", () => {
		const h = harness(false);
		let cleaned = 0;
		expect(() =>
			createCodexCoordinatorCallbacks({
				...h.options,
				operations: {
					subscribe: () => () => {
						cleaned += 1;
					},
				},
				semantic: {
					subscribeSettledChange: () => {
						throw new Error("listener registration failed");
					},
					subscribePaneFocus: h.options.semantic.subscribePaneFocus,
					subscribePaneSelection: h.options.semantic.subscribePaneSelection,
				},
			}),
		).toThrow("listener registration failed");
		expect(cleaned).toBe(1);
		close(h);
	});
});
