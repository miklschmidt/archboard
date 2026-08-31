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
});
