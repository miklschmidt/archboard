import { afterEach, describe, expect, test } from "bun:test";

import type { ApprovalOwnerView } from "#runtime/services/approvals/contract.ts";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import {
	createGatewayHarness,
	type GatewayHarness,
} from "#tests/server/support/gateway/support.ts";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const value of openHarnesses.splice(0)) {
		await value.gateway.dispose();
	}
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
		const connection = value.open();
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		connection.snapshot();
		const messages: unknown[] = [];
		connection.subscribe((message) => {
			messages.push(message);
			if (messages.length === 1) {
				throw new Error("terminal delta send failed");
			}
			connection.confirmPublished(message);
		});

		value.setOrdinaryApproval(spontaneousTerminal(approval));
		value.setReadiness("login_capable");

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
		const connection = value.open();
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

	test("a terminal retires once every connection of its own tab session has shown it", () => {
		const value = harness();
		const own = value.open();
		// Another browser tab is never shown this tab's approvals, so it cannot hold them back.
		const otherTab = value.gateway.connect(
			"browser-other-tab",
			value.paneId,
			parseTabSessionId("tab-other")!,
		);
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		own.snapshot();
		otherTab.snapshot();
		own.subscribe((message) => own.confirmPublished(message));
		otherTab.subscribe(() => undefined);

		value.setOrdinaryApproval(spontaneousTerminal(approval));

		expect(value.publishedAcknowledgements).toEqual([approval.request.requestId]);
	});

	test("a workhorse's terminal retires once every pane of its checkout has shown it", () => {
		const checkouts: Record<string, string> = {
			"browser-one": "/work/payments",
			"browser-two": "/work/shop",
		};
		const value = createGatewayHarness(undefined, undefined, undefined, {
			checkoutOf: (browserId) => checkouts[browserId] ?? "/work/payments",
			approvalCheckout: "/work/payments",
		});
		openHarnesses.push(value);
		const own = value.open();
		// A pane of the same tab in another checkout is never shown this workhorse's approvals.
		const otherCheckout = value.gateway.connect("browser-two", value.paneId, value.tabSessionId);
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		own.snapshot();
		otherCheckout.snapshot();
		own.subscribe((message) => own.confirmPublished(message));
		otherCheckout.subscribe((message) => otherCheckout.confirmPublished(message));

		value.setOrdinaryApproval(spontaneousTerminal(approval));

		expect(value.publishedAcknowledgements).toEqual([approval.request.requestId]);
	});

	test("gateway shutdown applies the zero-live terminal retirement rule", async () => {
		const value = harness();
		const connection = value.open();
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
