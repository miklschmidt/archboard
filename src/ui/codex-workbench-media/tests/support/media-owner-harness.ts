import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../../workbench-transport/index.js";
import type {
	BrowserCommandLease,
	BrowserSnapshot,
} from "../../../../shared/codex-browser-model/index.js";

// The shared harness for the media-owner owners: one fake transport that
// records leases, commands and media-ready publications, plus the minimal
// document the owner needs to attach remote audio. Extracted so a second owner
// file can use it without either file passing the 500-line cap.

export class FakeAudioElement {
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

export class FakeTransport implements BrowserWorkbenchTransport {
	readonly prepared: {
		draft: BrowserCommandDraft;
		intent: BrowserWorkbenchCommandIntent | undefined;
	}[] = [];
	preparedGate: Promise<void> | null = null;
	readonly preparation = Promise.withResolvers<void>();
	captureCommandIntent(): BrowserWorkbenchCommandIntent {
		if (this.currentSnapshot === null) throw new Error("No action target.");
		return {
			capturedThreadLink: this.currentSnapshot.threadLink,
			authority: this.currentLease === null ? null : this.captureCommandTarget(),
		};
	}
	async executeCommand(
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	): Promise<BrowserWorkbenchCommandResult> {
		this.prepared.push({ draft, intent });
		this.preparation.resolve();
		if (this.preparedGate !== null) await this.preparedGate;
		await this.claimLease();
		return this.command(draft);
	}
	readonly mediaReady: boolean[] = [];
	readonly commands: BrowserCommandDraft[] = [];
	private readonly listeners = new Set<() => void>();
	private currentSequence = 1;
	private currentSnapshot: BrowserSnapshot | null;
	private currentLease: BrowserCommandLease | null = null;
	private currentState: BrowserWorkbenchState;
	disposeCount = 0;

	constructor(
		options: {
			readonly snapshot?: BrowserSnapshot | null;
			readonly state?: BrowserWorkbenchState;
		} = {},
	) {
		this.currentSnapshot = options.snapshot === undefined ? workbenchSnapshot() : options.snapshot;
		this.currentState = options.state ?? this.readinessState();
	}

	private readinessState(): BrowserWorkbenchState {
		if (this.currentSnapshot === null)
			return {
				kind: "connection",
				state: "backoff",
				connection: "reconnecting",
				snapshot: null,
				sequence: null,
				retryAtMs: Date.now() + 1_000,
				reason: "retrying",
			};
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
		if (this.currentSnapshot === null) return Promise.reject(new Error("no snapshot"));
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
		if (this.currentSnapshot === null) return Promise.reject(new Error("no snapshot"));
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
		if (this.currentLease === null || this.currentSnapshot === null) throw new Error("no target");
		return {
			...this.currentLease,
			capturedThreadLink: this.currentSnapshot.threadLink,
		};
	}
	snapshot(): BrowserSnapshot | null {
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
		if (this.currentSnapshot === null) return;
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
		if (this.currentSnapshot === null) throw new Error("no snapshot");
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

export function installDocument(audio: FakeAudioElement[]): PropertyDescriptor | undefined {
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

export function restoreDocument(descriptor: PropertyDescriptor | undefined): void {
	if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
	else Reflect.deleteProperty(globalThis, "document");
}
