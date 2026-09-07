import { expect, test } from "bun:test";

import type { RealtimeMediaSession } from "@/ui/codex-realtime";
import { createBrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import type { BrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import { FakeMediaBrowser } from "@/ui/codex-workbench-media/tests/support/fake-media-environment";
import { FakeTransport } from "@/ui/codex-workbench-media/tests/support/fake-transport";

/**
 * Does nothing.
 */
function noop(): void {
	// Nothing to do.
}

/** What a stub session counts. */
interface StubSessionCounts {
	disposed: number;
	subscriptions: number;
	releases: number;
	publish: () => void;
}

/**
 * An owner over a stub session that only counts subscriptions and disposals.
 * @returns The owner and its counts.
 */
function stubbedOwner(): {
	readonly owner: BrowserWorkbenchMediaOwner;
	readonly counts: StubSessionCounts;
} {
	const counts: StubSessionCounts = {
		disposed: 0,
		subscriptions: 0,
		releases: 0,
		publish: noop,
	};
	const owner = createBrowserWorkbenchMediaOwner({
		/**
		 * A session that negotiates nothing.
		 * @returns The stub session.
		 */
		createMediaSession: (): RealtimeMediaSession => ({
			/**
			 * Idle.
			 * @returns The idle snapshot.
			 */
			getSnapshot: () => ({ correlation: null, state: { phase: "idle", reason: "created" } }),
			/**
			 * Counts subscriptions and captures the forwarder.
			 * @param listener The listener.
			 * @returns The release.
			 */
			subscribe: (listener) => {
				counts.subscriptions += 1;
				/**
				 * Publishes the idle snapshot to the captured listener.
				 */
				counts.publish = () => {
					listener({ correlation: null, state: { phase: "idle", reason: "created" } });
				};
				return () => {
					counts.releases += 1;
				};
			},
			/**
			 * Never starts.
			 * @returns Rejects.
			 */
			start: () => Promise.reject(new Error("stub")),
			/**
			 * Never mutes.
			 * @returns Rejects.
			 */
			mute: () => Promise.reject(new Error("stub")),
			/**
			 * Never unmutes.
			 * @returns Rejects.
			 */
			unmute: () => Promise.reject(new Error("stub")),
			/**
			 * Never stops.
			 * @returns Rejects.
			 */
			stop: () => Promise.reject(new Error("stub")),
			/**
			 * Counts disposals.
			 * @returns Resolved.
			 */
			dispose: () => {
				counts.disposed += 1;
				return Promise.resolve();
			},
			outputLevel: {
				/**
				 * Silence.
				 * @returns Zero.
				 */
				current: () => 0,
				/**
				 * Subscribes nothing.
				 * @returns A no-op.
				 */
				subscribe: () => noop,
				/**
				 * Follows nothing.
				 */
				follow: noop,
				/**
				 * Settles nothing.
				 */
				settle: noop,
				/**
				 * Disposes nothing.
				 */
				dispose: noop,
			},
		}),
		/**
		 * Supported.
		 * @returns True.
		 */
		mediaSupported: () => true,
	});
	return { owner, counts };
}

/**
 * An owner over the fake browser.
 * @param browser The fake browser.
 * @returns The owner.
 */
function browserOwner(browser: FakeMediaBrowser): BrowserWorkbenchMediaOwner {
	return createBrowserWorkbenchMediaOwner({
		environment: browser.environment(),
		audioElements: browser.audioElements(),
		/**
		 * Supported.
		 * @returns True.
		 */
		mediaSupported: () => true,
	});
}

test("the media owner delegates leases, commands, readiness, and snapshots to one transport", async () => {
	const browser = new FakeMediaBrowser();
	const transport = new FakeTransport();
	const owner = browserOwner(browser);
	try {
		await owner.attach(transport);
		expect(owner.state()).toEqual({ state: "ready" });
		const started = await owner.start();
		expect(owner.outputLevel()).not.toBeNull();
		await owner.appendText("continue the same voice turn");
		const stopped = await owner.stop();
		expect(started.state).toMatchObject({ phase: "listening" });
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(transport.commands.map((command) => command.command)).toEqual([
			"realtimeStart",
			"realtimeAppendText",
			"realtimeStop",
		]);
		expect(transport.mediaReady).toEqual([true, true, true]);
		expect(browser.audio).toHaveLength(1);
		expect(browser.audio[0]).toMatchObject({ removed: true, srcObject: null });
		browser.assertReleased();
	} finally {
		await owner.dispose();
	}
});

test("replacing or disposing media never disposes an externally-owned transport", async () => {
	const { owner, counts } = stubbedOwner();
	const first = new FakeTransport();
	const second = new FakeTransport();
	await owner.attach(first);
	await owner.attach(second);
	await owner.detach(first);
	expect(counts.disposed).toBe(1);
	expect(first.disposeCount).toBe(0);
	expect(second.disposeCount).toBe(0);
	await owner.dispose();
	expect(counts.disposed).toBe(2);
	expect(second.disposeCount).toBe(0);
});

test("authoritative transport closure revokes media without closing or disposing the transport", async () => {
	const { owner, counts } = stubbedOwner();
	const transport = new FakeTransport();
	await owner.attach(transport);
	transport.emitSocketClosed();
	await Bun.sleep(0);
	expect(owner.state()).toMatchObject({ state: "unavailable", reason: "socket_closed" });
	expect(counts.disposed).toBe(1);
	expect(transport.disposeCount).toBe(0);
	await owner.dispose();
});

test("a transport without a snapshot reports backoff through the transport-only media boundary", async () => {
	const transport = new FakeTransport({
		snapshot: null,
		state: {
			kind: "connection",
			state: "backoff",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			retryAtMs: Date.now() + 1_000,
			reason: "retrying",
		},
	});
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		expect(await owner.attach(transport)).toEqual({
			state: "unavailable",
			reason: "socket_closed",
			message: "retrying",
		});
		expect(owner.state()).toEqual({
			state: "unavailable",
			reason: "socket_closed",
			message: "retrying",
		});
		expect(transport.disposeCount).toBe(0);
	} finally {
		await owner.dispose();
	}
});

test("missing browser media APIs publish unavailable through the transport port", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	const transport = new FakeTransport();
	expect(await owner.attach(transport)).toEqual({
		state: "unavailable",
		reason: "media_api_unavailable",
		message: "This browser cannot install realtime microphone and audio support.",
	});
	expect(transport.mediaReady).toEqual([false]);
	await owner.dispose();
});

test.each([
	["permission", "permission_denied"],
	["sdp", "negotiation_failed"],
] as const)("a %s failure revokes voice readiness before returning", async (failure, reason) => {
	const browser = new FakeMediaBrowser();
	browser.denyPermission = failure === "permission";
	browser.fail = failure === "sdp" ? "createOffer" : undefined;
	const owner = browserOwner(browser);
	const transport = new FakeTransport();
	try {
		await owner.attach(transport);
		const snapshot = await owner.start();
		expect(snapshot.state.phase).toMatch(/error/u);
		expect(owner.state()).toMatchObject({ state: "unavailable", reason });
		expect(transport.mediaReady).toEqual([true, true, false]);
	} finally {
		await owner.dispose();
	}
});

test("forwards realtime publications to subscribers and releases them with each run", async () => {
	const { owner, counts } = stubbedOwner();
	let notifications = 0;
	const release = owner.subscribe(() => {
		notifications += 1;
	});
	await owner.attach(new FakeTransport());
	expect(counts.subscriptions).toBe(1);
	expect(notifications).toBeGreaterThan(0);

	// A browser-originated realtime publication reaches the owner's subscribers.
	const attached = notifications;
	counts.publish();
	expect(notifications).toBe(attached + 1);

	release();
	counts.publish();
	expect(notifications).toBe(attached + 1);

	// Replacing the run releases the previous session's subscription.
	const resumed = owner.subscribe(() => {
		notifications += 1;
	});
	await owner.attach(new FakeTransport());
	expect(counts.releases).toBe(1);
	expect(counts.subscriptions).toBe(2);

	await owner.dispose();
	expect(counts.releases).toBe(2);
	const closed = notifications;
	counts.publish();
	expect(notifications).toBe(closed);
	resumed();
	owner.subscribe(() => {
		notifications += 1;
	});
	counts.publish();
	expect(notifications).toBe(closed);
});

test("voice Stop stays pending while the transport sequences its captured session action", async () => {
	const browser = new FakeMediaBrowser();
	const transport = new FakeTransport();
	const owner = browserOwner(browser);
	let openGate: () => void = noop;
	const gate = new Promise<void>((resolve) => {
		openGate = resolve;
	});
	try {
		await owner.attach(transport);
		await owner.start();
		const sessionHandle = String(transport.lease()?.commandId);
		transport.preparedGate = gate;
		const stopping = owner.stop();
		await transport.preparation;
		expect(transport.prepared).toHaveLength(1);
		expect(transport.prepared[0]).toMatchObject({
			draft: {
				command: "realtimeStop",
				realtimeSessionHandle: sessionHandle,
			},
		});
		expect(transport.prepared[0]?.intent?.capturedThreadLink.state).toBe("executable");
		expect(owner.snapshot()?.state.phase).toBe("stopping");
		expect(transport.commands.map((command) => command.command)).toEqual(["realtimeStart"]);
		openGate();
		expect((await stopping).state).toEqual({ phase: "closed", reason: "stopped" });
		expect(transport.commands.map((command) => command.command)).toEqual([
			"realtimeStart",
			"realtimeStop",
		]);
		browser.assertReleased();
	} finally {
		openGate();
		await owner.dispose();
	}
});

test("a host that declares voice unavailable stops the live browser run", async () => {
	const browser = new FakeMediaBrowser();
	const transport = new FakeTransport();
	const owner = browserOwner(browser);
	try {
		await owner.attach(transport);
		await owner.start();
		expect(owner.snapshot()?.state.phase).toBe("listening");
		transport.emitVoice("unavailable");
		await Bun.sleep(0);
		expect(owner.snapshot()?.state.phase).toBe("closed");
		expect(transport.commands.map((command) => command.command)).toEqual([
			"realtimeStart",
			"realtimeStop",
		]);
		browser.assertReleased();
	} finally {
		await owner.dispose();
	}
});
