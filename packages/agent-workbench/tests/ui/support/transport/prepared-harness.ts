// The gateway double behind the prepared-command tests: a subscribed transport over a fake
// socket that hands out fresh leases and can hold a claim or a command.

import { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
import {
	type BrowserCommandDraft,
	type BrowserWorkbenchTransport,
} from "#ui/state/transport/contract.ts";
import {
	FakeSocket,
	answerSnapshots,
	commandResult,
	deltaMessage,
	fixtureIds,
	lease,
	record,
	snapshot,
	snapshotMessage,
	type FakeSocketRequest,
	type SnapshotFixture,
} from "#tests/ui/support/transport/fake-socket.ts";

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

export {
	declineApproval,
	harness,
	replacementSocket,
	sentCommands,
	start,
	stopVoice,
	type Harness,
};
