// One socket generation: its pending requests, the listeners it added, and
// the snapshot it has reduced so far. The transport owns at most one run at a
// time; a retired run answers nothing and touches nothing.

import { CODEX_REQUEST_SETTLEMENT_MS } from "@/shared/timing/timing";
import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	BrowserWorkbenchTransportError,
	type BrowserGatewayAction,
	type BrowserWorkbenchGatewayMessage,
	type BrowserWorkbenchSnapshotMessage,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchTransportErrorCode,
	type BrowserWorkbenchTransportErrorOptions,
} from "@/ui/workbench-transport/contract";
import { isRecord } from "@/ui/workbench-transport/lib/wire";
import {
	parseBrowserEvent,
	parseBrowserResponse,
	type BrowserWorkbenchResponseEnvelope,
} from "@/ui/workbench-transport/lib/wire-results";
import { BrowserWorkbenchWireError } from "@/ui/workbench-transport/lib/wire-identity";

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

/** What a pending request is for; commands and leases exclude one another. */
type PendingKind = "snapshot" | "lease" | "account" | "command" | "media" | "control";

/** One request on the wire, waiting for its answer or its deadline. */
interface PendingRequest {
	readonly action: BrowserGatewayAction;
	readonly kind: PendingKind;
	readonly commandId: BrowserCommandLease["commandId"] | null;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: BrowserWorkbenchTransportError) => void;
	timer: ReturnType<typeof setTimeout> | null;
}

/** One socket generation. */
interface SocketRun {
	readonly socket: BrowserWorkbenchSocket;
	readonly pending: Map<string, PendingRequest>;
	/** Remove the run's socket listeners. */
	readonly remove: () => void;
	snapshot: BrowserSnapshot | null;
	sequence: number | null;
	refreshPromise: Promise<BrowserWorkbenchSnapshotMessage> | null;
	closed: boolean;
	/** Advances whenever a captured intent can no longer be trusted. */
	intentRevision: number;
}

/** What a run needs from its transport. */
interface SocketRunHost {
	readonly isCurrent: (run: SocketRun) => boolean;
	readonly nextRequestId: () => string;
	readonly onGatewayMessage: (run: SocketRun, message: BrowserWorkbenchGatewayMessage) => void;
	readonly onClose: (run: SocketRun) => void;
	readonly incompatible: (run: SocketRun, error: unknown) => void;
}

/**
 * A refusal with the command it concerns, when any.
 * @param code The refusal code.
 * @param message Plain words.
 * @param pending The pending request, for its command id.
 * @param options Outcome, request id and cause.
 * @returns The error.
 */
function transportFailure(
	code: BrowserWorkbenchTransportErrorCode,
	message: string,
	pending?: Pick<PendingRequest, "commandId">,
	options: Omit<BrowserWorkbenchTransportErrorOptions, "commandId"> = {},
): BrowserWorkbenchTransportError {
	return new BrowserWorkbenchTransportError(code, message, {
		...options,
		commandId: pending?.commandId ?? null,
	});
}

/**
 * An error's message, or a fallback when it has none.
 * @param error The error.
 * @param fallback The words when the error has none.
 * @returns The message.
 */
function messageOf(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Whether a socket is open.
 * @param socket The socket.
 * @returns True when open.
 */
function socketOpen(socket: BrowserWorkbenchSocket): boolean {
	return socket.readyState === SOCKET_OPEN;
}

/**
 * Whether an error is a wire refusal.
 * @param error The error.
 * @returns True for a wire error.
 */
function isWireError(error: unknown): boolean {
	return error instanceof BrowserWorkbenchWireError;
}

/** The resolver a deferred holds before its promise has captured the real one. */
function settleNothing(): void {
	// Replaced synchronously by the promise executor.
}

/** A promise with its resolvers in hand. */
interface Deferred<Value> {
	readonly promise: Promise<Value>;
	readonly resolve: (value: Value) => void;
	readonly reject: (error: BrowserWorkbenchTransportError) => void;
}

/**
 * A promise settled from outside.
 * @returns The promise and its resolvers.
 */
function deferred<Value>(): Deferred<Value> {
	let resolve: (value: Value) => void = settleNothing;
	let reject: (error: BrowserWorkbenchTransportError) => void = settleNothing;
	const promise = new Promise<Value>((settle, fail) => {
		resolve = settle;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/**
 * Stop a pending request's deadline.
 * @param pending The request.
 */
function clearPendingTimer(pending: PendingRequest): void {
	if (pending.timer !== null) {
		clearTimeout(pending.timer);
		pending.timer = null;
	}
}

/**
 * Reject every pending request of a run with one reason.
 * @param run The run.
 * @param code The refusal code.
 * @param message Plain words.
 */
function rejectPending(
	run: SocketRun,
	code: BrowserWorkbenchTransportErrorCode,
	message: string,
): void {
	for (const [requestId, pending] of run.pending) {
		clearPendingTimer(pending);
		pending.reject(
			transportFailure(code, message, pending, { requestId, outcome: "outcome_unknown" }),
		);
	}
	run.pending.clear();
}

/**
 * Settle a request whose answer never came.
 * @param run The run.
 * @param requestId The request.
 * @param pending The request record.
 */
function expirePending(run: SocketRun, requestId: string, pending: PendingRequest): void {
	if (run.pending.get(requestId) !== pending) {
		return;
	}
	run.pending.delete(requestId);
	pending.timer = null;
	pending.reject(
		transportFailure(
			"response_lost",
			"The Codex workbench response did not arrive before the settlement deadline.",
			pending,
			{ requestId, outcome: "outcome_unknown" },
		),
	);
}

/** How one request is sent. */
interface RequestSpec {
	readonly action: BrowserGatewayAction;
	readonly kind: PendingKind;
	readonly extra?: Record<string, unknown>;
	readonly commandId?: BrowserCommandLease["commandId"] | null;
}

/**
 * Send one request and wait for its answer or its deadline.
 * @param run The run.
 * @param host The transport.
 * @param spec The action, its kind, extra fields and the command it belongs to.
 * @returns The answer's value.
 */
function sendRequest(run: SocketRun, host: SocketRunHost, spec: RequestSpec): Promise<unknown> {
	if (!host.isCurrent(run) || !socketOpen(run.socket)) {
		throw transportFailure("socket_unavailable", "The Codex workbench socket is unavailable.");
	}
	const requestId = host.nextRequestId();
	const commandId = spec.commandId ?? null;
	const request = {
		type: "codex_workbench_request",
		requestId,
		action: spec.action,
		...spec.extra,
	};
	const { promise, resolve, reject } = deferred<unknown>();
	const pending: PendingRequest = {
		action: spec.action,
		kind: spec.kind,
		commandId,
		resolve,
		reject,
		timer: null,
	};
	run.pending.set(requestId, pending);
	pending.timer = setTimeout(
		() => expirePending(run, requestId, pending),
		CODEX_REQUEST_SETTLEMENT_MS,
	);
	try {
		run.socket.send(JSON.stringify(request));
	} catch (error) {
		run.pending.delete(requestId);
		clearPendingTimer(pending);
		throw transportFailure(
			"socket_unavailable",
			"The Codex workbench request could not be sent.",
			{ commandId },
			{ outcome: "not_delivered", requestId, cause: error },
		);
	}
	return promise;
}

/**
 * Match a response to its request, refusing one that names another.
 * @param raw The response record.
 * @param requestId The request it claims.
 * @param pending The request record.
 * @returns The envelope.
 */
function matchedResponse(
	raw: Record<string, unknown>,
	requestId: string,
	pending: PendingRequest,
): BrowserWorkbenchResponseEnvelope {
	const response = parseBrowserResponse(raw);
	if (response.requestId !== requestId || response.action !== pending.action) {
		throw new BrowserWorkbenchWireError("The Codex workbench response does not match its request.");
	}
	return response;
}

/**
 * Resolve or reject a pending request from its matched response.
 * @param pending The request record.
 * @param requestId The request.
 * @param response The matched envelope.
 */
function settlePending(
	pending: PendingRequest,
	requestId: string,
	response: BrowserWorkbenchResponseEnvelope,
): void {
	if (response.ok) {
		pending.resolve(response.value);
		return;
	}
	pending.reject(
		transportFailure("gateway_error", response.error, pending, {
			outcome: "not_delivered",
			requestId,
		}),
	);
}

/**
 * Settle a pending request from its response.
 * @param run The run.
 * @param host The transport.
 * @param raw The response record.
 */
function handleResponse(run: SocketRun, host: SocketRunHost, raw: Record<string, unknown>): void {
	const requestId = typeof raw["requestId"] === "string" ? raw["requestId"] : null;
	const pending = requestId === null ? undefined : run.pending.get(requestId);
	if (requestId === null || pending === undefined) {
		return;
	}
	run.pending.delete(requestId);
	clearPendingTimer(pending);
	try {
		settlePending(pending, requestId, matchedResponse(raw, requestId, pending));
	} catch (error) {
		pending.reject(
			transportFailure(
				"incompatible_contract",
				messageOf(error, "The Codex workbench response is incompatible."),
				pending,
				{ outcome: "outcome_unknown", requestId, cause: error },
			),
		);
		host.incompatible(run, error);
	}
}

/**
 * The JSON a message event carries, or null when it is not JSON text.
 * @param event The socket event.
 * @returns The parsed record, or null.
 */
function messageRecord(event: Event): Record<string, unknown> | null {
	const data = event instanceof MessageEvent ? event.data : null;
	if (typeof data !== "string") {
		return null;
	}
	try {
		const raw: unknown = JSON.parse(data);
		return isRecord(raw) ? raw : null;
	} catch {
		return null;
	}
}

/**
 * Route one socket message to the event or response path.
 * @param run The run.
 * @param host The transport.
 * @param event The socket event.
 */
function onMessage(run: SocketRun, host: SocketRunHost, event: Event): void {
	const raw = host.isCurrent(run) ? messageRecord(event) : null;
	if (raw === null) {
		return;
	}
	if (raw["type"] === "codex_workbench_result") {
		handleResponse(run, host, raw);
		return;
	}
	if (raw["type"] !== "codex_workbench_event") {
		return;
	}
	try {
		host.onGatewayMessage(run, parseBrowserEvent(raw));
	} catch (error) {
		host.incompatible(run, error);
	}
}

/**
 * Start a run on a socket, listening for its messages and its close.
 * @param socket The socket.
 * @param host The transport.
 * @returns The run.
 */
function createSocketRun(socket: BrowserWorkbenchSocket, host: SocketRunHost): SocketRun {
	const run: SocketRun = {
		socket,
		pending: new Map(),
		remove,
		snapshot: null,
		sequence: null,
		refreshPromise: null,
		closed: false,
		intentRevision: 0,
	};
	/**
	 * Forward a message.
	 * @param event The socket event.
	 */
	function messageListener(event: Event): void {
		onMessage(run, host, event);
	}
	/** Forward the close. */
	function closeListener(): void {
		host.onClose(run);
	}
	/** Remove the run's socket listeners. */
	function remove(): void {
		socket.removeEventListener("message", messageListener);
		socket.removeEventListener("close", closeListener);
	}
	socket.addEventListener("message", messageListener);
	socket.addEventListener("close", closeListener);
	return run;
}

/**
 * Wait until a run's socket is open.
 * @param run The run.
 * @returns Settles when open; rejects when the socket closes first.
 */
async function waitForOpen(run: SocketRun): Promise<void> {
	if (socketOpen(run.socket)) {
		return;
	}
	if (run.socket.readyState === SOCKET_CLOSING || run.socket.readyState === SOCKET_CLOSED) {
		throw transportFailure("socket_unavailable", "The Codex workbench socket is closed.");
	}
	const { promise, resolve, reject } = deferred<void>();
	/** Stop listening. */
	function cleanup(): void {
		run.socket.removeEventListener("open", onOpen);
		run.socket.removeEventListener("close", onClosed);
	}
	/** The socket opened. */
	function onOpen(): void {
		cleanup();
		resolve();
	}
	/** The socket closed first. */
	function onClosed(): void {
		cleanup();
		reject(
			transportFailure(
				"socket_unavailable",
				"The Codex workbench socket closed before connecting.",
			),
		);
	}
	run.socket.addEventListener("open", onOpen);
	run.socket.addEventListener("close", onClosed);
	await promise;
}

export {
	createSocketRun,
	isWireError,
	messageOf,
	rejectPending,
	sendRequest,
	socketOpen,
	transportFailure,
	waitForOpen,
	type PendingKind,
	type PendingRequest,
	type RequestSpec,
	type SocketRun,
	type SocketRunHost,
};
