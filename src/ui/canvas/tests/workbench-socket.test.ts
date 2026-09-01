import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
	BrowserCommandDraft,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchSocket,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import type {
	BrowserCommandLease,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchMediaState } from "../../codex-workbench-media/index.js";
import {
	attachCanvasWorkbenchAfterRegistration,
	createCanvasPaneRegistration,
	createCanvasWorkbenchSocketOwner,
	type CanvasWorkbenchSocketOwner,
} from "../workbench-socket.js";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolveDeferred!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolveDeferred = accept;
	});
	return { promise, resolve: resolveDeferred };
}

class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readyState = 1;
	closeCount = 0;

	send(): void {}

	close(): void {
		this.closeCount += 1;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

const READY_SNAPSHOT = {
	threadLink: { state: "executable", threadId: "thread-canvas" },
	voice: { state: "ready" },
} as unknown as BrowserSnapshot;

function readyState(snapshot: BrowserSnapshot | null = READY_SNAPSHOT): BrowserWorkbenchState {
	if (snapshot === null)
		return {
			kind: "connection",
			state: "backoff",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			retryAtMs: 2_000,
			reason: "The canvas workbench socket could not be attached.",
		};
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot,
		sequence: 1,
	};
}

interface FakeTransportOptions {
	readonly snapshot?: BrowserSnapshot | null;
	readonly beforeAttach?: () => Promise<void>;
}

class FakeTransport implements BrowserWorkbenchTransport {
	readonly attachCount = { value: 0 };
	readonly subscribeCount = { value: 0 };
	disposeCount = 0;
	private readonly listeners = new Set<() => void>();
	private readonly snapshotValue: BrowserSnapshot | null;
	private readonly beforeAttach: (() => Promise<void>) | undefined;
	private currentState: BrowserWorkbenchState;
	private disposed = false;

	constructor(options: FakeTransportOptions = {}) {
		this.snapshotValue = options.snapshot === undefined ? READY_SNAPSHOT : options.snapshot;
		this.beforeAttach = options.beforeAttach;
		this.currentState = readyState(this.snapshotValue);
	}

	async attach(): Promise<BrowserWorkbenchState> {
		this.attachCount.value += 1;
		await this.beforeAttach?.();
		return this.currentState;
	}

	async detach(): Promise<void> {
		this.currentState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The fake transport was detached.",
		};
	}

	close(): Promise<void> {
		return Promise.resolve();
	}

	refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		return Promise.reject(new Error("not used"));
	}

	setMediaReady(): Promise<BrowserWorkbenchSnapshotMessage> {
		return Promise.reject(new Error("not used"));
	}

	claimLease(): Promise<BrowserCommandLease> {
		return Promise.reject(new Error("not used"));
	}

	renewLease(): Promise<BrowserCommandLease> {
		return Promise.reject(new Error("not used"));
	}

	releaseLease(): Promise<BrowserCommandLease | null> {
		return Promise.reject(new Error("not used"));
	}

	accountRead(): Promise<BrowserWorkbenchAccountReadResult> {
		return Promise.reject(new Error("not used"));
	}

	command(_draft: BrowserCommandDraft): Promise<BrowserWorkbenchCommandResult> {
		return Promise.reject(new Error("not used"));
	}

	captureCommandTarget(): BrowserWorkbenchCommandTarget {
		throw new Error("not used");
	}

	snapshot(): BrowserSnapshot | null {
		return this.snapshotValue;
	}

	sequence(): number | null {
		return this.snapshotValue === null ? null : 1;
	}

	lease(): BrowserCommandLease | null {
		return null;
	}

	state(): BrowserWorkbenchState {
		return this.currentState;
	}

	capabilities(): BrowserWorkbenchCapabilities {
		throw new Error("not used");
	}

	subscribe(listener: () => void): () => void {
		this.subscribeCount.value += 1;
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): Promise<void> {
		if (this.disposed) return Promise.resolve();
		this.disposed = true;
		this.disposeCount += 1;
		this.currentState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The fake transport was disposed.",
		};
		return Promise.resolve();
	}

	emit(): void {
		if (this.disposed) return;
		for (const listener of this.listeners) listener();
	}
}

class FakeMedia {
	readonly attached: BrowserWorkbenchTransport[] = [];
	readonly detached: BrowserWorkbenchTransport[] = [];
	readonly notifications: BrowserWorkbenchTransport[] = [];
	disposeCount = 0;
	private readonly unsubscribers = new Map<BrowserWorkbenchTransport, () => void>();
	private readonly firstAttachGate: Deferred<void> | null;
	private readonly firstAttachStarted: Deferred<void> | null;

	constructor(
		firstAttachGate: Deferred<void> | null = null,
		firstAttachStarted: Deferred<void> | null = null,
	) {
		this.firstAttachGate = firstAttachGate;
		this.firstAttachStarted = firstAttachStarted;
	}

	async attach(transport: BrowserWorkbenchTransport): Promise<BrowserWorkbenchMediaState> {
		this.attached.push(transport);
		this.unsubscribers.set(
			transport,
			transport.subscribe(() => this.notifications.push(transport)),
		);
		if (this.attached.length === 1 && this.firstAttachGate !== null) {
			this.firstAttachStarted?.resolve();
			await this.firstAttachGate.promise;
		}
		return { state: "ready" };
	}

	async detach(transport: BrowserWorkbenchTransport): Promise<void> {
		this.detached.push(transport);
		this.unsubscribers.get(transport)?.();
		this.unsubscribers.delete(transport);
	}

	dispose(): Promise<void> {
		this.disposeCount += 1;
		return Promise.resolve();
	}
}

function ownerWith(
	media: FakeMedia,
	transports: FakeTransport[],
	createTransport?: () => FakeTransport,
): CanvasWorkbenchSocketOwner {
	return createCanvasWorkbenchSocketOwner({
		media,
		createTransport: () => {
			const transport = createTransport?.() ?? new FakeTransport();
			transports.push(transport);
			return transport;
		},
	});
}

test("useCanvasSession delegates socket generations to the canvas owner", () => {
	const source = readFileSync(resolve(import.meta.dir, "../useCanvasSession.ts"), "utf8");
	expect(source).toContain("createCanvasWorkbenchSocketOwner({ media: realtime })");
	expect(source).toContain("createCanvasPaneRegistration(socket, generation)");
	expect(source).toMatch(
		/attachCanvasWorkbenchAfterRegistration\(\{[\s\S]*?attach: \(\) => workbenchSockets\s*\.attach\(socket\)/,
	);
	expect(source).toContain("const updatePaneConnectionHealth");
	expect(source).toContain("registration?.acknowledge(true)");
	expect(source).not.toContain("registration?.acknowledge(false)");
	expect(source).toMatch(
		/if \(isCurrentRegistration\) \{[\s\S]*?if \(result\.registered\) registration\?\.acknowledge\(true\);[\s\S]*?updatePaneConnectionHealth\(result\.registered\);/,
	);
	expect(source).toContain("updatePaneConnectionHealth(false)");
	expect(source).toContain("if (!result.registered)");
	expect(source).toContain("paneRegistrationRef.current === registration");
	expect(source).toContain("socketGenerationRef.current !== generation");
	expect(source).toContain("workbenchSockets.detach(socket)");
	expect(source).toContain("workbenchSockets.dispose()");
	expect(source).not.toContain("realtime.attach(");
	expect(source).not.toContain("realtime.detach(");
	expect(source).not.toContain("realtime.dispose(");
});

test("pane registration failure recovers once and stale generations cannot attach", async () => {
	const media = new FakeMedia();
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports);
	const firstSocket = new FakeSocket();
	const currentSocket = new FakeSocket();
	const firstRegistration = createCanvasPaneRegistration(firstSocket, 1);
	const currentRegistration = createCanvasPaneRegistration(currentSocket, 2);
	let currentRegistrationForSocket = firstRegistration;

	const firstAttach = attachCanvasWorkbenchAfterRegistration({
		registration: firstRegistration,
		isCurrent: () => currentRegistrationForSocket === firstRegistration,
		attach: () => owner.attach(firstSocket),
	});
	await Bun.sleep(0);
	expect(transports).toHaveLength(0);
	expect(firstRegistration.acknowledge(false)).toBeFalse();
	await Bun.sleep(0);
	expect(transports).toHaveLength(0);

	currentRegistrationForSocket = currentRegistration;
	expect(firstRegistration.acknowledge(true)).toBeTrue();
	expect(await firstAttach).toBeNull();
	expect(transports).toHaveLength(0);

	const currentAttach = attachCanvasWorkbenchAfterRegistration({
		registration: currentRegistration,
		isCurrent: () => currentRegistrationForSocket === currentRegistration,
		attach: () => owner.attach(currentSocket),
	});
	expect(currentRegistration.acknowledge(false)).toBeFalse();
	await Bun.sleep(0);
	expect(transports).toHaveLength(0);
	expect(currentRegistration.acknowledge(true)).toBeTrue();
	expect(await currentAttach).toMatchObject({ state: "thread_capable" });
	expect(transports).toHaveLength(1);
	expect(transports[0]?.subscribeCount.value).toBe(1);
	expect(firstSocket.closeCount).toBe(0);
	expect(currentSocket.closeCount).toBe(0);
	await owner.dispose();
});

test("the canvas socket owner shares one transport and retires it without closing sockets", async () => {
	const media = new FakeMedia();
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports);
	const firstSocket = new FakeSocket();
	const secondSocket = new FakeSocket();

	await owner.attach(firstSocket);
	await owner.attach(firstSocket);
	expect(transports).toHaveLength(1);
	const firstTransport = transports[0];
	if (firstTransport === undefined) throw new Error("the first transport was not created");
	expect(firstTransport.attachCount.value).toBe(1);
	expect(firstTransport.subscribeCount.value).toBe(1);
	expect(owner.current()?.transport).toBe(firstTransport);
	expect(media.attached[0]).toBe(firstTransport);

	await owner.attach(secondSocket);
	expect(transports).toHaveLength(2);
	const secondTransport = transports[1];
	if (secondTransport === undefined) throw new Error("the second transport was not created");
	expect(firstTransport.disposeCount).toBe(1);
	expect(secondTransport.attachCount.value).toBe(1);
	expect(secondTransport.subscribeCount.value).toBe(1);
	expect(owner.current()?.socket).toBe(secondSocket);
	expect(owner.current()?.transport).toBe(secondTransport);
	expect(media.attached[1]).toBe(secondTransport);
	expect(firstSocket.closeCount).toBe(0);
	expect(secondSocket.closeCount).toBe(0);

	await owner.detach(firstSocket);
	expect(owner.current()?.socket).toBe(secondSocket);
	await owner.detach(secondSocket);
	expect(owner.current()).toBeNull();
	expect(secondTransport.disposeCount).toBe(1);
	expect(secondSocket.closeCount).toBe(0);

	await owner.dispose();
	await owner.dispose();
	expect(media.disposeCount).toBe(1);
});

test("a late old socket generation cannot reach the replacement transport consumer", async () => {
	const firstAttach = deferred<void>();
	const firstMediaAttach = deferred<void>();
	const firstMediaStarted = deferred<void>();
	const media = new FakeMedia(firstMediaAttach, firstMediaStarted);
	const transports: FakeTransport[] = [];
	const owner = ownerWith(
		media,
		transports,
		() =>
			new FakeTransport({
				beforeAttach: transports.length === 0 ? async () => firstAttach.resolve() : undefined,
			}),
	);
	const firstSocket = new FakeSocket();
	const secondSocket = new FakeSocket();
	const firstPromise = owner.attach(firstSocket);
	await firstAttach.promise;

	// The first media attach is held open so replacement happens after its
	// transport listener exists, which is the late-frame race that matters.
	await firstMediaStarted.promise;
	expect(media.attached).toHaveLength(1);
	const secondPromise = owner.attach(secondSocket);
	// The old socket can close while replacement cleanup is in flight. Its stale
	// close must not invalidate the newer attach request.
	await owner.detach(firstSocket);
	await secondPromise;
	const notificationsBeforeLateFrame = media.notifications.length;
	const firstTransport = transports[0];
	if (firstTransport === undefined) throw new Error("the first transport was not created");
	firstTransport.emit();
	expect(media.notifications).toHaveLength(notificationsBeforeLateFrame);
	firstMediaAttach.resolve();
	await firstPromise;

	const secondTransport = transports[1];
	if (secondTransport === undefined) throw new Error("the replacement transport was not created");
	expect(owner.current()?.transport).toBe(secondTransport);
	expect(firstTransport.disposeCount).toBe(1);
	expect(media.attached).toEqual([firstTransport, secondTransport]);
	expect(media.detached[0]).toBe(firstTransport);
	expect(firstSocket.closeCount).toBe(0);
	expect(secondSocket.closeCount).toBe(0);
	await owner.dispose();
});

test("a backoff state stays visible on the one retained transport without a media fallback", async () => {
	const media = new FakeMedia();
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports, () => new FakeTransport({ snapshot: null }));
	const socket = new FakeSocket();

	const state = await owner.attach(socket);
	expect(state).toMatchObject({
		kind: "connection",
		state: "backoff",
		reason: "The canvas workbench socket could not be attached.",
	});
	const transport = transports[0];
	if (transport === undefined) throw new Error("the backoff transport was not created");
	expect(owner.current()?.transport).toBe(transport);
	expect(media.attached).toEqual([transport]);
	await owner.attach(socket);
	expect(transports).toHaveLength(1);
	expect(transport.disposeCount).toBe(0);
	expect(socket.closeCount).toBe(0);
	await owner.dispose();
});
