import { afterEach, expect, jest, test } from "bun:test";

import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
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

	close(): void {
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
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

function startDraft(threadId = "thread-a"): BrowserCommandDraft {
	return { command: "start", threadId, prompt: "begin" } as unknown as BrowserCommandDraft;
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

function requiredRequest(request: Request | null): Request {
	if (request === null) throw new Error("the command request was not sent");
	return request;
}

const transports: Array<ReturnType<typeof createBrowserWorkbenchTransport>> = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

test("settles an open-socket request once at the deadline and ignores a late result", async () => {
	jest.useFakeTimers();
	try {
		const activeLease = lease();
		const transport = createBrowserWorkbenchTransport();
		transports.push(transport);
		const socket = new FakeSocket();
		await attachWithSnapshot(transport, socket, snapshot({ lease: activeLease }));
		let commandRequest: Request | null = null;
		socket.onRequest = (request) => {
			if (request.action === "command") commandRequest = request;
		};

		const pending = transport.command(startDraft());
		const settled = rejection(pending);
		jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
		const error = await settled;
		expect(error).toMatchObject({
			name: "BrowserWorkbenchTransportError",
			code: "response_lost",
			outcome: "outcome_unknown",
			commandId: "command-a",
		});
		const sequence = transport.sequence();
		socket.reply(requiredRequest(commandRequest), {});
		expect(transport.sequence()).toBe(sequence);
		expect(transport.state()).toMatchObject({
			kind: "readiness",
			state: "thread_capable",
		});
	} finally {
		jest.useRealTimers();
	}
});

test("rejects a command result whose identity differs from the frozen target", async () => {
	const activeLease = lease();
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
		else if (request.action === "command")
			activeSocket.reply(request, commandResult(snapshot({ lease: activeLease }), "command-b"));
	};
	await transport.attach(socket);

	const error = await rejection(transport.command(startDraft()));
	expect(error).toMatchObject({
		code: "incompatible_contract",
		outcome: "outcome_unknown",
		commandId: "command-a",
	});
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	expect(socket.sent.map((request) => request.action)).toEqual(["subscribe", "command"]);
});

test("rejects renew and release results that change the lease target", async () => {
	for (const action of ["renewLease", "releaseLease"] as const) {
		const activeLease = lease();
		const transport = createBrowserWorkbenchTransport();
		transports.push(transport);
		const socket = new FakeSocket();
		socket.onRequest = (request, activeSocket) => {
			if (request.action === "subscribe")
				activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
			else if (request.action === action)
				activeSocket.reply(
					request,
					lease(
						Date.now() + 60_000,
						"command-b",
						action === "releaseLease" ? "released" : "active",
					),
				);
		};
		await transport.attach(socket);

		const pending = action === "renewLease" ? transport.renewLease() : transport.releaseLease();
		const error = await rejection(pending);
		expect(error).toMatchObject({
			code: "incompatible_contract",
			outcome: "outcome_unknown",
			commandId: "command-a",
		});
		expect(transport.state()).toMatchObject({
			kind: "connection",
			state: "incompatible_contract",
		});
	}
});

test("transport snapshots, leases, and captured targets remain immutable across later deltas", async () => {
	const sourceLease = lease();
	const source = snapshot({ lease: sourceLease });
	const transport = createBrowserWorkbenchTransport();
	transports.push(transport);
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, source);
	(source.threadLink as Record<string, unknown>).threadId = "mutated-thread";
	(source.queue as Record<string, unknown>).status = "failed";
	sourceLease.commandId = "mutated-command";

	const observed = transport.snapshot();
	const observedLease = transport.lease();
	if (observed === null || observedLease === null) throw new Error("the snapshot was not attached");
	expect(String(observed.threadLink.threadId)).toBe("thread-a");
	expect(observed.queue.status).toBe("empty");
	expect(String(observedLease.commandId)).toBe("command-a");
	expect(Object.isFrozen(observed)).toBe(true);
	expect(Object.isFrozen(observed.threadLink)).toBe(true);
	expect(Object.isFrozen(observed.queue)).toBe(true);
	expect(Object.isFrozen(observedLease)).toBe(true);

	const target = transport.captureCommandTarget();
	expect(Object.isFrozen(target)).toBe(true);
	expect(Object.isFrozen(target.capturedThreadLink)).toBe(true);
	expect(Reflect.set(target as unknown as Record<string, unknown>, "commandId", "evil")).toBe(
		false,
	);
	expect(
		Reflect.set(
			target.capturedThreadLink as unknown as Record<string, unknown>,
			"threadId",
			"evil",
		),
	).toBe(false);

	let sequence = 2;
	const currentLease = lease();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "command")
			activeSocket.reply(request, commandResult(snapshot({ lease: currentLease })));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(++sequence, snapshot({ lease: currentLease })));
	};
	const deltaQueue = { kind: "queue", status: "queued", entries: [] };
	socket.event(deltaMessage(2, { queue: deltaQueue }));
	deltaQueue.status = "failed";
	expect(transport.snapshot()?.queue.status).toBe("queued");

	const result = await transport.command(startDraft());
	const sentCommand = socket.sent.find((request) => request.action === "command");
	expect(sentCommand?.command).toMatchObject({
		commandId: "command-a",
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		threadId: "thread-a",
	});
	expect(Object.isFrozen(result.snapshot)).toBe(true);
	expect(Reflect.set(result.snapshot as unknown as Record<string, unknown>, "version", 2)).toBe(
		false,
	);
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe("thread-a");
	expect(String(transport.lease()?.commandId)).toBe("command-a");
});
