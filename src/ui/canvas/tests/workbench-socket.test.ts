import { expect, test } from "bun:test";

import type {
	PaneSocket,
	WorkbenchMediaPort,
	WorkbenchTransportPort,
	WorkbenchTransportState,
} from "@/ui/canvas/workbench-port";
import {
	attachCanvasWorkbenchAfterRegistration,
	createCanvasPaneRegistration,
	createCanvasWorkbenchSocketOwner,
	type CanvasWorkbenchSocketOwner,
} from "@/ui/canvas/workbench-socket";

/** A promise settled from outside. */
interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

/** A resolver that has not been captured yet. */
function unresolved(): void {
	// Replaced by the promise's own resolver before anyone can call it.
}

/**
 * A promise and its resolver.
 * @returns The deferred.
 */
function deferred<T>(): Deferred<T> {
	let resolveDeferred: (value: T) => void = unresolved;
	const promise = new Promise<T>((accept) => {
		resolveDeferred = accept;
	});
	return { promise, resolve: resolveDeferred };
}

/** A socket that counts its closes. */
class FakeSocket extends EventTarget implements PaneSocket {
	readyState = 1;
	closeCount = 0;

	/** Nothing goes anywhere. */
	send(): void {
		// A fake socket has no server.
	}

	/** Close it, announcing the close. */
	close(): void {
		this.closeCount += 1;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

const READY_SNAPSHOT: unknown = {
	threadLink: { state: "executable", threadId: "thread-canvas" },
	voice: { state: "ready" },
};

/**
 * The state a fake transport reports once attached.
 * @param snapshot The snapshot it holds, or null for a backoff.
 * @returns The state.
 */
function readyState(snapshot: unknown): WorkbenchTransportState {
	if (snapshot === null) {
		return {
			kind: "connection",
			state: "backoff",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			reason: "The canvas workbench socket could not be attached.",
		};
	}
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot,
		sequence: 1,
	};
}

/** How a fake transport behaves. */
interface FakeTransportOptions {
	readonly snapshot?: unknown;
	readonly beforeAttach?: () => Promise<void>;
}

/** A transport that records what happens to it. */
class FakeTransport implements WorkbenchTransportPort {
	readonly attachCount = { value: 0 };
	readonly subscribeCount = { value: 0 };
	disposeCount = 0;
	readonly #listeners = new Set<() => void>();
	readonly #beforeAttach: (() => Promise<void>) | undefined;
	#currentState: WorkbenchTransportState;
	#disposed = false;

	/**
	 * Create the transport.
	 * @param options How it behaves.
	 */
	constructor(options: FakeTransportOptions = {}) {
		this.#beforeAttach = options.beforeAttach;
		this.#currentState = readyState(
			options.snapshot === undefined ? READY_SNAPSHOT : options.snapshot,
		);
	}

	/**
	 * Attach to a socket.
	 * @returns The state.
	 */
	async attach(): Promise<WorkbenchTransportState> {
		this.attachCount.value += 1;
		await this.#beforeAttach?.();
		return this.#currentState;
	}

	/**
	 * The state now.
	 * @returns The state.
	 */
	state(): WorkbenchTransportState {
		return this.#currentState;
	}

	/**
	 * Hear about changes.
	 * @param listener What to call.
	 * @returns Stops listening.
	 */
	subscribe(listener: () => void): () => void {
		this.subscribeCount.value += 1;
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Dispose once.
	 * @returns Settles at once.
	 */
	dispose(): Promise<void> {
		if (!this.#disposed) {
			this.#disposed = true;
			this.disposeCount += 1;
			this.#currentState = {
				kind: "connection",
				state: "stopped",
				connection: "stopped",
				snapshot: null,
				sequence: null,
				reason: "The fake transport was disposed.",
			};
		}
		return Promise.resolve();
	}

	/** Tell every listener something changed. */
	emit(): void {
		if (this.#disposed) {
			return;
		}
		for (const listener of this.#listeners) {
			listener();
		}
	}
}

/** A media owner that records which transports it saw. */
class FakeMedia implements WorkbenchMediaPort<FakeTransport> {
	readonly attached: FakeTransport[] = [];
	readonly detached: FakeTransport[] = [];
	readonly notifications: FakeTransport[] = [];
	disposeCount = 0;
	readonly #unsubscribers = new Map<FakeTransport, () => void>();
	readonly #firstAttachGate: Deferred<void> | null;
	readonly #firstAttachStarted: Deferred<void> | null;

	/**
	 * Create the media owner.
	 * @param firstAttachGate Holds the first attach open until resolved.
	 * @param firstAttachStarted Resolved when the first attach begins waiting.
	 */
	constructor(
		firstAttachGate: Deferred<void> | null = null,
		firstAttachStarted: Deferred<void> | null = null,
	) {
		this.#firstAttachGate = firstAttachGate;
		this.#firstAttachStarted = firstAttachStarted;
	}

	/**
	 * Follow a transport.
	 * @param transport The transport.
	 * @returns A ready state.
	 */
	async attach(transport: FakeTransport): Promise<{ state: "ready" }> {
		this.attached.push(transport);
		this.#unsubscribers.set(
			transport,
			transport.subscribe(() => this.notifications.push(transport)),
		);
		if (this.attached.length === 1 && this.#firstAttachGate !== null) {
			this.#firstAttachStarted?.resolve();
			await this.#firstAttachGate.promise;
		}
		return { state: "ready" };
	}

	/**
	 * Stop following a transport.
	 * @param transport The transport.
	 */
	async detach(transport: FakeTransport): Promise<void> {
		this.detached.push(transport);
		this.#unsubscribers.get(transport)?.();
		this.#unsubscribers.delete(transport);
		await Promise.resolve();
	}

	/**
	 * Dispose.
	 * @returns Settles at once.
	 */
	dispose(): Promise<void> {
		this.disposeCount += 1;
		return Promise.resolve();
	}
}

/**
 * An owner over a media fake, recording every transport it creates.
 * @param media The media owner.
 * @param transports Where created transports go.
 * @param createTransport How to make one; a plain fake by default.
 * @returns The owner.
 */
function ownerWith(
	media: FakeMedia,
	transports: FakeTransport[],
	createTransport?: () => FakeTransport,
): CanvasWorkbenchSocketOwner<FakeTransport> {
	/**
	 * Make a transport and remember it.
	 * @returns The transport.
	 */
	function record(): FakeTransport {
		const transport = createTransport?.() ?? new FakeTransport();
		transports.push(transport);
		return transport;
	}
	return createCanvasWorkbenchSocketOwner<FakeTransport>({ media, createTransport: record });
}

/**
 * An attach released only after registration, on the owner's socket.
 * @param owner The owner.
 * @param socket The socket.
 * @param registration Its registration.
 * @param isCurrent Whether the registration is still the pane's.
 * @returns The attached state, or null.
 */
function attachAfter(
	owner: CanvasWorkbenchSocketOwner<FakeTransport>,
	socket: FakeSocket,
	registration: ReturnType<typeof createCanvasPaneRegistration>,
	isCurrent: () => boolean,
): Promise<WorkbenchTransportState | null> {
	/**
	 * Attach the owner to the socket.
	 * @returns The state.
	 */
	function attach(): Promise<WorkbenchTransportState> {
		return owner.attach(socket);
	}
	return attachCanvasWorkbenchAfterRegistration({ registration, isCurrent, attach });
}

test("pane registration failure recovers once and stale generations cannot attach", async () => {
	const media = new FakeMedia();
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports);
	const firstSocket = new FakeSocket();
	const currentSocket = new FakeSocket();
	const firstRegistration = createCanvasPaneRegistration(firstSocket, 1);
	const currentRegistration = createCanvasPaneRegistration(currentSocket, 2);
	let currentRegistrationForSocket = firstRegistration;

	const firstAttach = attachAfter(
		owner,
		firstSocket,
		firstRegistration,
		() => currentRegistrationForSocket === firstRegistration,
	);
	await Bun.sleep(0);
	expect(transports).toHaveLength(0);
	expect(firstRegistration.acknowledge(false)).toBeFalse();
	await Bun.sleep(0);
	expect(transports).toHaveLength(0);

	currentRegistrationForSocket = currentRegistration;
	expect(firstRegistration.acknowledge(true)).toBeTrue();
	expect(await firstAttach).toBeNull();
	expect(transports).toHaveLength(0);

	const currentAttach = attachAfter(
		owner,
		currentSocket,
		currentRegistration,
		() => currentRegistrationForSocket === currentRegistration,
	);
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
	const firstTransport = transportAt(transports, 0);
	expect(firstTransport.attachCount.value).toBe(1);
	expect(firstTransport.subscribeCount.value).toBe(1);
	expect(owner.current()?.transport).toBe(firstTransport);
	expect(media.attached[0]).toBe(firstTransport);

	await owner.attach(secondSocket);
	expect(transports).toHaveLength(2);
	const secondTransport = transportAt(transports, 1);
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

/**
 * The transport made at an index, which the test knows exists.
 * @param transports The transports made so far.
 * @param index Which one.
 * @returns The transport.
 */
function transportAt(transports: FakeTransport[], index: number): FakeTransport {
	const transport = transports[index];
	if (transport === undefined) {
		throw new Error(`transport ${index} was not created`);
	}
	return transport;
}

/**
 * A transport factory whose first transport signals when its attach begins.
 * @param transports The transports made so far.
 * @param firstAttach Resolved when the first transport starts attaching.
 * @returns The factory.
 */
function firstAttachSignalling(
	transports: FakeTransport[],
	firstAttach: Deferred<void>,
): () => FakeTransport {
	/** Signal, then let the attach continue. */
	async function beforeAttach(): Promise<void> {
		firstAttach.resolve();
		await Promise.resolve();
	}
	return () =>
		transports.length === 0 ? new FakeTransport({ beforeAttach }) : new FakeTransport();
}

test("a late old socket generation cannot reach the replacement transport consumer", async () => {
	const firstAttach = deferred<void>();
	const firstMediaAttach = deferred<void>();
	const firstMediaStarted = deferred<void>();
	const media = new FakeMedia(firstMediaAttach, firstMediaStarted);
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports, firstAttachSignalling(transports, firstAttach));
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
	const firstTransport = transportAt(transports, 0);
	firstTransport.emit();
	expect(media.notifications).toHaveLength(notificationsBeforeLateFrame);
	firstMediaAttach.resolve();
	await firstPromise;

	const secondTransport = transportAt(transports, 1);
	expect(owner.current()?.transport).toBe(secondTransport);
	expect(firstTransport.disposeCount).toBe(1);
	expect(media.attached).toEqual([firstTransport, secondTransport]);
	expect(media.detached[0]).toBe(firstTransport);
	expect(firstSocket.closeCount).toBe(0);
	expect(secondSocket.closeCount).toBe(0);
	await owner.dispose();
});

/**
 * A transport that reports a backoff.
 * @returns The transport.
 */
function backoffTransport(): FakeTransport {
	return new FakeTransport({ snapshot: null });
}

test("a backoff state stays visible on the one retained transport without a media fallback", async () => {
	const media = new FakeMedia();
	const transports: FakeTransport[] = [];
	const owner = ownerWith(media, transports, backoffTransport);
	const socket = new FakeSocket();

	const state = await owner.attach(socket);
	expect(state).toMatchObject({
		kind: "connection",
		state: "backoff",
		reason: "The canvas workbench socket could not be attached.",
	});
	const transport = transportAt(transports, 0);
	expect(owner.current()?.transport).toBe(transport);
	expect(media.attached).toEqual([transport]);
	await owner.attach(socket);
	expect(transports).toHaveLength(1);
	expect(transport.disposeCount).toBe(0);
	expect(socket.closeCount).toBe(0);
	await owner.dispose();
});
