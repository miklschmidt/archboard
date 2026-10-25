import { afterEach, describe, expect, test } from "bun:test";

import { startCommand } from "#tests/server/support/gateway/helpers.ts";
import {
	createGatewayHarness,
	type GatewayHarness,
} from "#tests/server/support/gateway/support.ts";
import { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";

// One command lease per browser tab session: the chats of one tab hand it to each
// other, and another tab's claim, renewal or expiry never touches it.

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) {
		await openHarness.gateway.dispose();
	}
});

/** A second browser tab on the same server. */
const OTHER_TAB = parseTabSessionId("tab-two")!;

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

describe("Codex workbench browser command leases", () => {
	test("a claim releases only its own tab session's lease", async () => {
		const value = harness();
		const first = value.open();
		const sibling = value.gateway.connect("browser-two", "chat-two", value.tabSessionId);
		const otherTab = value.gateway.connect("browser-three", "chat-one", OTHER_TAB);
		const firstLease = first.claimLease();
		const otherLease = otherTab.claimLease();
		expect((await first.command(startCommand(value, firstLease))).outcome).toBe("delivered");

		// The other chat of the same tab takes the lease; the other tab keeps its own.
		const siblingLease = sibling.claimLease();
		expect(siblingLease.commandId).not.toBe(firstLease.commandId);
		expect(value.disconnectReasons).toEqual([]);
		const transferred = await first.command(startCommand(value, firstLease));
		expect(transferred).toMatchObject({ code: "lease_transferred", outcome: "not_delivered" });
		expect((await otherTab.command(startCommand(value, otherLease))).outcome).toBe("delivered");
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(2);
	});

	test("expires once, makes expiry visible, and allows recovery with a new lease", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		value.advance(100_000);
		const otherTab = value.gateway.connect("browser-other", value.chatId, OTHER_TAB);
		const otherLease = otherTab.claimLease();
		value.advance(50_001);
		const result = await connection.command(startCommand(value, lease));
		expect(result).toMatchObject({ code: "lease_expired", outcome: "not_delivered" });
		// Another tab's lease runs on its own clock.
		expect((await otherTab.command(startCommand(value, otherLease))).outcome).toBe("delivered");
		expect(result.snapshot.lease).toMatchObject({ commandId: lease.commandId, state: "expired" });
		expect(result.snapshot.operation).toMatchObject({
			operationId: lease.commandId,
			outcome: "not_delivered",
		});
		expect(value.disconnectReasons).toEqual([]);
		const recovered = connection.claimLease();
		expect(recovered.commandId).not.toBe(lease.commandId);
	});

	test("renews a tab session's lease and keeps its exact binding", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		value.advance(1_000);
		value.gateway.connect("browser-other", "chat-other", OTHER_TAB).claimLease();
		const renewed = connection.renewLease();
		expect(renewed.commandId).toBe(lease.commandId);
		expect(renewed.chatId).toBe(lease.chatId);
		expect(renewed.childId).toBe(lease.childId);
		expect(renewed.epoch).toBe(lease.epoch);
		expect(renewed.expiresAtMs).toBeGreaterThan(lease.expiresAtMs);
		expect((await connection.command(startCommand(value, renewed))).outcome).toBe("delivered");
	});

	test("does not deliver a command after the captured link changes", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		value.setLink({
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: value.threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: false,
			reason: "direct_input_false",
		});
		const result = await connection.command(startCommand(value, lease));
		expect(result).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
		expect(value.calls).not.toContain("text.start");
	});
});

test("a tab session's end forgets its lease and leaves another tab's", async () => {
	const leaseLedger = createBrowserLeaseLedger();
	const value = createGatewayHarness(undefined, undefined, undefined, { leaseLedger });
	openHarnesses.push(value);
	const connection = value.open();
	connection.claimLease();
	const otherTab = value.gateway.connect("browser-other", value.chatId, OTHER_TAB);
	const otherLease = otherTab.claimLease();
	await connection.close();

	value.endSession();

	// Nothing of the ended session is kept for the rest of the server's life.
	expect([...leaseLedger.sessions.keys()]).toEqual([OTHER_TAB]);
	expect((await otherTab.command(startCommand(value, otherLease))).outcome).toBe("delivered");
	// A tab that comes back under the same id starts on a fresh lease.
	expect(value.open().claimLease().state).toBe("active");
});
