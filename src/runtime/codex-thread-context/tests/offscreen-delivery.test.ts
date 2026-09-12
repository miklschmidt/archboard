// A board change reaching a running session while nothing is on screen.
//
// The port subscribes to the publisher and injects into the thread; what is
// asserted here is the injection itself — the `thread/inject_items` the thread
// receives — rather than a context object or a refusal reason. Three things had
// to stop being true for this to work at all: a closed browser cleared the
// binding, so there was no port left to receive anything; a missing pane report
// read as stale board truth, so the event was refused as stale; and the context
// was only built when a pane was showing the very board that changed.
//
// Nothing here mentions a pane. That is the point: the recipient is the session.

import { expect, test } from "bun:test";

import { createHarness } from "./delivery-support.ts";

test("an event published while nothing is on screen is injected into the thread", async () => {
	// The harness's event carries no pane state worth having — focused false,
	// nothing selected — which is what a change on a board no pane is showing
	// produces. It is delivered because a session hears every board update.
	const harness = createHarness({ sessionAuthors: ["somebody-else"] });

	harness.emit(harness.events({ origin: "agent", by: "another-thread", focused: false }));
	await harness.flush();

	// The injection itself: the thread was handed the news.
	expect(harness.received).toHaveLength(1);
	expect(harness.received[0]?.threadId).toBe(harness.target.threadId);
});

test("the same event from this session's own thread is injected into nobody", async () => {
	const harness = createHarness({ sessionAuthors: ["mine"] });

	harness.emit(harness.events({ origin: "agent", by: "mine", focused: false }));
	await harness.flush();

	expect(harness.received).toHaveLength(0);
});
