import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchTransport } from "@/ui/workbench-transport";
import {
	FakeSocket,
	accountResult,
	answerAction,
	approval,
	attachWithSnapshot,
	commandResult,
	createTransportTracker,
	deltaMessage,
	lease,
	queue,
	refuseAction,
	rejection,
	requiredRequest,
	snapshot,
	wire,
	snapshotMessage,
	startDraft,
	type FakeSocketRequest,
	type WireRecord,
} from "@/ui/workbench-transport/tests/fake-socket";

const tracker = createTransportTracker();

afterEach(tracker.disposeAll);

/**
 * A request-id source that counts.
 * @returns The source.
 */
function countingRequestIds(): () => string {
	let count = 0;
	return () => {
		count += 1;
		return `request-${count}`;
	};
}

test("attach reports the transient reconnecting state before the subscribe baseline arrives", async () => {
	const transport = tracker.track(
		createBrowserWorkbenchTransport({ requestId: countingRequestIds() }),
	);
	const socket = new FakeSocket();
	socket.readyState = 0;
	socket.onRequest = answerAction("subscribe", snapshotMessage(7, snapshot()));

	const attached = transport.attach(socket);
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: null,
		sequence: null,
	});
	expect(socket.sent).toEqual([]);

	socket.open();
	await attached;
	expect(socket.sent).toEqual([
		{ type: "codex_workbench_request", requestId: "request-1", action: "subscribe" },
	]);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		sequence: 7,
	});
});

test("a server snapshot carrying pending approvals is a usable baseline, not an incompatible one", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ approvals: [approval()] }));

	expect(transport.state()).toMatchObject({ kind: "readiness", state: "thread_capable" });
	const approvals = transport.snapshot()?.approvals ?? [];
	expect(approvals).toHaveLength(1);
	expect(approvals[0]).toMatchObject({
		requestId: wire.requestA,
		lifecycle: { state: "pending" },
		binding: { child: "child-a", epoch: "epoch-a" },
	});

	socket.event(deltaMessage(2, { approvals: [approval({ requestId: wire.requestB })] }));
	expect(transport.state()).toMatchObject({ kind: "readiness", sequence: 2 });
	expect(transport.snapshot()?.approvals.map((entry) => String(entry.requestId))).toEqual([
		wire.requestB,
	]);
});

/** A socket whose recovery snapshot sequence the test moves. */
interface RecoveringSocket {
	readonly socket: FakeSocket;
	readonly setRecoverySequence: (sequence: number) => void;
}

/**
 * A socket answering subscribe with one snapshot and every recovery with a fresh one.
 * @param initial The subscribe snapshot.
 * @param recovery The recovery snapshot.
 * @returns The socket and its recovery sequence control.
 */
function recoveringSocket(initial: WireRecord, recovery: WireRecord): RecoveringSocket {
	const socket = new FakeSocket();
	let recoverySequence = 4;
	/**
	 * Answer one request.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, snapshotMessage(1, initial));
		}
		if (request["action"] === "snapshot") {
			activeSocket.reply(request, snapshotMessage(recoverySequence, recovery));
		}
	}
	/**
	 * Move the recovery sequence.
	 * @param sequence The next recovery sequence.
	 */
	function setRecoverySequence(sequence: number): void {
		recoverySequence = sequence;
	}
	socket.onRequest = answer;
	return { socket, setRecoverySequence };
}

test("strict stream reduction rejects gaps, ignores duplicates, and recovers from a snapshot", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const { socket, setRecoverySequence } = recoveringSocket(snapshot(), snapshot());
	await transport.attach(socket);

	socket.event(deltaMessage(3, { queue: queue("queued") }));
	await Bun.sleep(0);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		sequence: 4,
	});
	expect(socket.actions("snapshot")).toHaveLength(1);

	socket.event(deltaMessage(5, { queue: queue("queued") }));
	socket.event(deltaMessage(5, { queue: queue("queued") }));
	expect(transport.sequence()).toBe(5);
	expect(transport.state()).toMatchObject({ kind: "readiness", state: "thread_capable" });

	setRecoverySequence(6);
	socket.event(deltaMessage(2, { queue: queue("empty") }));
	await Bun.sleep(0);
	expect(transport.state()).toMatchObject({
		kind: "readiness",
		state: "thread_capable",
		sequence: 6,
	});
	expect(socket.actions("snapshot")).toHaveLength(2);
});

test("a redelivered older delta is stale and asks for one recovery snapshot", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const first = snapshot();
	const navigated = snapshot({ threadId: wire.threadB });
	const { socket, setRecoverySequence } = recoveringSocket(first, navigated);
	setRecoverySequence(3);
	await transport.attach(socket);

	socket.event(deltaMessage(2, { threadLink: navigated.threadLink, timeline: navigated.timeline }));
	expect(transport.sequence()).toBe(2);

	// The same threadLink delta arriving again after the timeline moved on would
	// merge into a contradiction, but it is an old message, not a broken contract.
	socket.event(deltaMessage(1, { threadLink: first.threadLink }));
	expect(transport.state()).toMatchObject({
		kind: "stream",
		state: "stale_snapshot",
		connection: "connected",
		expectedSequence: 3,
		receivedSequence: 1,
	});
	expect(socket.actions("snapshot")).toHaveLength(1);

	await Bun.sleep(0);
	expect(transport.state()).toMatchObject({ kind: "readiness", sequence: 3 });
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe(wire.threadB);
	expect(socket.actions("snapshot")).toHaveLength(1);
});

/** A socket that holds the command request instead of answering it. */
interface HoldingSocket {
	readonly socket: FakeSocket;
	readonly held: () => FakeSocketRequest | null;
}

/**
 * Hold every command request on a socket.
 * @param socket The socket.
 * @returns The socket and the held request.
 */
function holdCommands(socket: FakeSocket): HoldingSocket {
	let commandRequest: FakeSocketRequest | null = null;
	/**
	 * Hold the command request without answering.
	 * @param request The request.
	 */
	function hold(request: FakeSocketRequest): void {
		if (request["action"] === "command") {
			commandRequest = request;
		}
	}
	/**
	 * The held command.
	 * @returns The request, or null.
	 */
	function held(): FakeSocketRequest | null {
		return commandRequest;
	}
	socket.onRequest = hold;
	return { socket, held };
}

test("lost command responses become outcome-unknown and are never replayed after replacement", async () => {
	const activeLease = lease(Date.now() + 10_000);
	const first = new FakeSocket();
	const transport = tracker.track(createBrowserWorkbenchTransport());
	await attachWithSnapshot(transport, first, snapshot({ lease: activeLease }));
	const { held } = holdCommands(first);
	const pending = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(held());
	first.close();
	expect(await rejection(pending)).toMatchObject({
		name: "BrowserWorkbenchTransportError",
		code: "response_lost",
		outcome: "outcome_unknown",
	});

	const second = new FakeSocket();
	await attachWithSnapshot(transport, second, snapshot(), 9);
	first.reply(sentRequest, commandResult(snapshot({ lease: activeLease })));
	expect(second.sent.map((request) => request["action"])).toEqual(["subscribe"]);
});

/**
 * Answer subscribe, account read and the reconciliation snapshot for an
 * account-ready workbench.
 * @param request The request.
 * @param activeSocket The socket.
 */
function answerAccountReady(request: FakeSocketRequest, activeSocket: FakeSocket): void {
	const accountReady = snapshot({ state: "account_ready" });
	if (request["action"] === "subscribe") {
		activeSocket.reply(request, snapshotMessage(1, accountReady));
	} else if (request["action"] === "accountRead") {
		activeSocket.reply(request, accountResult(accountReady));
	} else if (request["action"] === "snapshot") {
		activeSocket.reply(request, snapshotMessage(2, accountReady));
	}
}

test("account results reconcile through a versioned snapshot and socket close exposes backoff", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	socket.onRequest = answerAccountReady;
	await transport.attach(socket);
	const result = await transport.accountRead();
	expect(result.kind).toBe("account_read");
	expect(transport.sequence()).toBe(2);
	socket.event(deltaMessage(3, { queue: queue("queued") }));
	expect(transport.sequence()).toBe(3);
	expect(transport.snapshot()?.queue.status).toBe("queued");
	socket.close();
	expect(transport.state()).toMatchObject({ kind: "connection", state: "backoff" });
	await transport.attach(socket);
});

test("explicit close uses the gateway close action and leaves the transport stopped", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.onRequest = answerAction("close", null);
	await transport.close();
	expect(socket.sent.at(-1)).toMatchObject({ type: "codex_workbench_request", action: "close" });
	expect(transport.state()).toMatchObject({ kind: "connection", state: "stopped" });
});

/**
 * Attach a fresh transport and push a contradictory thread link delta.
 * @param threadLink The contradicting link.
 */
async function expectContradictionIncompatible(threadLink: WireRecord): Promise<void> {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.event(deltaMessage(2, { threadLink }));
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
		reason: expect.stringContaining("contradicts its snapshot"),
	});
}

test("malformed and relationally contradictory messages become incompatible", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.event({ kind: "snapshot", sequence: 2, snapshot: { ...snapshot(), version: 2 } });
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	expect(await rejection(transport.refresh())).toMatchObject({ code: "socket_unavailable" });

	await Promise.all(
		[
			snapshot({ linkState: "unbound" }).threadLink,
			snapshot({ threadId: wire.threadB }).threadLink,
		].map(expectContradictionIncompatible),
	);
});

test("gateway failure responses are surfaced without treating them as transport loss", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ state: "account_ready" }));
	socket.onRequest = refuseAction("accountRead", "account unavailable");
	expect(await rejection(transport.accountRead())).toMatchObject({
		code: "gateway_error",
		outcome: "not_delivered",
	});
	expect(transport.state()).toMatchObject({ kind: "readiness", state: "account_ready" });
});

test("a thread-candidate delta reduces into the snapshot and a malformed one does not", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	expect(transport.snapshot()?.threadCandidates.state).toBe("unknown");

	const candidate = {
		kind: "thread_candidate",
		selectionId: "selection-a",
		threadId: wire.threadA,
		state: "executable",
		reason: null,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
	};
	const listed = {
		kind: "thread_candidates",
		state: "listed",
		records: [candidate],
		truncated: false,
		reason: null,
	};
	socket.event(deltaMessage(2, { threadCandidates: listed }));
	expect(transport.snapshot()?.threadCandidates).toMatchObject({
		state: "listed",
		truncated: false,
	});
	expect(transport.sequence()).toBe(2);

	// A candidate the shared contract rejects is a malformed delta, never a row
	// the browser guesses at.
	socket.event(
		deltaMessage(3, {
			threadCandidates: { ...listed, records: [{ ...candidate, state: "attached" }] },
		}),
	);
	expect(transport.state()).toMatchObject({ kind: "connection", state: "incompatible_contract" });
});
