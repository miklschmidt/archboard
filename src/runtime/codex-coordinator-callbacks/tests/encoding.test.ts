import { describe, expect, test } from "bun:test";

import {
	CALLBACK_MAX_ARRAY_ENTRIES,
	CALLBACK_MAX_ID_UTF8_BYTES,
	CALLBACK_MAX_STRING_UTF8_BYTES,
	encodeCoordinatorCallback,
	normalizeCoordinatorCallback,
} from "../index.js";
import { identities, link, operationEvent, semanticSources } from "./support.js";

describe("coordinator callback bytes", () => {
	test("the manage queue tuple and semantic focus/selection survive canonical encoding", () => {
		const ids = identities();
		const captured = link(ids);
		const queue = normalizeCoordinatorCallback(
			operationEvent(ids, "completed", "manage_workhorse_queue"),
			captured,
			null,
		);
		const queueText = encodeCoordinatorCallback(queue);
		expect(queueText).toContain('"operation":"manage_workhorse_queue"');
		expect(queueText).toContain('"queueOperation":"add"');
		expect(queueText).toContain('"rpc":"thread/queue/add"');
		expect(queueText).toContain('"revision":4');
		expect(queueText).toContain('"manifestRevision":7');
		const semantic = semanticSources(ids, true);
		const focusText = encodeCoordinatorCallback(
			normalizeCoordinatorCallback(semantic.focus, captured, null),
		);
		const selectionText = encodeCoordinatorCallback(
			normalizeCoordinatorCallback(semantic.selection, captured, null),
		);
		expect(focusText).toContain('"focused":true');
		expect(selectionText).toContain('"selection":["element-c"]');
		semantic.dispose();
	});

	test("canonical bytes have a stable exact golden value", () => {
		const ids = identities();
		const semantic = semanticSources(ids, false);
		const callback = normalizeCoordinatorCallback(semantic.focus, link(ids), null);
		const text = encodeCoordinatorCallback(callback);
		expect(text).toMatchSnapshot();
		semantic.dispose();
	});

	test("hostile mutation and UTF-8 or entry overflow are rejected", () => {
		const ids = identities();
		const callback = normalizeCoordinatorCallback(operationEvent(ids, "progress"), link(ids), null);
		expect(Reflect.set(callback.correlation.workhorseLink.target, "threadId", "hostile")).toBe(
			false,
		);
		const stringOverflow = structuredClone(callback);
		Reflect.set(stringOverflow, "detail", "ø".repeat(CALLBACK_MAX_STRING_UTF8_BYTES));
		expect(() => Reflect.apply(encodeCoordinatorCallback, undefined, [stringOverflow])).toThrow();
		const entryOverflow = structuredClone(callback);
		Reflect.set(
			entryOverflow,
			"queuedSubmissionIds",
			Array.from({ length: CALLBACK_MAX_ARRAY_ENTRIES + 1 }, (_, index) => `queue-${index}`),
		);
		expect(() => Reflect.apply(encodeCoordinatorCallback, undefined, [entryOverflow])).toThrow();
		const unknownKey = structuredClone(callback);
		Reflect.set(unknownKey, "narrative", "duplicate narration");
		expect(() => Reflect.apply(encodeCoordinatorCallback, undefined, [unknownKey])).toThrow();
	});

	test("singular and array queue IDs enforce exact UTF-8 byte boundaries", () => {
		const ids = identities();
		const original = normalizeCoordinatorCallback(
			operationEvent(ids, "completed", "manage_workhorse_queue"),
			link(ids),
			null,
		);
		const boundaryValues = [
			"a".repeat(CALLBACK_MAX_ID_UTF8_BYTES),
			"é".repeat(CALLBACK_MAX_ID_UTF8_BYTES / 2),
		];
		const overflowValues = [
			"a".repeat(CALLBACK_MAX_ID_UTF8_BYTES + 1),
			`${"é".repeat(CALLBACK_MAX_ID_UTF8_BYTES / 2)}a`,
		];
		for (const value of boundaryValues) {
			const singular = structuredClone(original);
			Reflect.set(singular.correlation, "queuedSubmissionId", value);
			expect(encodeCoordinatorCallback(singular)).toContain(JSON.stringify(value));
			const array = structuredClone(original);
			Reflect.set(array, "queuedSubmissionIds", [value]);
			expect(encodeCoordinatorCallback(array)).toContain(JSON.stringify(value));
		}
		for (const value of overflowValues) {
			const singular = structuredClone(original);
			Reflect.set(singular.correlation, "queuedSubmissionId", value);
			expect(() => encodeCoordinatorCallback(singular)).toThrow("Callback ID exceeds");
			const array = structuredClone(original);
			Reflect.set(array, "queuedSubmissionIds", [value]);
			expect(() => encodeCoordinatorCallback(array)).toThrow("array entry exceeds");
		}
		const nullable = structuredClone(original);
		Reflect.set(nullable.correlation, "queuedSubmissionId", null);
		expect(encodeCoordinatorCallback(nullable)).toContain('"queuedSubmissionId":null');
	});

	test("queue operations serialize only their exact RPC pair", () => {
		const ids = identities();
		const original = normalizeCoordinatorCallback(
			operationEvent(ids, "completed", "manage_workhorse_queue"),
			link(ids),
			null,
		);
		const pairs = [
			{ operation: "add", rpc: "thread/queue/add" },
			{ operation: "update", rpc: "thread/queue/update" },
			{ operation: "delete", rpc: "thread/queue/delete" },
			{ operation: "reorder", rpc: "thread/queue/reorder" },
			{ operation: "start", rpc: "thread/queue/start" },
		];
		for (const [index, pair] of pairs.entries()) {
			const valid = structuredClone(original);
			Reflect.set(valid, "queueOperation", pair.operation);
			Reflect.set(valid, "rpc", pair.rpc);
			const text = encodeCoordinatorCallback(valid);
			expect(text).toContain(`"queueOperation":"${pair.operation}"`);
			expect(text).toContain(`"rpc":"${pair.rpc}"`);
			const mismatch = structuredClone(valid);
			Reflect.set(mismatch, "rpc", pairs[(index + 1) % pairs.length]?.rpc);
			expect(() => encodeCoordinatorCallback(mismatch)).toThrow("queue tuple does not match");
		}
		const missingOperation = structuredClone(original);
		Reflect.set(missingOperation, "queueOperation", null);
		expect(() => encodeCoordinatorCallback(missingOperation)).toThrow("queue tuple does not match");
		const nonQueue = normalizeCoordinatorCallback(
			operationEvent(ids, "completed", "delegate_to_workhorse"),
			link(ids),
			null,
		);
		expect(encodeCoordinatorCallback(nonQueue)).toContain('"queueOperation":null');
		const hostileNonQueue = structuredClone(nonQueue);
		Reflect.set(hostileNonQueue, "queueOperation", "add");
		expect(() => encodeCoordinatorCallback(hostileNonQueue)).toThrow(
			"Non-queue callback has a queue operation",
		);
	});
});
