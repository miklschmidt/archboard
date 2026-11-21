// Branded identities for the projection tests, branded through the browser
// model so no test asserts a plain string into an identity type.

import { browserIdentities } from "#tests/ui/support/browser-identities.ts";

const ids = browserIdentities();

const identities = {
	childId: ids.child,
	epoch: ids.epoch,
	requestId: ids.nextJsonRpcRequest(),
	threadId: ids.thread("thread-0123456789abcdef"),
	turnId: ids.turn("turn-fixture"),
	itemId: ids.item("item-fixture"),
	approvalId: ids.approval("approval-fixture"),
	/**
	 * A queued submission id.
	 * @param name The fixture name.
	 * @returns The branded id.
	 */
	queued: (name: string) => ids.queuedSubmission(name),
};

export { identities };
