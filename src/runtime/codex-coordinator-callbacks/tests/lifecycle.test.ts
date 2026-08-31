import { describe, expect, test } from "bun:test";

import {
	CALLBACK_BUFFER_LIMIT,
	createCodexCoordinatorCallbacks,
	type CoordinatorCallbacksRetainedState,
} from "../index.js";
import { kept } from "../../engine/hot.js";
import { close, harness, operationEvent } from "./support.js";
import type {
	CallbackReloadFixtureModule,
	CallbackReloadFixtureRecord,
} from "./fixtures/reload-generation.fixture.js";

function loadReloadGeneration(
	key: string,
	generation: number,
): Promise<CallbackReloadFixtureModule> {
	return import(
		`./fixtures/reload-generation.fixture.ts?key=${encodeURIComponent(key)}&generation=${generation}`
	);
}

describe("coordinator callback lifecycle", () => {
	test("delivers all eleven members exactly once through one active route", async () => {
		const h = harness(true);
		for (const type of [
			"accepted",
			"queued",
			"started",
			"progress",
			"attention",
			"completed",
			"failed",
			"outcome_unknown",
		] satisfies ReadonlyArray<Parameters<typeof operationEvent>[1]>) {
			const result = await h.callbacks.enqueue(operationEvent(h.ids, type));
			expect(result.outcome).toBe("delivered");
		}
		for (const source of [h.semantic.change, h.semantic.focus, h.semantic.selection]) {
			const result = await h.callbacks.enqueue(source);
			expect(result.outcome).toBe("delivered");
		}
		expect(h.realtimeRequests).toHaveLength(11);
		expect(h.injections).toHaveLength(0);
		close(h);
	});

	test("preserves FIFO when a callback emits another callback", async () => {
		const h = harness(false);
		const second = operationEvent(h.ids, "completed");
		let emitted = false;
		h.setMutationHook(() => {
			if (emitted) return;
			emitted = true;
			h.operations.emit(second);
		});
		await h.callbacks.enqueue(operationEvent(h.ids, "started"));
		await h.callbacks.flush();
		expect(h.injections).toHaveLength(2);
		expect(h.callbacks.inspect().map((delivery) => delivery.callback?.type)).toEqual([
			"started",
			"completed",
		]);
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

	test("two Bun module generations reuse one retained callback and listener cohort", async () => {
		const h = harness(false);
		expect(h.sourceSubscriptions.activeCount()).toBe(4);
		h.callbacks.dispose();
		expect(h.sourceSubscriptions.activeCount()).toBe(0);
		const cleanupBaseline = h.sourceSubscriptions.cleanupCount();
		const key = `coordinator-callback-test-${crypto.randomUUID()}`;
		const record = kept<CallbackReloadFixtureRecord>(key, () => ({
			options: h.options,
			retained: { current: null } satisfies CoordinatorCallbacksRetainedState,
			evaluations: [],
			instances: [],
		}));
		const first = await loadReloadGeneration(key, 1);
		const second = await loadReloadGeneration(key, 2);
		if (first.instance === null || second.instance === null)
			throw new Error("Reload generation did not install callbacks.");
		expect(first.evaluationIdentity).not.toBe(second.evaluationIdentity);
		expect(record.evaluations).toEqual(["1", "2"]);
		expect(record.instances).toEqual([first.instance, first.instance]);
		expect(second.instance).toBe(first.instance);
		expect(h.sourceSubscriptions.activeCount()).toBe(4);
		h.operations.emit(operationEvent(h.ids, "completed"));
		await first.instance.flush();
		expect(first.instance.inspect()).toHaveLength(1);
		expect(h.injections).toHaveLength(1);
		second.instance.dispose();
		expect(h.sourceSubscriptions.activeCount()).toBe(0);
		expect(h.sourceSubscriptions.cleanupCount() - cleanupBaseline).toBe(4);
		first.instance.dispose();
		expect(h.sourceSubscriptions.cleanupCount() - cleanupBaseline).toBe(4);
		h.semantic.dispose();
	});
});
