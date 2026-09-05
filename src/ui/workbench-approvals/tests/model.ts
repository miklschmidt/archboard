// Fixtures are built through the closed browser model with a real identity
// authority, so a fixture the contract would refuse fails here instead of
// proving something about a shape the host can never publish.

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@/shared/codex-browser-model";
import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type { WorkbenchApprovalsInput } from "@/ui/workbench-approvals/contracts";
import type {
	ApprovalCommandDraft,
	WorkbenchApprovalsTransportPort,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportState,
} from "@/ui/workbench-approvals/transport-port";

const authorities = createIdentityAuthorities();
const authority = authorities.identity;
const model = createCodexBrowserModel(authorities);

const NOW = 1_700_000_000_000;
const EXPIRY_MS = 90_000;
const EXPIRES_AT = NOW + EXPIRY_MS;

const CHILD = model.ChildIdSchema.parse(authority.validator.childId);
const EPOCH = model.ChildEpochSchema.parse(authority.validator.epoch);
const THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-a"));
const OTHER_THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-b"));
const TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-a"));
const ITEM = model.ItemIdSchema.parse(authority.decoder.adoptItemId("item-a"));
const APPROVAL_ID = model.ApprovalIdSchema.parse(authority.decoder.adoptApprovalId("approval-a"));
const COMMAND_ID = model.BrowserCommandIdSchema.parse(authority.issuer.mintBrowserCommandId());
const PANE = "primary";
const HASH = `sha256:${"a".repeat(64)}`;

/**
 * A fresh request id.
 * @returns The id.
 */
function requestId(): BrowserApproval["requestId"] {
	return model.JsonRpcRequestIdSchema.parse(authority.issuer.mintJsonRpcRequestId());
}

/**
 * A dynamic tool call id.
 * @param name The fixture name.
 * @returns The id.
 */
function callId(name: string): BrowserDynamicApproval["identity"]["callId"] {
	return model.DynamicToolCallIdSchema.parse(authority.decoder.adoptDynamicToolCallId(name));
}

/**
 * A fresh operation id.
 * @returns The id.
 */
function operationId(): BrowserDynamicApproval["identity"]["operationId"] {
	return model.OperationIdSchema.parse(authorities.operation.issuer.mintOperationId());
}

/**
 * One approval through the closed model.
 * @param value The raw fixture.
 * @returns The approval.
 */
function parseApproval(value: Readonly<Record<string, unknown>>): BrowserApproval {
	return model.BrowserApprovalSchema.parse(value);
}

/**
 * One dynamic approval through the closed model.
 * @param value The raw fixture.
 * @returns The approval.
 */
function parseDynamicApproval(value: Readonly<Record<string, unknown>>): BrowserDynamicApproval {
	return model.BrowserDynamicApprovalSchema.parse(value);
}

/**
 * Whether the closed model accepts an approval fixture.
 * @param value The raw fixture.
 * @returns True when it parses.
 */
function approvalParses(value: Readonly<Record<string, unknown>>): boolean {
	return model.BrowserApprovalSchema.safeParse(value).success;
}

/**
 * The executable link to the workhorse.
 * @returns The link.
 */
function executableLink(): BrowserSnapshot["threadLink"] {
	return {
		kind: "thread_link",
		state: "executable",
		childId: CHILD,
		epoch: EPOCH,
		threadId: THREAD,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

/**
 * One published snapshot.
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
		threadLink: executableLink(),
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: { kind: "timeline", threadId: THREAD, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("coordinator-a")),
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
			reason: "Voice is unavailable.",
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		...overrides,
	};
}

/**
 * A connected, thread-capable transport state.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value = snapshot()): WorkbenchTransportState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 4,
	};
}

/**
 * A projection input.
 * @param state The transport state.
 * @param overrides Fields that differ from a fully capable input.
 * @returns The input.
 */
function approvalsInput(
	state: WorkbenchTransportState,
	overrides: Partial<Omit<WorkbenchApprovalsInput, "state">> = {},
): WorkbenchApprovalsInput {
	return {
		state,
		nowMs: NOW,
		canCommand: true,
		canRespondOrdinary: true,
		canRespondDynamic: true,
		...overrides,
	};
}

/**
 * The exact lease authority.
 * @returns The target.
 */
function commandTarget(): WorkbenchCommandTarget {
	return {
		commandId: COMMAND_ID,
		paneId: PANE,
		childId: CHILD,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
	};
}

/**
 * A captured intent with authority.
 * @returns The intent.
 */
function commandIntent(): WorkbenchCommandIntent & { readonly authority: WorkbenchCommandTarget } {
	const captured = commandTarget();
	return { capturedThreadLink: captured.capturedThreadLink, authority: captured };
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

/** One recorded command. */
interface RecordedCommand {
	readonly draft: ApprovalCommandDraft;
	readonly target: WorkbenchCommandIntent | WorkbenchCommandTarget | undefined;
}

/** How the double behaves. */
interface FakeTransportOptions {
	readonly state?: WorkbenchTransportState;
	readonly canCommand?: boolean;
	readonly unsupported?: readonly WorkbenchCommandName[];
	/** Null makes capture refuse, as a transport without a lease does. */
	readonly target?: WorkbenchCommandTarget | null;
	readonly result?: Partial<WorkbenchCommandResult>;
	readonly failure?: Error;
	/** Held until the test resolves it, so a decision stays on the wire. */
	readonly gate?: Promise<void>;
}

/** A transport double for the approvals' port. */
class FakeApprovalsTransport implements WorkbenchApprovalsTransportPort {
	readonly sent: RecordedCommand[] = [];
	private readonly options: FakeTransportOptions;
	private readonly current: WorkbenchTransportState;
	private readonly caps: WorkbenchTransportCapabilities;

	/**
	 * One double.
	 * @param options How it behaves.
	 */
	constructor(options: FakeTransportOptions = {}) {
		this.options = options;
		this.current = options.state ?? connected();
		const canCommand = options.canCommand ?? true;
		const unsupported = new Set(options.unsupported ?? []);
		this.caps = {
			canCommand,
			/**
			 * Whether the host accepts a command.
			 * @param name The command.
			 * @returns True while commanding and not refused by the fixture.
			 */
			supportsCommand: (name) => canCommand && !unsupported.has(name),
		};
		this.state = this.state.bind(this);
		this.capabilities = this.capabilities.bind(this);
		this.captureCommandIntent = this.captureCommandIntent.bind(this);
		this.executeCommand = this.executeCommand.bind(this);
		this.command = this.command.bind(this);
	}

	/**
	 * The current state.
	 * @returns The state.
	 */
	state(): WorkbenchTransportState {
		return this.current;
	}

	/**
	 * The capabilities.
	 * @returns The capabilities.
	 */
	capabilities(): WorkbenchTransportCapabilities {
		return this.caps;
	}

	/**
	 * The captured intent, or a refusal when the fixture holds no lease.
	 * @returns The intent.
	 */
	captureCommandIntent(): WorkbenchCommandIntent {
		if (this.options.target === null) {
			throw new Error("A browser command lease is required.");
		}
		if (this.options.target === undefined) {
			return commandIntent();
		}
		return {
			capturedThreadLink: this.options.target.capturedThreadLink,
			authority: this.options.target,
		};
	}

	/**
	 * Record one command and answer it.
	 * @param draft The draft.
	 * @param target The captured intent or target.
	 * @returns The configured result, or a delivered one.
	 */
	async executeCommand(
		draft: ApprovalCommandDraft,
		target?: WorkbenchCommandIntent | WorkbenchCommandTarget,
	): Promise<WorkbenchCommandResult> {
		this.sent.push({ draft, target });
		if (this.options.gate !== undefined) {
			await this.options.gate;
		}
		if (this.options.failure !== undefined) {
			throw this.options.failure;
		}
		return {
			kind: "command_result",
			commandId: COMMAND_ID,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: snapshot(),
			...this.options.result,
		};
	}

	/**
	 * Record one request-bound command and answer it.
	 * @param draft The draft.
	 * @param target The exact lease authority.
	 * @returns The configured result, or a delivered one.
	 */
	command(
		draft: ApprovalCommandDraft,
		target?: WorkbenchCommandTarget,
	): Promise<WorkbenchCommandResult> {
		return this.executeCommand(draft, target);
	}
}

export {
	APPROVAL_ID,
	CHILD,
	COMMAND_ID,
	EPOCH,
	EXPIRES_AT,
	EXPIRY_MS,
	FakeApprovalsTransport,
	FakeTransportError,
	HASH,
	ITEM,
	NOW,
	OTHER_THREAD,
	PANE,
	THREAD,
	TURN,
	approvalParses,
	approvalsInput,
	callId,
	commandIntent,
	commandTarget,
	connected,
	executableLink,
	operationId,
	parseApproval,
	parseDynamicApproval,
	requestId,
	snapshot,
	type FakeTransportOptions,
	type RecordedCommand,
};
