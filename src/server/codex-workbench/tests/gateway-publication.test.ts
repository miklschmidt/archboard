import { afterEach, describe, expect, test } from "bun:test";

import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import { createGatewayHarness, type GatewayHarness } from "./support.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const value of openHarnesses.splice(0)) await value.gateway.dispose();
});

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

function spontaneousTerminal(approval: ApprovalOwnerView): ApprovalOwnerView {
	return {
		...approval,
		terminalDelivery: "after_publish",
		snapshot: {
			...approval.snapshot,
			state: "expired",
			decision: "cancelled",
			outcome: "delivered",
			reason: "The approval expired.",
		},
		spoken: { eligible: false, reason: "not_pending" },
	};
}

describe("Codex workbench terminal publication", () => {
	test("an unrelated successful delta cannot credit a previously failed terminal payload", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		connection.snapshot();
		const messages: unknown[] = [];
		connection.subscribe((message) => {
			messages.push(message);
			if (messages.length === 1) throw new Error("terminal delta send failed");
			connection.confirmPublished(message);
		});

		value.setOrdinaryApproval(spontaneousTerminal(approval));
		value.setReadiness("account_ready");

		expect(messages).toHaveLength(2);
		expect(JSON.stringify(messages[1])).not.toContain(String(approval.request.requestId));
		const recovered = connection.snapshot();
		expect(recovered.snapshot.approvals).toEqual([
			expect.objectContaining({ requestId: approval.request.requestId }),
		]);
		connection.confirmPublished(recovered.snapshot);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("a successful media event retires its terminal without result confirmation", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const approval = spontaneousTerminal(value.makeOrdinaryApproval());
		connection.snapshot();
		const messages: unknown[] = [];
		connection.subscribe((message) => {
			messages.push(message);
			connection.confirmPublished(message);
		});
		value.setOrdinaryApproval(approval, false);

		connection.setMediaReady(true);

		expect(JSON.stringify(messages)).toContain(String(approval.request.requestId));
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("gateway shutdown applies the zero-live terminal retirement rule", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		connection.snapshot();
		connection.subscribe(() => {
			throw new Error("terminal delta send failed");
		});
		value.setOrdinaryApproval(spontaneousTerminal(approval));
		expect(value.publishedAcknowledgements).toEqual([]);

		await value.gateway.dispose();

		expect(value.publishedAcknowledgements).toEqual([approval.request.requestId]);
		openHarnesses.splice(openHarnesses.indexOf(value), 1);
	});
});
