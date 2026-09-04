import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchTransport, type BrowserCommandDraft } from "../index.js";
import {
	accountResult,
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

function startDraft(threadId = "thread-a"): BrowserCommandDraft {
	return { command: "start", threadId, prompt: "begin" } as unknown as BrowserCommandDraft;
}

const transports: Transport[] = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

function track(transport: Transport): Transport {
	transports.push(transport);
	return transport;
}

test("attach reports the transient reconnecting state before the subscribe baseline arrives", async () => {
	const transport = track(
		createBrowserWorkbenchTransport({
			requestId: (() => {
				let count = 0;
				return () => `request-${++count}`;
			})(),
		}),
	);
	const socket = new FakeSocket();
	socket.readyState = 0;
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe") activeSocket.reply(request, snapshotMessage(7, snapshot()));
	};

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
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ approvals: [approval()] }));

	expect(transport.state()).toMatchObject({ kind: "readiness", state: "thread_capable" });
	const approvals = transport.snapshot()?.approvals ?? [];
	expect(approvals).toHaveLength(1);
	expect(approvals[0]).toMatchObject({
		requestId: "request-a",
		lifecycle: { state: "pending" },
		binding: { child: "child-a", epoch: "epoch-a" },
	});

	socket.event(deltaMessage(2, { approvals: [approval({ requestId: "request-b" })] }));
	expect(transport.state()).toMatchObject({ kind: "readiness", sequence: 2 });
	expect(transport.snapshot()?.approvals.map((entry) => String(entry.requestId))).toEqual([
		"request-b",
	]);
});

test("strict stream reduction rejects gaps, ignores duplicates, and recovers from a snapshot", async () => {
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	let recoverySequence = 4;
	const initial = snapshot();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe") activeSocket.reply(request, snapshotMessage(1, initial));
		if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(recoverySequence, snapshot()));
	};
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

	recoverySequence = 6;
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
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	const first = snapshot();
	const navigated = snapshot({ threadId: "thread-b" });
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe") activeSocket.reply(request, snapshotMessage(1, first));
		if (request.action === "snapshot") activeSocket.reply(request, snapshotMessage(3, navigated));
	};
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
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe("thread-b");
	expect(socket.actions("snapshot")).toHaveLength(1);
});

test("lost command responses become outcome-unknown and are never replayed after replacement", async () => {
	const activeLease = lease(Date.now() + 10_000);
	const first = new FakeSocket();
	const transport = track(createBrowserWorkbenchTransport());
	await attachWithSnapshot(transport, first, snapshot({ lease: activeLease }));
	let commandRequest: Request | null = null;
	first.onRequest = (request) => {
		if (request.action === "command") commandRequest = request;
	};
	const pending = transport.command(startDraft());
	await Bun.sleep(0);
	const sentRequest = requiredRequest(commandRequest);
	first.close();
	expect(await rejection(pending)).toMatchObject({
		name: "BrowserWorkbenchTransportError",
		code: "response_lost",
		outcome: "outcome_unknown",
	});

	const second = new FakeSocket();
	await attachWithSnapshot(transport, second, snapshot(), 9);
	first.reply(sentRequest, commandResult(snapshot({ lease: activeLease })));
	expect(second.sent.map((request) => request.action)).toEqual(["subscribe"]);
});

test("account results reconcile through a versioned snapshot and socket close exposes backoff", async () => {
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	const accountReady = snapshot({ state: "account_ready" });
	const reconciled = snapshot({ state: "account_ready" });
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, accountReady));
		else if (request.action === "accountRead")
			activeSocket.reply(request, accountResult(accountReady));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(2, reconciled));
	};
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
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "close") activeSocket.reply(request, null);
	};
	await transport.close();
	expect(socket.sent.at(-1)).toMatchObject({ type: "codex_workbench_request", action: "close" });
	expect(transport.state()).toMatchObject({ kind: "connection", state: "stopped" });
});

test("malformed and relationally contradictory messages become incompatible", async () => {
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.event({ kind: "snapshot", sequence: 2, snapshot: { ...snapshot(), version: 2 } });
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	expect(await rejection(transport.refresh())).toMatchObject({ code: "socket_unavailable" });

	for (const threadLink of [
		snapshot({ linkState: "unbound" }).threadLink,
		snapshot({ threadId: "thread-b" }).threadLink,
	]) {
		const relationshipTransport = track(createBrowserWorkbenchTransport());
		const relationshipSocket = new FakeSocket();
		await attachWithSnapshot(relationshipTransport, relationshipSocket, snapshot());
		relationshipSocket.event(deltaMessage(2, { threadLink }));
		expect(relationshipTransport.state()).toMatchObject({
			kind: "connection",
			state: "incompatible_contract",
			reason: expect.stringContaining("contradicts its snapshot"),
		});
	}
});

test("gateway failure responses are surfaced without treating them as transport loss", async () => {
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ state: "account_ready" }));
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "accountRead") activeSocket.replyFailure(request, "account unavailable");
	};
	expect(await rejection(transport.accountRead())).toMatchObject({
		code: "gateway_error",
		outcome: "not_delivered",
	});
	expect(transport.state()).toMatchObject({ kind: "readiness", state: "account_ready" });
});
