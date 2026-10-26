import { afterEach, describe, expect, test } from "bun:test";

import { realtimeCommand } from "#tests/server/support/gateway/helpers.ts";
import {
	createGatewayHarness,
	type GatewayHarness,
} from "#tests/server/support/gateway/support.ts";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) {
		await openHarness.gateway.dispose();
	}
});

describe("Codex workbench durable browser lifecycle", () => {
	test("exact close after socket replacement ignores stale ownership", async () => {
		const value = createGatewayHarness();
		openHarnesses.push(value);
		const staleInstance = Object.freeze({ socket: "stale" });
		const currentInstance = Object.freeze({ socket: "current" });
		value.gateway
			.connect(value.browserId, value.chatId, value.tabSessionId, staleInstance)
			.claimLease();
		const current = value.open(currentInstance);
		const lease = current.claimLease();

		await value.gateway.closeConnection(value.browserId, value.chatId, staleInstance);
		expect(current.renewLease()).toMatchObject({ commandId: lease.commandId, state: "active" });
		await value.gateway.closeConnection(value.browserId, value.chatId, currentInstance);
		expect(() => current.snapshot()).toThrow("closed");
	});

	test("release and reacquire preserve realtime state until exact close", async () => {
		const value = createGatewayHarness();
		openHarnesses.push(value);
		const connection = value.open();
		const startLease = connection.claimLease();
		expect(
			(await connection.command(realtimeCommand(value, startLease, "realtimeStart"))).outcome,
		).toBe("delivered");
		connection.releaseLease();
		expect(value.disconnectReasons).toEqual([]);
		expect(value.realtimeActive()).toBeTrue();

		const appendLease = connection.claimLease();
		expect(
			(
				await connection.command(
					realtimeCommand(value, appendLease, "realtimeAppendText", startLease.commandId),
				)
			).outcome,
		).toBe("delivered");
		expect(value.disconnectReasons).toEqual([]);
		await connection.close();
		expect(value.disconnectReasons).toEqual(["browser_disconnected"]);
		expect(value.realtimeActive()).toBeFalse();
	});
});
