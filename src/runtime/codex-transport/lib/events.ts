import { CODEX_TRANSPORT_MAX_RETAINED_ISSUES, CODEX_TRANSPORT_MAX_STDERR_BYTES } from "./limits.js";
import type {
	TransportExit,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
	TransportStderrChunk,
	TransportStderrSnapshot,
	Unsubscribe,
} from "./types.js";

type Listener<T> = (value: T) => void;

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Unsubscribe {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export interface TransportEvents {
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly emitServerRequest: (request: TransportServerRequest) => void;
	readonly emitServerNotification: (event: TransportServerNotification) => void;
	readonly emitStderr: (buffer: Buffer, text: string) => void;
	readonly emitExit: (event: TransportExit) => void;
	readonly onServerRequest: (listener: Listener<TransportServerRequest>) => Unsubscribe;
	readonly onServerNotification: (listener: Listener<TransportServerNotification>) => Unsubscribe;
	readonly onIssue: (listener: Listener<TransportIssue>) => Unsubscribe;
	readonly onStderr: (listener: Listener<TransportStderrChunk>) => Unsubscribe;
	readonly onExit: (listener: Listener<TransportExit>) => Unsubscribe;
	readonly inspectIssues: () => readonly TransportIssue[];
	readonly inspectStderr: () => TransportStderrSnapshot;
}

export function createTransportEvents(): TransportEvents {
	let stderrRetained = "";
	let stderrRetainedBytes = 0;
	let stderrTotalBytes = 0;
	let stderrTruncated = false;
	const issues: TransportIssue[] = [];
	const requestListeners = new Set<Listener<TransportServerRequest>>();
	const notificationListeners = new Set<Listener<TransportServerNotification>>();
	const issueListeners = new Set<Listener<TransportIssue>>();
	const stderrListeners = new Set<Listener<TransportStderrChunk>>();
	const exitListeners = new Set<Listener<TransportExit>>();

	const emitIssue = (issue: TransportIssue): void => {
		if (issues.length >= CODEX_TRANSPORT_MAX_RETAINED_ISSUES) issues.shift();
		const retained = Object.freeze(issue);
		issues.push(retained);
		for (const listener of issueListeners) {
			try {
				listener(retained);
			} catch {
				// Diagnostics must not stop frame recovery.
			}
		}
	};

	const emitTo = <T>(
		listeners: Set<Listener<T>>,
		value: T,
		direction: TransportIssue["direction"],
	): void => {
		for (const listener of listeners) {
			try {
				listener(value);
			} catch (cause) {
				emitIssue({
					kind: "listener-error",
					direction,
					detail: "A transport listener threw",
					cause,
				});
			}
		}
	};

	const emitStderr = (buffer: Buffer, text: string): void => {
		stderrTotalBytes += buffer.byteLength;
		const remaining = Math.max(0, CODEX_TRANSPORT_MAX_STDERR_BYTES - stderrRetainedBytes);
		if (remaining > 0) {
			const kept = buffer.subarray(0, remaining);
			stderrRetained += kept.toString("utf8");
			stderrRetainedBytes += kept.byteLength;
		}
		if (stderrRetainedBytes < stderrTotalBytes) stderrTruncated = true;
		emitTo(
			stderrListeners,
			Object.freeze({
				text,
				bytes: buffer.byteLength,
				retainedBytes: stderrRetainedBytes,
				truncated: stderrTruncated,
			}),
			"stderr",
		);
	};

	return Object.freeze({
		emitIssue,
		emitServerRequest: (request: TransportServerRequest) =>
			emitTo(requestListeners, request, "server-request"),
		emitServerNotification: (event: TransportServerNotification) =>
			emitTo(notificationListeners, event, "notification"),
		emitStderr,
		emitExit: (event: TransportExit) => emitTo(exitListeners, event, "stdout"),
		onServerRequest: (listener: Listener<TransportServerRequest>) =>
			subscribe(requestListeners, listener),
		onServerNotification: (listener: Listener<TransportServerNotification>) =>
			subscribe(notificationListeners, listener),
		onIssue: (listener: Listener<TransportIssue>) => subscribe(issueListeners, listener),
		onStderr: (listener: Listener<TransportStderrChunk>) => subscribe(stderrListeners, listener),
		onExit: (listener: Listener<TransportExit>) => subscribe(exitListeners, listener),
		inspectIssues: () => Object.freeze([...issues]),
		inspectStderr: (): TransportStderrSnapshot =>
			Object.freeze({
				text: stderrRetained,
				retainedBytes: stderrRetainedBytes,
				totalBytes: stderrTotalBytes,
				truncated: stderrTruncated,
			}),
	});
}
