// Who is told about a context change: a session hears every settled change except the ones it
// makes itself, whichever chat is showing, because no chat decides the recipients.
//
// These are the five cases that rule turns on.

import { describe, expect, test } from "bun:test";

import { createHarness } from "#tests/runtime/services/thread-context/delivery-support.ts";

describe("a session hears everything except its own writes", () => {
	test("its own session's write is not sent back to it", async () => {
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		const mine = await harness.delivery.deliver(harness.events({ by: "workhorse" }));

		expect(mine).toMatchObject({
			outcome: "not_delivered",
			reason: "own_change",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});

	test("the coordinator paired with it counts as the same session", async () => {
		// One session as far as a person talking to it is concerned: the voice
		// coordinator and the workhorse it drives. Neither is told about what the
		// other wrote, because to the person they are one participant.
		const harness = createHarness({ sessionAuthors: ["workhorse", "coordinator"] });

		const paired = await harness.delivery.deliver(harness.events({ by: "coordinator" }));

		expect(paired).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
		expect(harness.received).toHaveLength(0);
	});

	test("another session's write is delivered, and so is one nobody attributed", async () => {
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		// The news a session most needs: what it was told has stopped being true.
		const somebody = await harness.delivery.deliver(harness.events({ by: "another-thread" }));
		// And a write from outside this server — a person's terminal — which can
		// state no session at all. Delivered, because unattributable must never
		// mean unheard.
		const outside = await harness.delivery.deliver(harness.events({ sequence: 2, by: null }));

		expect(somebody).toMatchObject({ outcome: "delivered", attempted: true });
		expect(outside).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(2);
	});

	test("a session with no identity to compare hears everything, its own writes included", async () => {
		// Redundancy rather than silence. A port that cannot say which writes are
		// its own tells its thread about all of them; a thread hearing its own
		// change is noise it is told how to read, where missing somebody else's is
		// the failure this rule exists to prevent.
		const harness = createHarness({ sessionAuthors: [] });

		const anything = await harness.delivery.deliver(harness.events({ by: "workhorse" }));

		expect(anything).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});

	test("a new conversation is a new author, so the old identity is not its own", async () => {
		// A thread that goes on being the same thread is the same session, which is
		// why the identity is not minted per turn. A new conversation is a different thread,
		// and a change the previous one wrote is now somebody else's news.
		const harness = createHarness({ sessionAuthors: ["workhorse-after-new-conversation"] });

		const before = await harness.delivery.deliver(harness.events({ by: "workhorse" }));

		expect(before).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});
});

describe("the session a port is listening for can change under it", () => {
	test("a thread this session no longer is becomes somebody else's news", async () => {
		// New conversation puts a different thread on the same tab session, and a coordinator is
		// restarted inside one workhorse's life. Either way the port's own identity
		// moves, so what used to be its own writes become news — which is only true
		// if the identity is asked for as each change arrives rather than sampled
		// when the port was built.
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		const before = await harness.delivery.deliver(harness.events({ by: "workhorse" }));
		expect(before).toMatchObject({ outcome: "not_delivered", reason: "own_change" });

		harness.becomeSession(["workhorse-after-new-conversation"]);

		const old = await harness.delivery.deliver(harness.events({ sequence: 2, by: "workhorse" }));
		const now = await harness.delivery.deliver(
			harness.events({ sequence: 3, by: "workhorse-after-new-conversation" }),
		);

		expect(old).toMatchObject({ outcome: "delivered", attempted: true });
		expect(now).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
	});
});
