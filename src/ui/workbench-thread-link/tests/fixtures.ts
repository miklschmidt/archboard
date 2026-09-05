// Fixtures for the thread-link owners: branded identities minted through the
// real authority, snapshots, transport states, and a transport double that
// enforces the captured target the way the real one does, so a caller that
// forgets to pass its captured target is not silently retargeted onto
// whatever the pane moved to.

import { BROWSER_IDLE_SPOKEN_APPROVAL } from "@/shared/codex-browser-model";
import type {
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import {
	THREAD_LINK_MODULE_COMMANDS,
	type ThreadLinkInventory,
	type ThreadLinkHostRecovery,
	type ThreadLinkInventoryRecord,
	type ThreadLinkPaneCapture,
	type ThreadLinkRecoveryIntent,
	type ThreadLinkRecoveryTarget,
} from "@/ui/workbench-thread-link/contracts";
import type {
	ThreadLinkCommandDraft,
	ThreadLinkTransportPort,
	WorkbenchAccountReadResult,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportState,
} from "@/ui/workbench-thread-link/transport-port";

const authorities = createIdentityAuthorities();
const { decoder, issuer, validator } = authorities.identity;

const threadA = decoder.adoptThreadId("thread-a");
const threadB = decoder.adoptThreadId("thread-b");
const threadC = decoder.adoptThreadId("thread-c");
const loginA = decoder.adoptLoginId("login-a");
const loginB = decoder.adoptLoginId("login-b");
const childA = validator.childId;
const epochA = validator.epoch;
const epochB = issuer.mintChildEpoch();
const commandA = issuer.mintBrowserCommandId();

/**
 * An executable link to one thread.
 * @param threadId The thread.
 * @returns The link.
 */
function executableLink(threadId: ThreadId = threadA): BrowserThreadLink {
	return {
		kind: "thread_link",
		state: "executable",
		childId: childA,
		epoch: epochA,
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

const unboundLink: BrowserThreadLink = {
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
};

/**
 * An inspect-only link to one thread.
 * @param reason The host's reason.
 * @param threadId The thread.
 * @returns The link.
 */
function inspectOnlyLink(reason: string, threadId: ThreadId = threadA): BrowserThreadLink {
	return {
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason,
	};
}

const unknownCandidates: ThreadLinkInventory = {
	kind: "thread_candidates",
	state: "unknown",
	records: [],
	truncated: false,
	reason: null,
};

/**
 * One listed inventory arm, exactly as the workbench snapshot publishes it.
 * @param records The records.
 * @param truncated Whether the host published only the first page.
 * @returns The inventory.
 */
function listed(
	records: readonly ThreadLinkInventoryRecord[],
	truncated = false,
): ThreadLinkInventory {
	return {
		kind: "thread_candidates",
		state: "listed",
		records: [...records],
		truncated,
		reason: null,
	};
}

/**
 * One published snapshot, unbound by default.
 * @param overrides Fields that differ.
 * @returns The snapshot.
 */
function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: unboundLink,
		threadCandidates: unknownCandidates,
		timeline: null,
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: null,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		...overrides,
	};
}

/**
 * A connected transport state carrying the snapshot's own readiness.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value: BrowserSnapshot = snapshot()): WorkbenchTransportState {
	return {
		kind: "readiness",
		state: value.readiness.state,
		connection: "connected",
		snapshot: value,
		sequence: 1,
	};
}

/** What the capabilities fixture may override. */
interface CapabilitiesSeed {
	readonly connected?: boolean;
	readonly canReadAccount?: boolean;
	/** The commands the transport accepts; every module command by default. */
	readonly supported?: readonly WorkbenchCommandName[];
}

/**
 * Transport capabilities.
 * @param seed Fields that differ.
 * @returns The capabilities.
 */
function capabilities(seed: CapabilitiesSeed = {}): WorkbenchTransportCapabilities {
	const supported = new Set<WorkbenchCommandName>(seed.supported ?? THREAD_LINK_MODULE_COMMANDS);
	return Object.freeze({
		connected: seed.connected ?? true,
		canReadAccount: seed.canReadAccount ?? true,
		/**
		 * Whether the host accepts a command.
		 * @param command The command.
		 * @returns True when the fixture lists it.
		 */
		supportsCommand: (command: WorkbenchCommandName) => supported.has(command),
	});
}

/**
 * One candidate record.
 * @param overrides Fields that differ from an executable, loaded, idle record.
 * @returns The record.
 */
function record(overrides: Partial<ThreadLinkInventoryRecord> = {}): ThreadLinkInventoryRecord {
	return {
		kind: "thread_candidate",
		selectionId: "selection-a",
		threadId: threadA,
		state: "executable",
		reason: null,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		...overrides,
	};
}

/** One recorded command. */
interface RecordedCommand {
	readonly draft: ThreadLinkCommandDraft;
	readonly target: WorkbenchCommandTarget | undefined;
}

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

/** A transport double that enforces the captured target the way the real one does. */
class FakeTransport implements ThreadLinkTransportPort {
	readonly commands: RecordedCommand[] = [];
	refreshes = 0;
	accountReads = 0;
	leased = true;
	epoch = epochA;
	readonly paneId = "pane-a";
	nextResult: WorkbenchCommandResult | null = null;
	nextError: Error | null = null;
	/** Runs after the command is recorded and before its captured target is checked. */
	beforeCommand: (() => void) | null = null;
	/** Held until the test resolves it, so two commands can overlap. */
	gate: Promise<void> | null = null;
	private current: WorkbenchTransportState;
	private caps: WorkbenchTransportCapabilities;
	private readonly listeners = new Set<() => void>();

	/**
	 * One double.
	 * @param state The initial state.
	 * @param caps The initial capabilities.
	 */
	constructor(state: WorkbenchTransportState = connected(), caps = capabilities()) {
		this.current = state;
		this.caps = caps;
		// The real transport is a closure object, so callers may pass its members
		// around unbound. Bind here so the double behaves the same way.
		this.state = this.state.bind(this);
		this.capabilities = this.capabilities.bind(this);
		this.captureCommandIntent = this.captureCommandIntent.bind(this);
		this.executeCommand = this.executeCommand.bind(this);
		this.refresh = this.refresh.bind(this);
		this.accountRead = this.accountRead.bind(this);
	}

	/**
	 * Publish a new authoritative state the way the transport would.
	 * @param state The state.
	 * @param caps New capabilities, when they change.
	 */
	publish(state: WorkbenchTransportState, caps: WorkbenchTransportCapabilities = this.caps): void {
		this.current = state;
		this.caps = caps;
		for (const listener of this.listeners) {
			listener();
		}
	}

	/**
	 * A delivered result over the current snapshot.
	 * @param overrides Fields that differ.
	 * @returns The result.
	 */
	result(overrides: Partial<WorkbenchCommandResult> = {}): WorkbenchCommandResult {
		return {
			kind: "command_result",
			commandId: commandA,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.current.snapshot ?? snapshot(),
			...overrides,
		};
	}

	/**
	 * The exact lease authority as the pane stands now.
	 * @returns The target.
	 * @throws {FakeTransportError} Without a lease.
	 */
	captureCommandTarget(): WorkbenchCommandTarget {
		if (!this.leased) {
			throw new FakeTransportError("lease_required", "A browser command lease is required.");
		}
		const link = this.current.snapshot?.threadLink ?? unboundLink;
		return Object.freeze({
			commandId: commandA,
			paneId: this.paneId,
			childId: childA,
			epoch: this.epoch,
			capturedThreadLink: Object.freeze({ ...link }),
		});
	}

	/**
	 * The captured intent, with authority only while leased.
	 * @returns The intent.
	 */
	captureCommandIntent(): WorkbenchCommandIntent {
		return {
			capturedThreadLink: this.current.snapshot?.threadLink ?? unboundLink,
			authority: this.leased ? this.captureCommandTarget() : null,
		};
	}

	/**
	 * Whether the pane moved since a target was captured.
	 * @param target The captured target.
	 * @returns True when the target no longer matches the pane.
	 */
	private moved(target: WorkbenchCommandTarget): boolean {
		const now = this.captureCommandTarget();
		return (
			now.commandId !== target.commandId ||
			now.paneId !== target.paneId ||
			now.childId !== target.childId ||
			now.epoch !== target.epoch ||
			now.capturedThreadLink.state !== target.capturedThreadLink.state ||
			now.capturedThreadLink.threadId !== target.capturedThreadLink.threadId
		);
	}

	/**
	 * Record one command, then answer it against the target it captured.
	 * @param draft The draft.
	 * @param intent The captured intent.
	 * @returns The next result.
	 */
	async executeCommand(
		draft: ThreadLinkCommandDraft,
		intent?: WorkbenchCommandIntent,
	): Promise<WorkbenchCommandResult> {
		this.leased = true;
		const target = intent?.authority ?? this.captureCommandTarget();
		this.commands.push({ draft, target });
		const gate = this.gate;
		this.beforeCommand?.();
		if (gate !== null) {
			await gate;
		}
		return this.answer(target);
	}

	/**
	 * Answer a recorded command against the target it captured.
	 * @param target The captured target.
	 * @returns The next result.
	 * @throws {Error} When the pane moved, or the next error was configured.
	 */
	private answer(target: WorkbenchCommandTarget): WorkbenchCommandResult {
		if (this.moved(target)) {
			throw new FakeTransportError(
				"link_changed",
				"The workbench target changed since this command was captured.",
			);
		}
		if (this.nextError !== null) {
			throw this.nextError;
		}
		return this.nextResult ?? this.result();
	}

	/**
	 * Run one hook after the next command is recorded and before it is answered.
	 * @param hook The hook.
	 */
	runBeforeCommand(hook: () => void): void {
		this.beforeCommand = hook;
	}

	/**
	 * The capabilities.
	 * @returns The capabilities.
	 */
	capabilities(): WorkbenchTransportCapabilities {
		return this.caps;
	}

	/**
	 * The current state.
	 * @returns The state.
	 */
	state(): WorkbenchTransportState {
		return this.current;
	}

	/**
	 * The current snapshot.
	 * @returns The snapshot, or null.
	 */
	snapshot(): BrowserSnapshot | null {
		return this.current.snapshot;
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
	 * Re-read the snapshot.
	 * @returns A snapshot message.
	 */
	async refresh(): Promise<unknown> {
		this.refreshes += 1;
		return { kind: "snapshot", sequence: 1, snapshot: this.current.snapshot ?? snapshot() };
	}

	/**
	 * Re-read the account.
	 * @returns A delivered read.
	 */
	async accountRead(): Promise<WorkbenchAccountReadResult> {
		this.accountReads += 1;
		return {
			kind: "account_read",
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.current.snapshot ?? snapshot(),
		};
	}
}

/**
 * The pane one action is captured against.
 * @param transport The double.
 * @param hostRecoveryIntents The host intents this pane has an owner for.
 * @returns The capture.
 */
function pane(
	transport: FakeTransport,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [],
): ThreadLinkPaneCapture {
	return { paneId: transport.paneId, transport, hostRecoveryIntents };
}

/**
 * A pane capture over one double, read once per action.
 * @param transport The double.
 * @param hostRecoveryIntents The host intents this pane has an owner for.
 * @returns The capture function.
 */
function capturing(
	transport: FakeTransport,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [],
): () => ThreadLinkPaneCapture {
	return () => pane(transport, hostRecoveryIntents);
}

/**
 * A host recovery owner for one pane.
 * @param paneId The pane the owner answers for.
 * @param recover What the owner runs.
 * @returns The capture function.
 */
function hostOwner(
	paneId: string,
	recover: (target: ThreadLinkRecoveryTarget) => Promise<void>,
): (target: ThreadLinkRecoveryTarget) => ThreadLinkHostRecovery {
	return (target) => ({
		paneId,
		intent: target.intent,
		/**
		 * Run the owner's recovery for this target.
		 * @returns When it completes.
		 */
		recover: () => recover(target),
	});
}

export {
	FakeTransport,
	FakeTransportError,
	capabilities,
	capturing,
	hostOwner,
	childA,
	commandA,
	connected,
	epochA,
	epochB,
	executableLink,
	inspectOnlyLink,
	listed,
	loginA,
	loginB,
	pane,
	record,
	snapshot,
	threadA,
	threadB,
	threadC,
	unboundLink,
	unknownCandidates,
	type RecordedCommand,
};
