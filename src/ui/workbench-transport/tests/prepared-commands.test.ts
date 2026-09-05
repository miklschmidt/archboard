import { expect, test } from "bun:test";
import { createBrowserWorkbenchTransport, type BrowserCommandDraft } from "../index.js";
import {
	FakeSocket,
	approval,
	commandResult,
	deltaMessage,
	lease,
	rejection,
	snapshot,
	snapshotMessage,
	type FakeSocketRequest,
} from "./fake-socket.js";

// The public transport boundary is the cheapest owner for authority acquisition:
// callers begin with a real subscribed snapshot and no private lease setup.
async function harness(initial = snapshot({ linkState: "unbound" })) {
	const transport = createBrowserWorkbenchTransport();
	const socket = new FakeSocket();
	const claimSent = Promise.withResolvers<void>();
	const commandSent = Promise.withResolvers<void>();
	let current = initial;
	let sequence = 0;
	let commandNumber = 0;
	let heldClaim: FakeSocketRequest | null = null;
	let holdClaim = false;
	let heldCommand: FakeSocketRequest | null = null;
	let holdCommand = false;
	const replyClaim = (request: FakeSocketRequest) => {
		const fresh = lease(Date.now() + 60_000, `command-${++commandNumber}`);
		current = { ...current, lease: fresh };
		socket.reply(request, fresh);
	};
	const replyCommand = (request: FakeSocketRequest) => {
		const command = request.command as Record<string, unknown>;
		if (command.command === "threadLinkCreate")
			current = snapshot({ lease: current.lease as Record<string, unknown> });
		socket.reply(request, commandResult(current, String(command.commandId)));
	};
	socket.onRequest = (request) => {
		if (request.action === "subscribe" || request.action === "snapshot")
			socket.reply(request, snapshotMessage(++sequence, current));
		else if (request.action === "claimLease") {
			claimSent.resolve();
			if (holdClaim) heldClaim = request;
			else replyClaim(request);
		} else if (request.action === "command") {
			commandSent.resolve();
			if (holdCommand) heldCommand = request;
			else replyCommand(request);
		}
	};
	await transport.attach(socket);
	return {
		transport,
		socket,
		claimSent: claimSent.promise,
		commandSent: commandSent.promise,
		holdClaim: () => {
			holdClaim = true;
		},
		releaseClaim: () => {
			if (heldClaim === null) throw new Error("No claim is pending.");
			holdClaim = false;
			replyClaim(heldClaim);
		},
		failClaim: () => {
			if (heldClaim === null) throw new Error("No claim is pending.");
			socket.replyFailure(heldClaim);
		},
		holdCommand: () => {
			holdCommand = true;
		},
		releaseCommand: () => {
			if (heldCommand === null) throw new Error("No command is pending.");
			holdCommand = false;
			replyCommand(heldCommand);
		},
		publish: (next: Record<string, unknown>) => {
			current = next;
			socket.event(snapshotMessage(++sequence, current));
		},
		stale: () => socket.event(deltaMessage(sequence + 2, {})),
	};
}
const start = (): BrowserCommandDraft =>
	({ command: "start", threadId: "thread-a", prompt: "Draw the graph." }) as BrowserCommandDraft;

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
		const commands = h.socket
			.actions("command")
			.map((request) => request.command as Record<string, unknown>);
		expect(commands.map((command) => command.commandId)).toEqual([
			"command-1",
			"command-2",
			"command-3",
		]);
		expect(commands.map((command) => command.command)).toEqual([
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
		h.publish(snapshot({ threadId: "thread-b" }));
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
		Object.assign(draft, { prompt: "Changed after activation" });
		expect(await rejection(h.transport.claimLease())).toMatchObject({
			code: "not_ready",
			outcome: "not_delivered",
		});
		h.releaseClaim();
		await pending;
		expect(h.socket.actions("command")[0]?.command).toMatchObject({ prompt: "Draw the graph." });
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
		await h.transport.executeCommand(
			{
				command: "approvalRespond",
				requestId: "request-a",
				approvalId: "approval-a",
				response: { approvalKind: "command_execution", decision: "decline" },
			} as BrowserCommandDraft,
			target,
		);
		expect(h.socket.actions("command")[0]?.command).toMatchObject({
			command: "approvalRespond",
			commandId: "command-1",
			requestId: "request-a",
		});
		expect(
			await rejection(
				h.transport.executeCommand({ command: "dynamicApprovalRespond" } as BrowserCommandDraft),
			),
		).toMatchObject({ code: "not_ready" });
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
		const next = new FakeSocket();
		next.onRequest = (request) => next.reply(request, snapshotMessage(1, snapshot()));
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
		const next = new FakeSocket();
		next.onRequest = (request) => next.reply(request, snapshotMessage(1, snapshot()));
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
		const pending = rejection(
			h.transport.executeCommand({
				command: "approvalRespond",
				requestId: "request-a",
				approvalId: "approval-a",
				response: { approvalKind: "command_execution", decision: "decline" },
			} as BrowserCommandDraft),
		);
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
		const stopped = h.transport.executeCommand(
			{
				command: "realtimeStop",
				threadId: "thread-a",
				realtimeSessionHandle: "voice-start-lease",
			} as BrowserCommandDraft,
			h.transport.captureCommandIntent(),
		);
		expect(h.socket.actions("claimLease")).toHaveLength(1);
		h.releaseCommand();
		await text;
		expect((await stopped).outcome).toBe("delivered");
		expect(h.socket.actions("command").map((request) => request.command)).toMatchObject([
			{ command: "start", commandId: "command-1" },
			{
				command: "realtimeStop",
				commandId: "command-2",
				threadId: "thread-a",
				realtimeSessionHandle: "voice-start-lease",
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
			h.transport.executeCommand(
				{
					command: "realtimeStop",
					threadId: "thread-a",
					realtimeSessionHandle: "voice-start-lease",
				} as BrowserCommandDraft,
				h.transport.captureCommandIntent(),
			),
		);
		h.publish(snapshot({ threadId: "thread-b", lease: lease(Date.now() + 60_000, "command-1") }));
		h.releaseCommand();
		await text;
		expect(await stopped).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
		expect(h.socket.actions("command")).toHaveLength(1);
		expect(h.socket.actions("claimLease")).toHaveLength(1);
	} finally {
		await h.transport.dispose();
	}
});
