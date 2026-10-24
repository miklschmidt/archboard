import { describe, expect, test } from "bun:test";

import { createSemanticContextPublisher } from "#runtime/operations/semantic-context-publisher.ts";
import { type SettledChangeSourceEvent } from "#runtime/schemas/semantic-context-types.ts";

describe("semantic context source failures", () => {
	test("keeps the feed alive when an unbound server cannot capture context", () => {
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
		if (feedListener === null) {
			throw new Error("The publisher did not subscribe to the feed.");
		}

		expect(() =>
			feedListener?.({
				cursor: 1,
				vault: "/work/.archboard/vault",
				board: "scratch",
				at: new Date().toISOString(),
				origin: "human",
				significance: "layout",
				text: "The user moved a box.",
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
