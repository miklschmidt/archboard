import { afterEach, describe, expect, test } from "bun:test";

import {
	dynamicResponse,
	expectGatewayError,
	expectRejected,
	startCommand,
} from "#tests/server/support/gateway/helpers.ts";
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

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	const state: { resolve: () => void } = { resolve: () => undefined };
	const promise = new Promise<void>((resolve) => {
		state.resolve = () => resolve();
	});
	return { promise, resolve: () => state.resolve() };
}

describe("Codex workbench browser recovery and delivery", () => {
	test("deduplicates an in-flight command and classifies a late result as unknown", async () => {
		const value = harness();
		const first = value.open();
		const second = value.gateway.connect("browser-two", "chat-two", value.tabSessionId);
		const lease = first.claimLease();
		let settle: ((result: undefined) => void) | undefined;
		value.setActionResult(undefined);
		const delayed = new Promise<undefined>((resolve) => {
			settle = resolve;
		});
		value.setActionError(null);
		value.setActionGate(delayed);
		const original = value.calls.length;
		const command = startCommand(value, lease);
		const pending = first.command(command);
		await Promise.resolve();
		const duplicateInFlight = first.command(command);
		const transferred = second.claimLease();
		expect(transferred.commandId).not.toBe(lease.commandId);
		settle?.(undefined);
		value.setActionGate(null);
		const result = await pending;
		expect(await duplicateInFlight).toEqual(result);
		expect(result).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
		expect(value.calls.length).toBeGreaterThanOrEqual(original);
		const lateDuplicate = await first.command(command);
		expect(lateDuplicate).toMatchObject({
			code: "lease_transferred",
			outcome: "not_delivered",
		});
	});

	test("preserves a lost-response settlement without retrying the owner", async () => {
		const value = harness();
		value.setActionResult({ outcome: "outcome_unknown" });
		const connection = value.open();
		const command = startCommand(value, connection.claimLease());
		const result = await connection.command(command);
		expect(result).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
		expect((await connection.command(command)).snapshot.operation).toMatchObject({
			operationId: command.commandId,
			outcome: "outcome_unknown",
		});
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(1);
	});

	test("does not replay a cached command across browser ownership", async () => {
		const value = harness();
		const first = value.open();
		const second = value.gateway.connect("browser-two", value.chatId, value.tabSessionId);
		const lease = first.claimLease();
		const command = startCommand(value, lease);
		const delivered = await first.command(command);
		const replay = await second.command(command);
		expect(delivered.outcome).toBe("delivered");
		expect(replay).toMatchObject({ code: "lease_transferred", outcome: "not_delivered" });
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(1);
	});

	test("an out-of-order close from a replaced socket cannot revoke the replacement lease", async () => {
		const value = harness();
		const firstSocket = Object.freeze({ socket: 1 });
		const replacementSocket = Object.freeze({ socket: 2 });
		const stale = value.open(firstSocket);
		stale.claimLease();
		const current = value.open(replacementSocket);
		const currentLease = current.claimLease();

		await stale.close();

		expect(current.renewLease()).toMatchObject({
			commandId: currentLease.commandId,
			state: "active",
		});
		expectGatewayError(() => stale.snapshot(), "invalid_input");
	});

	test("reconnecting the exact live socket instance preserves its lease", () => {
		const value = harness();
		const socket = Object.freeze({ socket: "stable" });
		const first = value.open(socket);
		const lease = first.claimLease();
		const reconnected = value.open(socket);

		expect(reconnected.instance).toBe(socket);
		expect(reconnected.renewLease()).toMatchObject({ commandId: lease.commandId, state: "active" });
	});

	test("replays a settled command while retained and refuses a fingerprint conflict", async () => {
		const value = harness();
		const connection = value.open();
		const command = startCommand(value, connection.claimLease());
		const first = await connection.command(command);
		const replay = await connection.command(command);
		expect(replay).toEqual(first);
		const conflict = await connection.command({ ...command, prompt: "a different command" });
		expect(conflict).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(1);
	});

	test("rejects a dynamic response whose captured link is not current", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const otherThread = value.model.ThreadIdSchema.parse(
			value.authorities.identity.decoder.adoptThreadId("other-thread"),
		);
		const approval = value.makeDynamicApproval(lease.commandId, otherThread);
		value.setDynamicApprovals([approval]);
		const result = await connection.command(dynamicResponse(value, approval));
		expect(result).toMatchObject({
			code: "dynamic_approval_not_pending",
			outcome: "not_delivered",
		});
		expect(value.calls).not.toContain("dynamic.resolve");
	});

	test("makes child exit terminal and recovers through a new gateway authority", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const staleCommand = startCommand(value, lease);
		await value.gateway.childExit(value.childId, value.epoch);
		expect(value.disconnectReasons).toEqual(["child_disconnected"]);
		expectGatewayError(() => value.open(), "disposed");
		expectGatewayError(() => connection.snapshot(), "disposed");
		expectGatewayError(() => connection.claimLease(), "disposed");
		expectGatewayError(() => connection.renewLease(), "disposed");
		expectGatewayError(() => value.gateway.renewLease(value.browserId, lease), "disposed");
		await expectRejected(() => connection.command(staleCommand), "disposed");

		const replacement = harness();
		expect(replacement.childId).not.toBe(value.childId);
		expect(replacement.epoch).not.toBe(value.epoch);
		const recovered = replacement.open();
		const replacementLease = recovered.claimLease();
		expect(replacementLease.childId).toBe(replacement.childId);
		expect(replacementLease.epoch).toBe(replacement.epoch);
		expect(replacementLease.childId).not.toBe(value.childId);
		expect(replacementLease.epoch).not.toBe(value.epoch);
		expect((await recovered.command(startCommand(replacement, replacementLease))).outcome).toBe(
			"delivered",
		);
	});

	test("child exit wins an ordering race with a late in-flight command", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		let settle: ((result: undefined) => void) | undefined;
		value.setActionGate(
			new Promise<undefined>((resolve) => {
				settle = resolve;
			}),
		);
		const pending = connection.command(startCommand(value, lease));
		await Promise.resolve();
		await value.gateway.childExit(value.childId, value.epoch);
		const replacement = harness();
		const replacementConnection = replacement.open();
		const replacementLease = replacementConnection.claimLease();
		settle?.(undefined);
		expect(await pending).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
		expect(
			(await replacementConnection.command(startCommand(replacement, replacementLease))).outcome,
		).toBe("delivered");
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
	});

	test("releases a browser lease on close and allows another browser to recover", async () => {
		const value = harness();
		const connection = value.open();
		connection.claimLease();
		await connection.close();
		expect(value.disconnectReasons).toEqual(["browser_disconnected"]);
		const recovered = value.gateway.connect("browser-two", "chat-two", value.tabSessionId);
		expect(recovered.claimLease().state).toBe("active");
	});

	test("a closed connection leaves its tab session's approvals for the tab to answer when it comes back", async () => {
		const value = harness();
		const first = value.open();
		const lease = first.claimLease();
		const ordinary = value.makeOrdinaryApproval();
		const dynamic = value.makeDynamicApproval(lease.commandId);
		value.setOrdinaryApproval(ordinary);
		value.setDynamicApprovals([dynamic]);
		first.snapshot();

		await first.close();

		// A reload within the grace: the tab comes back on a new socket of the same session.
		const recovered = value.gateway.connect("browser-reloaded", value.chatId, value.tabSessionId);
		recovered.claimLease();
		const { snapshot } = recovered.snapshot();
		expect(snapshot.approvals).toEqual([
			expect.objectContaining({ requestId: ordinary.request.requestId }),
		]);
		expect(snapshot.dynamicApprovals).toHaveLength(1);
	});

	test("waits for the voice settlement after revoking browser authority", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		let closed = false;
		const closing = connection.close().then(() => {
			closed = true;
			return undefined;
		});
		expect(closed).toBeFalse();
		expect(value.disconnectReasons).toEqual(["browser_disconnected"]);
		expect(value.disconnectSettled).toEqual([]);
		expectGatewayError(() => connection.claimLease(), "invalid_input");
		expectGatewayError(() => connection.renewLease(), "invalid_input");
		await expectRejected(() => connection.command(startCommand(value, lease)), "invalid_input");
		await Promise.resolve();
		expect(closed).toBeFalse();
		voice.resolve();
		await closing;
		expect(closed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["realtime"]);
	});

	test("waits for the voice settlement after terminalizing the gateway on child exit", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		let exited = false;
		const exiting = value.gateway.childExit(value.childId, value.epoch).then(() => {
			exited = true;
			return undefined;
		});
		expect(exited).toBeFalse();
		expect(value.disconnectReasons).toEqual(["child_disconnected"]);
		expectGatewayError(() => connection.claimLease(), "disposed");
		expectGatewayError(() => connection.renewLease(), "disposed");
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		await Promise.resolve();
		expect(exited).toBeFalse();
		voice.resolve();
		await exiting;
		expect(exited).toBeTrue();
		expect(value.disconnectSettled).toEqual(["realtime"]);
	});

	test("waits for the voice settlement after closing authority on shutdown", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		let disposed = false;
		const disposing = value.gateway.dispose().then(() => {
			disposed = true;
			return undefined;
		});
		expect(disposed).toBeFalse();
		expectGatewayError(
			() => value.gateway.connect("browser-two", "chat-two", value.tabSessionId),
			"disposed",
		);
		expectGatewayError(() => connection.claimLease(), "disposed");
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		await Promise.resolve();
		expect(disposed).toBeFalse();
		voice.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["realtime"]);
	});

	test("a failed voice settlement still closes the connection", async () => {
		const value = harness();
		const connection = value.open();
		connection.claimLease();
		value.setDisconnectError(new Error("voice settlement failed"));
		await connection.close();
		expect(value.disconnectReasons).toEqual(["browser_disconnected"]);
		expect(value.disconnectSettled).toEqual([]);
		expect(() => connection.snapshot()).toThrow("closed");
	});

	test("lease transfer and release do not run durable disconnect settlement", async () => {
		const value = harness();
		const first = value.open();
		const second = value.gateway.connect("browser-two", "chat-two", value.tabSessionId);
		first.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		second.claimLease();
		second.releaseLease();
		expect(value.disconnectReasons).toEqual([]);
		let disposed = false;
		const disposing = value.gateway.dispose().then(() => {
			disposed = true;
			return undefined;
		});
		expect(disposed).toBeFalse();
		expect(value.disconnectReasons).toEqual(["gateway_shutdown", "gateway_shutdown"]);
		voice.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toHaveLength(2);
	});

	test("lease expiry does not run durable disconnect settlement", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		value.advance(150_001);
		const expired = await connection.command(startCommand(value, lease));
		expect(expired).toMatchObject({ code: "lease_expired", outcome: "not_delivered" });
		expect(value.disconnectReasons).toEqual([]);
		let disposed = false;
		const disposing = value.gateway.dispose().then(() => {
			disposed = true;
			return undefined;
		});
		expect(disposed).toBeFalse();
		voice.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["realtime"]);
	});

	test("exposes an awaitable child-exit lifecycle listener", async () => {
		let listener:
			| ((childId: GatewayHarness["childId"], epoch: GatewayHarness["epoch"]) => Promise<void>)
			| undefined;
		const value = createGatewayHarness(undefined, {
			onChildExit: (candidate) => {
				listener = candidate;
				return () => undefined;
			},
		});
		openHarnesses.push(value);
		const connection = value.open();
		const lease = connection.claimLease();
		const voice = deferred();
		value.setDisconnectGate(voice.promise);
		expect(listener).toBeDefined();
		const staleEpoch = value.authorities.identity.issuer.mintChildEpoch();
		await listener!(value.childId, staleEpoch);
		expect(value.disconnectReasons).toEqual([]);
		const exit = listener!(value.childId, value.epoch);
		expectGatewayError(() => connection.claimLease(), "disposed");
		let settled = false;
		const observed = exit.then(() => {
			settled = true;
			return undefined;
		});
		expect(settled).toBeFalse();
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		voice.resolve();
		await observed;
		expect(settled).toBeTrue();
	});
});
