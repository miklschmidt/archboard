import { afterEach, expect, jest, test } from "bun:test";

import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
import { createBrowserWorkbenchTransport, type BrowserCommandDraft } from "../index.js";
import {
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

test("settles an open-socket request once at the deadline and ignores a late result", async () => {
	jest.useFakeTimers();
	try {
		const transport = track(createBrowserWorkbenchTransport());
		const socket = new FakeSocket();
		await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
		let commandRequest: Request | null = null;
		socket.onRequest = (request) => {
			if (request.action === "command") commandRequest = request;
		};

		const settled = rejection(transport.command(startDraft()));
		jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
		expect(await settled).toMatchObject({
			name: "BrowserWorkbenchTransportError",
			code: "response_lost",
			outcome: "outcome_unknown",
			commandId: "command-a",
		});
		const sequence = transport.sequence();
		socket.reply(requiredRequest(commandRequest), {});
		expect(transport.sequence()).toBe(sequence);
		expect(transport.state()).toMatchObject({ kind: "readiness", state: "thread_capable" });
	} finally {
		jest.useRealTimers();
	}
});

test("rejects a command result whose identity differs from the frozen target", async () => {
	const activeLease = lease();
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
		else if (request.action === "command")
			activeSocket.reply(request, commandResult(snapshot({ lease: activeLease }), "command-b"));
	};
	await transport.attach(socket);

	expect(await rejection(transport.command(startDraft()))).toMatchObject({
		code: "incompatible_contract",
		outcome: "outcome_unknown",
		commandId: "command-a",
	});
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	expect(socket.sent.map((request) => request.action)).toEqual(["subscribe", "command"]);
});

test("rejects renew and release results that change the lease target", async () => {
	for (const action of ["renewLease", "releaseLease"] as const) {
		const activeLease = lease();
		const transport = track(createBrowserWorkbenchTransport());
		const socket = new FakeSocket();
		socket.onRequest = (request, activeSocket) => {
			if (request.action === "subscribe")
				activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
			else if (request.action === action)
				activeSocket.reply(
					request,
					lease(
						Date.now() + 60_000,
						"command-b",
						action === "releaseLease" ? "released" : "active",
					),
				);
		};
		await transport.attach(socket);

		const pending = action === "renewLease" ? transport.renewLease() : transport.releaseLease();
		expect(await rejection(pending)).toMatchObject({
			code: "incompatible_contract",
			outcome: "outcome_unknown",
			commandId: "command-a",
		});
		expect(transport.state()).toMatchObject({
			kind: "connection",
			state: "incompatible_contract",
		});
	}
});

test("renews and releases a lease only after preserving its target identity", async () => {
	const initialLease = lease();
	const renewedLease = lease(Date.now() + 120_000);
	const releasedLease = lease(Date.now() + 120_000, "command-a", "released");
	let sequence = 1;
	let current = snapshot({ lease: initialLease });
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, snapshotMessage(sequence, current));
		else if (request.action === "renewLease") {
			current = snapshot({ lease: renewedLease });
			activeSocket.reply(request, renewedLease);
		} else if (request.action === "releaseLease") {
			current = snapshot({ lease: releasedLease });
			activeSocket.reply(request, releasedLease);
		} else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(++sequence, current));
	};
	await transport.attach(socket);

	const renewed = await transport.renewLease();
	expect(String(renewed.commandId)).toBe("command-a");
	expect(transport.lease()?.expiresAtMs).toBe(Number(renewedLease.expiresAtMs));
	expect(transport.capabilities().canRenewLease).toBe(true);

	const released = await transport.releaseLease();
	expect(String(released?.commandId)).toBe("command-a");
	expect(released?.state).toBe("released");
	expect(transport.capabilities().canReleaseLease).toBe(false);
});

test("transport snapshots, leases, and captured targets remain immutable across later deltas", async () => {
	const sourceLease = lease();
	const source = snapshot({ lease: sourceLease });
	const transport = track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, source);
	(source.threadLink as Record<string, unknown>).threadId = "mutated-thread";
	(source.queue as Record<string, unknown>).status = "failed";
	sourceLease.commandId = "mutated-command";

	const observed = transport.snapshot();
	const observedLease = transport.lease();
	if (observed === null || observedLease === null) throw new Error("the snapshot was not attached");
	expect(String(observed.threadLink.threadId)).toBe("thread-a");
	expect(observed.queue.status).toBe("empty");
	expect(String(observedLease.commandId)).toBe("command-a");
	expect(Object.isFrozen(observed)).toBe(true);
	expect(Object.isFrozen(observed.threadLink)).toBe(true);
	expect(Object.isFrozen(observed.queue)).toBe(true);
	expect(Object.isFrozen(observedLease)).toBe(true);

	const target = transport.captureCommandTarget();
	expect(Object.isFrozen(target)).toBe(true);
	expect(Object.isFrozen(target.capturedThreadLink)).toBe(true);
	expect(Reflect.set(target as unknown as Record<string, unknown>, "commandId", "evil")).toBe(
		false,
	);
	expect(
		Reflect.set(
			target.capturedThreadLink as unknown as Record<string, unknown>,
			"threadId",
			"evil",
		),
	).toBe(false);

	let sequence = 2;
	const currentLease = lease();
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "command")
			activeSocket.reply(request, commandResult(snapshot({ lease: currentLease })));
		else if (request.action === "snapshot")
			activeSocket.reply(request, snapshotMessage(++sequence, snapshot({ lease: currentLease })));
	};
	const deltaQueue = queue("queued");
	socket.event(deltaMessage(2, { queue: deltaQueue }));
	deltaQueue.status = "failed";
	expect(transport.snapshot()?.queue.status).toBe("queued");

	const result = await transport.command(startDraft());
	expect(socket.actions("command")[0]?.command).toMatchObject({
		commandId: "command-a",
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		threadId: "thread-a",
	});
	expect(Object.isFrozen(result.snapshot)).toBe(true);
	expect(Reflect.set(result.snapshot as unknown as Record<string, unknown>, "version", 2)).toBe(
		false,
	);
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe("thread-a");
	expect(String(transport.lease()?.commandId)).toBe("command-a");
});
