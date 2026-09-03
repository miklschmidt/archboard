import { expect, test } from "bun:test";

import { closeBroker, commandRequest, permissionsRequest, testBroker } from "./support.js";

test("the approval owner view retains normalized request and terminal settlement state", async () => {
	const fixture = testBroker();
	try {
		const pending = fixture.broker.receive(commandRequest(fixture.identity, "owner-lifecycle"));
		const pendingView = fixture.broker.view(pending.requestId);
		expect(pendingView).toMatchObject({
			kind: "approval_owner",
			request: { family: "command_execution", params: { command: "echo owner-lifecycle" } },
			snapshot: { state: "pending", decision: null, outcome: null },
			spoken: { eligible: true, reason: "eligible" },
		});

		await fixture.broker.resolve({
			requestId: pending.requestId,
			approvalId: pending.approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		expect(fixture.broker.view(pending.requestId)).toMatchObject({
			snapshot: { state: "settled", decision: "approved", outcome: "delivered" },
			spoken: { eligible: false, reason: "not_pending" },
		});
		fixture.broker.acknowledge(pending.requestId);
		expect(fixture.broker.get(pending.requestId)).toBeUndefined();
	} finally {
		closeBroker(fixture.broker);
	}
});

test("the approval owner view carries generated permission authority without browser presentation", async () => {
	const fixture = testBroker();
	try {
		const pending = fixture.broker.receive(
			permissionsRequest(fixture.identity, "owner-permissions"),
		);
		const [view] = fixture.broker.inspectViews();
		expect(view?.request).toMatchObject({
			family: "permissions",
			params: {
				cwd: "/workspace",
				permissions: {
					fileSystem: {
						read: ["/workspace"],
						entries: [{ access: "deny" }],
					},
				},
			},
		});
		expect(view).not.toHaveProperty("approvalKind");
		await fixture.broker.cancel(pending.requestId);
	} finally {
		closeBroker(fixture.broker);
	}
});
