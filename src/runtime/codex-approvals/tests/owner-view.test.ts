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

test("nested owner-view mutation cannot alter later views or settlement", async () => {
	const fixture = testBroker();
	try {
		const source = commandRequest(fixture.identity, "immutable-owner");
		const pending = fixture.broker.receive(source);
		const mutableSource = source as unknown as {
			params: { command: string; availableDecisions: string[] };
		};
		mutableSource.params.command = "echo source-tampered";
		mutableSource.params.availableDecisions.push("cancel");
		const view = fixture.broker.view(pending.requestId);
		const mutable = view as unknown as {
			request: {
				params: { command: string; availableDecisions: string[] };
				binding: { target: string };
			};
		};
		expect(() => (mutable.request.params.command = "echo tampered")).toThrow();
		expect(() => mutable.request.params.availableDecisions.push("cancel")).toThrow();
		expect(() => (mutable.request.binding.target = "tampered-target")).toThrow();

		const laterView = fixture.broker.view(pending.requestId);
		expect(laterView.request).toMatchObject({
			params: {
				command: "echo immutable-owner",
				availableDecisions: ["accept", "decline"],
			},
		});
		expect(laterView.request.binding.target).toBe(view.request.binding.target);
		const settlement = await fixture.broker.resolve({
			requestId: pending.requestId,
			approvalId: pending.approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		expect(settlement).toMatchObject({ state: "settled", outcome: "delivered" });
		expect(fixture.port.responses[0]?.response).toEqual({ result: { decision: "accept" } });
	} finally {
		closeBroker(fixture.broker);
	}
});

test("expiry and child exit mark terminals for acknowledgement after publication", async () => {
	const fixture = testBroker();
	try {
		const expired = fixture.broker.receive(commandRequest(fixture.identity, "expiry-delivery"));
		await fixture.broker.expire(expired.requestId);
		expect(fixture.broker.view(expired.requestId)).toMatchObject({
			snapshot: { state: "expired" },
			terminalDelivery: "after_publish",
		});

		const stale = fixture.broker.receive(commandRequest(fixture.identity, "child-delivery"));
		await fixture.broker.childExit({ child: stale.child, epoch: stale.epoch });
		expect(fixture.broker.view(stale.requestId)).toMatchObject({
			snapshot: { state: "stale" },
			terminalDelivery: "after_publish",
		});
	} finally {
		closeBroker(fixture.broker);
	}
});
