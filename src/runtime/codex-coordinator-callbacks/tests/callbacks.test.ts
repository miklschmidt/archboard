import { describe, expect, test } from "bun:test";

import { encodeCoordinatorCallback, normalizeCoordinatorCallback } from "../index.js";
import { close, harness, identities, link, operationEvent, semanticSources } from "./support.js";

const operationTypes = [
	"accepted",
	"queued",
	"started",
	"progress",
	"attention",
	"completed",
	"failed",
	"outcome_unknown",
] satisfies ReadonlyArray<Parameters<typeof operationEvent>[1]>;

describe("coordinator callbacks", () => {
	test("normalizes and freezes every closed-union member", () => {
		const ids = identities();
		const captured = link(ids);
		for (const type of operationTypes) {
			const callback = normalizeCoordinatorCallback(operationEvent(ids, type), captured, null);
			expect(callback.kind).toBe("operation");
			expect(callback.type).toBe(type);
			expect(Object.isFrozen(callback)).toBe(true);
			expect(Object.isFrozen(callback.correlation.workhorseLink.target)).toBe(true);
			expect(encodeCoordinatorCallback(callback)).toContain(`"type":"${type}"`);
		}
		const semantic = semanticSources(ids, true);
		const semanticCases = [
			{ source: semantic.change, type: "change" },
			{ source: semantic.focus, type: "focus" },
			{ source: semantic.selection, type: "selection" },
		] satisfies ReadonlyArray<{
			source: typeof semantic.change | typeof semantic.focus | typeof semantic.selection;
			type: "change" | "focus" | "selection";
		}>;
		for (const { source, type } of semanticCases) {
			const callback = normalizeCoordinatorCallback(source, captured, null);
			expect(callback.kind).toBe("semantic");
			expect(callback.type).toBe(type);
			expect(Object.isFrozen(callback.correlation)).toBe(true);
			expect(encodeCoordinatorCallback(callback)).toContain(`"type":"${type}"`);
		}
		semantic.dispose();
	});

	test("inactive operation families inject one raw developer item into the coordinator", async () => {
		const operations: ReadonlyArray<Parameters<typeof operationEvent>[2]> = [
			"delegate_to_workhorse",
			"manage_workhorse_queue",
			"steer_workhorse",
		];
		for (const operation of operations) {
			const h = harness(false);
			const event = operationEvent(
				h.ids,
				operation === "steer_workhorse" ? "attention" : "completed",
				operation,
			);
			const delivery = await h.callbacks.enqueue(event);
			expect(delivery.outcome).toBe("delivered");
			expect(delivery.path).toBe("thread_inject_items");
			expect(h.injections).toHaveLength(1);
			expect(h.injections[0]?.threadId).toBe(h.ids.coordinator);
			expect(h.injections[0]?.items).toEqual([
				{
					type: "message",
					role: "developer",
					content: [{ type: "input_text", text: delivery.text }],
				},
			]);
			close(h);
		}
	});

	test("active callbacks append one developer request with exact generation identities", async () => {
		const h = harness(true);
		const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "progress"));
		if (delivery.text === null || h.state.generation === null)
			throw new Error("active callback fixture failed");
		expect(delivery.outcome).toBe("delivered");
		expect(delivery.path).toBe("realtime_appendText");
		expect(h.realtimeRequests).toHaveLength(1);
		expect(h.realtimeRequests[0]?.params).toEqual({
			threadId: h.ids.coordinator,
			text: delivery.text,
			role: "developer",
		});
		expect(delivery.realtimeRequest?.generation).toEqual(h.state.generation);
		expect(h.injections).toHaveLength(0);
		close(h);
	});

	test("inactive semantic callbacks remain silent while preserving focus and selection", async () => {
		const h = harness(false);
		for (const event of [h.semantic.change, h.semantic.focus, h.semantic.selection]) {
			const delivery = await h.callbacks.enqueue(event);
			expect(delivery.path).toBe("silent");
			expect(delivery.reason).toBe("voice_inactive");
			expect(delivery.text).toContain('"semantic"');
		}
		expect(h.injections).toHaveLength(0);
		expect(h.realtimeRequests).toHaveLength(0);
		close(h);
	});
});
