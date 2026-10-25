import { afterEach, describe, expect, test } from "bun:test";

import {
	accountCommand,
	dynamicResponse,
	expectGatewayError,
	startCommand,
} from "#tests/server/support/gateway/helpers.ts";
import {
	createGatewayHarness,
	commandTarget,
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

function spontaneousTerminal(
	approval: ReturnType<GatewayHarness["makeOrdinaryApproval"]>,
	state: "expired" | "stale" = "expired",
	reason = "The approval expired.",
) {
	return {
		...approval,
		terminalDelivery: "after_publish" as const,
		snapshot: {
			...approval.snapshot,
			state,
			decision: "cancelled" as const,
			outcome: "delivered" as const,
			reason,
		},
		spoken: { eligible: false as const, reason: "not_pending" as const },
	};
}

describe("Codex workbench browser gateway readiness", () => {
	test("passes authoritative thread provenance through the sole closed projection", () => {
		for (const source of [
			{
				presentation: "subagent",
				reason: "thread_source_subagent",
				value: (owner: GatewayHarness) => ({
					subAgent: {
						thread_spawn: {
							parent_thread_id:
								owner.authorities.identity.decoder.adoptThreadId("private-gateway-parent"),
							depth: 2,
							agent_path: "/private/gateway/agent",
							agent_nickname: "private-gateway-nickname",
							agent_role: "private-gateway-role",
						},
					},
				}),
			},
			{
				presentation: "custom",
				reason: "thread_source_custom",
				value: (_owner: GatewayHarness) => ({ custom: "private-gateway-custom" }),
			},
		] as const) {
			const value = harness();
			value.setLink({
				kind: "thread_link",
				state: "inspect_only",
				childId: null,
				epoch: null,
				threadId: value.threadId,
				source: source.value(value),
				status: "idle",
				loaded: true,
				canAcceptDirectInput: false,
				reason: source.reason,
			});
			const projected = value.gateway
				.connect(value.browserId, value.chatId, value.tabSessionId)
				.snapshot().snapshot.threadLink;
			expect(projected.sourcePresentation).toBe(source.presentation);
			expect(Object.keys(projected).toSorted()).toEqual([
				"canAcceptDirectInput",
				"childId",
				"epoch",
				"kind",
				"loaded",
				"reason",
				"sourcePresentation",
				"state",
				"status",
				"threadId",
			]);
			for (const privateDetail of [
				"private-gateway-parent",
				"/private/gateway/agent",
				"private-gateway-nickname",
				"private-gateway-role",
				"private-gateway-custom",
			]) {
				expect(JSON.stringify(projected)).not.toContain(privateDetail);
			}
		}
	});

	test("publishes every readiness state and keeps commands disabled before login capability", () => {
		const value = harness();
		const connection = value.open();
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
		const connection = value.open();
		const states = ["login_capable", "signed_out", "login_pending", "thread_capable"] as const;
		for (const state of states) {
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
		expect(value.calls.filter((call) => call === "account.read")).toHaveLength(states.length);
		expect(value.calls.filter((call) => call === "account.login")).toHaveLength(states.length - 1);
		expect(value.calls.filter((call) => call === "account.loginCancel")).toHaveLength(1);
	});

	test("routes account logout while the account is only login-capable", async () => {
		const value = harness();
		const connection = value.open();
		value.setReadiness("signed_out");
		const result = await connection.command(
			accountCommand(value, connection.claimLease(), "accountLogout"),
		);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("account.logout");
	});

	test("normalizes account login through the protocol owner before dispatch", async () => {
		const value = harness();
		const connection = value.open();
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
		const first = value.open();
		expect(first.snapshot().snapshot.voice).toMatchObject({ state: "unavailable" });
		expect(first.setMediaReady(true).snapshot.voice).toMatchObject({ state: "ready" });

		const replacement = value.open();
		expect(replacement.snapshot().snapshot.voice).toMatchObject({ state: "unavailable" });
		expect(() => first.setMediaReady(true)).toThrow("replaced");
		expect(replacement.setMediaReady(true).snapshot.voice).toMatchObject({ state: "ready" });
	});
});

describe("Codex workbench browser command routing", () => {
	test("requires composed thread capability and an exact executable link", async () => {
		const value = harness();
		const connection = value.open();
		value.setReadiness("login_capable");
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
		const connection = value.open();
		const other = value.model.ThreadIdSchema.parse(
			value.authorities.identity.decoder.adoptThreadId("other-thread"),
		);
		const lease = connection.claimLease();
		const result = await connection.command(startCommand(value, lease, other));
		expect(result).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
	});

	test("routes ordinary approvals only while their exact linked request is pending", async () => {
		const value = harness();
		const connection = value.open();
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
		const connection = value.open();
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
	] as const) {
		test(`publishes a spontaneous ${terminal.name} terminal exactly once`, () => {
			const value = harness();
			const connection = value.open();
			const approval = value.makeOrdinaryApproval();
			value.setOrdinaryApproval(approval);
			connection.snapshot();
			const messages: unknown[] = [];
			connection.subscribe((message) => {
				messages.push(message);
				connection.confirmPublished(message);
			});

			value.setOrdinaryApproval(spontaneousTerminal(approval, terminal.state, terminal.reason));

			expect(messages).toHaveLength(1);
			expect(JSON.stringify(messages[0])).toContain(`"state":"${terminal.state}"`);
			expect(connection.snapshot().snapshot.approvals).toEqual([]);
		});
	}

	test("retires a spontaneous terminal immediately when no browser can receive it", () => {
		const value = harness();
		const approval = value.makeOrdinaryApproval();
		value.setOrdinaryApproval(spontaneousTerminal(approval));

		const connection = value.open();
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("returns an initial spontaneous terminal once before acknowledging it", () => {
		const value = harness();
		const approval = value.makeOrdinaryApproval();
		const connection = value.open();
		value.setOrdinaryApproval(spontaneousTerminal(approval));

		const published = connection.snapshot();
		expect(published.snapshot.approvals).toEqual([
			expect.objectContaining({
				requestId: approval.request.requestId,
				lifecycle: expect.objectContaining({ state: "expired", outcome: "delivered" }),
			}),
		]);
		connection.confirmPublished(published.snapshot);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("keeps a spontaneous terminal until both live connections publish it", () => {
		const value = harness();
		const first = value.open();
		const second = value.gateway.connect("browser-two", value.chatId, value.tabSessionId);
		const approval = value.makeOrdinaryApproval();
		first.snapshot();
		second.snapshot();
		const firstMessages: unknown[] = [];
		first.subscribe((message) => {
			firstMessages.push(message);
			first.confirmPublished(message);
		});

		value.setOrdinaryApproval(spontaneousTerminal(approval));

		expect(firstMessages).toHaveLength(1);
		const secondPublished = second.snapshot();
		expect(secondPublished.snapshot.approvals).toEqual([
			expect.objectContaining({ requestId: approval.request.requestId }),
		]);
		second.confirmPublished(secondPublished.snapshot);
		expect(first.snapshot().snapshot.approvals).toEqual([]);
	});

	test("keeps a spontaneous terminal after a publication send fails", () => {
		const value = harness();
		const connection = value.open();
		const approval = value.makeOrdinaryApproval();
		connection.snapshot();
		const unsubscribe = connection.subscribe(() => {
			throw new Error("socket send failed");
		});

		value.setOrdinaryApproval(spontaneousTerminal(approval));

		unsubscribe();
		const recovered = connection.snapshot();
		expect(recovered.snapshot.approvals).toEqual([
			expect.objectContaining({ requestId: approval.request.requestId }),
		]);
		connection.confirmPublished(recovered.snapshot);
		expect(connection.snapshot().snapshot.approvals).toEqual([]);
	});

	test("preserves dynamic identity and effect hash through pending-aware response validation", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const approval = value.makeDynamicApproval(lease.commandId);
		value.setDynamicApprovals([approval]);
		const response = dynamicResponse(value, approval);
		const result = await connection.command(response);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("dynamic.resolve");
	});

	test("rejects a dynamic decision after the tab session ends and never resumes it", async () => {
		const value = harness();
		const connection = value.open();
		const lease = connection.claimLease();
		const approval = value.makeDynamicApproval(lease.commandId);
		value.setDynamicApprovals([approval]);
		const response = dynamicResponse(value, approval);
		await connection.close();
		value.endSession();
		const recovered = value.open();
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
		const connection = value.open();
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
});
