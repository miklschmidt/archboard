import { afterEach, expect, test } from "bun:test";

import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import type {
	BrowserCommandLease,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import { createBrowserWorkbenchMediaOwner } from "../index.js";
import { FakeBrowser, restoreFakeBrowsers } from "./support/browser-media-fake.js";

class FakeAudioElement {
	autoplay = false;
	hidden = false;
	srcObject: MediaProvider | null = null;
	removed = false;
	pauseCount = 0;
	play(): Promise<void> {
		return Promise.resolve();
	}
	pause(): void {
		this.pauseCount += 1;
	}
	load(): void {}
	setAttribute(): void {}
	removeAttribute(): void {}
	remove(): void {
		this.removed = true;
	}
}

function workbenchSnapshot(voice: "ready" | "unavailable" = "ready"): BrowserSnapshot {
	return {
		threadLink: { state: "executable", threadId: "thread-media" },
		voice: { state: voice },
	} as unknown as BrowserSnapshot;
}

class FakeTransport implements BrowserWorkbenchTransport {
	readonly mediaReady: boolean[] = [];
	readonly commands: BrowserCommandDraft[] = [];
	private readonly listeners = new Set<() => void>();
	private currentSequence = 1;
	private currentSnapshot = workbenchSnapshot();
	private currentLease: BrowserCommandLease | null = null;
	private currentState: BrowserWorkbenchState = this.readinessState();
	disposeCount = 0;

	private readinessState(): BrowserWorkbenchState {
		return {
			kind: "readiness",
			state: "thread_capable",
			connection: "connected",
			snapshot: this.currentSnapshot,
			sequence: this.currentSequence,
		} as BrowserWorkbenchState;
	}

	attach(): Promise<BrowserWorkbenchState> {
		return Promise.resolve(this.currentState);
	}
	detach(): Promise<void> {
		return Promise.resolve();
	}
	close(): Promise<void> {
		return Promise.resolve();
	}
	refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		return Promise.resolve(this.snapshotMessage());
	}
	setMediaReady(ready: boolean): Promise<BrowserWorkbenchSnapshotMessage> {
		this.mediaReady.push(ready);
		return Promise.resolve(this.snapshotMessage());
	}
	claimLease(): Promise<BrowserCommandLease> {
		const commandId = `media-lease-${this.mediaReady.length + this.commands.length + 1}`;
		this.currentLease = {
			kind: "command_lease",
			commandId,
			paneId: "pane-media",
			childId: "child-media",
			epoch: "epoch-media",
			state: "active",
			expiresAtMs: Date.now() + 60_000,
		} as BrowserCommandLease;
		this.currentSnapshot = { ...this.currentSnapshot, lease: this.currentLease } as BrowserSnapshot;
		this.currentState = this.readinessState();
		this.notify();
		return Promise.resolve(this.currentLease);
	}
	renewLease(): Promise<BrowserCommandLease> {
		if (this.currentLease === null) return Promise.reject(new Error("no lease"));
		return this.claimLease();
	}
	releaseLease(): Promise<BrowserCommandLease | null> {
		return Promise.resolve(this.currentLease);
	}
	accountRead(): Promise<never> {
		return Promise.reject(new Error("not used"));
	}
	command(draft: BrowserCommandDraft): Promise<BrowserWorkbenchCommandResult> {
		this.commands.push(draft);
		const commandId = this.currentLease?.commandId ?? null;
		const value: BrowserWorkbenchCommandResult = {
			kind: "command_result",
			commandId,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.currentSnapshot,
		};
		if (draft.command === "realtimeStart")
			return Promise.resolve({
				...value,
				realtimeSessionHandle: String(commandId),
				realtimeAnswer: {
					sessionId: String(commandId),
					correlationId: String(commandId),
					sdp: "v=0\\r\\na=answer",
				},
			} as BrowserWorkbenchCommandResult);
		return Promise.resolve(value);
	}
	captureCommandTarget(): BrowserWorkbenchCommandTarget {
		if (this.currentLease === null) throw new Error("no lease");
		return {
			...this.currentLease,
			capturedThreadLink: this.currentSnapshot.threadLink,
		};
	}
	snapshot(): BrowserSnapshot {
		return this.currentSnapshot;
	}
	sequence(): number {
		return this.currentSequence;
	}
	lease(): BrowserCommandLease | null {
		return this.currentLease;
	}
	state(): BrowserWorkbenchState {
		return this.currentState;
	}
	capabilities(): never {
		throw new Error("not used");
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	dispose(): Promise<void> {
		this.disposeCount += 1;
		return Promise.resolve();
	}

	emitVoice(state: "ready" | "unavailable"): void {
		this.currentSnapshot = {
			...this.currentSnapshot,
			voice: { state },
		} as BrowserSnapshot;
		this.currentState = this.readinessState();
		this.notify();
	}
	emitSocketClosed(): void {
		this.currentState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "socket closed",
		};
		this.currentSnapshot = null as unknown as BrowserSnapshot;
		this.notify();
	}

	private snapshotMessage(): BrowserWorkbenchSnapshotMessage {
		return {
			kind: "snapshot",
			sequence: this.currentSequence,
			snapshot: this.currentSnapshot,
		};
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function installDocument(audio: FakeAudioElement[]): PropertyDescriptor | undefined {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			createElement: () => {
				const element = new FakeAudioElement();
				audio.push(element);
				return element;
			},
			body: { append: () => undefined },
		},
	});
	return descriptor;
}

function restoreDocument(descriptor: PropertyDescriptor | undefined): void {
	if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
	else Reflect.deleteProperty(globalThis, "document");
}

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
