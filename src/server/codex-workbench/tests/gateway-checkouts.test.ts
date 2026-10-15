// Each checkout of a tab has its own workhorse, under its own link (ADR 0050). What is guarded: a
// pane reads the link of the workhorse of its own checkout, and what it types reaches that
// workhorse and no other, whichever checkout another pane of the same tab is in.

import { afterEach, expect, test } from "bun:test";

import { startCommand } from "./helpers.js";
import { createGatewayHarness, type GatewayHarness } from "./support.js";
import { executableLink } from "./support-values.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) {
		await openHarness.gateway.dispose();
	}
});

const PAYMENTS = "/work/payments";
const SHOP = "/work/shop";

test("a typed message reaches the workhorse of its pane's checkout, under that workhorse's link", async () => {
	const checkouts: Record<string, string> = { "browser-one": PAYMENTS, "browser-two": SHOP };
	let shopThread: ReturnType<typeof executableLink> | null = null;
	const value = createGatewayHarness(undefined, undefined, undefined, {
		checkoutOf: (browserId) => checkouts[browserId] ?? PAYMENTS,
		linkFor: (key) => (key.includes(SHOP) ? shopThread : null),
	});
	openHarnesses.push(value);
	const { childId, epoch } = value;
	const shopThreadId = value.model.ThreadIdSchema.parse(
		value.authorities.identity.decoder.adoptThreadId("shop"),
	);
	shopThread = executableLink(childId, epoch, shopThreadId);
	const payments = value.open();
	const shop = value.gateway.connect("browser-two", value.paneId, value.tabSessionId);

	// Each pane is shown the link of its own checkout's workhorse.
	expect(payments.snapshot().snapshot.threadLink).toMatchObject({ threadId: value.threadId });
	expect(shop.snapshot().snapshot.threadLink).toMatchObject({ threadId: shopThreadId });

	const fromShop = await shop.command(startCommand(value, shop.claimLease(), shopThreadId));
	expect(fromShop.outcome).toBe("delivered");
	// A pane cannot type into the other checkout's conversation.
	const crossed = await shop.command(startCommand(value, shop.claimLease(), value.threadId));
	expect(crossed).toMatchObject({ outcome: "not_delivered", code: "link_changed" });
	const fromPayments = await payments.command(startCommand(value, payments.claimLease()));
	expect(fromPayments.outcome).toBe("delivered");

	expect(value.calls).toEqual(["text.start", "text.start"]);
	expect(value.actionContexts).toEqual([
		expect.objectContaining({
			checkout: SHOP,
			link: expect.objectContaining({ threadId: shopThreadId }),
		}),
		expect.objectContaining({
			checkout: PAYMENTS,
			link: expect.objectContaining({ threadId: value.threadId }),
		}),
	]);
});
