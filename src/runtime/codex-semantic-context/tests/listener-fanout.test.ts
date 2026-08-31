import { describe, expect, test } from "bun:test";

import {
	createSemanticContextPublisher,
	SEMANTIC_LISTENER_DIAGNOSTIC_POLICY,
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
		cursor: { feedId: "feed", sequence: 0 },
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

function utf8(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

describe("semantic context listener fanout", () => {
	test("publishes the concrete diagnostic payload bound", () => {
		expect(SEMANTIC_LISTENER_DIAGNOSTIC_POLICY).toEqual({
			maxEntries: 64,
			errorNameBytes: 128,
			messageBytes: 2_048,
			maxBatchBytes: 146_477,
		});
		expect(Object.isFrozen(SEMANTIC_LISTENER_DIAGNOSTIC_POLICY)).toBe(true);
	});

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
		expect(h.publisher.drainListenerFailures()).toEqual({
			entries: [
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
			],
			droppedCount: 0,
		});
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
		expect(publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });
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
		expect(h.publisher.drainListenerFailures().entries).toHaveLength(1);
		h.emit(change(11));
		expect(deliveries).toBe(1);
		expect(h.publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });
	});

	test("retains the oldest bounded diagnostic burst and reports overflow", () => {
		const h = publisherWithFeed();
		h.publisher.subscribeSettledChange((event) => {
			throw new Error(`failure-${event.change.cursor.sequence}`);
		});

		for (
			let sequence = 0;
			sequence < SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxEntries + 5;
			sequence++
		) {
			expect(() => h.emit(change(sequence))).not.toThrow();
		}

		const batch = h.publisher.drainListenerFailures();
		expect(batch.entries).toHaveLength(SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxEntries);
		expect(batch.droppedCount).toBe(5);
		expect(batch.entries[0]?.message).toBe("failure-0");
		expect(batch.entries.at(-1)?.message).toBe(
			`failure-${SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxEntries - 1}`,
		);
		expect(Object.isFrozen(batch)).toBe(true);
		expect(Object.isFrozen(batch.entries)).toBe(true);
		expect(Object.isFrozen(batch.entries[0])).toBe(true);
		expect(utf8(JSON.stringify(batch))).toBeLessThanOrEqual(
			SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxBatchBytes,
		);
		expect(h.publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });

		h.emit(change(100));
		expect(h.publisher.drainListenerFailures().entries).toHaveLength(1);
		expect(h.publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });
	});

	test("clips JSON-hostile diagnostic strings without exceeding the byte policy", () => {
		const h = publisherWithFeed();
		const controls = String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index));
		const hostilePrefix = `name " \\\b\t\n\f\r${controls}\ud800\udc00𝄞界`;
		const megabyte = `${hostilePrefix}${"x".repeat(1_050_000)}`;
		expect(utf8(megabyte)).toBeGreaterThanOrEqual(1_048_576);
		let laterDeliveries = 0;
		h.publisher.subscribeSettledChange(() => {
			const error = new Error(megabyte);
			error.name = megabyte;
			throw error;
		});
		h.publisher.subscribeSettledChange(() => {
			laterDeliveries++;
		});

		h.emit(change(1));
		expect(laterDeliveries).toBe(1);
		const batch = h.publisher.drainListenerFailures();
		const entry = batch.entries[0];
		if (entry === undefined) throw new Error("expected a listener diagnostic");
		expect(utf8(JSON.stringify(entry.errorName))).toBeLessThanOrEqual(
			SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.errorNameBytes,
		);
		expect(utf8(JSON.stringify(entry.message))).toBeLessThanOrEqual(
			SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.messageBytes,
		);
		expect(JSON.parse(JSON.stringify(batch))).toEqual(batch);
		expect(utf8(JSON.stringify(batch))).toBeLessThanOrEqual(
			SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxBatchBytes,
		);
		expect(entry.errorName.endsWith("…")).toBe(true);
		expect(entry.message.endsWith("…")).toBe(true);
		h.emit(change(2));
		expect(laterDeliveries).toBe(2);
		expect(h.publisher.drainListenerFailures().entries).toHaveLength(1);
		expect(h.publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });
	});

	test("contains hostile thrown values and recovers without suppressing later listeners", () => {
		const h = publisherWithFeed();
		const getterHostile = {};
		Object.defineProperty(getterHostile, Symbol.toPrimitive, {
			get: () => {
				throw new Error("primitive getter failed");
			},
		});
		const toStringHostile = {};
		Object.defineProperty(toStringHostile, "toString", {
			get: () => {
				throw new Error("toString getter failed");
			},
		});
		const proxy = new Proxy(
			{},
			{
				getPrototypeOf: () => {
					throw new Error("prototype trap failed");
				},
			},
		);
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		const throwingError = new Error("message unavailable");
		Object.defineProperty(throwingError, "name", {
			get: () => {
				throw new Error("name getter failed");
			},
		});
		Object.defineProperty(throwingError, "message", {
			get: () => {
				throw new Error("message getter failed");
			},
		});
		const thrownValues: readonly unknown[] = [
			throwingError,
			getterHostile,
			toStringHostile,
			{
				[Symbol.toPrimitive]: () => {
					throw new Error("coercion failed");
				},
			},
			proxy,
			revoked.proxy,
			Symbol("symbol"),
			123n,
			null,
		];
		let next = 0;
		let laterDeliveries = 0;
		h.publisher.subscribeSettledChange(() => {
			if (next < thrownValues.length) throw thrownValues[next++];
		});
		h.publisher.subscribeSettledChange(() => {
			laterDeliveries++;
		});

		for (let sequence = 0; sequence < thrownValues.length; sequence++) {
			expect(() => h.emit(change(sequence))).not.toThrow();
		}
		expect(laterDeliveries).toBe(thrownValues.length);
		const batch = h.publisher.drainListenerFailures();
		expect(batch.entries).toHaveLength(thrownValues.length);
		expect(batch.entries.every((entry) => entry.message.length > 0)).toBe(true);

		h.emit(change(100));
		expect(laterDeliveries).toBe(thrownValues.length + 1);
		expect(h.publisher.drainListenerFailures()).toEqual({ entries: [], droppedCount: 0 });
	});

	test("keeps reentrant emission and subsequent recovery intact during extraction", () => {
		const publisher = publisherWithFocus();
		let nested = false;
		let throwOnce = true;
		let deliveries = 0;
		const hostile = new Proxy(
			{},
			{
				get: () => {
					throw new Error("hostile read");
				},
			},
		);
		publisher.subscribePaneSelection(() => {
			if (!nested) {
				nested = true;
				publisher.publishPaneSelection(input(["nested"]));
			}
			if (throwOnce) {
				throwOnce = false;
				throw hostile;
			}
		});
		publisher.subscribePaneSelection(() => {
			deliveries++;
		});

		expect(() => publisher.publishPaneSelection(input(["outer"]))).not.toThrow();
		expect(deliveries).toBe(2);
		expect(publisher.drainListenerFailures().entries).toHaveLength(1);
		publisher.publishPaneSelection(input(["recovered"]));
		expect(deliveries).toBe(3);
	});
});
