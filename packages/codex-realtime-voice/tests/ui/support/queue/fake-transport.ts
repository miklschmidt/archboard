// The transport double of the queue owners: it records what the module sent
// and lets a test publish a new authoritative state, which is the only way
// anything in this module is allowed to change.

import {
	capabilities,
	commandIntent,
	commandResult,
	connected,
	snapshot,
	type CommandAnswer,
} from "#tests/ui/support/queue/support.ts";
import type {
	QueueCommandDraft,
	WorkbenchCommandIntent,
	WorkbenchCommandResult,
	WorkbenchQueueTransportPort,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportState,
} from "#ui/state/queue/transport-port.ts";
import type { DeliveryOutcome } from "#shared/schemas/browser/snapshot.ts";

/** The shape the transport's own error class carries, without that class. */
class FakeTransportError extends Error {
	override readonly name = "BrowserWorkbenchTransportError";
	readonly code: WorkbenchTransportErrorCode;
	readonly outcome: DeliveryOutcome;

	/**
	 * One transport error.
	 * @param code The code.
	 * @param message The message.
	 * @param outcome The outcome the transport could prove.
	 */
	constructor(
		code: WorkbenchTransportErrorCode,
		message: string,
		outcome: DeliveryOutcome = "not_delivered",
	) {
		super(message);
		this.code = code;
		this.outcome = outcome;
	}
}

/** One recorded command. */
interface RecordedCommand {
	readonly draft: QueueCommandDraft;
	readonly target: WorkbenchCommandIntent | undefined;
}

/** How the double behaves. */
interface FakeQueueTransportOptions {
	readonly state?: WorkbenchTransportState;
	readonly capabilities?: WorkbenchTransportCapabilities;
	readonly target?: WorkbenchCommandIntent;
	/** Throw from capture, as a transport without a usable snapshot does. */
	readonly captureFailure?: Error;
	readonly onCommand?: CommandAnswer;
	/** Reject the refresh with this error. */
	readonly refreshFailure?: Error;
	/** The authoritative state a refresh republishes, as the real transport does. */
	readonly refreshPublishes?: WorkbenchTransportState;
}

/** A transport double for the queue's port. */
class FakeQueueTransport {
	readonly commands: RecordedCommand[] = [];
	refreshes = 0;
	private current: WorkbenchTransportState;
	private currentCapabilities: WorkbenchTransportCapabilities;
	private readonly listeners = new Set<() => void>();
	private readonly options: FakeQueueTransportOptions;

	/**
	 * One double.
	 * @param options How it behaves.
	 */
	constructor(options: FakeQueueTransportOptions = {}) {
		this.options = options;
		this.current = options.state ?? connected();
		this.currentCapabilities = options.capabilities ?? capabilities();
	}

	/**
	 * Publish a new authoritative state the way the transport would.
	 * @param state The state.
	 * @param next New capabilities, when they change.
	 */
	publish(state: WorkbenchTransportState, next?: WorkbenchTransportCapabilities): void {
		this.current = state;
		if (next !== undefined) {
			this.currentCapabilities = next;
		}
		for (const listener of this.listeners) {
			listener();
		}
	}

	/**
	 * Follow the double.
	 * @param listener Notified on publish.
	 * @returns Release the subscription.
	 */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * The captured intent, or the configured capture failure.
	 * @returns The intent.
	 */
	captureCommandIntent(): WorkbenchCommandIntent {
		if (this.options.captureFailure !== undefined) {
			throw this.options.captureFailure;
		}
		return this.options.target ?? commandIntent();
	}

	/**
	 * Re-read the snapshot.
	 * @returns A snapshot message.
	 */
	async refresh(): Promise<unknown> {
		this.refreshes += 1;
		if (this.options.refreshPublishes !== undefined) {
			this.publish(this.options.refreshPublishes);
		}
		if (this.options.refreshFailure !== undefined) {
			throw this.options.refreshFailure;
		}
		return { kind: "snapshot", sequence: 1, snapshot: this.current.snapshot };
	}

	/**
	 * Record one command and answer it.
	 * @param draft The draft.
	 * @param target The captured intent.
	 * @returns The configured answer, or a delivered result over the current snapshot.
	 */
	async executeCommand(
		draft: QueueCommandDraft,
		target?: WorkbenchCommandIntent,
	): Promise<WorkbenchCommandResult> {
		this.commands.push({ draft, target });
		if (this.options.onCommand !== undefined) {
			return this.options.onCommand();
		}
		return commandResult(this.current.snapshot ?? snapshot());
	}

	/**
	 * The double as the port the module takes.
	 * @returns The port.
	 */
	asTransport(): WorkbenchQueueTransportPort {
		return {
			/**
			 * The current state.
			 * @returns The state.
			 */
			state: () => this.current,
			/**
			 * The current capabilities.
			 * @returns The capabilities.
			 */
			capabilities: () => this.currentCapabilities,
			subscribe: this.subscribe.bind(this),
			captureCommandIntent: this.captureCommandIntent.bind(this),
			refresh: this.refresh.bind(this),
			executeCommand: this.executeCommand.bind(this),
		};
	}
}

export {
	FakeQueueTransport,
	FakeTransportError,
	type FakeQueueTransportOptions,
	type RecordedCommand,
};
