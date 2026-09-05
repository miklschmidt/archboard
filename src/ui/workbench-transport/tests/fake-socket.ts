// A pane socket double and the wire fixtures the transport owners speak
// through it. Fixtures are plain wire records: they cross the fake socket as
// JSON and the transport parses them like anything the gateway sends.

import {
	BrowserWorkbenchTransportError,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

import { snapshotMessage, type WireRecord } from "@/ui/workbench-transport/tests/fixtures";

/** A request as the fake socket recorded it. */
type FakeSocketRequest = Record<string, unknown>;

/** How a test answers one request. */
type Answerer = (request: FakeSocketRequest, socket: FakeSocket) => void;

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for a non-array object.
 */
function isRecord(value: unknown): value is WireRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A wire value that must be a record.
 * @param value The value.
 * @returns The record.
 */
function record(value: unknown): WireRecord {
	if (!isRecord(value)) {
		throw new Error("The wire value is not a record.");
	}
	return value;
}

/**
 * A fixed clock.
 * @param nowMs The time it reports.
 * @returns The clock.
 */
function clockAt(nowMs: number): () => number {
	return () => nowMs;
}

/** A pane socket that records what was sent and replays what a test answers. */
class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: FakeSocketRequest[] = [];
	closeCalls = 0;
	readyState = 1;
	onRequest: Answerer | null = null;

	/**
	 * Record a request and hand it to the test's answerer.
	 * @param raw The request JSON.
	 */
	send(raw: string): void {
		const request = record(JSON.parse(raw));
		this.sent.push(request);
		this.onRequest?.(request, this);
	}

	/**
	 * The requests sent for one action.
	 * @param action The gateway action.
	 * @returns The requests, in order.
	 */
	actions(action: string): FakeSocketRequest[] {
		return this.sent.filter((request) => request["action"] === action);
	}

	/**
	 * Answer a request successfully.
	 * @param request The request.
	 * @param value The answer's value.
	 */
	reply(request: FakeSocketRequest, value: unknown): void {
		this.deliver({
			type: "codex_workbench_result",
			requestId: request["requestId"],
			action: request["action"],
			ok: true,
			value,
		});
	}

	/**
	 * Answer a request with a gateway refusal.
	 * @param request The request.
	 * @param error The refusal's words.
	 */
	replyFailure(request: FakeSocketRequest, error = "request rejected"): void {
		this.deliver({
			type: "codex_workbench_result",
			requestId: request["requestId"],
			action: request["action"],
			ok: false,
			error,
		});
	}

	/**
	 * Push a gateway event.
	 * @param message The snapshot or delta message.
	 */
	event(message: unknown): void {
		this.deliver({ type: "codex_workbench_event", message });
	}

	/** Open the socket. */
	open(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	/** Close the socket. */
	close(): void {
		this.closeCalls += 1;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}

	/**
	 * Deliver one message as the gateway would.
	 * @param payload The message.
	 */
	private deliver(payload: unknown): void {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
	}
}

/**
 * An answerer that replies to subscribe and snapshot requests with one snapshot.
 * @param value The snapshot.
 * @param sequence Its sequence.
 * @returns The answerer.
 */
function answerSnapshots(value: WireRecord, sequence = 1): Answerer {
	return (request, socket) => {
		if (request["action"] === "subscribe" || request["action"] === "snapshot") {
			socket.reply(request, snapshotMessage(sequence, value));
		}
	};
}

/**
 * An answerer that replies to one action with a gateway refusal.
 * @param action The action to refuse.
 * @param error The refusal's words.
 * @returns The answerer.
 */
function refuseAction(action: string, error: string): Answerer {
	return (request, socket) => {
		if (request["action"] === action) {
			socket.replyFailure(request, error);
		}
	};
}

/**
 * An answerer that replies to one action with one value.
 * @param action The action to answer.
 * @param value The answer.
 * @returns The answerer.
 */
function answerAction(action: string, value: unknown): Answerer {
	return (request, socket) => {
		if (request["action"] === action) {
			socket.reply(request, value);
		}
	};
}

/**
 * Attach a transport whose subscribe and snapshot requests answer with one snapshot.
 * @param transport The transport.
 * @param socket The socket.
 * @param value The snapshot.
 * @param sequence Its sequence.
 */
async function attachWithSnapshot(
	transport: BrowserWorkbenchTransport,
	socket: FakeSocket,
	value: WireRecord,
	sequence = 1,
): Promise<void> {
	socket.onRequest = answerSnapshots(value, sequence);
	await transport.attach(socket);
}

/**
 * The error a promise rejects with.
 * @param promise The promise.
 * @returns The rejection.
 */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("The promise unexpectedly resolved.");
}

/**
 * The refusal code of a transport error, or null for anything else.
 * @param error The rejection.
 * @returns The code, or null.
 */
function errorCode(error: unknown): string | null {
	return error instanceof BrowserWorkbenchTransportError ? error.code : null;
}

/**
 * A request that must have been sent.
 * @param request The recorded request, or null.
 * @returns The request.
 */
function requiredRequest(request: FakeSocketRequest | null): FakeSocketRequest {
	if (request === null) {
		throw new Error("the request was not sent");
	}
	return request;
}

/**
 * Run steps one after another, each awaiting the previous.
 * @param items The inputs.
 * @param step The step for one input.
 * @returns Settles when every step has run.
 */
function sequentially<Item>(
	items: readonly Item[],
	step: (item: Item) => Promise<void>,
): Promise<void> {
	return items.reduce(
		(tail: Promise<void>, item) => tail.then(() => step(item)),
		Promise.resolve(),
	);
}

/** Transports created by a test, disposed after it. */
interface TransportTracker {
	readonly track: (transport: BrowserWorkbenchTransport) => BrowserWorkbenchTransport;
	readonly disposeAll: () => Promise<void>;
}

/**
 * A tracker for the transports a test creates.
 * @returns The tracker.
 */
function createTransportTracker(): TransportTracker {
	const transports: BrowserWorkbenchTransport[] = [];
	/**
	 * Remember a transport.
	 * @param transport The transport.
	 * @returns The same transport.
	 */
	function track(transport: BrowserWorkbenchTransport): BrowserWorkbenchTransport {
		transports.push(transport);
		return transport;
	}
	/** Dispose every remembered transport. */
	async function disposeAll(): Promise<void> {
		await Promise.all(transports.splice(0).map((transport) => transport.dispose()));
	}
	return { track, disposeAll };
}

export {
	FakeSocket,
	answerAction,
	answerSnapshots,
	attachWithSnapshot,
	clockAt,
	createTransportTracker,
	errorCode,
	isRecord,
	record,
	refuseAction,
	rejection,
	requiredRequest,
	sequentially,
	type Answerer,
	type FakeSocketRequest,
};
export {
	accountResult,
	approval,
	commandResult,
	deltaMessage,
	fixtureIds,
	wire,
	lease,
	queue,
	readiness,
	snapshot,
	snapshotMessage,
	startDraft,
	type SnapshotFixture,
	type WireRecord,
} from "@/ui/workbench-transport/tests/fixtures";
