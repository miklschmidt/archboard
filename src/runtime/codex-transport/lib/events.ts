import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import { CodexTransportUsageError } from "./errors.js";
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

function truncate(value: string, maximum: number): string {
	return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 3))}...`;
}

function safeLabel(value: string | number, maximum: number): string | number {
	return typeof value === "string" ? truncate(value, maximum) : value;
}

function diagnosticBytes(buffer: Buffer): Buffer {
	const maximum = CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes;
	if (buffer.byteLength <= maximum) return Buffer.from(buffer);
	const half = maximum / 2;
	return Buffer.concat([buffer.subarray(0, half), buffer.subarray(buffer.byteLength - half)]);
}

function decodeDiagnostic(buffer: Buffer): string {
	return new TextDecoder("utf-8").decode(buffer);
}

function publicIssue(issue: TransportIssue): TransportIssue {
	const labelLimit = Math.floor(CODEX_APP_SERVER_CAPACITY.retention.issueRecordBytes / 8);
	const detailLimit = Math.floor(CODEX_APP_SERVER_CAPACITY.retention.issueRecordBytes / 4);
	const candidate: TransportIssue = Object.freeze({
		kind: issue.kind,
		detail: truncate(issue.detail, detailLimit),
		...(issue.direction === undefined ? {} : { direction: issue.direction }),
		...(issue.method === undefined ? {} : { method: truncate(issue.method, labelLimit) }),
		...(issue.requestId === undefined ? {} : { requestId: safeLabel(issue.requestId, labelLimit) }),
	});
	if (
		Buffer.byteLength(JSON.stringify(candidate), "utf8") <=
		CODEX_APP_SERVER_CAPACITY.retention.issueRecordBytes
	)
		return candidate;
	return Object.freeze({
		kind: issue.kind,
		detail: "Transport diagnostic was redacted at the shared issue-record bound",
	});
}

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Unsubscribe {
	if (listeners.size >= CODEX_APP_SERVER_CAPACITY.listenersPerEvent)
		throw new CodexTransportUsageError("each transport event supports one listener");
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export interface TransportEvents {
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly emitServerRequest: (request: TransportServerRequest) => boolean;
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
	let stderrRetained = Buffer.alloc(0);
	let stderrRetainedBytes = 0;
	let stderrTotalBytes = 0;
	let stderrTruncated = false;
	const issues: TransportIssue[] = [];
	const requestListeners = new Set<Listener<TransportServerRequest>>();
	const notificationListeners = new Set<Listener<TransportServerNotification>>();
	const issueListeners = new Set<Listener<TransportIssue>>();
	const stderrListeners = new Set<Listener<TransportStderrChunk>>();
	const exitListeners = new Set<Listener<TransportExit>>();

	const recordIssue = (issue: TransportIssue): void => {
		if (issues.length >= CODEX_APP_SERVER_CAPACITY.retention.issues) issues.shift();
		issues.push(publicIssue(issue));
	};

	const emitIssue = (issue: TransportIssue): void => {
		const retained = publicIssue(issue);
		if (issues.length >= CODEX_APP_SERVER_CAPACITY.retention.issues) issues.shift();
		issues.push(retained);
		for (const listener of Array.from(issueListeners)) {
			try {
				listener(retained);
			} catch {
				recordIssue({
					kind: "listener-error",
					direction: issue.direction,
					detail: "A transport issue listener threw",
				});
			}
		}
	};

	const emitTo = <T>(
		listeners: Set<Listener<T>>,
		value: T,
		direction: TransportIssue["direction"],
	): boolean => {
		let delivered = false;
		for (const listener of Array.from(listeners)) {
			try {
				listener(value);
				delivered = true;
			} catch {
				emitIssue({
					kind: "listener-error",
					direction,
					detail: "A transport listener threw",
				});
			}
		}
		return delivered;
	};

	const appendStderr = (buffer: Buffer): void => {
		const maximum = CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes;
		const half = maximum / 2;
		stderrTotalBytes += buffer.byteLength;
		if (!stderrTruncated && stderrRetained.byteLength + buffer.byteLength <= maximum) {
			stderrRetained = Buffer.concat([stderrRetained, buffer]);
		} else if (!stderrTruncated) {
			const head =
				stderrRetained.byteLength >= half
					? Buffer.from(stderrRetained.subarray(0, half))
					: Buffer.concat([
							stderrRetained,
							buffer.subarray(0, Math.min(buffer.byteLength, half - stderrRetained.byteLength)),
						]);
			const tail =
				buffer.byteLength >= half
					? Buffer.from(buffer.subarray(buffer.byteLength - half))
					: Buffer.concat([
							stderrRetained.subarray(
								Math.max(0, stderrRetained.byteLength - (half - buffer.byteLength)),
							),
							buffer,
						]);
			stderrRetained = Buffer.concat([head, tail]);
			stderrTruncated = true;
		} else {
			const priorTail = stderrRetained.subarray(half);
			const tail =
				buffer.byteLength >= half
					? Buffer.from(buffer.subarray(buffer.byteLength - half))
					: Buffer.concat([
							priorTail.subarray(Math.max(0, priorTail.byteLength + buffer.byteLength - half)),
							buffer,
						]);
			stderrRetained = Buffer.concat([stderrRetained.subarray(0, half), tail]);
		}
		stderrRetainedBytes = Math.min(stderrTotalBytes, maximum);
	};

	const emitStderr = (buffer: Buffer, _text: string): void => {
		appendStderr(buffer);
		emitTo(
			stderrListeners,
			Object.freeze({
				text: decodeDiagnostic(diagnosticBytes(buffer)),
				bytes: buffer.byteLength,
				retainedBytes: stderrRetainedBytes,
				truncated:
					stderrTruncated || buffer.byteLength > CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes,
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
				text: decodeDiagnostic(stderrRetained),
				retainedBytes: stderrRetainedBytes,
				totalBytes: stderrTotalBytes,
				truncated: stderrTruncated,
			}),
	});
}
