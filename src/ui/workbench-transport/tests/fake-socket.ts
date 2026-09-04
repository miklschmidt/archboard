import type { createBrowserWorkbenchTransport, BrowserWorkbenchSocket } from "../index.js";

export type FakeSocketRequest = Record<string, unknown>;

export class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: FakeSocketRequest[] = [];
	closeCalls = 0;
	readyState = 1;
	onRequest: ((request: FakeSocketRequest, socket: FakeSocket) => void) | null = null;

	send(raw: string): void {
		const request = JSON.parse(raw) as FakeSocketRequest;
		this.sent.push(request);
		this.onRequest?.(request, this);
	}

	actions(action: string): FakeSocketRequest[] {
		return this.sent.filter((request) => request.action === action);
	}

	reply(request: FakeSocketRequest, value: unknown): void {
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

	replyFailure(request: FakeSocketRequest, error = "request rejected"): void {
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

	open(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	close(): void {
		this.closeCalls += 1;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

export function lease(
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

export function readiness(state: string): Record<string, unknown> {
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

/** One pending command-execution approval bound to the default child epoch. */
export function approval(
	options: {
		readonly requestId?: string;
		readonly approvalId?: string | null;
		readonly threadId?: string;
		readonly childId?: string;
		readonly epoch?: string;
		readonly expiresAtMs?: number;
		readonly lifecycle?: Record<string, unknown>;
	} = {},
): Record<string, unknown> {
	const lifecycle = options.lifecycle ?? {
		state: "pending",
		decision: null,
		outcome: null,
		reason: null,
	};
	return {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: options.requestId ?? "request-a",
		threadId: options.threadId ?? "thread-a",
		turnId: "turn-a",
		itemId: "item-a",
		approvalId: options.approvalId === undefined ? "approval-a" : options.approvalId,
		expiresAtMs: options.expiresAtMs ?? 4_000_000_000_000,
		lifecycle,
		binding: {
			child: options.childId ?? "child-a",
			epoch: options.epoch ?? "epoch-a",
			link: "pane:pane-a",
			target: "the workhorse shell",
			effect: "run a command",
		},
		spoken: { eligible: lifecycle.state === "pending", reason: "eligible" },
		reason: null,
		command: "ls",
		availableDecisions: [],
	};
}

export function queue(
	status = "empty",
	submissionIds: readonly string[] = [],
): Record<string, unknown> {
	return {
		kind: "queue",
		status,
		entries: submissionIds.map((submissionId) => ({
			submissionId,
			prompt: "queued work",
			status: "queued",
			operationId: null,
		})),
	};
}

export interface SnapshotOptions {
	readonly state?: string;
	readonly threadId?: string;
	readonly lease?: Record<string, unknown> | null;
	readonly linkState?: "executable" | "inspect_only" | "unbound";
	readonly approvals?: readonly Record<string, unknown>[];
	readonly dynamicApprovals?: readonly Record<string, unknown>[];
	readonly queue?: Record<string, unknown>;
	readonly voiceState?: string;
	readonly threadCandidates?: Record<string, unknown>;
}

function threadLinkFor(linkState: string, threadId: string): Record<string, unknown> {
	if (linkState === "executable")
		return {
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
		};
	if (linkState === "inspect_only")
		return {
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
		};
	return {
		kind: "thread_link",
		state: "unbound",
		childId: null,
		epoch: null,
		threadId: null,
		sourcePresentation: null,
		status: "notLoaded",
		loaded: false,
		canAcceptDirectInput: false,
		reason: null,
	};
}

export function snapshot(options: SnapshotOptions = {}): Record<string, unknown> {
	const state = options.state ?? "thread_capable";
	const threadId = options.threadId ?? "thread-a";
	const linkState = options.linkState ?? "executable";
	return {
		kind: "snapshot",
		version: 1,
		readiness: readiness(state),
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: threadLinkFor(linkState, threadId),
		threadCandidates: options.threadCandidates ?? {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline:
			linkState === "unbound" ? null : { kind: "timeline", threadId, turns: [], nextCursor: null },
		queue: options.queue ?? queue(),
		settings: [],
		approvals: options.approvals ?? [],
		dynamicApprovals: options.dynamicApprovals ?? [],
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
			state: options.voiceState ?? "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		lease: options.lease ?? null,
		operation: null,
	};
}

export function snapshotMessage(sequence: number, value: Record<string, unknown>) {
	return { kind: "snapshot", sequence, snapshot: value };
}

export function deltaMessage(sequence: number, delta: Record<string, unknown>) {
	return { kind: "delta", sequence, delta };
}

export function commandResult(
	value: Record<string, unknown>,
	commandId: string | null = "command-a",
) {
	return {
		kind: "command_result",
		commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

export function accountResult(value: Record<string, unknown>) {
	return {
		kind: "account_read",
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

export type Transport = ReturnType<typeof createBrowserWorkbenchTransport>;

export async function attachWithSnapshot(
	transport: Transport,
	socket: FakeSocket,
	value: Record<string, unknown>,
	sequence = 1,
): Promise<void> {
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe" || request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(sequence, value));
	};
	await transport.attach(socket);
}

export async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("The promise unexpectedly resolved.");
}

export function requiredRequest(request: FakeSocketRequest | null): FakeSocketRequest {
	if (request === null) throw new Error("the request was not sent");
	return request;
}
