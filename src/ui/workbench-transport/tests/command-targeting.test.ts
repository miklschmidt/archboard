import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchTransport, type BrowserCommandDraft } from "../index.js";
import {
	approval,
	attachWithSnapshot,
	commandResult,
	deltaMessage,
	FakeSocket,
	lease,
	queue,
	rejection,
	requiredRequest,
	snapshot,
	snapshotMessage,
	type FakeSocketRequest as Request,
	type Transport,
} from "./fake-socket.js";

const CLOCK = 1_000_000;

function startDraft(threadId = "thread-a"): BrowserCommandDraft {
	return { command: "start", threadId, prompt: "begin" } as unknown as BrowserCommandDraft;
}

function approvalDraft(requestId = "request-a"): BrowserCommandDraft {
	return {
		command: "approvalRespond",
		requestId,
		approvalId: "approval-a",
		response: { approvalKind: "command_execution", decision: "approved" },
	} as unknown as BrowserCommandDraft;
}

/** The same pane after it navigated onto a thread owned by a newer child epoch. */
function navigatedSnapshot(approvals: readonly Record<string, unknown>[]): Record<string, unknown> {
	const value = snapshot({
		threadId: "thread-b",
		lease: { ...lease(CLOCK + 60_000), childId: "child-b", epoch: "epoch-b" },
		approvals,
	});
	value.threadLink = {
		...(value.threadLink as Record<string, unknown>),
		childId: "child-b",
		epoch: "epoch-b",
	};
	return value;
}

const transports: Transport[] = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

function track(transport: Transport): Transport {
	transports.push(transport);
	return transport;
}

async function realtimeResult(sdp: unknown) {
	const initial = snapshot({ lease: lease(CLOCK + 60_000) });
	const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe" || request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(1, initial));
		else if (request.action === "command")
			activeSocket.reply(request, {
				...commandResult(initial),
				realtimeAnswer: { sessionId: "command-a", correlationId: "command-a", sdp },
				realtimeSessionHandle: "command-a",
			});
	};
	await transport.attach(socket);
	const result = await transport.command({
		command: "realtimeStart",
		threadId: "thread-a",
		sdp: "offer",
	} as BrowserCommandDraft);
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
	const navigated = snapshot({ lease: activeLease, threadId: "thread-b" });
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	let commandRequest: Request | null = null;
	let currentSnapshot = initial;
	let currentSequence = 1;
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe") activeSocket.reply(request, snapshotMessage(1, initial));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(currentSequence, currentSnapshot));
		else if (request.action === "command") commandRequest = request;
	};
	await transport.attach(socket);

	const resultPromise = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(commandRequest);
	expect(sentRequest.command).toMatchObject({
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
	socket.event(deltaMessage(3, { threadLink: navigated.threadLink, timeline: navigated.timeline }));
	socket.reply(sentRequest, commandResult(snapshot({ threadId: "thread-result" })));
	expect((await resultPromise).outcome).toBe("delivered");
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe("thread-b");
});

test("an approval read on one child epoch is refused after the pane navigates, never retargeted", async () => {
	const stale = approval();
	const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
	const socket = new FakeSocket();
	await attachWithSnapshot(
		transport,
		socket,
		snapshot({ lease: lease(CLOCK + 60_000), approvals: [stale] }),
	);
	expect(transport.capabilities().supportsCommand("approvalRespond")).toBe(true);

	const navigated = navigatedSnapshot([stale]);
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(2, navigated));
	};
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

test("a settled, expired, or unknown approval is refused before it reaches the gateway", async () => {
	const cases = [
		[
			"settled",
			approval({
				lifecycle: {
					state: "settled",
					decision: "approved",
					outcome: "delivered",
					reason: "already answered",
				},
			}),
		],
		["expired", approval({ expiresAtMs: CLOCK })],
		["another request", approval({ requestId: "request-z" })],
	] as const;
	for (const [name, pending] of cases) {
		const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
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
		void name;
	}
});

test("a previously captured command target is enforced instead of silently replaced", async () => {
	const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
	const socket = new FakeSocket();
	await attachWithSnapshot(
		transport,
		socket,
		snapshot({ lease: lease(CLOCK + 60_000), approvals: [approval()] }),
	);
	const captured = transport.captureCommandTarget();
	expect(captured).toMatchObject({ commandId: "command-a", childId: "child-a" });

	const navigated = navigatedSnapshot([
		approval({ threadId: "thread-b", childId: "child-b", epoch: "epoch-b" }),
	]);
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(2, navigated));
	};
	await transport.refresh();

	expect(await rejection(transport.command(approvalDraft(), captured))).toMatchObject({
		code: "link_changed",
		outcome: "not_delivered",
		commandId: "command-a",
	});
	expect(socket.actions("command")).toHaveLength(0);
});

test("queue commands are bound to the queue the captured link is presenting", async () => {
	const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
	const socket = new FakeSocket();
	const withQueue = snapshot({
		lease: lease(CLOCK + 60_000),
		queue: queue("queued", ["submission-a"]),
	});
	let commandRequest: Request | null = null;
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe" || request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(1, withQueue));
		else if (request.action === "command") {
			commandRequest = request;
			activeSocket.reply(request, commandResult(withQueue));
		}
	};
	await transport.attach(socket);
	expect(transport.capabilities().supportsCommand("queueStart")).toBe(true);

	await transport.command({
		command: "queueStart",
		submissionId: "submission-a",
	} as unknown as BrowserCommandDraft);
	expect(requiredRequest(commandRequest).command).toMatchObject({
		command: "queueStart",
		submissionId: "submission-a",
		childId: "child-a",
		epoch: "epoch-a",
	});

	expect(
		await rejection(
			transport.command({
				command: "queueDelete",
				submissionId: "submission-gone",
			} as unknown as BrowserCommandDraft),
		),
	).toMatchObject({ code: "invalid_command", outcome: "not_delivered" });
	expect(socket.actions("command")).toHaveLength(1);

	const unavailable = snapshot({
		lease: lease(CLOCK + 60_000),
		queue: queue("unavailable"),
	});
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(2, unavailable));
	};
	await transport.refresh();
	expect(transport.capabilities().supportsCommand("queueAdd")).toBe(false);
	expect(
		await rejection(
			transport.command({ command: "queueAdd", prompt: "later" } as unknown as BrowserCommandDraft),
		),
	).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
	expect(socket.actions("command")).toHaveLength(1);
});

test("queueAdd must name the target it was composed against, and is refused after navigation", async () => {
	const transport = track(createBrowserWorkbenchTransport({ now: () => CLOCK }));
	const socket = new FakeSocket();
	const onThreadA = snapshot({
		lease: lease(CLOCK + 60_000),
		queue: queue("queued", ["submission-a"]),
	});
	let commandRequest: Request | null = null;
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe") activeSocket.reply(request, snapshotMessage(1, onThreadA));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(1, onThreadA));
		else if (request.action === "command") {
			commandRequest = request;
			activeSocket.reply(request, commandResult(onThreadA));
		}
	};
	await transport.attach(socket);

	// A queued submission names neither a thread nor a submission id, so a caller
	// that forgets to say what it was composed against is refused rather than
	// quietly aimed at whatever link is current.
	const draft = {
		command: "queueAdd",
		prompt: "run the migration",
	} as unknown as BrowserCommandDraft;
	expect(await rejection(transport.command(draft))).toMatchObject({
		code: "link_required",
		outcome: "not_delivered",
	});
	expect(socket.actions("command")).toHaveLength(0);

	const captured = transport.captureCommandTarget();
	await transport.command(draft, captured);
	expect(requiredRequest(commandRequest).command).toMatchObject({
		command: "queueAdd",
		prompt: "run the migration",
		childId: "child-a",
		epoch: "epoch-a",
	});

	// The pane navigates to thread-b, whose queue is present and perfectly
	// usable. Only the captured target says this submission was not meant for it.
	const onThreadB = navigatedSnapshot([]);
	onThreadB.queue = queue("queued", ["submission-b"]);
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(2, onThreadB));
	};
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
