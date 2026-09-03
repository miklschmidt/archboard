import { afterEach, expect, test } from "bun:test";

import {
	createBrowserWorkbenchTransport,
	type BrowserCommandDraft,
	type BrowserWorkbenchSocket,
} from "../index.js";

type Request = Record<string, unknown>;

class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: Request[] = [];
	readyState = 1;
	onRequest: ((request: Request, socket: FakeSocket) => void) | null = null;

	send(raw: string): void {
		const request = JSON.parse(raw) as Request;
		this.sent.push(request);
		this.onRequest?.(request, this);
	}

	reply(request: Request, value: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: true,
					value,
				}),
			}),
		);
	}

	event(message: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "codex_workbench_event", message }),
			}),
		);
	}
}

function lease(
	expiresAtMs = Date.now() + 60_000,
	commandId = "command-a",
	state: "active" | "released" = "active",
): Record<string, unknown> {
	return {
		kind: "command_lease",
		commandId,
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		state,
		expiresAtMs,
	};
}

function readiness(state: string): Record<string, unknown> {
	if (state === "backoff") return { kind: "readiness", state, retryAtMs: 900, reason: "retry" };
	if (
		state === "stopped" ||
		state === "storage_mismatch" ||
		state === "reconnecting" ||
		state === "incompatible_contract"
	)
		return { kind: "readiness", state, reason: "state reason" };
	if (state === "login_pending") return { kind: "readiness", state, loginId: "login-a" };
	return { kind: "readiness", state };
}

function snapshot(
	options: {
		readonly state?: string;
		readonly threadId?: string;
		readonly lease?: Record<string, unknown> | null;
		readonly linkState?: "executable" | "inspect_only" | "unbound";
	} = {},
): Record<string, unknown> {
	const state = options.state ?? "thread_capable";
	const threadId = options.threadId ?? "thread-a";
	const linkState = options.linkState ?? "executable";
	const threadLink =
		linkState === "executable"
			? {
					kind: "thread_link",
					state: linkState,
					childId: "child-a",
					epoch: "epoch-a",
					threadId,
					sourcePresentation: "standard",
					status: "idle",
					loaded: true,
					canAcceptDirectInput: true,
					reason: null,
				}
			: linkState === "inspect_only"
				? {
						kind: "thread_link",
						state: linkState,
						childId: null,
						epoch: null,
						threadId,
						sourcePresentation: "standard",
						status: "idle",
						loaded: true,
						canAcceptDirectInput: false,
						reason: null,
					}
				: {
						kind: "thread_link",
						state: linkState,
						childId: null,
						epoch: null,
						threadId: null,
						sourcePresentation: null,
						status: "notLoaded",
						loaded: false,
						canAcceptDirectInput: false,
						reason: null,
					};
	return {
		kind: "snapshot",
		version: 1,
		readiness: readiness(state),
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink,
		timeline:
			linkState === "unbound" ? null : { kind: "timeline", threadId, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "unbound",
			threadId: null,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		lease: options.lease ?? null,
		operation: null,
	};
}

function snapshotMessage(sequence: number, value: Record<string, unknown>) {
	return { kind: "snapshot", sequence, snapshot: value };
}

function deltaMessage(sequence: number, delta: Record<string, unknown>) {
	return { kind: "delta", sequence, delta };
}

function dynamicDraft(threadId = "thread-a"): BrowserCommandDraft {
	return {
		command: "dynamicApprovalRespond",
		capturedLink: { threadId, childId: "child-a", epoch: "epoch-a" },
		identity: {
			child: "child-a",
			epoch: "epoch-a",
			threadId,
			turnId: "turn-a",
			callId: "call-a",
			namespace: "archboard_app",
			tool: "send_message_to_thread",
			manifestHash: "manifest-a",
			operationId: "operation-a",
		},
		effectHash: `sha256:${"0".repeat(64)}`,
		decision: "approve",
	} as unknown as BrowserCommandDraft;
}

async function attachWithSnapshot(
	transport: ReturnType<typeof createBrowserWorkbenchTransport>,
	socket: FakeSocket,
	value: Record<string, unknown>,
	sequence = 1,
): Promise<void> {
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(sequence, value));
	};
	await transport.attach(socket);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("The promise unexpectedly resolved.");
}

const transports: Array<ReturnType<typeof createBrowserWorkbenchTransport>> = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

test("rejects hostile nested snapshots and every closed delta projection", async () => {
	const hostileSnapshot = snapshot();
	(hostileSnapshot.timeline as Record<string, unknown>).unexpected = true;
	const snapshotTransport = createBrowserWorkbenchTransport();
	transports.push(snapshotTransport);
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
		["queue", { kind: "queue", status: "empty", entries: [], unexpected: true }],
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
		const transport = createBrowserWorkbenchTransport();
		transports.push(transport);
		const socket = new FakeSocket();
		await attachWithSnapshot(transport, socket, snapshot());
		socket.event(deltaMessage(2, { [field]: value }));
		expect(transport.state()).toMatchObject({
			kind: "connection",
			state: "incompatible_contract",
		});
	}
});

test("keeps the readiness, link, and command capability matrix explicit", async () => {
	const activeLease = lease();
	let sequence = 1;
	let current = snapshot({ lease: activeLease });
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
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
		expect(capabilities.supportsCommand("accountLogout")).toBe(accountReady);
		expect(capabilities.supportsCommand("threadLinkCreate")).toBe(state === "thread_capable");
		expect(capabilities.supportsCommand("start")).toBe(state === "thread_capable");
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
		expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBe(false);
		expect(capabilities.supportsCommand("threadLinkCreate")).toBe(true);
		expect(capabilities.supportsCommand("threadLinkAttach")).toBe(true);
		expect(capabilities.supportsCommand("threadLinkRelink")).toBe(true);
	}
});

test("marks a sequence gap stale and disables commands until a new snapshot arrives", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
	socket.onRequest = null;
	socket.event(deltaMessage(3, { queue: { kind: "queue", status: "queued", entries: [] } }));
	expect(transport.state()).toMatchObject({
		kind: "stream",
		state: "stale_snapshot",
		receivedSequence: 3,
	});
	expect(transport.capabilities().supportsCommand("start")).toBe(false);
});

test("requires dynamic approval identity and captured-link fields to match the current target", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
	expect(transport.capabilities().supportsCommand("dynamicApprovalRespond")).toBe(false);

	const wrongLink = dynamicDraft("thread-b");
	const wrongIdentity = dynamicDraft();
	const wrongIdentityRecord = wrongIdentity as unknown as Record<string, unknown>;
	wrongIdentityRecord.identity = {
		...(wrongIdentityRecord.identity as Record<string, unknown>),
		child: "child-b",
	};
	for (const draft of [wrongLink, wrongIdentity]) {
		const error = await rejection(transport.command(draft));
		expect(error).toMatchObject({ code: "not_ready", outcome: "not_delivered" });
	}
	expect(socket.sent.some((request) => request.action === "command")).toBe(false);
});

test("renews and releases a lease only after preserving its target identity", async () => {
	const initialLease = lease();
	const renewedLease = lease(Date.now() + 120_000);
	const releasedLease = lease(Date.now() + 120_000, "command-a", "released");
	let sequence = 1;
	let current = snapshot({ lease: initialLease });
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(sequence, current));
		else if (request.action === "renewLease") {
			current = snapshot({ lease: renewedLease });
			activeSocket.reply(request, renewedLease);
		} else if (request.action === "releaseLease") {
			current = snapshot({ lease: releasedLease });
			activeSocket.reply(request, releasedLease);
		} else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(++sequence, current));
	};
	await transport.attach(socket);

	const renewed = await transport.renewLease();
	expect(String(renewed.commandId)).toBe("command-a");
	expect(transport.lease()?.expiresAtMs).toBe(Number(renewedLease.expiresAtMs));
	expect(transport.capabilities().canRenewLease).toBe(true);

	const released = await transport.releaseLease();
	expect(String(released?.commandId)).toBe("command-a");
	expect(released?.state).toBe("released");
	expect(transport.capabilities().canReleaseLease).toBe(false);
});
