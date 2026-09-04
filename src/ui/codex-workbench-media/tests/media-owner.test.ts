import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createBrowserWorkbenchMediaOwner } from "../index.js";
import { FakeBrowser, restoreFakeBrowsers } from "./support/browser-media-fake.js";
import {
	FakeTransport,
	installDocument,
	restoreDocument,
	type FakeAudioElement,
} from "./support/media-owner-harness.js";

const NO_PUBLICATION = (): void => undefined;

afterEach(restoreFakeBrowsers);

test("the media owner delegates leases, commands, readiness, and snapshots to one transport", async () => {
	const environment = new FakeBrowser();
	const audio: FakeAudioElement[] = [];
	const documentDescriptor = installDocument(audio);
	const transport = new FakeTransport();
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		await owner.attach(transport);
		expect(owner.state()).toEqual({ state: "ready" });
		const started = await owner.start();
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
		expect(audio).toHaveLength(1);
		expect(audio[0]).toMatchObject({ removed: true, srcObject: null });
		environment.assertReleased();
	} finally {
		await owner.dispose();
		restoreDocument(documentDescriptor);
	}
});

test("replacing or disposing media never disposes an externally-owned transport", async () => {
	let disposedSessions = 0;
	const owner = createBrowserWorkbenchMediaOwner({
		createMediaSession: () =>
			({
				getSnapshot: () => null,
				subscribe: () => () => undefined,
				start: async () => ({}) as never,
				stop: async () => ({}) as never,
				appendText: async () => ({}) as never,
				dispose: async () => {
					disposedSessions += 1;
				},
			}) as never,
	});
	const first = new FakeTransport();
	const second = new FakeTransport();
	await owner.attach(first);
	await owner.attach(second);
	await owner.detach(first);
	expect(disposedSessions).toBe(1);
	expect(first.disposeCount).toBe(0);
	expect(second.disposeCount).toBe(0);
	await owner.dispose();
	expect(disposedSessions).toBe(2);
	expect(second.disposeCount).toBe(0);
});

test("authoritative transport closure revokes media without closing or disposing the transport", async () => {
	let disposedSessions = 0;
	const transport = new FakeTransport();
	const owner = createBrowserWorkbenchMediaOwner({
		createMediaSession: () =>
			({
				getSnapshot: () => null,
				subscribe: () => () => undefined,
				start: async () => ({}) as never,
				stop: async () => ({}) as never,
				appendText: async () => ({}) as never,
				dispose: async () => {
					disposedSessions += 1;
				},
			}) as never,
	});
	await owner.attach(transport);
	transport.emitSocketClosed();
	await Bun.sleep(0);
	expect(owner.state()).toMatchObject({ state: "unavailable", reason: "socket_closed" });
	expect(disposedSessions).toBe(1);
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

test("the media owner source has no raw-socket or transport-construction fallback", () => {
	const source = readFileSync(resolve(import.meta.dir, "../lib/media-owner.ts"), "utf8");
	expect(source).toContain(
		"readonly attach: (transport: BrowserWorkbenchTransport) => Promise<BrowserWorkbenchMediaState>",
	);
	expect(source).not.toContain("BrowserWorkbenchSocket");
	expect(source).not.toContain("createBrowserWorkbenchTransport");
	expect(source).not.toContain("attach_failed");
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

test("permission and SDP failures revoke voice readiness before returning", async () => {
	for (const failure of ["permission", "sdp"] as const) {
		const environment = new FakeBrowser();
		const documentDescriptor = installDocument([]);
		if (failure === "permission")
			Object.defineProperty(environment, "getUserMedia", {
				configurable: true,
				value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
			});
		else environment.fail = "createOffer";
		const owner = createBrowserWorkbenchMediaOwner();
		const transport = new FakeTransport();
		try {
			await owner.attach(transport);
			const snapshot = await owner.start();
			expect(snapshot.state.phase).toMatch(/error/);
			expect(owner.state()).toMatchObject({
				state: "unavailable",
				reason: failure === "permission" ? "permission_denied" : "negotiation_failed",
			});
			expect(transport.mediaReady).toEqual([true, true, false]);
		} finally {
			await owner.dispose();
			environment.restore();
			restoreDocument(documentDescriptor);
		}
	}
});

test("forwards realtime publications to subscribers and releases them with each run", async () => {
	let publish: () => void = NO_PUBLICATION;
	let innerSubscriptions = 0;
	let innerReleases = 0;
	const owner = createBrowserWorkbenchMediaOwner({
		createMediaSession: () =>
			({
				getSnapshot: () => null,
				subscribe: (listener: () => void) => {
					innerSubscriptions += 1;
					publish = listener;
					return () => {
						innerReleases += 1;
					};
				},
				start: async () => ({}) as never,
				stop: async () => ({}) as never,
				appendText: async () => ({}) as never,
				dispose: async () => undefined,
			}) as never,
	});
	let notifications = 0;
	const release = owner.subscribe(() => {
		notifications += 1;
	});
	const first = new FakeTransport();
	await owner.attach(first);
	expect(innerSubscriptions).toBe(1);
	expect(notifications).toBeGreaterThan(0);

	// A browser-originated realtime publication — a lost microphone, a dropped
	// ICE connection, an in-start phase — reaches the owner's subscribers.
	const attached = notifications;
	publish();
	expect(notifications).toBe(attached + 1);

	release();
	publish();
	expect(notifications).toBe(attached + 1);

	// Replacing the run releases the previous session's subscription.
	const resumed = owner.subscribe(() => {
		notifications += 1;
	});
	await owner.attach(new FakeTransport());
	expect(innerReleases).toBe(1);
	expect(innerSubscriptions).toBe(2);

	await owner.dispose();
	expect(innerReleases).toBe(2);
	const closed = notifications;
	publish();
	expect(notifications).toBe(closed);
	resumed();
	// A disposed owner accepts no new subscriber.
	owner.subscribe(() => {
		notifications += 1;
	});
	publish();
	expect(notifications).toBe(closed);
});
