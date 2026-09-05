import { BROWSER_IDLE_SPOKEN_APPROVAL } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandLease,
	BrowserSnapshot,
	BrowserThreadLink,
} from "../../../shared/codex-browser-model/index.js";
import type { LoginId, ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import type {
	BrowserCommandDraft,
	BrowserCommandName,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import { THREAD_LINK_MODULE_COMMANDS } from "../index.js";
import type {
	ThreadLinkInventory,
	ThreadLinkInventoryRecord,
	ThreadLinkPaneCapture,
	ThreadLinkRecoveryIntent,
} from "../index.js";

type ExecutableLink = Extract<BrowserThreadLink, { readonly state: "executable" }>;

export const threadA = "thread-a" as ThreadId;
export const threadB = "thread-b" as ThreadId;
export const loginA = "login-a" as LoginId;

export function executableLink(threadId: ThreadId = threadA): BrowserThreadLink {
	return {
		kind: "thread_link",
		state: "executable",
		childId: "child-a" as ExecutableLink["childId"],
		epoch: "epoch-a" as ExecutableLink["epoch"],
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

export const unboundLink: BrowserThreadLink = {
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

export function inspectOnlyLink(reason: string, threadId: ThreadId = threadA): BrowserThreadLink {
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

export const unknownCandidates: ThreadLinkInventory = {
	kind: "thread_candidates",
	state: "unknown",
	records: [],
	truncated: false,
	reason: null,
};

/** One listed inventory arm, exactly as the workbench snapshot publishes it. */
export function listed(
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

export function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
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

export function connected(value: BrowserSnapshot = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: value.readiness.state,
		connection: "connected",
		snapshot: value,
		sequence: 1,
	};
}

export function capabilities(
	overrides: Partial<Omit<BrowserWorkbenchCapabilities, "supportsCommand">> & {
		readonly supported?: readonly BrowserCommandName[];
	} = {},
): BrowserWorkbenchCapabilities {
	const supported = new Set<BrowserCommandName>(overrides.supported ?? THREAD_LINK_MODULE_COMMANDS);
	return Object.freeze({
		connected: overrides.connected ?? true,
		readiness: overrides.readiness ?? "thread_capable",
		canReadAccount: overrides.canReadAccount ?? true,
		canClaimLease: overrides.canClaimLease ?? true,
		canRenewLease: overrides.canRenewLease ?? true,
		canReleaseLease: overrides.canReleaseLease ?? true,
		canCommand: overrides.canCommand ?? true,
		canThreadCommands: overrides.canThreadCommands ?? true,
		canRealtime: overrides.canRealtime ?? false,
		supportsCommand: (command: BrowserCommandName) => supported.has(command),
	});
}

export function record(
	overrides: Partial<ThreadLinkInventoryRecord> = {},
): ThreadLinkInventoryRecord {
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

export interface RecordedCommand {
	readonly draft: BrowserCommandDraft;
	readonly target: BrowserWorkbenchCommandTarget | undefined;
}

function refuse(code: "link_changed" | "lease_required", message: string): never {
	throw new BrowserWorkbenchTransportError(code, message);
}

/**
 * A transport double that enforces the captured target the way the real one
 * does, so a caller that forgets to pass its captured target is not silently
 * retargeted onto whatever the pane moved to.
 */
export class FakeTransport implements BrowserWorkbenchTransport {
	captureCommandIntent = () => ({
		capturedThreadLink: this.current.snapshot!.threadLink,
		authority: this.leased ? this.captureCommandTarget() : null,
	});
	executeCommand: BrowserWorkbenchTransport["executeCommand"] = (draft, intent) => {
		this.leased = true;
		return this.command(draft, intent?.authority ?? this.captureCommandTarget());
	};
	readonly commands: RecordedCommand[] = [];
	refreshes = 0;
	accountReads = 0;
	leased = true;
	commandId = "command-a" as BrowserCommandLease["commandId"];
	childId = "child-a" as BrowserCommandLease["childId"];
	epoch = "epoch-a" as BrowserCommandLease["epoch"];
	paneId = "pane-a";
	nextResult: BrowserWorkbenchCommandResult | null = null;
	nextError: unknown = null;
	/** Runs after the command is recorded and before its captured target is checked. */
	beforeCommand: (() => void) | null = null;
	/** Held until the test resolves it, so two commands can overlap. */
	gate: Promise<unknown> | null = null;
	private current: BrowserWorkbenchState;
	private caps: BrowserWorkbenchCapabilities;
	private readonly listeners = new Set<() => void>();

	constructor(state: BrowserWorkbenchState = connected(), caps = capabilities()) {
		this.current = state;
		this.caps = caps;
		// The real transport is a closure object, so callers may pass its members
		// around unbound. Bind here so the double behaves the same way.
		this.state = this.state.bind(this);
		this.subscribe = this.subscribe.bind(this);
		this.snapshot = this.snapshot.bind(this);
		this.sequence = this.sequence.bind(this);
		this.lease = this.lease.bind(this);
		this.capabilities = this.capabilities.bind(this);
		this.captureCommandTarget = this.captureCommandTarget.bind(this);
		this.command = this.command.bind(this);
		this.refresh = this.refresh.bind(this);
		this.accountRead = this.accountRead.bind(this);
	}

	publish(state: BrowserWorkbenchState, caps: BrowserWorkbenchCapabilities = this.caps): void {
		this.current = state;
		this.caps = caps;
		for (const listener of Array.from(this.listeners)) listener();
	}

	result(overrides: Partial<BrowserWorkbenchCommandResult> = {}): BrowserWorkbenchCommandResult {
		return {
			kind: "command_result",
			commandId: this.commandId,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.current.snapshot ?? snapshot(),
			...overrides,
		};
	}

	captureCommandTarget(): BrowserWorkbenchCommandTarget {
		if (!this.leased) refuse("lease_required", "A browser command lease is required.");
		const link = this.current.snapshot?.threadLink ?? unboundLink;
		return Object.freeze({
			commandId: this.commandId,
			paneId: this.paneId,
			childId: this.childId,
			epoch: this.epoch,
			capturedThreadLink: Object.freeze({ ...link }),
		});
	}

	async command(
		draft: BrowserCommandDraft,
		target?: BrowserWorkbenchCommandTarget,
	): Promise<BrowserWorkbenchCommandResult> {
		this.commands.push({ draft, target });
		const gate = this.gate;
		this.beforeCommand?.();
		if (gate !== null) await gate;
		if (target !== undefined) {
			const now = this.captureCommandTarget();
			if (
				now.commandId !== target.commandId ||
				now.paneId !== target.paneId ||
				now.childId !== target.childId ||
				now.epoch !== target.epoch ||
				now.capturedThreadLink.state !== target.capturedThreadLink.state ||
				now.capturedThreadLink.threadId !== target.capturedThreadLink.threadId
			)
				refuse("link_changed", "The workbench target changed since this command was captured.");
		}
		if (this.nextError !== null) throw this.nextError;
		return this.nextResult ?? this.result();
	}

	capabilities(): BrowserWorkbenchCapabilities {
		return this.caps;
	}

	state(): BrowserWorkbenchState {
		return this.current;
	}

	snapshot(): BrowserSnapshot | null {
		return this.current.snapshot;
	}

	sequence(): number | null {
		return this.current.sequence;
	}

	lease(): BrowserCommandLease | null {
		return null;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		this.refreshes += 1;
		return { kind: "snapshot", sequence: 1, snapshot: this.current.snapshot ?? snapshot() };
	}

	async accountRead(): Promise<BrowserWorkbenchAccountReadResult> {
		this.accountReads += 1;
		return {
			kind: "account_read",
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.current.snapshot ?? snapshot(),
		};
	}

	async attach(): Promise<BrowserWorkbenchState> {
		return this.current;
	}

	async detach(): Promise<void> {}
	async close(): Promise<void> {}
	async dispose(): Promise<void> {}

	async setMediaReady(): Promise<BrowserWorkbenchSnapshotMessage> {
		return this.refresh();
	}

	async claimLease(): Promise<BrowserCommandLease> {
		throw new Error("The thread-link module never claims a lease.");
	}

	async renewLease(): Promise<BrowserCommandLease> {
		throw new Error("The thread-link module never renews a lease.");
	}

	async releaseLease(): Promise<BrowserCommandLease | null> {
		throw new Error("The thread-link module never releases a lease.");
	}
}

export function pane(
	transport: FakeTransport,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [],
): ThreadLinkPaneCapture {
	return { paneId: transport.paneId, transport, hostRecoveryIntents };
}

export const epochA = "epoch-a" as BrowserCommandLease["epoch"];
export const epochB = "epoch-b" as BrowserCommandLease["epoch"];
export const childA = "child-a" as BrowserCommandLease["childId"];
export const commandA = "command-a" as BrowserCommandLease["commandId"];
