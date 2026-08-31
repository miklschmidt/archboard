import { afterEach, describe, expect, test } from "bun:test";

import type {
	BrowserCommand,
	BrowserDynamicApprovalResponse,
	BrowserGatewayClientState,
	BrowserGatewayMessage,
} from "../index.js";
import { applyBrowserGatewayMessage, CodexWorkbenchGatewayError } from "../index.js";
import {
	commandTarget,
	createGatewayHarness,
	latestDelta,
	type GatewayHarness,
} from "./support.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) await openHarness.gateway.dispose();
});

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

function expectGatewayError(action: () => unknown, code: CodexWorkbenchGatewayError["code"]): void {
	expect(action).toThrow(CodexWorkbenchGatewayError);
	try {
		action();
	} catch (error) {
		expect(error).toMatchObject({ code });
	}
}

function accountCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	command: "accountLogin" | "accountLoginCancel" | "accountLogout",
): BrowserCommand {
	const target = commandTarget(lease);
	if (command === "accountLogin")
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			login: { type: "chatgpt" },
		});
	if (command === "accountLoginCancel")
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			loginId: harnessValue.model.LoginIdSchema.parse(
				harnessValue.authorities.identity.decoder.adoptLoginId("gateway-login"),
			),
		});
	return harnessValue.model.BrowserCommandSchema.parse({ ...target, command });
}

function startCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	threadId = harnessValue.threadId,
): BrowserCommand {
	return harnessValue.model.BrowserCommandSchema.parse({
		...commandTarget(lease),
		command: "start",
		threadId,
		prompt: "Run the bounded command",
	});
}

function dynamicResponse(
	harnessValue: GatewayHarness,
	approval: ReturnType<GatewayHarness["makeDynamicApproval"]>,
	decision: "approve" | "decline" = "approve",
): BrowserDynamicApprovalResponse {
	return harnessValue.model.BrowserDynamicApprovalResponseSchema.parse({
		kind: "browser_command",
		command: "dynamicApprovalRespond",
		commandId: approval.binding!.commandId,
		paneId: approval.binding!.paneId,
		childId: harnessValue.childId,
		epoch: harnessValue.epoch,
		capturedLink: approval.binding!.capturedLink,
		identity: approval.identity,
		effectHash: approval.effectHash,
		decision,
	});
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
});

describe("Codex workbench browser command leases", () => {
	test("has one app-global lease and refuses a transferred command without retargeting", async () => {
		const value = harness();
		const first = value.gateway.connect(value.browserId, value.paneId);
		const second = value.gateway.connect("browser-two", "pane-two");
		const firstLease = first.claimLease();
		const secondLease = second.claimLease();
		expect(secondLease.commandId).not.toBe(firstLease.commandId);
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
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
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		const recovered = connection.claimLease();
		expect(recovered.commandId).not.toBe(lease.commandId);
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
		const command = value.model.BrowserCommandSchema.parse({
			...commandTarget(lease),
			command: "approvalRespond",
			requestId: approval.requestId,
			approvalId: approval.approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		const result = await connection.command(command);
		expect(result.outcome).toBe("delivered");
		expect(value.calls).toContain("approval.resolve");
		value.setOrdinaryApproval(null);
		const secondLease = connection.claimLease();
		const stale = await connection.command({
			...command,
			...commandTarget(secondLease),
			commandId: secondLease.commandId,
		});
		expect(stale).toMatchObject({ code: "approval_not_pending", outcome: "not_delivered" });
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
});

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
		const transferred = second.claimLease();
		expect(transferred.commandId).not.toBe(lease.commandId);
		settle?.(undefined);
		value.setActionGate(null);
		const result = await pending;
		expect(result).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
		expect(value.calls.length).toBeGreaterThanOrEqual(original);
		const duplicate = await first.command(command);
		expect(duplicate).toEqual(result);
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

	test("child exit and browser close release ownership while a fresh connection recovers", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const lease = connection.claimLease();
		await value.gateway.childExit(value.childId, value.epoch);
		expect(value.disconnects).toEqual(["ordinary", "dynamic"]);
		const afterExit = await connection.command(startCommand(value, lease));
		expect(afterExit).toMatchObject({ code: "child_disconnected", outcome: "not_delivered" });
		const recovered = value.gateway.connect("browser-two", "pane-two");
		recovered.claimLease();
		await recovered.close();
		const final = value.gateway.connect("browser-three", "pane-three");
		expect(final.claimLease().state).toBe("active");
	});
});
