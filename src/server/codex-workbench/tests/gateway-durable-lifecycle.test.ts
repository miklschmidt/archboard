import { afterEach, describe, expect, test } from "bun:test";

import { realtimeCommand } from "./helpers.js";
import { createGatewayHarness, type GatewayHarness } from "./support.js";

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
		value.gateway.connect(value.browserId, value.paneId, staleInstance).claimLease();
		const current = value.gateway.connect(value.browserId, value.paneId, currentInstance);
		const lease = current.claimLease();

		await value.gateway.closeConnection(value.browserId, value.paneId, staleInstance);
		expect(current.renewLease()).toMatchObject({ commandId: lease.commandId, state: "active" });
		await value.gateway.closeConnection(value.browserId, value.paneId, currentInstance);
		expect(() => current.snapshot()).toThrow("closed");
	});

	test("release and reacquire preserve semantic and realtime state until exact close", async () => {
		const value = createGatewayHarness();
		openHarnesses.push(value);
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const startLease = connection.claimLease();
		expect(
			(await connection.command(realtimeCommand(value, startLease, "realtimeStart"))).outcome,
		).toBe("delivered");
		connection.releaseLease();
		expect(value.durableDisconnects).toEqual([]);
		expect(value.durableState()).toEqual({ semanticBound: true, realtimeActive: true });

		const appendLease = connection.claimLease();
		expect(
			(
				await connection.command(
					realtimeCommand(value, appendLease, "realtimeAppendText", startLease.commandId),
				)
			).outcome,
		).toBe("delivered");
		expect(value.durableDisconnects).toEqual([]);
		await connection.close();
		expect(value.durableDisconnects).toEqual([
			"semantic:browser_disconnected",
			"realtime:browser_disconnected",
		]);
		expect(value.durableState()).toEqual({ semanticBound: false, realtimeActive: false });
	});
});
