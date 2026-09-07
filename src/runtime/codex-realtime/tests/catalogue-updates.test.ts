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

test("injects catalogue replacements into both models without starting turns and releases its watch", async () => {
	const source = catalogueSource();
	const h = harness(source);
	const { correlation } = await started(h);
	try {
		const start = h.session.starts[0]!;
		expect(start.initialItems?.[1]?.text).toBe(source.read());
		expect(start.realtimeStartInstructions).toContain(source.read());
		for (const text of ['{"boards":["payments","payments@proposed"]}', '{"boards":["payments"]}']) {
			const delivered = new Promise<void>((resolve) => {
				h.session.afterAppendText = resolve;
			});
			source.set(text);
			source.set(text);
			await delivered;
			const injection = JSON.stringify(h.session.injections.at(-1));
			expect(injection).toContain("developer");
			expect(h.session.injections.at(-1)?.threadId).toBe(h.coordinatorThreadId);
			expect(h.session.texts.at(-1)).toMatchObject({
				threadId: h.coordinatorThreadId,
				role: "developer",
			});
			expect(h.session.texts.at(-1)?.text).toContain(text);
			expect(injection).toContain(JSON.stringify(text).slice(1, -1));
		}
		expect(h.session.injections).toHaveLength(2);
		expect(h.session.starts).toHaveLength(1);
		const stopped = h.adapter.stop(correlation);
		expect(source.listeners.size).toBe(0);
		await stopped;
	} finally {
		h.adapter.dispose();
	}
	expect(source.listeners.size).toBe(0);
});

test("reports a lost coordinator update once while still updating voice", async () => {
	const source = catalogueSource();
	const h = harness(source);
	await started(h);
	try {
		h.session.afterInjection = () => {
			throw new Error("response lost");
		};
		await new Promise<void>((resolve) => {
			h.session.afterAppendText = resolve;
			source.set('{"boards":["payments"]}');
			source.set('{"boards":["payments"]}');
		});
		expect(h.session.injections).toHaveLength(1);
		expect(h.session.texts).toHaveLength(1);
		expect(h.events).toContainEqual(
			expect.objectContaining({
				kind: "diagnostic",
				message: expect.stringContaining("coordinator board catalogue update was not confirmed"),
			}),
		);
	} finally {
		h.adapter.dispose();
	}
});

test("does not forward catalogue data into a voice session whose binding changed during injection", async () => {
	const source = catalogueSource();
	const h = harness(source);
	await started(h);
	try {
		await new Promise<void>((resolve) => {
			h.session.afterInjection = () => {
				h.binding = null;
				resolve();
			};
			source.set('{"boards":["payments"]}');
		});
		await Promise.resolve();
		expect(h.session.injections).toHaveLength(1);
		expect(h.session.texts).toHaveLength(0);
	} finally {
		h.adapter.dispose();
	}
});
