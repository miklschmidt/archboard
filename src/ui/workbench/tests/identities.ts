// Branded identities for the projection tests, minted through the real
// authority so no test asserts a plain string into an identity type.

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";

const authorities = createIdentityAuthorities();
const { decoder, issuer, validator } = authorities.identity;

const identities = {
	childId: validator.childId,
	epoch: validator.epoch,
	requestId: issuer.mintJsonRpcRequestId(),
	threadId: decoder.adoptThreadId("thread-0123456789abcdef"),
	turnId: decoder.adoptTurnId("turn-fixture"),
	itemId: decoder.adoptItemId("item-fixture"),
	approvalId: decoder.adoptApprovalId("approval-fixture"),
	/**
	 * A queued submission id.
	 * @param name The fixture name.
	 * @returns The branded id.
	 */
	queued: (name: string) => decoder.adoptQueuedSubmissionId(name),
};

export { identities };
