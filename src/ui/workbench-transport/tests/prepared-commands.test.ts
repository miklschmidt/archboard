import { expect, test } from "bun:test";

import {
	createBrowserWorkbenchTransport,
	type BrowserCommandDraft,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";
import {
	FakeSocket,
	answerSnapshots,
	approval,
	commandResult,
	deltaMessage,
	fixtureIds,
	lease,
	record,
	rejection,
	snapshot,
	wire,
	snapshotMessage,
	type FakeSocketRequest,
	type SnapshotFixture,
} from "@/ui/workbench-transport/tests/fake-socket";

// The public transport boundary is the cheapest owner for authority acquisition:
// callers begin with a real subscribed snapshot and no private lease setup.

/** A transport over a gateway double that hands out fresh leases on demand. */
interface Harness {
	readonly transport: BrowserWorkbenchTransport;
	readonly socket: FakeSocket;
	readonly claimSent: Promise<void>;
	readonly commandSent: Promise<void>;
	readonly holdClaim: () => void;
	readonly releaseClaim: () => void;
	readonly failClaim: () => void;
	readonly holdCommand: () => void;
	readonly releaseCommand: () => void;
	readonly publish: (next: SnapshotFixture) => void;
	readonly stale: () => void;
}

/** A promise released from outside. */
interface Latch {
	readonly promise: Promise<void>;
	readonly release: () => void;
}

/** The resolver a latch holds before its promise has captured the real one. */
function releaseNothing(): void {
	// Replaced synchronously by the promise executor.
}

/**
 * A promise and the function that resolves it.
 * @returns The latch.
 */
function latch(): Latch {
	let release: () => void = releaseNothing;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

/** The gateway double's mutable state. */
interface GatewayState {
	current: SnapshotFixture;
	sequence: number;
	commandNumber: number;
	heldClaim: FakeSocketRequest | null;
	holdClaim: boolean;
	heldCommand: FakeSocketRequest | null;
	holdCommand: boolean;
}

/**
 * The gateway double: what it answers and what it holds.
 * @param initial The first snapshot.
 * @returns The harness.
 */
async function harness(initial = snapshot({ linkState: "unbound" })): Promise<Harness> {
	const transport = createBrowserWorkbenchTransport();
	const socket = new FakeSocket();
	const claimSent = latch();
	const commandSent = latch();
	const state: GatewayState = {
		current: initial,
		sequence: 0,
		commandNumber: 0,
		heldClaim: null,
		holdClaim: false,
		heldCommand: null,
		holdCommand: false,
	};
	/**
	 * Answer a claim with a fresh lease.
	 * @param request The claim request.
	 */
	function replyClaim(request: FakeSocketRequest): void {
		state.commandNumber += 1;
		const fresh = lease(Date.now() + 60_000, `command-${state.commandNumber}`);
		state.current = { ...state.current, lease: fresh };
		socket.reply(request, fresh);
	}
	/**
	 * Answer a command with the current snapshot, linking on threadLinkCreate.
	 * @param request The command request.
	 */
	function replyCommand(request: FakeSocketRequest): void {
		const sent = record(request["command"]);
		if (sent["command"] === "threadLinkCreate") {
			state.current = snapshot({ lease: state.current.lease });
		}
		socket.reply(request, commandResult(state.current, String(sent["commandId"])));
	}
	/**
	 * Answer or hold a claim.
	 * @param request The claim request.
	 */
	function onClaim(request: FakeSocketRequest): void {
		claimSent.release();
		if (state.holdClaim) {
			state.heldClaim = request;
		} else {
			replyClaim(request);
		}
	}
	/**
	 * Answer or hold a command.
	 * @param request The command request.
	 */
	function onCommand(request: FakeSocketRequest): void {
		commandSent.release();
		if (state.holdCommand) {
			state.heldCommand = request;
		} else {
			replyCommand(request);
		}
	}
	/**
	 * Route one request.
	 * @param request The request.
	 */
	function answer(request: FakeSocketRequest): void {
		const action = request["action"];
		if (action === "subscribe" || action === "snapshot") {
			state.sequence += 1;
			socket.reply(request, snapshotMessage(state.sequence, state.current));
		} else if (action === "claimLease") {
			onClaim(request);
		} else if (action === "command") {
			onCommand(request);
		}
	}
	/** Hold the next claim. */
	function holdClaim(): void {
		state.holdClaim = true;
	}
	/** Answer the held claim. */
	function releaseClaim(): void {
		if (state.heldClaim === null) {
			throw new Error("No claim is pending.");
		}
		state.holdClaim = false;
		replyClaim(state.heldClaim);
	}
	/** Refuse the held claim. */
	function failClaim(): void {
		if (state.heldClaim === null) {
			throw new Error("No claim is pending.");
		}
		socket.replyFailure(state.heldClaim);
	}
	/** Hold the next command. */
	function holdCommand(): void {
		state.holdCommand = true;
	}
	/** Answer the held command. */
	function releaseCommand(): void {
		if (state.heldCommand === null) {
			throw new Error("No command is pending.");
		}
		state.holdCommand = false;
		replyCommand(state.heldCommand);
	}
	/**
	 * Push a new snapshot.
	 * @param next The snapshot.
	 */
	function publish(next: SnapshotFixture): void {
		state.current = next;
		state.sequence += 1;
		socket.event(snapshotMessage(state.sequence, state.current));
	}
	/** Push a delta that skips a sequence. */
	function stale(): void {
		socket.event(deltaMessage(state.sequence + 2, {}));
	}
	socket.onRequest = answer;
	await transport.attach(socket);
	return {
		transport,
		socket,
		claimSent: claimSent.promise,
		commandSent: commandSent.promise,
		holdClaim,
		releaseClaim,
		failClaim,
		holdCommand,
		releaseCommand,
		publish,
		stale,
	};
}

type StartDraft = Extract<BrowserCommandDraft, { readonly command: "start" }>;

/**
 * A start against thread-a.
 * @returns The draft.
 */
function start(): StartDraft {
	return { command: "start", threadId: fixtureIds.threadA, prompt: "Draw the graph." };
}

/**
 * A decline against the default approval.
 * @returns The draft.
 */
function declineApproval(): BrowserCommandDraft {
	return {
		command: "approvalRespond",
		requestId: fixtureIds.requestA,
		approvalId: fixtureIds.approvalA,
		response: { approvalKind: "command_execution", decision: "decline" },
	};
}

/**
 * A voice stop for the captured session handle.
 * @returns The draft.
 */
function stopVoice(): BrowserCommandDraft {
	return {
		command: "realtimeStop",
		threadId: fixtureIds.threadA,
		realtimeSessionHandle: fixtureIds.voiceHandle,
	};
}

/**
 * The commands a socket sent, as wire records.
 * @param socket The socket.
 * @returns The command records.
 */
function sentCommands(socket: FakeSocket): readonly Record<string, unknown>[] {
	return socket.actions("command").map((request) => record(request["command"]));
}

/**
 * A replacement socket answering everything with the baseline snapshot.
 * @returns The socket.
 */
function replacementSocket(): FakeSocket {
	const next = new FakeSocket();
	next.onRequest = answerSnapshots(snapshot());
	return next;
}

test("human actions bootstrap without a lease and every subsequent action gets fresh authority", async () => {
	const h = await harness();
	try {
		expect(h.socket.actions("claimLease")).toHaveLength(0);
		expect(h.transport.capabilities().supportsCommand("threadLinkCreate")).toBe(true);
		await h.transport.executeCommand({ command: "threadLinkCreate" });
		await h.transport.executeCommand(start());
		await h.transport.executeCommand(
			{ command: "queueAdd", prompt: "Then label it." },
			h.transport.captureCommandIntent(),
		);
		expect(h.socket.actions("claimLease")).toHaveLength(3);
		const commands = sentCommands(h.socket);
		expect(commands.map((command) => command["commandId"])).toEqual([
			"command-1",
			"command-2",
			"command-3",
		]);
		expect(commands.map((command) => command["command"])).toEqual([
			"threadLinkCreate",
			"start",
			"queueAdd",
		]);
	} finally {
		await h.transport.dispose();
	}
});

test("serializes fresh authority and refuses a queued action after the first changes its link", async () => {
	const h = await harness();
	try {
		h.holdCommand();
		const create = h.transport.executeCommand({ command: "threadLinkCreate" });
		await h.commandSent;
		const refresh = rejection(h.transport.executeCommand({ command: "threadLinkRefresh" }));
		expect(h.socket.actions("claimLease")).toHaveLength(1);
		h.releaseCommand();
		await create;
		expect(await refresh).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(1);
	} finally {
		await h.transport.dispose();
	}
});

test("a link change during acquisition refuses the original intent without dispatch", async () => {
	const h = await harness(snapshot());
	try {
		h.holdClaim();
		const pending = rejection(h.transport.executeCommand(start()));
		await h.claimSent;
		h.publish(snapshot({ threadId: wire.threadB }));
		h.releaseClaim();
		expect(await pending).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("captures the draft at activation and prevents another owner from claiming during preparation", async () => {
	const h = await harness(snapshot());
	try {
		h.holdClaim();
		const draft = start();
		const pending = h.transport.executeCommand(draft);
		await h.claimSent;
		draft.prompt = "Changed after activation";
		expect(await rejection(h.transport.claimLease())).toMatchObject({
			code: "not_ready",
			outcome: "not_delivered",
		});
		h.releaseClaim();
		await pending;
		expect(sentCommands(h.socket)[0]).toMatchObject({ prompt: "Draw the graph." });
	} finally {
		await h.transport.dispose();
	}
});

test("ordinary approvals acquire fresh authority while dynamic decisions keep exact authority", async () => {
	const h = await harness(snapshot({ approvals: [approval()] }));
	try {
		expect(h.transport.capabilities().supportsCommand("approvalRespond")).toBe(true);
		const target = h.transport.captureCommandIntent();
		expect(target.authority).toBeNull();
		await h.transport.executeCommand(declineApproval(), target);
		expect(sentCommands(h.socket)[0]).toMatchObject({
			command: "approvalRespond",
			commandId: "command-1",
			requestId: wire.requestA,
		});
		// A dynamic decision is never prepared: the same predicate the prepared
		// path consults refuses it before any claim.
		expect(h.transport.capabilities().supportsCommand("dynamicApprovalRespond")).toBe(false);
		expect(h.socket.actions("claimLease")).toHaveLength(1);
	} finally {
		await h.transport.dispose();
	}
});

test("a lost command result remains unknown and is never replayed after reconnection", async () => {
	const h = await harness(snapshot());
	try {
		h.holdCommand();
		const pending = rejection(h.transport.executeCommand(start()));
		await h.commandSent;
		h.socket.close();
		expect(await pending).toMatchObject({
			code: "response_lost",
			outcome: "outcome_unknown",
			commandId: "command-1",
		});
		const next = replacementSocket();
		await h.transport.attach(next);
		expect(next.actions("command")).toHaveLength(0);
		expect(next.actions("claimLease")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("refuses captured actions after replacement even when the new socket shows the same link", async () => {
	const h = await harness(snapshot());
	try {
		const intent = h.transport.captureCommandIntent();
		const next = replacementSocket();
		await h.transport.attach(next);
		expect(await rejection(h.transport.executeCommand(start(), intent))).toMatchObject({
			code: "link_changed",
			outcome: "not_delivered",
		});
		expect(next.actions("claimLease")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("a failed authority claim leaves the requested action definitively unsent", async () => {
	const h = await harness();
	try {
		h.holdClaim();
		const pending = rejection(h.transport.executeCommand({ command: "threadLinkCreate" }));
		await h.claimSent;
		h.failClaim();
		expect(await pending).toMatchObject({ outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(0);
		expect(h.socket.actions("claimLease")).toHaveLength(1);
	} finally {
		await h.transport.dispose();
	}
});

test("a decision that settles while authority is acquired is refused without answering again", async () => {
	const h = await harness(snapshot({ approvals: [approval()] }));
	try {
		h.holdClaim();
		const pending = rejection(h.transport.executeCommand(declineApproval()));
		await h.claimSent;
		h.publish(snapshot());
		h.releaseClaim();
		expect(await pending).toMatchObject({ outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("a stale stream invalidates displayed intent even after the same link recovers", async () => {
	const h = await harness(snapshot());
	try {
		const intent = h.transport.captureCommandIntent();
		h.stale();
		await h.transport.refresh();
		expect(await rejection(h.transport.executeCommand(start(), intent))).toMatchObject({
			code: "link_changed",
			outcome: "not_delivered",
		});
		expect(h.socket.actions("claimLease")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("queue additions still require the displayed conversation intent", async () => {
	const h = await harness(snapshot());
	try {
		expect(
			await rejection(h.transport.executeCommand({ command: "queueAdd", prompt: "Later" })),
		).toMatchObject({ code: "link_required", outcome: "not_delivered" });
		expect(h.socket.actions("claimLease")).toHaveLength(0);
	} finally {
		await h.transport.dispose();
	}
});

test("voice Stop waits behind a pending text command and keeps its captured session handle", async () => {
	const h = await harness(snapshot());
	try {
		h.holdCommand();
		const text = h.transport.executeCommand(start());
		await h.commandSent;
		const stopped = h.transport.executeCommand(stopVoice(), h.transport.captureCommandIntent());
		expect(h.socket.actions("claimLease")).toHaveLength(1);
		h.releaseCommand();
		await text;
		expect((await stopped).outcome).toBe("delivered");
		expect(sentCommands(h.socket)).toMatchObject([
			{ command: "start", commandId: "command-1" },
			{
				command: "realtimeStop",
				commandId: "command-2",
				threadId: wire.threadA,
				realtimeSessionHandle: fixtureIds.voiceHandle,
			},
		]);
		expect(h.socket.actions("claimLease")).toHaveLength(2);
	} finally {
		await h.transport.dispose();
	}
});

test("a queued voice Stop cannot move to a replacement conversation", async () => {
	const h = await harness(snapshot());
	try {
		h.holdCommand();
		const text = h.transport.executeCommand(start());
		await h.commandSent;
		const stopped = rejection(
			h.transport.executeCommand(stopVoice(), h.transport.captureCommandIntent()),
		);
		h.publish(snapshot({ threadId: wire.threadB, lease: lease(Date.now() + 60_000, "command-1") }));
		h.releaseCommand();
		await text;
		expect(await stopped).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(1);
		expect(h.socket.actions("claimLease")).toHaveLength(1);
	} finally {
		await h.transport.dispose();
	}
});
