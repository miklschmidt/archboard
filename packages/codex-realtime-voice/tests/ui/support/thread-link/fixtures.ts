// Fixtures for the thread-link owners: branded identities minted through the
// real authority, snapshots, transport states, and a transport double that
// enforces the captured target the way the real one does, so a caller that
// forgets to pass its captured target is not silently retargeted onto
// whatever the pane moved to.

import { BROWSER_IDLE_SPOKEN_APPROVAL } from "#shared/schemas/browser/spoken-approval.ts";
import type { BrowserSnapshot, BrowserThreadLink, DeliveryOutcome } from "#shared/schemas/browser/snapshot.ts";
import { createIdentityAuthorities, type ThreadId } from "@archboard/codex-app-server/identity";
import {
	THREAD_LINK_MODULE_COMMANDS,
	type ThreadLinkPaneCapture,
} from "#ui/state/thread-link/contracts.ts";
import type {
	ThreadLinkCommandDraft,
	ThreadLinkTransportPort,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
} from "#ui/state/thread-link/transport-port.ts";

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
 * @param reason The server's reason.
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

/** What the double reads of the pane it stands in for: the snapshot it last published. */
interface FakeTransportState {
	readonly snapshot: BrowserSnapshot | null;
}

/**
 * A connected transport state carrying one snapshot.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value: BrowserSnapshot = snapshot()): FakeTransportState {
	return { snapshot: value };
}

/** What the capabilities fixture may override. */
interface CapabilitiesSeed {
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
		/**
		 * Whether the server accepts a command.
		 * @param command The command.
		 * @returns True when the fixture lists it.
		 */
		supportsCommand: (command: WorkbenchCommandName) => supported.has(command),
	});
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
	leased = true;
	epoch = epochA;
	readonly paneId = "pane-a";
	nextResult: WorkbenchCommandResult | null = null;
	nextError: Error | null = null;
	/** Runs after the command is recorded and before its captured target is checked. */
	beforeCommand: (() => void) | null = null;
	/** Held until the test resolves it, so two commands can overlap. */
	gate: Promise<void> | null = null;
	private readonly current: FakeTransportState;
	private readonly caps: WorkbenchTransportCapabilities;

	/**
	 * One double.
	 * @param state The initial state.
	 * @param caps The initial capabilities.
	 */
	constructor(state: FakeTransportState = connected(), caps = capabilities()) {
		this.current = state;
		this.caps = caps;
		// The real transport is a closure object, so callers may pass its members
		// around unbound. Bind here so the double behaves the same way.
		this.capabilities = this.capabilities.bind(this);
		this.captureCommandIntent = this.captureCommandIntent.bind(this);
		this.executeCommand = this.executeCommand.bind(this);
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
}

/**
 * The pane one action is captured against.
 * @param transport The double.
 * @returns The capture.
 */
function pane(transport: FakeTransport): ThreadLinkPaneCapture {
	return { paneId: transport.paneId, transport };
}

/**
 * A pane capture over one double, read once per action.
 * @param transport The double.
 * @returns The capture function.
 */
function capturing(transport: FakeTransport): () => ThreadLinkPaneCapture {
	return () => pane(transport);
}

export {
	FakeTransport,
	FakeTransportError,
	capabilities,
	capturing,
	childA,
	commandA,
	connected,
	epochA,
	epochB,
	executableLink,
	inspectOnlyLink,
	loginA,
	loginB,
	pane,
	snapshot,
	threadA,
	threadB,
	threadC,
	unboundLink,
	type RecordedCommand,
};
