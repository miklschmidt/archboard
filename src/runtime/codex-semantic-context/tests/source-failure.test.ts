import { describe, expect, test } from "bun:test";

import { createSemanticContextPublisher, type SettledChangeSourceEvent } from "../index.ts";

describe("semantic context source failures", () => {
	test("keeps the feed alive when an unbound canvas cannot capture context", () => {
		let feedListener: ((event: SettledChangeSourceEvent) => void) | null = null;
		const publisher = createSemanticContextPublisher({
			feed: {
				onChange(listener) {
					feedListener = listener;
					return () => {
						feedListener = null;
					};
				},
			},
			feedId: "feed-1",
			fresh: {
				read: () => {
					throw new Error("fresh context is not part of this source proof");
				},
			},
			contextForChange: () => {
				throw new Error("no current thread-context binding");
			},
		});
		const settled: unknown[] = [];
		publisher.subscribeSettledChange((event) => settled.push(event));
		if (feedListener === null) throw new Error("The publisher did not subscribe to the feed.");

		expect(() =>
			feedListener?.({
				cursor: 1,
				board: "scratch",
				at: new Date().toISOString(),
				origin: "human",
				significance: "layout",
				text: "The person moved a box.",
			}),
		).not.toThrow();
		expect(settled).toEqual([]);
		expect(publisher.drainListenerFailures()).toEqual({
			entries: [
				{
					port: "settled_change",
					eventKind: "settled_change",
					listenerIndex: 0,
					errorName: "Error",
					message: "no current thread-context binding",
				},
			],
			droppedCount: 0,
		});
	});
});
