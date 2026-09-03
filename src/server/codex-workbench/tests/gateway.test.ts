import { afterEach, describe, expect, test } from "bun:test";

import {
	accountCommand,
	dynamicResponse,
	expectGatewayError,
	startCommand,
	terminalDynamicApproval,
} from "./helpers.js";
import { createGatewayHarness, commandTarget, type GatewayHarness } from "./support.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) await openHarness.gateway.dispose();
});

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

describe("Codex workbench browser gateway readiness", () => {
	test("publishes every readiness state and keeps commands disabled before login capability", () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		for (const state of [
			"stopped",
			"backoff",
			"initialized",
			"storage_mismatch",
			"reconnecting",
			"incompatible_contract",
		] as const) {
			value.setReadiness(state);
			expect(connection.snapshot().snapshot.readiness.state).toBe(state);
			expectGatewayError(
				() => connection.claimLease(),
				state === "reconnecting" ? "not_ready" : "not_ready",
			);
		}
	});

	test("allows account reads and account commands before account readiness", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		for (const state of [
			"login_capable",
			"signed_out",
			"login_pending",
			"account_ready",
			"thread_capable",
		] as const) {
			value.setReadiness(state);
			const read = await connection.accountRead();
			expect(read.outcome).toBe("delivered");
			const lease = connection.claimLease();
			const result = await connection.command(
				accountCommand(
					value,
					lease,
					state === "login_pending" ? "accountLoginCancel" : "accountLogin",
				),
			);
			expect(result.outcome).toBe("delivered");
			connection.releaseLease();
		}
		expect(value.calls.filter((call) => call === "account.read")).toHaveLength(5);
		expect(value.calls.filter((call) => call === "account.login")).toHaveLength(4);
		expect(value.calls.filter((call) => call === "account.loginCancel")).toHaveLength(1);
	});

	test("routes account logout while the account is only login-capable", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setReadiness("signed_out");
		const result = await connection.command(
			accountCommand(value, connection.claimLease(), "accountLogout"),
		);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("account.logout");
	});

	test("normalizes account login through the protocol owner before dispatch", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const result = await connection.command({
			...commandTarget(lease),
			command: "accountLogin",
			login: { type: "chatgptDeviceCode" },
		});
		expect(result).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
		expect(value.calls).not.toContain("account.login");
	});

	test("advertises voice only for the exact socket that owns ready browser media", () => {
		const value = harness();
		const first = value.gateway.connect(value.browserId, value.paneId);
		expect(first.snapshot().snapshot.voice).toMatchObject({ state: "unavailable" });
		expect(first.setMediaReady(true).snapshot.voice).toMatchObject({ state: "ready" });

		const replacement = value.gateway.connect(value.browserId, value.paneId);
		expect(replacement.snapshot().snapshot.voice).toMatchObject({ state: "unavailable" });
		expect(() => first.setMediaReady(true)).toThrow("replaced");
		expect(replacement.setMediaReady(true).snapshot.voice).toMatchObject({ state: "ready" });
	});
});

describe("Codex workbench browser command leases", () => {
	test("has one app-global lease and refuses a transferred command without retargeting", async () => {
		const value = harness();
		const first = value.gateway.connect(value.browserId, value.paneId);
		const second = value.gateway.connect("browser-two", "pane-two");
		const firstLease = first.claimLease();
		const secondLease = second.claimLease();
		expect(secondLease.commandId).not.toBe(firstLease.commandId);
		expect(value.disconnects).toEqual([]);
		expect(value.disconnectReasons).toEqual([]);
		const result = await first.command(startCommand(value, firstLease));
		expect(result).toMatchObject({ code: "lease_transferred", outcome: "not_delivered" });
		expect(value.calls).not.toContain("text.start");
	});

	test("expires once, makes expiry visible, and allows recovery with a new lease", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		value.advance(150_001);
		const result = await connection.command(startCommand(value, lease));
		expect(result).toMatchObject({ code: "lease_expired", outcome: "not_delivered" });
		expect(result.snapshot.lease).toMatchObject({ commandId: lease.commandId, state: "expired" });
		expect(result.snapshot.operation).toMatchObject({
			operationId: lease.commandId,
			outcome: "not_delivered",
		});
		expect(value.disconnects).toEqual([]);
		expect(value.disconnectReasons).toEqual([]);
		const recovered = connection.claimLease();
		expect(recovered.commandId).not.toBe(lease.commandId);
	});

	test("renews the app-global lease and keeps its exact binding", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		value.advance(1_000);
		const renewed = connection.renewLease();
		expect(renewed.commandId).toBe(lease.commandId);
		expect(renewed.paneId).toBe(lease.paneId);
		expect(renewed.childId).toBe(lease.childId);
		expect(renewed.epoch).toBe(lease.epoch);
		expect(renewed.expiresAtMs).toBeGreaterThan(lease.expiresAtMs);
		expect((await connection.command(startCommand(value, renewed))).outcome).toBe("delivered");
	});

	test("does not deliver a command after the captured link changes", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
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

describe("Codex workbench browser command routing", () => {
	test("requires composed thread capability and an exact executable link", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setReadiness("account_ready");
		let lease = connection.claimLease();
		let result = await connection.command(startCommand(value, lease));
		expect(result).toMatchObject({ code: "thread_capability_required", outcome: "not_delivered" });
		connection.releaseLease();
		value.setReadiness("thread_capable");
		value.setLink({
			kind: "thread_link",
			state: "unbound",
			childId: null,
			epoch: null,
			threadId: null,
			source: null,
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: null,
		});
		lease = connection.claimLease();
		result = await connection.command(startCommand(value, lease));
		expect(result).toMatchObject({ code: "link_required", outcome: "not_delivered" });
		expect(value.calls).not.toContain("text.start");
	});

	test("rejects a thread target that differs from the current link", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const other = value.model.ThreadIdSchema.parse(
			value.authorities.identity.decoder.adoptThreadId("other-thread"),
		);
		const lease = connection.claimLease();
		const result = await connection.command(startCommand(value, lease, other));
		expect(result).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
	});

	test("routes ordinary approvals only while their exact linked request is pending", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		expect(connection.snapshot().snapshot.approvals).toEqual([
			expect.objectContaining({
				requestId: approval.request.requestId,
				lifecycle: expect.objectContaining({ state: "pending" }),
			}),
		]);
		const command = value.model.BrowserCommandSchema.parse({
			...commandTarget(lease),
			command: "approvalRespond",
			requestId: approval.request.requestId,
			approvalId: approval.request.approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		const result = await connection.command(command);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("approval.resolve");
		expect(result.snapshot.approvals).toEqual([
			expect.objectContaining({
				requestId: approval.request.requestId,
				lifecycle: expect.objectContaining({
					state: "settled",
					decision: "approved",
					outcome: "delivered",
				}),
			}),
		]);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
		const secondLease = connection.claimLease();
		const stale = await connection.command({
			...command,
			...commandTarget(secondLease),
			commandId: secondLease.commandId,
		});
		expect(stale).toMatchObject({ code: "approval_not_pending", outcome: "not_delivered" });
	});

	test("normalizes approval responses through the approval owner before dispatch", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(approval);
		const result = await connection.command({
			...commandTarget(connection.claimLease()),
			command: "approvalRespond",
			requestId: approval.request.requestId,
			approvalId: approval.request.approvalId,
			response: { approvalKind: "command_execution", decision: "invented" },
		});
		expect(result).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
		expect(value.calls).not.toContain("approval.resolve");
	});

	for (const terminal of [
		{ name: "expiry", state: "expired", reason: "The approval expired." },
		{ name: "child exit", state: "stale", reason: "The Codex child exited." },
	] as const)
		test(`publishes a spontaneous ${terminal.name} terminal exactly once`, () => {
			const value = harness();
			const connection = value.gateway.connect(value.browserId, value.paneId);
			const approval = value.makeOrdinaryApproval();
			value.setOrdinaryApproval(approval);
			connection.snapshot();
			const messages: unknown[] = [];
			connection.subscribe((message) => messages.push(message));

			value.setOrdinaryApproval({
				...approval,
				terminalDelivery: "after_publish",
				snapshot: {
					...approval.snapshot,
					state: terminal.state,
					decision: "cancelled",
					outcome: "delivered",
					reason: terminal.reason,
				},
				spoken: { eligible: false, reason: "not_pending" },
			});

			expect(messages).toHaveLength(1);
			expect(JSON.stringify(messages[0])).toContain(`"state":"${terminal.state}"`);
			expect(connection.snapshot().snapshot.approvals).toEqual([]);
		});

	test("retires a spontaneous terminal immediately when no browser can receive it", () => {
		const value = harness();
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval({
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
		});

		const connection = value.gateway.connect(value.browserId, value.paneId);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("returns an initial spontaneous terminal once before acknowledging it", () => {
		const value = harness();
		const approval = value.makeOrdinaryApproval();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setOrdinaryApproval({
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
		});

		expect(connection.snapshot().snapshot.approvals).toEqual([
			expect.objectContaining({
				requestId: approval.request.requestId,
				lifecycle: expect.objectContaining({ state: "expired", outcome: "delivered" }),
			}),
		]);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("preserves dynamic identity and effect hash through pending-aware response validation", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const approval = value.makeDynamicApproval(lease.commandId);
		value.setDynamicApprovals([approval]);
		const response = dynamicResponse(value, approval);
		const result = await connection.command(response);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("dynamic.resolve");
	});

	test("rejects a dynamic decision after disconnect and never resumes it", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const approval = value.makeDynamicApproval(lease.commandId);
		value.setDynamicApprovals([approval]);
		const response = dynamicResponse(value, approval);
		await connection.close();
		const recovered = value.gateway.connect(value.browserId, value.paneId);
		const newLease = recovered.claimLease();
		const late = await recovered.command({
			...response,
			...commandTarget(newLease),
			commandId: newLease.commandId,
		});
		expect(late).toMatchObject({ code: "dynamic_approval_not_pending", outcome: "not_delivered" });
		expect(value.calls).not.toContain("dynamic.resolve");
	});

	test("refuses an expired dynamic approval before invoking its owner", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const approval = value.makeDynamicApproval(lease.commandId);
		value.setDynamicApprovals([approval]);
		value.advance(90_001);
		const result = await connection.command(dynamicResponse(value, approval));
		expect(result).toMatchObject({
			code: "dynamic_approval_not_pending",
			outcome: "not_delivered",
		});
		expect(value.calls).not.toContain("dynamic.resolve");
	});

	test("projects terminal approval_required and rejects its late response", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		const pending = value.makeDynamicApproval(lease.commandId);
		const terminal = terminalDynamicApproval(value, pending);
		value.setDynamicApprovals([terminal]);
		const snapshot = connection.snapshot().snapshot;
		expect(snapshot.dynamicApprovals).toEqual([terminal]);
		expect(snapshot.dynamicApprovals[0]).toMatchObject({
			state: "cancelled",
			toolResult: "approval_required",
			binding: null,
			resumable: false,
		});
		const late = await connection.command(dynamicResponse(value, pending));
		expect(late).toMatchObject({
			code: "dynamic_approval_not_pending",
			outcome: "not_delivered",
		});
		expect(value.calls).not.toContain("dynamic.resolve");
	});
});
