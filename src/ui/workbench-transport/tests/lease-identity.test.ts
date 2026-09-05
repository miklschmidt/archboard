import { afterEach, expect, jest, test } from "bun:test";

import { CODEX_REQUEST_SETTLEMENT_MS } from "@/shared/timing/timing";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";
import {
	FakeSocket,
	attachWithSnapshot,
	commandResult,
	createTransportTracker,
	deltaMessage,
	lease,
	queue,
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

test("settles an open-socket request once at the deadline and ignores a late result", async () => {
	jest.useFakeTimers();
	try {
		const transport = tracker.track(createBrowserWorkbenchTransport());
		const socket = new FakeSocket();
		await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
		let commandRequest: FakeSocketRequest | null = null;
		/**
		 * Hold the command request.
		 * @param request The request.
		 */
		function hold(request: FakeSocketRequest): void {
			if (request["action"] === "command") {
				commandRequest = request;
			}
		}
		socket.onRequest = hold;

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
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	/**
	 * Answer subscribe, and the command with another command id.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
		} else if (request["action"] === "command") {
			activeSocket.reply(request, commandResult(snapshot({ lease: activeLease }), "command-b"));
		}
	}
	socket.onRequest = answer;
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
	expect(socket.sent.map((request) => request["action"])).toEqual(["subscribe", "command"]);
});

test("retains the accepted turn identity independently of the reply snapshot", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	const current = snapshot({ lease: lease() });
	await attachWithSnapshot(transport, socket, current);
	/**
	 * Answer the command with an accepted turn, and snapshots with the same state.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "command") {
			activeSocket.reply(request, { ...commandResult(current), turnId: "accepted-turn" });
		} else if (request["action"] === "snapshot") {
			activeSocket.reply(request, snapshotMessage(1, current));
		}
	}
	socket.onRequest = answer;
	expect(await transport.command(startDraft())).toMatchObject({
		outcome: "delivered",
		turnId: "accepted-turn",
	});
});

/**
 * Attach with an active lease and answer one lease call with another command id.
 * @param action The lease call the gateway answers with a moved identity.
 */
async function expectMovedLeaseRefused(action: "renewLease" | "releaseLease"): Promise<void> {
	const activeLease = lease();
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	/**
	 * Answer subscribe, and the lease call with another command id.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, snapshotMessage(1, snapshot({ lease: activeLease })));
		} else if (request["action"] === action) {
			const state = action === "releaseLease" ? "released" : "active";
			activeSocket.reply(request, lease(Date.now() + 60_000, "command-b", state));
		}
	}
	socket.onRequest = answer;
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

test("rejects renew and release results that change the lease target", async () => {
	await Promise.all((["renewLease", "releaseLease"] as const).map(expectMovedLeaseRefused));
});

test("renews and releases a lease only after preserving its target identity", async () => {
	const initialLease = lease();
	const renewedLease = lease(Date.now() + 120_000);
	const releasedLease = lease(Date.now() + 120_000, "command-a", "released");
	let sequence = 1;
	let current: WireRecord = snapshot({ lease: initialLease });
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	/**
	 * Answer subscribe, renew, release and reconciliation snapshots.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, snapshotMessage(sequence, current));
		} else if (request["action"] === "renewLease") {
			current = snapshot({ lease: renewedLease });
			activeSocket.reply(request, renewedLease);
		} else if (request["action"] === "releaseLease") {
			current = snapshot({ lease: releasedLease });
			activeSocket.reply(request, releasedLease);
		} else if (request["action"] === "snapshot") {
			sequence += 1;
			activeSocket.reply(request, snapshotMessage(sequence, current));
		}
	}
	socket.onRequest = answer;
	await transport.attach(socket);

	const renewed = await transport.renewLease();
	expect(String(renewed.commandId)).toBe("command-a");
	expect(transport.lease()?.expiresAtMs).toBe(Number(renewedLease["expiresAtMs"]));
	expect(transport.capabilities().canRenewLease).toBe(true);

	const released = await transport.releaseLease();
	expect(String(released?.commandId)).toBe("command-a");
	expect(released?.state).toBe("released");
	expect(transport.capabilities().canReleaseLease).toBe(false);
});

/**
 * The attached snapshot and lease, frozen and untouched by later mutation of
 * the records they were parsed from.
 * @param transport The transport.
 */
function expectFrozenBaseline(transport: BrowserWorkbenchTransport): void {
	const observed = transport.snapshot();
	const observedLease = transport.lease();
	if (observed === null || observedLease === null) {
		throw new Error("the snapshot was not attached");
	}
	expect(String(observed.threadLink.threadId)).toBe(wire.threadA);
	expect(observed.queue.status).toBe("empty");
	expect(String(observedLease.commandId)).toBe("command-a");
	expect(Object.isFrozen(observed)).toBe(true);
	expect(Object.isFrozen(observed.threadLink)).toBe(true);
	expect(Object.isFrozen(observed.queue)).toBe(true);
	expect(Object.isFrozen(observedLease)).toBe(true);

	const target = transport.captureCommandTarget();
	expect(Object.isFrozen(target)).toBe(true);
	expect(Object.isFrozen(target.capturedThreadLink)).toBe(true);
	expect(Reflect.set(target, "commandId", "evil")).toBe(false);
	expect(Reflect.set(target.capturedThreadLink, "threadId", "evil")).toBe(false);
}

/**
 * Answer the command and reconciliation snapshots with one fixed lease.
 * @param socket The socket.
 */
function answerCommandsWithFixedLease(socket: FakeSocket): void {
	let sequence = 2;
	const currentLease = lease();
	/**
	 * Answer the command and the reconciliation snapshot.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "command") {
			activeSocket.reply(request, commandResult(snapshot({ lease: currentLease })));
		} else if (request["action"] === "snapshot") {
			sequence += 1;
			activeSocket.reply(request, snapshotMessage(sequence, snapshot({ lease: currentLease })));
		}
	}
	socket.onRequest = answer;
}

test("transport snapshots, leases, and captured targets remain immutable across later deltas", async () => {
	const sourceLease = lease();
	const source = snapshot({ lease: sourceLease });
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, source);
	source.threadLink["threadId"] = "mutated-thread";
	source.queue["status"] = "failed";
	sourceLease["commandId"] = "mutated-command";
	expectFrozenBaseline(transport);

	answerCommandsWithFixedLease(socket);
	const deltaQueue = queue("queued");
	socket.event(deltaMessage(2, { queue: deltaQueue }));
	deltaQueue["status"] = "failed";
	expect(transport.snapshot()?.queue.status).toBe("queued");

	const result = await transport.command(startDraft());
	expect(socket.actions("command")[0]?.["command"]).toMatchObject({
		commandId: "command-a",
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		threadId: wire.threadA,
	});
	expect(Object.isFrozen(result.snapshot)).toBe(true);
	expect(Reflect.set(result.snapshot, "version", 2)).toBe(false);
	expect(String(transport.snapshot()?.threadLink.threadId)).toBe(wire.threadA);
	expect(String(transport.lease()?.commandId)).toBe("command-a");
});
