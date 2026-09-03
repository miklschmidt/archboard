import { expect, test } from "bun:test";

import {
	closeBroker,
	commandRequest,
	elicitationRequest,
	permissionsRequest,
	testBroker,
} from "./support.js";

test("browser approval projection retains authority and terminal decision", async () => {
	const fixture = testBroker();
	try {
		const pending = fixture.broker.receive(commandRequest(fixture.identity, "browser-lifecycle"));
		expect(fixture.broker.toBrowserApproval(pending.requestId)).toMatchObject({
			lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
			binding: pending.binding,
			spoken: { eligible: true, reason: "eligible" },
		});
		await fixture.broker.resolve({
			requestId: pending.requestId,
			approvalId: pending.approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		expect(fixture.broker.toBrowserApproval(pending.requestId)).toMatchObject({
			lifecycle: { state: "settled", decision: "approved", outcome: "delivered" },
			spoken: { eligible: false, reason: "not_pending" },
		});
	} finally {
		closeBroker(fixture.broker);
	}
});

test("browser approval projection preserves elicitation constraints and requested permissions", async () => {
	const fixture = testBroker();
	try {
		const form = fixture.broker.receive(
			elicitationRequest(fixture.identity, "browser-form", "form"),
		);
		expect(fixture.broker.toBrowserApproval(form.requestId)).toMatchObject({
			approvalKind: "elicitation",
			fields: [
				{
					name: "name",
					title: "Name",
					description: "Display name",
					minLength: 2,
					maxLength: 40,
					defaultValue: "Ada",
				},
				{ name: "kind", options: ["a", "b"], defaultValue: "a" },
			],
		});

		const permissions = fixture.broker.receive(
			permissionsRequest(fixture.identity, "browser-permissions"),
		);
		const request = fixture.broker.getRequest(permissions.requestId);
		const card = fixture.broker.toBrowserApproval(permissions.requestId);
		if (request?.family !== "permissions" || card.approvalKind !== "permissions")
			throw new Error("permission fixture did not retain its family");
		expect(card.requestedPermissions).toEqual(request.params.permissions);
		await fixture.broker.cancel(form.requestId);
		await fixture.broker.cancel(permissions.requestId);
	} finally {
		closeBroker(fixture.broker);
	}
});
