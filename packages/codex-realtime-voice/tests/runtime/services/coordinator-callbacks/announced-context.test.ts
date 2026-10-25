import { describe, expect, test } from "bun:test";

import {
	close,
	contextEvent,
	harness,
	link,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

// What the tab's one callback queue does with a change a host announced to the coordinator or to
// the voice (TASK-530.05). How it gets there is `announce`'s; that the queue keeps its order, and
// drops the oldest past its buffer, is the queue's own and owned elsewhere.

describe("an announced change in the callback queue", () => {
	test("the voice is told the words quietly or as speech, and the coordinator as a developer message", async () => {
		const h = harness(true);
		const quiet = await h.callbacks.enqueue(contextEvent(h.ids, { sequence: 1 }));
		const spoken = await h.callbacks.enqueue(contextEvent(h.ids, { sequence: 2, speech: true }));
		const coordinator = await h.callbacks.enqueue({
			...contextEvent(h.ids, { sequence: 3 }),
			audience: "coordinator",
		});

		expect([quiet, spoken, coordinator].map(({ outcome, path }) => [outcome, path])).toEqual([
			["delivered", "realtime_appendText"],
			["delivered", "realtime_appendSpeech"],
			["delivered", "coordinator_context"],
		]);
		expect(h.realtimeRequests.map((request) => request.params.text)).toEqual([
			"Task changed.",
			"Task changed.",
		]);
		expect(h.injections).toEqual([{ threadId: h.ids.coordinator, text: "Task changed." }]);
		expect(h.reports).toHaveLength(0);
		close(h);
	});

	test("withheld words and a voice that is not live reach nobody, and say why", async () => {
		const live = harness(true);
		const withheld = await live.callbacks.enqueue(
			contextEvent(live.ids, { text: null, withheld: "not_shown" }),
		);
		const idle = harness(false);
		const inactive = await idle.callbacks.enqueue(contextEvent(idle.ids));

		expect(withheld).toMatchObject({ attempted: false, reason: "withheld" });
		expect(inactive).toMatchObject({ attempted: false, reason: "voice_inactive" });
		expect([...live.realtimeRequests, ...idle.realtimeRequests]).toHaveLength(0);
		expect([...live.injections, ...idle.injections]).toHaveLength(0);
		close(live);
		close(idle);
	});

	test("a change any thread of the tab made is its own, and one another thread made is told", async () => {
		const h = harness(true);
		const other = link(h.ids);
		const shop = h.ids.authorities.identity.decoder.adoptThreadId("workhorse-shop");
		h.state.others = [{ ...other, target: { ...other.target, threadId: shop } }];
		const authors = [String(h.ids.coordinator), String(h.ids.workhorse), String(shop), "outside"];
		const deliveries = await Promise.all(
			authors.map((author, sequence) =>
				h.callbacks.enqueue({ ...contextEvent(h.ids, { sequence, topic: null }), author }),
			),
		);

		expect(deliveries.map(({ reason }) => reason)).toEqual([
			"own_change",
			"own_change",
			"own_change",
			null,
		]);
		expect(h.realtimeRequests).toHaveLength(1);
		close(h);
	});

	test("while a change waits, a later one of its feed and topic replaces it; one with no topic does not", async () => {
		const h = harness(true);
		const [replaced, latest, first, second] = await Promise.all([
			h.callbacks.enqueue(contextEvent(h.ids, { sequence: 1, text: "Picked A." })),
			h.callbacks.enqueue(contextEvent(h.ids, { sequence: 2, text: "Picked B." })),
			h.callbacks.enqueue(contextEvent(h.ids, { sequence: 3, topic: null, text: "Wrote A." })),
			h.callbacks.enqueue(contextEvent(h.ids, { sequence: 4, topic: null, text: "Wrote B." })),
		]);

		expect(replaced).toMatchObject({ attempted: false, reason: "coalesced" });
		expect([latest, first, second].map(({ outcome }) => outcome)).toEqual([
			"delivered",
			"delivered",
			"delivered",
		]);
		expect(h.realtimeRequests.map((request) => request.params.text)).toEqual([
			"Picked B.",
			"Wrote A.",
			"Wrote B.",
		]);
		close(h);
	});
});
