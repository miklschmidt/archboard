// Who is told about a board change, now that a pane has stopped deciding.
//
// The rule a reader settled: an active agent session receives every board
// update except the ones it makes itself. What it replaced was a surface
// deciding recipients — a write stated the pane it was running for, a delivery
// port dropped changes whose pane matched its own, and the context check
// required that pane to be showing the board that changed. So a person closing
// a pane, or looking at another board, silenced the session bound to it; and two
// threads on one claimed board suppressed each other.
//
// These are the five cases that rule turns on.

import { describe, expect, test } from "bun:test";

import { createHarness } from "./delivery-support.ts";

describe("a session hears everything except its own writes", () => {
	test("its own session's write is not sent back to it", async () => {
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		const mine = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "workhorse" }),
		);

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

		const paired = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "coordinator" }),
		);

		expect(paired).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
		expect(harness.received).toHaveLength(0);
	});

	test("another session's write is delivered, and so is one nobody attributed", async () => {
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		// The news a session most needs: what it was told has stopped being true.
		const somebody = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "another-thread" }),
		);
		// And a write from outside this canvas — a person's terminal — which can
		// state no session at all. Delivered, because unattributable must never
		// mean unheard.
		const outside = await harness.delivery.deliver(
			harness.events({ sequence: 2, origin: "agent", by: null }),
		);

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

		const anything = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "workhorse" }),
		);

		expect(anything).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});

	test("a relinked session is a new author, so the old identity is not its own", async () => {
		// A thread that goes on being the same thread is the same session, which is
		// why the identity is not minted per turn. A relink is a different thread,
		// and a change the previous one wrote is now somebody else's news.
		const harness = createHarness({ sessionAuthors: ["workhorse-after-relink"] });

		const before = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "workhorse" }),
		);

		expect(before).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});
});

describe("the session a port is listening for can change under it", () => {
	test("a thread this session no longer is becomes somebody else's news", async () => {
		// A relink puts a different thread on the same pane, and a coordinator is
		// restarted inside one workhorse's life. Either way the port's own identity
		// moves, so what used to be its own writes become news — which is only true
		// if the identity is asked for as each change arrives rather than sampled
		// when the port was built.
		const harness = createHarness({ sessionAuthors: ["workhorse"] });

		const before = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "workhorse" }),
		);
		expect(before).toMatchObject({ outcome: "not_delivered", reason: "own_change" });

		harness.becomeSession(["workhorse-after-relink"]);

		const old = await harness.delivery.deliver(
			harness.events({ sequence: 2, origin: "agent", by: "workhorse" }),
		);
		const now = await harness.delivery.deliver(
			harness.events({ sequence: 3, origin: "agent", by: "workhorse-after-relink" }),
		);

		expect(old).toMatchObject({ outcome: "delivered", attempted: true });
		expect(now).toMatchObject({ outcome: "not_delivered", reason: "own_change" });
	});
});
