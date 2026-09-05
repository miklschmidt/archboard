// A fake workbench transport for the media owner tests: it records leases,
// commands and media-ready publications and answers realtime commands the way
// the gateway does.

import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import {
	mediaLease,
	workbenchSnapshot,
	type FixtureVoiceState,
} from "@/ui/codex-workbench-media/tests/support/workbench-fixture";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/**
 * Does nothing.
 */
function noop(): void {
	// Nothing to do.
}

/** One prepared human action. */
interface PreparedCommand {
	readonly draft: BrowserCommandDraft;
	readonly intent: BrowserWorkbenchCommandIntent | undefined;
}

/** Construction options. */
interface FakeTransportOptions {
	readonly snapshot?: BrowserSnapshot | null;
	readonly state?: BrowserWorkbenchState;
}

/** The fake transport. */
class FakeTransport implements BrowserWorkbenchTransport {
	readonly prepared: PreparedCommand[] = [];
	readonly mediaReady: boolean[] = [];
	readonly commands: BrowserCommandDraft[] = [];
	/** Resolved once the first executeCommand prepared its draft. */
	readonly preparation: Promise<void>;
	preparedGate: Promise<void> | null = null;
	disposeCount = 0;
	#resolvePreparation: () => void = noop;
	#listeners = new Set<() => void>();
	#sequence = 1;
	#snapshot: BrowserSnapshot | null;
	#lease: BrowserCommandLease | null = null;
	#state: BrowserWorkbenchState;

	/**
	 * Builds a transport.
	 * @param options The initial snapshot and state.
	 */
	constructor(options: FakeTransportOptions = {}) {
		this.#snapshot = options.snapshot === undefined ? workbenchSnapshot() : options.snapshot;
		this.#state = options.state ?? this.readinessState();
		this.preparation = new Promise<void>((resolve) => {
			this.#resolvePreparation = resolve;
		});
	}

	/**
	 * The readiness state over the current snapshot.
	 * @returns The state.
	 */
	readinessState(): BrowserWorkbenchState {
		if (this.#snapshot === null) {
			return {
				kind: "connection",
				state: "backoff",
				connection: "reconnecting",
				snapshot: null,
				sequence: null,
				retryAtMs: Date.now() + 1_000,
				reason: "retrying",
			};
		}
		return {
			kind: "readiness",
			state: "thread_capable",
			connection: "connected",
			snapshot: this.#snapshot,
			sequence: this.#sequence,
		};
	}

	/**
	 * Attaches nothing.
	 * @returns The state.
	 */
	attach(): Promise<BrowserWorkbenchState> {
		return Promise.resolve(this.#state);
	}

	/**
	 * Detaches nothing.
	 * @returns Resolved.
	 */
	detach(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Closes nothing.
	 * @returns Resolved.
	 */
	close(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Refreshes.
	 * @returns The snapshot message.
	 */
	refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		return Promise.resolve(this.snapshotMessage());
	}

	/**
	 * Records a media-ready publication.
	 * @param ready Whether media is ready.
	 * @returns The snapshot message.
	 */
	setMediaReady(ready: boolean): Promise<BrowserWorkbenchSnapshotMessage> {
		this.mediaReady.push(ready);
		return Promise.resolve(this.snapshotMessage());
	}

	/**
	 * Claims a fresh lease and publishes it.
	 * @returns The lease.
	 */
	claimLease(): Promise<BrowserCommandLease> {
		if (this.#snapshot === null) {
			return Promise.reject(new Error("no snapshot"));
		}
		this.#lease = mediaLease(Date.now() + 60_000);
		this.#snapshot = workbenchSnapshot(this.#snapshot.voice.state, this.#lease);
		this.#state = this.readinessState();
		this.notify();
		return Promise.resolve(this.#lease);
	}

	/**
	 * Renews the lease.
	 * @returns The lease.
	 */
	renewLease(): Promise<BrowserCommandLease> {
		if (this.#lease === null) {
			return Promise.reject(new Error("no lease"));
		}
		return this.claimLease();
	}

	/**
	 * Releases the lease.
	 * @returns The lease.
	 */
	releaseLease(): Promise<BrowserCommandLease | null> {
		return Promise.resolve(this.#lease);
	}

	/**
	 * Not used.
	 * @returns Rejects.
	 */
	accountRead(): Promise<never> {
		return Promise.reject(new Error("not used"));
	}

	/**
	 * Records and answers a command.
	 * @param draft The command.
	 * @returns The result.
	 */
	command(draft: BrowserCommandDraft): Promise<BrowserWorkbenchCommandResult> {
		this.commands.push(draft);
		if (this.#snapshot === null) {
			return Promise.reject(new Error("no snapshot"));
		}
		const commandId = this.#lease?.commandId ?? null;
		const value: BrowserWorkbenchCommandResult = {
			kind: "command_result",
			commandId,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.#snapshot,
		};
		if (draft.command !== "realtimeStart") {
			return Promise.resolve(value);
		}
		const handle = String(commandId);
		return Promise.resolve({
			...value,
			realtimeSessionHandle: handle,
			realtimeAnswer: {
				sessionId: parseRealtimeSessionId(handle),
				correlationId: parseRealtimeCorrelationId(handle),
				sdp: "v=0\r\na=answer",
			},
		});
	}

	/**
	 * Prepares a human action, waits at the gate, claims, then dispatches.
	 * @param draft The command.
	 * @param intent The captured intent.
	 * @returns The result.
	 */
	async executeCommand(
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	): Promise<BrowserWorkbenchCommandResult> {
		this.prepared.push({ draft, intent });
		this.#resolvePreparation();
		if (this.preparedGate !== null) {
			await this.preparedGate;
		}
		await this.claimLease();
		return this.command(draft);
	}

	/**
	 * Captures the current intent.
	 * @returns The intent.
	 */
	captureCommandIntent(): BrowserWorkbenchCommandIntent {
		if (this.#snapshot === null) {
			throw new Error("No action target.");
		}
		return {
			capturedThreadLink: this.#snapshot.threadLink,
			authority: this.#lease === null ? null : this.captureCommandTarget(),
		};
	}

	/**
	 * Captures the current target.
	 * @returns The target.
	 */
	captureCommandTarget(): BrowserWorkbenchCommandTarget {
		if (this.#lease === null || this.#snapshot === null) {
			throw new Error("no target");
		}
		return { ...this.#lease, capturedThreadLink: this.#snapshot.threadLink };
	}

	/**
	 * The snapshot.
	 * @returns The snapshot, or null.
	 */
	snapshot(): BrowserSnapshot | null {
		return this.#snapshot;
	}

	/**
	 * The sequence.
	 * @returns The sequence.
	 */
	sequence(): number {
		return this.#sequence;
	}

	/**
	 * The lease.
	 * @returns The lease, or null.
	 */
	lease(): BrowserCommandLease | null {
		return this.#lease;
	}

	/**
	 * The state.
	 * @returns The state.
	 */
	state(): BrowserWorkbenchState {
		return this.#state;
	}

	/**
	 * Not used.
	 * @throws {Error} Always: the owner never reads capabilities.
	 */
	capabilities(): never {
		throw new Error("not used");
	}

	/**
	 * Subscribes.
	 * @param listener The listener.
	 * @returns The unsubscribe function.
	 */
	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	/**
	 * Counts disposals; the owner must never cause one.
	 * @returns Resolved.
	 */
	dispose(): Promise<void> {
		this.disposeCount += 1;
		return Promise.resolve();
	}

	/**
	 * Publishes a new voice state.
	 * @param state The voice state.
	 */
	emitVoice(state: FixtureVoiceState): void {
		if (this.#snapshot === null) {
			return;
		}
		this.#snapshot = workbenchSnapshot(state, this.#lease);
		this.#state = this.readinessState();
		this.notify();
	}

	/**
	 * Publishes a closed socket.
	 */
	emitSocketClosed(): void {
		this.#state = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "socket closed",
		};
		this.#snapshot = null;
		this.notify();
	}

	/**
	 * The current snapshot as a message.
	 * @returns The message.
	 */
	snapshotMessage(): BrowserWorkbenchSnapshotMessage {
		if (this.#snapshot === null) {
			throw new Error("no snapshot");
		}
		return { kind: "snapshot", sequence: this.#sequence, snapshot: this.#snapshot };
	}

	/**
	 * Tells every subscriber.
	 */
	notify(): void {
		for (const listener of this.#listeners) {
			listener();
		}
	}
}

export { FakeTransport, type FakeTransportOptions };
