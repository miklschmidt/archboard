import { describe, expect, test } from "bun:test";

import {
	CALLBACK_MAX_ARRAY_ENTRIES,
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
});
