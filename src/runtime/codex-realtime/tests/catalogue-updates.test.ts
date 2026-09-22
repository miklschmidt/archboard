// The board catalogue is the coordinator's data and nobody else's: it lands on the coordinator
// thread when a voice session starts and whenever the vault changes, each replacing the last,
// and the voice session is never sent it (TASK-297).

import { expect, test } from "bun:test";
import { harness, started } from "./adapter-harness.js";

function catalogueSource() {
	let text = '{"type":"archboard_board_catalogue","boards":[],"omitted":0}';
	const listeners = new Set<() => void>();
	return {
		read: () => text,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set: (next: string) => {
			text = next;
			for (const listener of listeners) listener();
		},
		listeners,
	};
}

/**
 * Resolve once the coordinator has been handed that many catalogues.
 * @param h The harness.
 * @param count How many injections to wait for.
 * @returns Resolves when the count is reached.
 */
function injected(h: ReturnType<typeof harness>, count: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const check = (): void => {
			if (h.session.injections.length >= count) {
				h.session.afterInjection = null;
				resolve();
			}
		};
		h.session.afterInjection = check;
		check();
	});
}

test("hands the coordinator the catalogue at start and every replacement, never voice, and releases its watch", async () => {
	const source = catalogueSource();
	const h = harness(source);
	const { correlation } = await started(h);
	try {
		const start = h.session.starts[0]!;
		expect(start.initialItems).toEqual([]);
		expect(start.realtimeStartInstructions).not.toContain(source.read());
		await injected(h, 1);
		expect(JSON.stringify(h.session.injections[0])).toContain("archboard_board_catalogue");
		for (const text of ['{"boards":["payments","payments@proposed"]}', '{"boards":["payments"]}']) {
			const delivered = injected(h, h.session.injections.length + 1);
			source.set(text);
			source.set(text);
			await delivered;
			const injection = JSON.stringify(h.session.injections.at(-1));
			expect(injection).toContain("developer");
			expect(h.session.injections.at(-1)?.threadId).toBe(h.coordinatorThreadId);
			expect(injection).toContain(JSON.stringify(text).slice(1, -1));
		}
		expect(h.session.injections).toHaveLength(3);
		expect(h.session.texts).toHaveLength(0);
		expect(h.session.starts).toHaveLength(1);
		const stopped = h.adapter.stop(correlation);
		expect(source.listeners.size).toBe(0);
		await stopped;
	} finally {
		h.adapter.dispose();
	}
});

test("reports a lost coordinator update once and does not retry it", async () => {
	const source = catalogueSource();
	const h = harness(source);
	await started(h);
	try {
		await injected(h, 1);
		let attempts = 0;
		h.session.afterInjection = () => {
			attempts += 1;
			throw new Error("response lost");
		};
		source.set('{"boards":["payments"]}');
		source.set('{"boards":["payments"]}');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(attempts).toBe(1);
		expect(h.session.texts).toHaveLength(0);
		expect(
			h.events.filter(
				(event) =>
					event.kind === "diagnostic" &&
					event.message.includes("coordinator board catalogue update was not confirmed"),
			),
		).toHaveLength(1);
	} finally {
		h.adapter.dispose();
	}
});

test("delivers nothing further once the session's binding has changed", async () => {
	const source = catalogueSource();
	const h = harness(source);
	await started(h);
	try {
		await injected(h, 1);
		h.binding = null;
		source.set('{"boards":["payments"]}');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(h.session.injections).toHaveLength(1);
		expect(h.session.texts).toHaveLength(0);
	} finally {
		h.adapter.dispose();
	}
});
