// What the coordinator half of a session is told about board changes.
//
// A session hears every board update except the ones it makes itself, and the
// coordinator and the workhorse it drives are one session — one participant, as
// far as the person talking to them is concerned. So a change either of them
// wrote must not come back as voice.
//
// This is the second half of that rule. The workhorse's own delivery port
// refuses its session's writes; the coordinator subscribes to the same
// publisher independently, and a normalized voice callback keeps what is said
// out loud and discards who wrote it — so without a gate here, a write the
// workhorse was spared was still read out by its own pair.

import { expect, test } from "bun:test";

import { harness } from "./support.js";

test("neither half of a session hears what the other wrote", async () => {
	const h = harness(true);

	// The workhorse's own write, and the coordinator's own, by the live
	// identities this callback path reads at the moment each change arrives.
	const own = await Promise.all([
		h.callbacks.enqueue({
			...h.semantic.change,
			change: { ...h.semantic.change.change, by: String(h.state.link?.target.threadId) },
		}),
		h.callbacks.enqueue({
			...h.semantic.change,
			change: { ...h.semantic.change.change, by: String(h.state.coordinator?.threadId) },
		}),
	]);

	for (const delivery of own) {
		expect(delivery).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
	}
	expect(h.injections).toHaveLength(0);
	expect(h.realtimeRequests).toHaveLength(0);
});

test("another session's write, and one nobody attributed, are both spoken", async () => {
	const h = harness(true);

	const somebody = await h.callbacks.enqueue({
		...h.semantic.change,
		change: { ...h.semantic.change.change, by: "another-thread" },
	});
	const outside = await h.callbacks.enqueue(h.semantic.change);

	// Delivered means it reached the voice path rather than being dropped for
	// whose work it was; what the realtime port then did with it is its own
	// business and is owned elsewhere.
	for (const delivery of [somebody, outside]) {
		expect(delivery.reason).not.toBe("own_change");
	}
	expect(h.semantic.change.change.by).toBeNull();
});

test("the filter reads the live pair, not the pair there was when it started", async () => {
	const h = harness(true);
	const replacement = "coordinator-after-a-restart";

	// A coordinator is created, restarted and retired inside one workhorse's
	// life. The identity is asked for as each change arrives, so the pair the
	// filter recognises is the pair that exists now — a value sampled once would
	// go on sparing a thread that is gone and start speaking the one that is here.
	h.state.coordinator =
		h.state.coordinator === null
			? null
			: { ...h.state.coordinator, threadId: replacement as never };

	const restarted = await h.callbacks.enqueue({
		...h.semantic.change,
		change: { ...h.semantic.change.change, by: replacement },
	});

	expect(restarted).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
});

test("after a relink the coordinator hears the new thread's news and not its writes", async () => {
	// The correlation follows the bound thread — the production provider reads it
	// from the thread-context binding — so this sets the harness's live link to
	// the relinked thread and asks the real callbacks what they do with it.
	const h = harness(true);
	const relinked = "workhorse-after-relink";
	// Everything the delivery authority asks about the link, moved to the
	// relinked thread: the correlation the production reader now derives from the
	// thread-context binding, the link evidence it captured, and what the
	// classifier says the pane is on. In production all three read live state;
	// the fixture holds them, so the test moves them together.
	h.state.link =
		h.state.link === null
			? null
			: {
					binding: {
						...h.state.link.binding,
						link: { ...h.state.link.binding.link, threadId: relinked as never },
					},
					target: { ...h.state.link.target, threadId: relinked as never },
				};

	h.state.classification = {
		...h.state.classification,
		link: { ...h.state.classification.link, threadId: relinked as never },
	};

	const own = await h.callbacks.enqueue({
		...h.semantic.change,
		workhorse: { ...h.semantic.change.workhorse, threadId: relinked as never },
		change: { ...h.semantic.change.change, by: relinked },
	});
	const external = await h.callbacks.enqueue({
		...h.semantic.change,
		workhorse: { ...h.semantic.change.workhorse, threadId: relinked as never },
		change: {
			...h.semantic.change.change,
			by: "somebody-else",
			cursor: { feedId: "feed-1", sequence: 9 },
		},
	});

	// Its own write is refused for being its own, and somebody else's is not
	// refused for a link that stopped matching.
	expect(own).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
	expect(external.reason).not.toBe("stale_link");
	expect(external.reason).not.toBe("own_change");
});
