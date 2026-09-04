import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchTransport } from "../index.js";
import {
	attachWithSnapshot,
	deltaMessage,
	FakeSocket,
	lease,
	queue,
	snapshot,
	snapshotMessage,
	type Transport,
} from "./fake-socket.js";

const transports: Transport[] = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

function track(transport: Transport): Transport {
	transports.push(transport);
	return transport;
}

test("rejects hostile nested snapshots and every closed delta projection", async () => {
	const hostileSnapshot = snapshot();
	(hostileSnapshot.timeline as Record<string, unknown>).unexpected = true;
	const snapshotTransport = track(createBrowserWorkbenchTransport());
	const snapshotSocket = new FakeSocket();
	await attachWithSnapshot(snapshotTransport, snapshotSocket, snapshot());
	snapshotSocket.event({ kind: "snapshot", sequence: 2, snapshot: hostileSnapshot });
	expect(snapshotTransport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});

	const invalidDeltas: ReadonlyArray<readonly [string, unknown]> = [
		["readiness", { kind: "readiness", state: "unknown" }],
		["account", { kind: "account", state: "ready", accountType: "invalid" }],
		["login", { kind: "login", state: "idle", unexpected: true }],
		["threadLink", { ...(snapshot().threadLink as Record<string, unknown>), unexpected: true }],
		[
			"timeline",
			{ kind: "timeline", threadId: "thread-a", turns: [], nextCursor: null, unexpected: true },
		],
		["queue", { ...queue(), unexpected: true }],
		["settings", [{ kind: "settings" }]],
		["approvals", [{}]],
		["dynamicApprovals", [{}]],
		[
			"semantic",
			{
				kind: "semantic_delivery",
				threadId: "thread-a",
				delivery: "delivered",
				capturedAtMs: 0,
				freshUntilMs: 0,
				reason: null,
				unexpected: true,
			},
		],
		[
			"coordinator",
			{
				kind: "coordinator",
				state: "unbound",
				threadId: "thread-a",
				activeTurnId: null,
				configuredModel: null,
				configuredEffort: null,
				model: null,
				effort: null,
				serviceTier: null,
				reason: null,
			},
		],
		["voice", { ...(snapshot().voice as Record<string, unknown>), unexpected: true }],
		["lease", { ...lease(), unexpected: true }],
		[
			"operation",
			{
				kind: "operation_outcome",
				operationId: "operation-a",
				outcome: "delivered",
				message: null,
				unexpected: true,
			},
		],
	];

	for (const [field, value] of invalidDeltas) {
		const transport = track(createBrowserWorkbenchTransport());
		const socket = new FakeSocket();
		await attachWithSnapshot(transport, socket, snapshot());
		socket.event(deltaMessage(2, { [field]: value }));
		expect(transport.state()).toMatchObject({
			kind: "connection",
			state: "incompatible_contract",
		});
	}
});

test("keeps the readiness, link, lease, and command capability matrix explicit", async () => {
	const activeLease = lease();
	let sequence = 1;
	let current = snapshot({ lease: activeLease });
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(sequence, current));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(++sequence, current));
	};
	await transport.attach(socket);

	const allReadinessStates = [
		"stopped",
		"backoff",
		"initialized",
		"storage_mismatch",
		"login_capable",
		"signed_out",
		"login_pending",
		"account_ready",
		"thread_capable",
		"reconnecting",
		"incompatible_contract",
	] as const;
	const accountReadyStates = new Set([
		"login_capable",
		"signed_out",
		"login_pending",
		"account_ready",
		"thread_capable",
	]);
	for (const state of allReadinessStates) {
		current = snapshot({ state, lease: activeLease });
		await transport.refresh();
		const capabilities = transport.capabilities();
		const accountReady = accountReadyStates.has(state);
		expect(capabilities.connected).toBe(true);
		expect(capabilities.readiness).toBe(state);
		expect(capabilities.canReadAccount).toBe(accountReady);
		expect(capabilities.canClaimLease).toBe(accountReady);
		// A live lease is a gateway-side lifecycle, not a workbench command, so it
		// stays renewable and releasable in every readiness arm.
		expect(capabilities.canRenewLease).toBe(true);
		expect(capabilities.canReleaseLease).toBe(true);
		expect(capabilities.supportsCommand("accountLogout")).toBe(accountReady);
		expect(capabilities.supportsCommand("threadLinkCreate")).toBe(state === "thread_capable");
		// Discovering the list is how a pane with no link finds one, so it needs
		// thread capability and nothing more.
		expect(capabilities.supportsCommand("threadLinkRefresh")).toBe(state === "thread_capable");
		expect(capabilities.supportsCommand("start")).toBe(state === "thread_capable");
		expect(capabilities.supportsCommand("queueAdd")).toBe(state === "thread_capable");
		expect(capabilities.supportsCommand("approvalRespond")).toBe(false);
		expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBe(false);
		expect(capabilities.canCommand).toBe(state === "thread_capable");
		expect(capabilities.canThreadCommands).toBe(state === "thread_capable");
		expect(capabilities.canRealtime).toBe(state === "thread_capable");
	}

	for (const linkState of ["inspect_only", "unbound"] as const) {
		current = snapshot({ state: "thread_capable", linkState, lease: activeLease });
		await transport.refresh();
		const capabilities = transport.capabilities();
		expect(capabilities.canCommand).toBe(false);
		expect(capabilities.supportsCommand("start")).toBe(false);
		expect(capabilities.supportsCommand("queueAdd")).toBe(false);
		expect(capabilities.supportsCommand("approvalRespond")).toBe(false);
		expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBe(false);
		expect(capabilities.supportsCommand("threadLinkCreate")).toBe(true);
		expect(capabilities.supportsCommand("threadLinkRefresh")).toBe(true);
		expect(capabilities.supportsCommand("threadLinkAttach")).toBe(true);
		expect(capabilities.supportsCommand("threadLinkRelink")).toBe(true);
		expect(capabilities.canRenewLease).toBe(true);
		expect(capabilities.canReleaseLease).toBe(true);
	}

	// A lease with no live socket is not a capability at all.
	await transport.detach(socket);
	const detached = transport.capabilities();
	expect(detached).toMatchObject({
		connected: false,
		canRenewLease: false,
		canReleaseLease: false,
		canClaimLease: false,
		canReadAccount: false,
		canCommand: false,
	});
});

test("marks a sequence gap stale, disables commands, and keeps the lease renewable", async () => {
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
	socket.onRequest = null;
	socket.event(deltaMessage(3, { queue: queue("queued") }));
	expect(transport.state()).toMatchObject({
		kind: "stream",
		state: "stale_snapshot",
		receivedSequence: 3,
	});
	const capabilities = transport.capabilities();
	expect(capabilities.supportsCommand("start")).toBe(false);
	expect(capabilities.canCommand).toBe(false);
	expect(capabilities.canReadAccount).toBe(false);
	// Deliberate: recovering from a stale stream is exactly when a person must be
	// able to keep or hand back the lease they already hold.
	expect(capabilities.canRenewLease).toBe(true);
	expect(capabilities.canReleaseLease).toBe(true);
});
