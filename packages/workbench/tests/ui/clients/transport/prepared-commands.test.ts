import { expect, test } from "bun:test";

import {
	approval,
	fixtureIds,
	lease,
	rejection,
	snapshot,
	wire,
} from "#tests/ui/support/transport/fake-socket.ts";
import {
	declineApproval,
	harness,
	replacementSocket,
	sentCommands,
	start,
	stopVoice,
} from "#tests/ui/support/transport/prepared-harness.ts";

// The public transport boundary is the cheapest owner for authority acquisition:
// callers begin with a real subscribed snapshot and no private lease setup.

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
		const second = rejection(h.transport.executeCommand({ command: "threadLinkCreate" }));
		expect(h.socket.actions("claimLease")).toHaveLength(1);
		h.releaseCommand();
		await create;
		expect(await second).toMatchObject({ code: "link_changed", outcome: "not_delivered" });
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
