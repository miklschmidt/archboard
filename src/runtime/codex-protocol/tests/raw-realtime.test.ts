import { describe, expect, test } from "bun:test";

import { decodeServerNotification } from "../index.js";

describe("raw realtime preservation", () => {
	test("does not invent phase or transcript state", () => {
		const input = {
			method: "thread/realtime/transcript/delta",
			params: { threadId: "thread-1", role: "assistant", delta: "raw delta" },
			emittedAtMs: 99,
		};
		const decoded = decodeServerNotification(input);
		expect(decoded as unknown).toEqual(input);
		expect(decoded).not.toHaveProperty("phase");
		expect(decoded.params).not.toHaveProperty("transcript");
	});

	test("keeps item-scoped realtime identity and presentation untouched", () => {
		const input = {
			method: "thread/realtime/item/completed",
			params: {
				threadId: "thread-1",
				item: {
					id: "realtime-item-1",
					realtimeSessionId: "realtime-1",
					type: "bemItemPromoted",
					turnId: "turn-1",
					itemId: "item-1",
					presentation: { type: "inlineVisualization", index: 0 },
				},
			},
		};
		expect(decodeServerNotification(input) as unknown).toEqual(input);
	});
});
