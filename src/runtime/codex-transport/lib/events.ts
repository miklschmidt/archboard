import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import { CodexTransportUsageError } from "@/runtime/codex-transport/lib/errors";
import type {
	TransportExit,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
	TransportStderrChunk,
	TransportStderrSnapshot,
	Unsubscribe,
} from "@/runtime/codex-transport/lib/types";

type Listener<T> = (value: T) => void;

/**
 * Shortens text to a bound, marking the cut with an ellipsis.
 * @param value The text.
 * @param maximum The longest text allowed.
 * @returns The text, cut when it exceeds the bound.
 */
function truncate(value: string, maximum: number): string {
	return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 3))}...`;
}

/**
 * Bounds a request id label; numeric ids are already bounded.
 * @param value The id.
 * @param maximum The longest string id retained.
 * @returns The id, truncated when it is an over-long string.
 */
function safeLabel(value: string | number, maximum: number): string | number {
	return typeof value === "string" ? truncate(value, maximum) : value;
}

/**
 * Keeps the head and tail of a stderr chunk within the retained-bytes bound so listeners see
 * both how a diagnostic started and how it ended.
 * @param buffer The chunk.
 * @returns A copy of the chunk, or its outer halves when it exceeds the bound.
 */
function diagnosticBytes(buffer: Buffer): Buffer {
	const maximum = CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes;
	if (buffer.byteLength <= maximum) return Buffer.from(buffer);
	const half = maximum / 2;
	return Buffer.concat([buffer.subarray(0, half), buffer.subarray(buffer.byteLength - half)]);
}

/**
 * Decodes retained stderr bytes leniently; a cut may split a multi-byte character.
 * @param buffer The bytes.
 * @returns The text.
 */
function decodeDiagnostic(buffer: Buffer): string {
	return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Bounds an issue to the shared issue-record size before it is retained or published.
 * @param issue The issue as raised.
 * @returns A frozen issue within the bound, or a redaction notice when even the bounded
 * labels would exceed it.
 */
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

/**
 * Adds a listener within the per-event listener bound.
 * @param listeners The event's listener set.
 * @param listener The listener to add.
 * @returns A function that removes the listener.
 */
function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Unsubscribe {
	if (listeners.size >= CODEX_APP_SERVER_CAPACITY.listenersPerEvent)
		throw new CodexTransportUsageError("each transport event supports one listener");
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * The first half of the retained stderr window when retention first overflows: the retained
 * bytes, topped up from the incoming chunk when they do not fill the half on their own.
 * @param retained The bytes retained so far.
 * @param incoming The chunk that overflowed the window.
 * @param half Half the retained-bytes bound.
 * @returns The head bytes.
 */
function overflowHead(retained: Buffer, incoming: Buffer, half: number): Buffer {
	return retained.byteLength >= half
		? Buffer.from(retained.subarray(0, half))
		: Buffer.concat([
				retained,
				incoming.subarray(0, Math.min(incoming.byteLength, half - retained.byteLength)),
			]);
}

/**
 * The last half of the retained stderr window when retention first overflows: the newest
 * bytes, drawn from the incoming chunk and, when it is short, the end of what was retained.
 * @param retained The bytes retained so far.
 * @param incoming The chunk that overflowed the window.
 * @param half Half the retained-bytes bound.
 * @returns The tail bytes.
 */
function overflowTail(retained: Buffer, incoming: Buffer, half: number): Buffer {
	return incoming.byteLength >= half
		? Buffer.from(incoming.subarray(incoming.byteLength - half))
		: Buffer.concat([
				retained.subarray(Math.max(0, retained.byteLength - (half - incoming.byteLength))),
				incoming,
			]);
}

/**
 * The tail half after retention has already overflowed: the prior tail slid forward to end
 * with the incoming chunk.
 * @param priorTail The current tail half.
 * @param incoming The new chunk.
 * @param half Half the retained-bytes bound.
 * @returns The new tail bytes.
 */
function slidTail(priorTail: Buffer, incoming: Buffer, half: number): Buffer {
	return incoming.byteLength >= half
		? Buffer.from(incoming.subarray(incoming.byteLength - half))
		: Buffer.concat([
				priorTail.subarray(Math.max(0, priorTail.byteLength + incoming.byteLength - half)),
				incoming,
			]);
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

/**
 * Creates the transport's event hub: bounded listener sets, the retained issue log, and the
 * head-and-tail stderr window.
 * @returns The emitters, subscriptions and inspectors.
 */
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
	let terminalExit: TransportExit | null = null;

	/**
	 * Appends an issue to the bounded log without publishing it, for faults raised while
	 * publishing another issue.
	 * @param issue The issue to retain.
	 */
	const recordIssue = (issue: TransportIssue): void => {
		if (issues.length >= CODEX_APP_SERVER_CAPACITY.retention.issues) issues.shift();
		issues.push(publicIssue(issue));
	};

	/**
	 * Retains an issue and publishes it; a throwing listener is itself recorded as an issue.
	 * @param issue The issue to raise.
	 */
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
					...(issue.direction === undefined ? {} : { direction: issue.direction }),
					detail: "A transport issue listener threw",
				});
			}
		}
	};

	/**
	 * Delivers a value to every listener, isolating each one's failure as an issue.
	 * @param listeners The listeners to call.
	 * @param value The value to deliver.
	 * @param direction The direction to attribute a listener failure to.
	 * @returns True when at least one listener returned normally.
	 */
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
					...(direction === undefined ? {} : { direction }),
					detail: "A transport listener threw",
				});
			}
		}
		return delivered;
	};

	/**
	 * Adds a stderr chunk to the retained window: whole while it fits, then the oldest head
	 * and the newest tail.
	 * @param buffer The chunk.
	 */
	const appendStderr = (buffer: Buffer): void => {
		const maximum = CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes;
		const half = maximum / 2;
		stderrTotalBytes += buffer.byteLength;
		if (!stderrTruncated && stderrRetained.byteLength + buffer.byteLength <= maximum) {
			stderrRetained = Buffer.concat([stderrRetained, buffer]);
		} else if (!stderrTruncated) {
			stderrRetained = Buffer.concat([
				overflowHead(stderrRetained, buffer, half),
				overflowTail(stderrRetained, buffer, half),
			]);
			stderrTruncated = true;
		} else {
			stderrRetained = Buffer.concat([
				stderrRetained.subarray(0, half),
				slidTail(stderrRetained.subarray(half), buffer, half),
			]);
		}
		stderrRetainedBytes = Math.min(stderrTotalBytes, maximum);
	};

	/**
	 * Retains a stderr chunk and publishes its bounded text.
	 * @param buffer The chunk bytes.
	 * @param _text The chunk text, unused because listeners get the bounded decoding.
	 */
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

	/**
	 * Publishes a reverse request.
	 * @param request The request.
	 * @returns True when a listener took it.
	 */
	const emitServerRequest = (request: TransportServerRequest): boolean =>
		emitTo(requestListeners, request, "server-request");

	/**
	 * Publishes a server notification.
	 * @param event The notification with its correlation.
	 */
	const emitServerNotification = (event: TransportServerNotification): void => {
		emitTo(notificationListeners, event, "notification");
	};

	/**
	 * Publishes the child's exit once; later exits are ignored and later subscribers replay it.
	 * @param event The exit.
	 */
	const emitExit = (event: TransportExit): void => {
		if (terminalExit !== null) return;
		terminalExit = event;
		emitTo(exitListeners, terminalExit, "stdout");
		exitListeners.clear();
	};

	/**
	 * Subscribes to reverse requests.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	const onServerRequest = (listener: Listener<TransportServerRequest>): Unsubscribe =>
		subscribe(requestListeners, listener);

	/**
	 * Subscribes to server notifications.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	const onServerNotification = (listener: Listener<TransportServerNotification>): Unsubscribe =>
		subscribe(notificationListeners, listener);

	/**
	 * Subscribes to issues.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	const onIssue = (listener: Listener<TransportIssue>): Unsubscribe =>
		subscribe(issueListeners, listener);

	/**
	 * Subscribes to stderr chunks.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	const onStderr = (listener: Listener<TransportStderrChunk>): Unsubscribe =>
		subscribe(stderrListeners, listener);

	/**
	 * Subscribes to the child's exit, replaying it immediately when it already happened.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	const onExit = (listener: Listener<TransportExit>): Unsubscribe => {
		if (terminalExit === null) return subscribe(exitListeners, listener);
		emitTo(new Set([listener]), terminalExit, "stdout");
		return () => undefined;
	};

	/**
	 * Copies the retained issue log.
	 * @returns The issues, oldest first.
	 */
	const inspectIssues = (): readonly TransportIssue[] => Object.freeze([...issues]);

	/**
	 * Describes the retained stderr window.
	 * @returns The retained text with its byte accounting.
	 */
	const inspectStderr = (): TransportStderrSnapshot =>
		Object.freeze({
			text: decodeDiagnostic(stderrRetained),
			retainedBytes: stderrRetainedBytes,
			totalBytes: stderrTotalBytes,
			truncated: stderrTruncated,
		});

	return Object.freeze({
		emitIssue,
		emitServerRequest,
		emitServerNotification,
		emitStderr,
		emitExit,
		onServerRequest,
		onServerNotification,
		onIssue,
		onStderr,
		onExit,
		inspectIssues,
		inspectStderr,
	});
}
