import { afterEach, expect, test } from "bun:test";

import {
	createBrowserWorkbenchTransport,
	type BrowserCommandDraft,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchState,
} from "@/ui/workbench-transport";
import {
	FakeSocket,
	answerAction,
	approval,
	attachWithSnapshot,
	clockAt,
	commandResult,
	createTransportTracker,
	deltaMessage,
	fixtureIds,
	lease,
	queue,
	rejection,
	requiredRequest,
	snapshot,
	wire,
	snapshotMessage,
	startDraft,
	type FakeSocketRequest,
	type SnapshotFixture,
	type WireRecord,
} from "@/ui/workbench-transport/tests/fake-socket";

const CLOCK = 1_000_000;
const tracker = createTransportTracker();

afterEach(tracker.disposeAll);

/**
 * A decline against the default approval.
 * @param requestId The request it answers.
 * @returns The draft.
 */
function approvalDraft(requestId = fixtureIds.requestA): BrowserCommandDraft {
	return {
		command: "approvalRespond",
		requestId,
		approvalId: fixtureIds.approvalA,
		response: { approvalKind: "command_execution", decision: "decline" },
	};
}

/**
 * The same pane after it navigated onto a thread owned by a newer child epoch.
 * @param approvals The approvals still listed.
 * @returns The snapshot.
 */
function navigatedSnapshot(approvals: readonly unknown[]): SnapshotFixture {
	const value = snapshot({
		threadId: wire.threadB,
		lease: { ...lease(CLOCK + 60_000), childId: "child-b", epoch: "epoch-b" },
		approvals,
	});
	value.threadLink = { ...value.threadLink, childId: "child-b", epoch: "epoch-b" };
	return value;
}

/** A socket that answers subscribe and snapshot with one value and records commands. */
interface CommandSocket {
	readonly socket: FakeSocket;
	readonly lastCommand: () => FakeSocketRequest | null;
}

/**
 * A socket answering every subscribe and snapshot with one snapshot and
 * every command with a delivered result, recording the last command.
 * @param value The snapshot.
 * @param result The command result, or null to hold commands unanswered.
 * @returns The socket and the last command sent.
 */
function commandSocket(value: WireRecord, result: WireRecord | null): CommandSocket {
	const socket = new FakeSocket();
	let last: FakeSocketRequest | null = null;
	/**
	 * Answer one request.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe" || request["action"] === "snapshot") {
			activeSocket.reply(request, snapshotMessage(1, value));
		} else if (request["action"] === "command") {
			last = request;
			if (result !== null) {
				activeSocket.reply(request, result);
			}
		}
	}
	/**
	 * The last command sent.
	 * @returns The request, or null.
	 */
	function lastCommand(): FakeSocketRequest | null {
		return last;
	}
	socket.onRequest = answer;
	return { socket, lastCommand };
}

/** A realtime start's result and the state it left. */
interface RealtimeOutcome {
	readonly result: BrowserWorkbenchCommandResult;
	readonly state: BrowserWorkbenchState;
}

/**
 * Start realtime and read the answer the gateway sends back.
 * @param sdp The SDP the gateway answers with.
 * @returns The result and the transport state.
 */
async function realtimeResult(sdp: unknown): Promise<RealtimeOutcome> {
	const initial = snapshot({ lease: lease(CLOCK + 60_000) });
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const { socket } = commandSocket(initial, {
		...commandResult(initial),
		realtimeAnswer: { sessionId: "command-a", correlationId: "command-a", sdp },
		realtimeSessionHandle: "command-a",
	});
	await transport.attach(socket);
	const result = await transport.command({
		command: "realtimeStart",
		threadId: fixtureIds.threadA,
		sdp: "offer",
	});
	return { result, state: transport.state() };
}

test("preserves a realtime SDP answer's terminal CRLF through the browser transport", async () => {
	const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
	const { result, state } = await realtimeResult(sdp);
	expect(result.outcome).toBe("delivered");
	expect(result.realtimeAnswer?.sdp).toBe(sdp);
	expect(state.state).toBe("thread_capable");
});

test.each([
	{ name: "empty", value: "" },
	{ name: "whitespace-only", value: "\r\n " },
	{ name: "NUL-containing", value: "v=0\0\r\n" },
	{ name: "oversized", value: "x".repeat(16_385) },
	{ name: "non-string", value: null },
])("rejects a $name realtime SDP answer", async ({ value }) => {
	const error = await rejection(realtimeResult(value));
	expect(error).toMatchObject({ code: "incompatible_contract" });
});

test("commands carry the target captured at dispatch, not the one navigation moved to", async () => {
	const activeLease = lease(Date.now() + 10_000);
	const initial = snapshot({ lease: activeLease });
	const navigated = snapshot({ lease: activeLease, threadId: wire.threadB });
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const { socket, lastCommand } = commandSocket(initial, null);
	await transport.attach(socket);

	const resultPromise = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(lastCommand());
	expect(sentRequest["command"]).toMatchObject({
		kind: "browser_command",
		command: "start",
		commandId: "command-a",
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		threadId: wire.threadA,
	});

	socket.onRequest = answerAction("snapshot", snapshotMessage(3, navigated));
	socket.event(deltaMessage(3, { threadLink: navigated.threadLink, timeline: navigated.timeline }));
	socket.reply(sentRequest, commandResult(snapshot({ threadId: wire.threadResult })));
	expect((await resultPromise).outcome).toBe("delivered");
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe(wire.threadB);
});

test("an approval read on one child epoch is refused after the pane navigates, never retargeted", async () => {
	const stale = approval();
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const socket = new FakeSocket();
	await attachWithSnapshot(
		transport,
		socket,
		snapshot({ lease: lease(CLOCK + 60_000), approvals: [stale] }),
	);
	expect(transport.capabilities().supportsCommand("approvalRespond")).toBe(true);

	socket.onRequest = answerAction("snapshot", snapshotMessage(2, navigatedSnapshot([stale])));
	await transport.refresh();
	expect(String(transport.snapshot()?.threadLink.childId)).toBe("child-b");

	// The stale approval is still listed, so nothing about the draft would notice
	// the move; the transport refuses it rather than sending it to child-b.
	expect(await rejection(transport.command(approvalDraft()))).toMatchObject({
		code: "approval_not_pending",
		outcome: "not_delivered",
	});
	expect(transport.capabilities().supportsCommand("approvalRespond")).toBe(false);
	expect(socket.actions("command")).toHaveLength(0);
});

/**
 * Attach over one listed approval and expect the answer to be refused unsent.
 * @param pending The approval as listed.
 */
async function expectApprovalRefused(pending: WireRecord): Promise<void> {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const socket = new FakeSocket();
	await attachWithSnapshot(
		transport,
		socket,
		snapshot({ lease: lease(CLOCK + 60_000), approvals: [pending] }),
	);
	expect(await rejection(transport.command(approvalDraft()))).toMatchObject({
		code: "approval_not_pending",
	});
	expect(socket.actions("command")).toHaveLength(0);
}

test("a settled, expired, or unknown approval is refused before it reaches the gateway", async () => {
	await Promise.all(
		[
			approval({
				lifecycle: {
					state: "settled",
					decision: "approved",
					outcome: "delivered",
					reason: "already answered",
				},
			}),
			approval({ expiresAtMs: CLOCK }),
			approval({ requestId: wire.requestZ }),
		].map(expectApprovalRefused),
	);
});

test("a previously captured command target is enforced instead of silently replaced", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const socket = new FakeSocket();
	await attachWithSnapshot(
		transport,
		socket,
		snapshot({ lease: lease(CLOCK + 60_000), approvals: [approval()] }),
	);
	const captured = transport.captureCommandTarget();
	expect(captured).toMatchObject({ commandId: "command-a", childId: "child-a" });

	socket.onRequest = answerAction(
		"snapshot",
		snapshotMessage(
			2,
			navigatedSnapshot([
				approval({ threadId: wire.threadB, childId: "child-b", epoch: "epoch-b" }),
			]),
		),
	);
	await transport.refresh();

	expect(await rejection(transport.command(approvalDraft(), captured))).toMatchObject({
		code: "link_changed",
		outcome: "not_delivered",
		commandId: "command-a",
	});
	expect(socket.actions("command")).toHaveLength(0);
});

test("queue commands are bound to the queue the captured link is presenting", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const withQueue = snapshot({
		lease: lease(CLOCK + 60_000),
		queue: queue("queued", [wire.submissionA]),
	});
	const { socket, lastCommand } = commandSocket(withQueue, commandResult(withQueue));
	await transport.attach(socket);
	expect(transport.capabilities().supportsCommand("queueStart")).toBe(true);

	await transport.command({ command: "queueStart", submissionId: fixtureIds.submissionA });
	expect(requiredRequest(lastCommand())["command"]).toMatchObject({
		command: "queueStart",
		submissionId: wire.submissionA,
		childId: "child-a",
		epoch: "epoch-a",
	});

	expect(
		await rejection(
			transport.command({ command: "queueDelete", submissionId: fixtureIds.submissionGone }),
		),
	).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
	expect(socket.actions("command")).toHaveLength(1);

	socket.onRequest = answerAction(
		"snapshot",
		snapshotMessage(2, snapshot({ lease: lease(CLOCK + 60_000), queue: queue("unavailable") })),
	);
	await transport.refresh();
	expect(transport.capabilities().supportsCommand("queueAdd")).toBe(false);
	expect(
		await rejection(transport.command({ command: "queueAdd", prompt: "later" })),
	).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
	expect(socket.actions("command")).toHaveLength(1);
});

test("queueAdd must name the target it was composed against, and is refused after navigation", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(CLOCK) }));
	const onThreadA = snapshot({
		lease: lease(CLOCK + 60_000),
		queue: queue("queued", [wire.submissionA]),
	});
	const { socket, lastCommand } = commandSocket(onThreadA, commandResult(onThreadA));
	await transport.attach(socket);

	// A queued submission names neither a thread nor a submission id, so a caller
	// that forgets to say what it was composed against is refused rather than
	// quietly aimed at whatever link is current.
	const draft: BrowserCommandDraft = { command: "queueAdd", prompt: "run the migration" };
	expect(await rejection(transport.command(draft))).toMatchObject({
		code: "link_required",
		outcome: "not_delivered",
	});
	expect(socket.actions("command")).toHaveLength(0);

	const captured = transport.captureCommandTarget();
	await transport.command(draft, captured);
	expect(requiredRequest(lastCommand())["command"]).toMatchObject({
		command: "queueAdd",
		prompt: "run the migration",
		childId: "child-a",
		epoch: "epoch-a",
	});

	// The pane navigates to thread-b, whose queue is present and perfectly
	// usable. Only the captured target says this submission was not meant for it.
	const onThreadB = navigatedSnapshot([]);
	onThreadB.queue = queue("queued", [wire.submissionB]);
	socket.onRequest = answerAction("snapshot", snapshotMessage(2, onThreadB));
	await transport.refresh();
	expect(transport.snapshot()?.queue.status).toBe("queued");
	expect(transport.capabilities().supportsCommand("queueAdd")).toBe(true);

	expect(await rejection(transport.command(draft, captured))).toMatchObject({
		code: "link_changed",
		outcome: "not_delivered",
		commandId: "command-a",
	});
	expect(socket.actions("command")).toHaveLength(1);
});
