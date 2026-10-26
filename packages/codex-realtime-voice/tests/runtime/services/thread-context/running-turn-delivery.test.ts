// A context change reaching a workhorse while it runs a turn. The turn
// makes the thread's observed status active; the link's binding was taken while
// it was idle. What the final gate compares is the link's identity — thread,
// child, epoch — not what was observed of the thread.

import { expect, test } from "bun:test";

import {
	createHarness,
	executableLink,
} from "#tests/runtime/services/thread-context/delivery-support.ts";

test("a link that differs from the binding only by a running turn's status still delivers", async () => {
	const harness = createHarness();
	const bound = executableLink(
		harness.target.childId,
		harness.target.epoch,
		harness.target.threadId,
	);
	harness.setClassificationLink({ ...bound, status: "active" });

	const result = await harness.delivery.deliver(harness.events());

	expect(result).toMatchObject({ outcome: "delivered", attempted: true });
	expect(harness.received).toHaveLength(1);
});

test("a link to another thread or another epoch is still refused before writing", async () => {
	const otherThread = createHarness();
	otherThread.setClassificationLink(
		executableLink(
			otherThread.target.childId,
			otherThread.target.epoch,
			otherThread.authority.decoder.adoptThreadId("another-thread"),
		),
	);
	const otherEpoch = createHarness();
	otherEpoch.setClassificationLink(
		executableLink(
			otherEpoch.target.childId,
			otherEpoch.authority.issuer.mintChildEpoch(),
			otherEpoch.target.threadId,
		),
	);

	for (const harness of [otherThread, otherEpoch]) {
		const result = await harness.delivery.deliver(harness.events());
		expect(result).toMatchObject({ outcome: "not_delivered", attempted: false });
		expect(harness.received).toHaveLength(0);
	}
});
