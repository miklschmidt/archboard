// Each checkout of a tab has its own workhorse, under its own link. What is guarded: a
// chat reads the link of the workhorse of its own checkout, and what it types reaches that
// workhorse and no other, whichever checkout another chat of the same tab is in.

import { afterEach, expect, test } from "bun:test";

import { interruptCommand, startCommand } from "#tests/server/support/gateway/helpers.ts";
import {
	createGatewayHarness,
	type GatewayHarness,
} from "#tests/server/support/gateway/support.ts";
import { executableLink } from "#tests/server/support/gateway/support-values.ts";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) {
		await openHarness.gateway.dispose();
	}
});

const PAYMENTS = "/work/payments";
const SHOP = "/work/shop";

test("a typed message reaches the workhorse of its chat's checkout, under that workhorse's link", async () => {
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
	const shop = value.gateway.connect("browser-two", value.chatId, value.tabSessionId);

	// Each chat is shown the link of its own checkout's workhorse.
	expect(payments.snapshot().snapshot.threadLink).toMatchObject({ threadId: value.threadId });
	expect(shop.snapshot().snapshot.threadLink).toMatchObject({ threadId: shopThreadId });

	const fromShop = await shop.command(startCommand(value, shop.claimLease(), shopThreadId));
	expect(fromShop.outcome).toBe("delivered");
	// A chat cannot type into the other checkout's conversation.
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

// The shown conversation is the checkout every chat of the tab reads. What is guarded:
// a Stop pressed under a lease taken before the tab was switched to another checkout is refused,
// never sent to the conversation the person no longer sees, and the next lease is the new one's.
test("a lease taken before the shown conversation switched is refused, and a new one runs on the shown workhorse", async () => {
	const shown = { checkout: PAYMENTS };
	let shopThread: ReturnType<typeof executableLink> | null = null;
	const value = createGatewayHarness(undefined, undefined, undefined, {
		checkoutOf: () => shown.checkout,
		linkFor: (key) => (key.includes(SHOP) ? shopThread : null),
	});
	openHarnesses.push(value);
	const shopThreadId = value.model.ThreadIdSchema.parse(
		value.authorities.identity.decoder.adoptThreadId("shop"),
	);
	shopThread = executableLink(value.childId, value.epoch, shopThreadId);
	const chat = value.open();
	const before = chat.claimLease();

	shown.checkout = SHOP;
	const raced = await chat.command(interruptCommand(value, before));
	expect(raced).toMatchObject({ outcome: "not_delivered", code: "link_changed" });
	expect(() => chat.renewLease()).toThrow();
	expect(value.calls).toEqual([]);

	expect(chat.snapshot().snapshot.threadLink).toMatchObject({ threadId: shopThreadId });
	const typed = await chat.command(startCommand(value, chat.claimLease(), shopThreadId));
	expect(typed.outcome).toBe("delivered");
	expect(value.actionContexts).toEqual([
		expect.objectContaining({
			checkout: SHOP,
			link: expect.objectContaining({ threadId: shopThreadId }),
		}),
	]);
});

// What is guarded: the person activates another checkout while a command runs on the workhorse
// that was shown when it was sent, such as a voice start, which takes seconds. That workhorse's
// link did not move, so the command's outcome is still known and is answered as it is; a voice
// start answered as unknown would leave a session running that the browser never connected.
test("a command running when the shown conversation switches keeps its outcome", async () => {
	const shown = { checkout: PAYMENTS };
	const value = createGatewayHarness(undefined, undefined, undefined, {
		checkoutOf: () => shown.checkout,
		linkFor: () => null,
	});
	openHarnesses.push(value);
	const chat = value.open();
	let settle: (() => void) | undefined;
	value.setActionGate(
		new Promise((resolve) => {
			settle = () => resolve(undefined);
		}),
	);
	const running = chat.command(startCommand(value, chat.claimLease()));
	await Promise.resolve();

	shown.checkout = SHOP;
	settle?.();
	expect(await running).toMatchObject({ outcome: "delivered", code: null });
	expect(value.actionContexts).toEqual([expect.objectContaining({ checkout: PAYMENTS })]);
});
