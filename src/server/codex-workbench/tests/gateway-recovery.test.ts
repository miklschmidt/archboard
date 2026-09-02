import { afterEach, describe, expect, test } from "bun:test";

import type { BrowserGatewayClientState, BrowserGatewayMessage } from "../index.js";
import {
	applyBrowserGatewayMessage,
	BROWSER_SETTLED_COMMAND_LIMIT,
	browserGatewayMessageSchema,
} from "../index.js";
import { dynamicResponse, expectGatewayError, expectRejected, startCommand } from "./helpers.js";
import { createGatewayHarness, latestDelta, type GatewayHarness } from "./support.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) await openHarness.gateway.dispose();
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
		const first = value.gateway.connect(value.browserId, value.paneId);
		const second = value.gateway.connect("browser-two", "pane-two");
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
		const connection = value.gateway.connect(value.browserId, value.paneId);
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
		const first = value.gateway.connect(value.browserId, value.paneId);
		const second = value.gateway.connect("browser-two", value.paneId);
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
		const stale = value.gateway.connect(value.browserId, value.paneId, firstSocket);
		stale.claimLease();
		const current = value.gateway.connect(value.browserId, value.paneId, replacementSocket);
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
		const first = value.gateway.connect(value.browserId, value.paneId, socket);
		const lease = first.claimLease();
		const reconnected = value.gateway.connect(value.browserId, value.paneId, socket);

		expect(reconnected.instance).toBe(socket);
		expect(reconnected.renewLease()).toMatchObject({ commandId: lease.commandId, state: "active" });
	});

	test("replays a settled command while retained and refuses a fingerprint conflict", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const command = startCommand(value, connection.claimLease());
		const first = await connection.command(command);
		const replay = await connection.command(command);
		expect(replay).toEqual(first);
		const conflict = await connection.command({ ...command, prompt: "a different command" });
		expect(conflict).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(1);
	});

	test("evicts settled results without allowing the evicted command to execute again", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const firstLease = connection.claimLease();
		const firstCommand = startCommand(value, firstLease);
		await connection.command(firstCommand);
		for (let index = 0; index < BROWSER_SETTLED_COMMAND_LIMIT; index += 1) {
			const lease = connection.claimLease();
			await connection.command(startCommand(value, lease));
		}
		const callsBeforeReplay = value.calls.filter((call) => call === "text.start").length;
		const replay = await connection.command(firstCommand);
		expect(replay).toMatchObject({ code: "lease_transferred", outcome: "not_delivered" });
		expect(value.calls.filter((call) => call === "text.start")).toHaveLength(callsBeforeReplay);
	});

	test("rejects a dynamic response whose captured link is not current", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
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

	test("falls back to one bounded full snapshot when a delta is too large", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		connection.snapshot();
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => messages.push(message));
		const lease = connection.claimLease();
		messages.length = 0;
		value.setDynamicApprovals(
			Array.from({ length: 500 }, () => value.makeDynamicApproval(lease.commandId)),
		);
		const message = messages.at(-1);
		expect(message?.kind).toBe("snapshot");
		if (message?.kind === "snapshot") expect(message.sequence).toBeGreaterThan(0);
	});

	test("applies snapshots, rejects gaps, and treats duplicate or stale messages idempotently", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const first = connection.snapshot();
		let state: BrowserGatewayClientState | null = applyBrowserGatewayMessage(
			value.model,
			first,
			null,
		).state;
		expect(state).not.toBeNull();
		const messages: BrowserGatewayMessage[] = [];
		const unsubscribe = connection.subscribe((message) => messages.push(message));
		value.setReadiness("account_ready");
		const delta = latestDelta(messages);
		expect(delta).toBeDefined();
		const applied = applyBrowserGatewayMessage(value.model, delta, state);
		expect(applied.status).toBe("applied");
		state = applied.state;
		expect(state).not.toBeNull();
		expect(applyBrowserGatewayMessage(value.model, delta, state).status).toBe("duplicate");
		expect(
			applyBrowserGatewayMessage(value.model, { ...delta!, sequence: delta!.sequence - 1 }, state)
				.status,
		).toBe("stale");
		expect(
			applyBrowserGatewayMessage(value.model, { ...delta!, sequence: state!.sequence + 2 }, state)
				.status,
		).toBe("gap");
		unsubscribe();
	});

	test("rejects unexpected or wrong-arm wrapper fields", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const snapshot = connection.snapshot();
		const schema = browserGatewayMessageSchema(value.model);
		expect(() => schema.parse({ ...snapshot, delta: {} })).toThrow();
		expect(() => schema.parse({ ...snapshot, unexpected: true })).toThrow();
		expect(() =>
			schema.parse({
				kind: "delta",
				sequence: snapshot.sequence + 1,
				delta: {},
				snapshot: snapshot.snapshot,
			}),
		).toThrow();
	});

	test("makes child exit terminal and recovers through a new gateway authority", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const staleCommand = startCommand(value, lease);
		await value.gateway.childExit(value.childId, value.epoch);
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		expect(value.disconnectReasons).toEqual(["child_disconnected", "child_disconnected"]);
		expectGatewayError(() => value.gateway.connect(value.browserId, value.paneId), "disposed");
		expectGatewayError(() => connection.snapshot(), "disposed");
		expectGatewayError(() => connection.claimLease(), "disposed");
		expectGatewayError(() => connection.renewLease(), "disposed");
		expectGatewayError(() => value.gateway.renewLease(value.browserId, lease), "disposed");
		await expectRejected(() => connection.command(staleCommand), "disposed");

		const replacement = harness();
		expect(replacement.childId).not.toBe(value.childId);
		expect(replacement.epoch).not.toBe(value.epoch);
		const recovered = replacement.gateway.connect(replacement.browserId, replacement.paneId);
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
		const connection = value.gateway.connect(value.browserId, value.paneId);
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
		const replacementConnection = replacement.gateway.connect(
			replacement.browserId,
			replacement.paneId,
		);
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
		const connection = value.gateway.connect(value.browserId, value.paneId);
		connection.claimLease();
		await connection.close();
		expect(value.disconnectReasons).toEqual(["browser_disconnected", "browser_disconnected"]);
		const recovered = value.gateway.connect("browser-two", "pane-two");
		expect(recovered.claimLease().state).toBe("active");
	});

	test("waits for both close settlements after revoking browser authority", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
		let closed = false;
		const closing = connection.close().then(() => {
			closed = true;
			return undefined;
		});
		expect(closed).toBeFalse();
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		expect(value.disconnectSettled).toEqual([]);
		expectGatewayError(() => connection.claimLease(), "invalid_input");
		expectGatewayError(() => connection.renewLease(), "invalid_input");
		await expectRejected(() => connection.command(startCommand(value, lease)), "invalid_input");
		ordinary.resolve();
		await Promise.resolve();
		expect(closed).toBeFalse();
		dynamic.resolve();
		await closing;
		expect(closed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["ordinary", "dynamic"]);
	});

	test("waits for both child-exit settlements after terminalizing the gateway", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
		let exited = false;
		const exiting = value.gateway.childExit(value.childId, value.epoch).then(() => {
			exited = true;
			return undefined;
		});
		expect(exited).toBeFalse();
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		expectGatewayError(() => connection.claimLease(), "disposed");
		expectGatewayError(() => connection.renewLease(), "disposed");
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		ordinary.resolve();
		await Promise.resolve();
		expect(exited).toBeFalse();
		dynamic.resolve();
		await exiting;
		expect(exited).toBeTrue();
		expect(value.disconnectSettled).toEqual(["ordinary", "dynamic"]);
	});

	test("waits for both shutdown settlements after closing authority", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
		let disposed = false;
		const disposing = value.gateway.dispose().then(() => {
			disposed = true;
			return undefined;
		});
		expect(disposed).toBeFalse();
		expectGatewayError(() => value.gateway.connect("browser-two", "pane-two"), "disposed");
		expectGatewayError(() => connection.claimLease(), "disposed");
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		ordinary.resolve();
		await Promise.resolve();
		expect(disposed).toBeFalse();
		dynamic.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["ordinary", "dynamic"]);
	});

	test("swallows one settlement failure only after the other owner settles", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		connection.claimLease();
		const dynamic = deferred();
		value.setOrdinaryDisconnectError(new Error("ordinary settlement failed"));
		value.setDynamicDisconnectGate(dynamic.promise);
		let closed = false;
		const closing = connection.close().then(() => {
			closed = true;
			return undefined;
		});
		expect(closed).toBeFalse();
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		dynamic.resolve();
		await closing;
		expect(closed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["dynamic"]);
	});

	test("lease transfer and release do not run durable disconnect settlement", async () => {
		const value = harness();
		const first = value.gateway.connect(value.browserId, value.paneId);
		const second = value.gateway.connect("browser-two", "pane-two");
		first.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
		second.claimLease();
		second.releaseLease();
		let disposed = false;
		const disposing = value.gateway.dispose().then(() => {
			disposed = true;
			return undefined;
		});
		expect(disposed).toBeFalse();
		expect(value.disconnectReasons).toEqual([
			"gateway_shutdown",
			"gateway_shutdown",
			"gateway_shutdown",
			"gateway_shutdown",
		]);
		ordinary.resolve();
		dynamic.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toHaveLength(4);
	});

	test("lease expiry does not run durable disconnect settlement", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
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
		ordinary.resolve();
		dynamic.resolve();
		await disposing;
		expect(disposed).toBeTrue();
		expect(value.disconnectSettled).toEqual(["ordinary", "dynamic"]);
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
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const ordinary = deferred();
		const dynamic = deferred();
		value.setOrdinaryDisconnectGate(ordinary.promise);
		value.setDynamicDisconnectGate(dynamic.promise);
		expect(listener).toBeDefined();
		const staleEpoch = value.authorities.identity.issuer.mintChildEpoch();
		await listener!(value.childId, staleEpoch);
		expect(value.disconnects).toEqual([]);
		const exit = listener!(value.childId, value.epoch);
		expectGatewayError(() => connection.claimLease(), "disposed");
		let settled = false;
		const observed = exit.then(() => {
			settled = true;
			return undefined;
		});
		expect(settled).toBeFalse();
		await expectRejected(() => connection.command(startCommand(value, lease)), "disposed");
		ordinary.resolve();
		dynamic.resolve();
		await observed;
		expect(settled).toBeTrue();
	});
});
