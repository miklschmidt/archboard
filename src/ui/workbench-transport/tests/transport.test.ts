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

	replyFailure(request: Request, error = "request rejected"): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: false,
					error,
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

	close(): void {
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

function lease(expiresAtMs = 10_000, commandId = "command-a"): Record<string, unknown> {
	return {
		kind: "command_lease",
		commandId,
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		state: "active",
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
					source: "appServer",
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
						source: "appServer",
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
						source: null,
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

function commandResult(value: Record<string, unknown>, commandId: string | null = "command-a") {
	return {
		kind: "command_result",
		commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

function accountResult(value: Record<string, unknown>) {
	return {
		kind: "account_read",
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

function startDraft(threadId = "thread-a"): BrowserCommandDraft {
	return { command: "start", threadId, prompt: "begin" } as unknown as BrowserCommandDraft;
}

function requiredRequest(request: Request | null): Request {
	if (request === null) throw new Error("the command request was not sent");
	return request;
}

async function attachWithSnapshot(
	transport: ReturnType<typeof createBrowserWorkbenchTransport>,
	socket: FakeSocket,
	value: Record<string, unknown>,
	sequence = 1,
): Promise<void> {
	socket.onRequest = (request, activeSocket) => {
		if (
			request.action === "connect" ||
			request.action === "subscribe" ||
			request.action === "snapshot"
		)
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

test("handshake uses the composed gateway envelope and exposes readiness capabilities", async () => {
	const transport = createBrowserWorkbenchTransport({
		requestId: (() => {
			let count = 0;
			return () => `request-${++count}`;
		})(),
	});
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot(), 7);

	expect(socket.sent).toEqual([
		{ type: "codex_workbench_request", requestId: "request-1", action: "subscribe" },
	]);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		sequence: 7,
	});
	expect(transport.capabilities()).toMatchObject({
		connected: true,
		canReadAccount: true,
		canClaimLease: true,
		canCommand: false,
	});
	expect(transport.capabilities().supportsCommand("start")).toBe(false);
});

test("strict stream reduction rejects gaps, ignores duplicates, and recovers from a snapshot", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	let recoverySequence = 4;
	const initial = snapshot();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "connect" || request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, initial));
		if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(recoverySequence, snapshot()));
	};
	await transport.attach(socket);

	socket.event(deltaMessage(3, { queue: { kind: "queue", status: "queued", entries: [] } }));
	await Bun.sleep(0);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		sequence: 4,
	});
	expect(socket.sent.filter((request) => request.action === "snapshot")).toHaveLength(1);

	socket.event(deltaMessage(5, { queue: { kind: "queue", status: "queued", entries: [] } }));
	socket.event(deltaMessage(5, { queue: { kind: "queue", status: "queued", entries: [] } }));
	expect(transport.sequence()).toBe(5);
	expect(transport.state()).toMatchObject({ kind: "readiness", state: "thread_capable" });

	recoverySequence = 6;
	socket.event(deltaMessage(2, { queue: { kind: "queue", status: "empty", entries: [] } }));
	await Bun.sleep(0);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		sequence: 6,
	});
	expect(socket.sent.filter((request) => request.action === "snapshot")).toHaveLength(2);
});

test("commands capture the lease target before focus or navigation changes", async () => {
	const activeLease = lease(Date.now() + 10_000);
	const initial = snapshot({ lease: activeLease });
	const navigated = snapshot({ lease: activeLease, threadId: "thread-b" });
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	let commandRequest: Request | null = null;
	let currentSnapshot = initial;
	let currentSequence = 1;
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "connect" || request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, initial));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(currentSequence, currentSnapshot));
		else if (request.action === "command") commandRequest = request;
	};
	await transport.attach(socket);

	const resultPromise = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(commandRequest);
	const sentCommand = sentRequest.command as Record<string, unknown>;
	expect(sentCommand).toMatchObject({
		kind: "browser_command",
		command: "start",
		commandId: "command-a",
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		threadId: "thread-a",
	});

	currentSnapshot = navigated;
	currentSequence = 3;
	socket.event(deltaMessage(3, { threadLink: navigated.threadLink }));
	socket.reply(sentRequest, commandResult(snapshot({ threadId: "thread-result" })));
	const result = await resultPromise;
	expect(result.outcome).toBe("delivered");
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe("thread-b");
	currentSnapshot = snapshot({ threadId: "thread-c" });
	currentSequence = 4;
	socket.event(deltaMessage(4, { queue: currentSnapshot.queue }));
	expect(transport.sequence()).toBe(4);
	expect(transport.snapshot()?.queue.status).toBe("empty");
});

test("lost command responses become outcome-unknown and are never replayed after replacement", async () => {
	const activeLease = lease(Date.now() + 10_000);
	const first = new FakeSocket();
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	await attachWithSnapshot(transport, first, snapshot({ lease: activeLease }));
	let commandRequest: Request | null = null;
	first.onRequest = (request) => {
		if (request.action === "command") commandRequest = request;
	};
	const pending = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(commandRequest);
	first.close();
	expect(await rejection(pending)).toMatchObject({
		name: "BrowserWorkbenchTransportError",
		code: "response_lost",
		outcome: "outcome_unknown",
	});

	const second = new FakeSocket();
	await attachWithSnapshot(transport, second, snapshot(), 9);
	first.reply(sentRequest, commandResult(snapshot({ lease: activeLease })));
	expect(second.sent.map((request) => request.action)).toEqual(["subscribe"]);
});

test("lease expiry blocks commands locally and readiness states do not unlock unsupported actions", async () => {
	let clock = 100;
	const expired = lease(100);
	const transport = createBrowserWorkbenchTransport({ now: () => clock });
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ lease: expired }));
	expect(transport.capabilities().canCommand).toBe(false);
	expect(await rejection(transport.command(startDraft()))).toMatchObject({
		code: "lease_expired",
		outcome: "not_delivered",
	});
	expect(socket.sent.some((request) => request.action === "command")).toBe(false);

	for (const state of [
		"initialized",
		"storage_mismatch",
		"login_capable",
		"signed_out",
		"login_pending",
		"account_ready",
		"thread_capable",
		"reconnecting",
		"incompatible_contract",
	]) {
		clock += 1;
		const next = snapshot({ state });
		socket.onRequest = (request, activeSocket) => {
			if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(clock, next));
		};
		await transport.refresh();
		expect(transport.state()).toMatchObject({ kind: "readiness", state });
		expect(transport.capabilities().supportsCommand("start")).toBe(false);
	}
});

test("account results reconcile through a versioned snapshot and socket close exposes backoff", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	const accountReady = snapshot({ state: "account_ready" });
	const reconciled = snapshot({ state: "account_ready" });
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "connect" || request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, accountReady));
		else if (request.action === "accountRead")
			activeSocket.reply(request, accountResult(accountReady));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(2, reconciled));
	};
	await transport.attach(socket);
	const result = await transport.accountRead();
	expect(result.kind).toBe("account_read");
	expect(transport.sequence()).toBe(2);
	socket.event(deltaMessage(3, { queue: { kind: "queue", status: "queued", entries: [] } }));
	expect(transport.sequence()).toBe(3);
	expect(transport.snapshot()?.queue.status).toBe("queued");
	socket.close();
	expect(transport.state()).toMatchObject({ kind: "connection", state: "backoff" });
	await transport.attach(socket);
});

test("explicit close uses the gateway close action and leaves the transport stopped", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "close") activeSocket.reply(request, null);
	};
	await transport.close();
	expect(socket.sent.at(-1)).toMatchObject({
		type: "codex_workbench_request",
		action: "close",
	});
	expect(transport.state()).toMatchObject({ kind: "connection", state: "stopped" });
});

test("malformed workbench messages move the transport to incompatible-contract", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.event({ kind: "snapshot", sequence: 2, snapshot: { ...snapshot(), version: 2 } });
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	expect(await rejection(transport.refresh())).toMatchObject({ code: "socket_unavailable" });
});

test("gateway failure responses are surfaced without treating them as transport loss", async () => {
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ state: "account_ready" }));
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "accountRead") activeSocket.replyFailure(request, "account unavailable");
	};
	expect(await rejection(transport.accountRead())).toMatchObject({
		code: "gateway_error",
		outcome: "not_delivered",
	});
	expect(transport.state()).toMatchObject({ kind: "readiness", state: "account_ready" });
});
