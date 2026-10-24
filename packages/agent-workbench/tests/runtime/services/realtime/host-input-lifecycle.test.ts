import { expect, test } from "bun:test";
import { correlation, harness, started } from "#tests/runtime/services/realtime/adapter-harness.ts";

test("a failed voice subscription releases context before a later start", async () => {
	const listeners = new Set<() => void>();
	let failVoice = true;
	const h = harness(
		{
			read: () => "Current application context.",
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		{
			subscribe: () => {
				if (failVoice) throw new Error("Voice source unavailable.");
				return () => {};
			},
		},
	);
	try {
		await expect(
			h.adapter.createOffer({ ...correlation(), sdp: "offer-sdp" }),
		).rejects.toBeInstanceOf(Error);
		expect(listeners.size).toBe(0);
		expect(h.session.starts).toHaveLength(0);
		expect(h.adapter.generation()).toBeNull();
		failVoice = false;
		await started(h, "replacement");
		expect(listeners.size).toBe(1);
		expect(h.session.starts).toHaveLength(1);
	} finally {
		h.adapter.dispose();
	}
	expect(listeners.size).toBe(0);
});

test("throwing host cleanups release both subscriptions once and do not block voice stop", async () => {
	let contextStops = 0;
	let voiceStops = 0;
	const h = harness(
		{
			read: () => "Current application context.",
			subscribe: () => () => {
				contextStops += 1;
				throw new Error("Context source cleanup failed.");
			},
		},
		{
			subscribe: () => () => {
				voiceStops += 1;
				throw new Error("Voice source cleanup failed.");
			},
		},
	);
	try {
		const start = await started(h);
		expect(await h.adapter.stop(start.correlation)).toMatchObject({ outcome: "delivered" });
		expect(h.session.stops).toHaveLength(1);
		expect(h.adapter.generation()).toBeNull();
	} finally {
		h.adapter.dispose();
	}
	expect(contextStops).toBe(1);
	expect(voiceStops).toBe(1);
	expect(h.events.filter((event) => event.kind === "diagnostic")).toHaveLength(2);
});
