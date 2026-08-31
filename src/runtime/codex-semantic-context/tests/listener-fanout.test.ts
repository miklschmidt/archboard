import { describe, expect, test } from "bun:test";

import {
	createSemanticContextPublisher,
	type SemanticContextInput,
	type SettledChangeSourceEvent,
	type SettledChangeSource,
} from "../index.ts";

function input(selection: readonly string[] = []): SemanticContextInput {
	return {
		repository: "repo",
		board: { key: "board", note: "board.md", version: 1 },
		pane: { paneId: "pane", focused: true },
		selection,
		doing: null,
		cursor: 0,
		description: "compact board",
	};
}

function change(sequence: number): SettledChangeSourceEvent {
	return {
		cursor: sequence,
		board: "board",
		at: new Date(1_700_000_000_000).toISOString(),
		origin: "human",
		significance: "structural",
		text: "changed",
	};
}

function publisherWithFeed() {
	const listeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const feed: SettledChangeSource = {
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	const publisher = createSemanticContextPublisher({
		feed,
		feedId: "feed",
		fresh: { read: () => input() },
		contextForChange: () => input(),
		now: () => 1_700_000_000_000,
	});
	return {
		publisher,
		emit: (event: SettledChangeSourceEvent) => {
			for (const listener of listeners) listener(event);
		},
	};
}

function publisherWithFocus() {
	const publisher = createSemanticContextPublisher({
		feed: { onChange: () => () => {} },
		feedId: "feed",
		fresh: { read: () => input() },
		contextForChange: () => input(),
		now: () => 1_700_000_000_000,
	});
	return publisher;
}

describe("semantic context listener fanout", () => {
	test("delivers later listeners and reports failures without throwing into the feed", () => {
		const h = publisherWithFeed();
		const order: string[] = [];
		h.publisher.subscribeSettledChange(() => order.push("first"));
		h.publisher.subscribeSettledChange(() => {
			order.push("second");
			throw new Error("second listener failed");
		});
		h.publisher.subscribeSettledChange(() => {
			order.push("third");
			throw new TypeError("third listener failed");
		});

		expect(() => h.emit(change(4))).not.toThrow();
		expect(order).toEqual(["first", "second", "third"]);
		expect(h.publisher.drainListenerFailures()).toEqual([
			{
				port: "settled_change",
				eventKind: "settled_change",
				listenerIndex: 1,
				errorName: "Error",
				message: "second listener failed",
			},
			{
				port: "settled_change",
				eventKind: "settled_change",
				listenerIndex: 2,
				errorName: "TypeError",
				message: "third listener failed",
			},
		]);
	});

	test("uses a listener snapshot for reentrant publish and unsubscribe behavior", () => {
		const publisher = publisherWithFocus();
		const order: string[] = [];
		let nested = false;
		let unsubscribeSecond: (() => void) | undefined;
		const added = () => order.push("added");
		publisher.subscribePaneSelection(() => {
			order.push("first");
			unsubscribeSecond?.();
			publisher.subscribePaneSelection(added);
			if (!nested) {
				nested = true;
				publisher.publishPaneSelection(input(["nested"]));
			}
		});
		unsubscribeSecond = publisher.subscribePaneSelection(() => order.push("second"));

		publisher.publishPaneSelection(input(["outer"]));

		expect(order).toEqual(["first", "first", "added", "second"]);
		expect(publisher.drainListenerFailures()).toEqual([]);
	});

	test("recovers after a throwing listener on the next settled event", () => {
		const h = publisherWithFeed();
		let shouldThrow = true;
		let deliveries = 0;
		h.publisher.subscribeSettledChange(() => {
			if (shouldThrow) {
				shouldThrow = false;
				throw new Error("temporary listener failure");
			}
			deliveries++;
		});

		expect(() => h.emit(change(10))).not.toThrow();
		expect(h.publisher.drainListenerFailures()).toHaveLength(1);
		h.emit(change(11));
		expect(deliveries).toBe(1);
		expect(h.publisher.drainListenerFailures()).toEqual([]);
	});
});
