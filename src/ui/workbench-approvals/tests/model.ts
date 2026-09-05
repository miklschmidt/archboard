import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandName,
	BrowserCommandDraft,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
} from "../../workbench-transport/index.js";
import type { WorkbenchApprovalsInput, WorkbenchApprovalsTransport } from "../index.js";

/**
 * Fixtures are built through the closed browser model with a real identity
 * authority, so a fixture the contract would refuse fails here instead of
 * proving something about a shape the host can never publish.
 */
const authorities = createIdentityAuthorities();
const authority = authorities.identity;
export const model = createCodexBrowserModel(authorities);

export const NOW = 1_700_000_000_000;
export const EXPIRY_MS = 90_000;
export const EXPIRES_AT = NOW + EXPIRY_MS;

export const CHILD = model.ChildIdSchema.parse(authority.validator.childId);
export const EPOCH = model.ChildEpochSchema.parse(authority.validator.epoch);
export const THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-a"));
export const OTHER_THREAD = model.ThreadIdSchema.parse(
	authority.decoder.adoptThreadId("workhorse-b"),
);
export const TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-a"));
export const ITEM = model.ItemIdSchema.parse(authority.decoder.adoptItemId("item-a"));
export const APPROVAL_ID = model.ApprovalIdSchema.parse(
	authority.decoder.adoptApprovalId("approval-a"),
);
export const COMMAND_ID = model.BrowserCommandIdSchema.parse(
	authority.issuer.mintBrowserCommandId(),
);
export const PANE = "primary";
export const HASH = `sha256:${"a".repeat(64)}`;
export const OPERATION_OUTCOME_ID = COMMAND_ID;

export function requestId(): BrowserApproval["requestId"] {
	return model.JsonRpcRequestIdSchema.parse(authority.issuer.mintJsonRpcRequestId());
}

export function callId(name: string): BrowserDynamicApproval["identity"]["callId"] {
	return model.DynamicToolCallIdSchema.parse(authority.decoder.adoptDynamicToolCallId(name));
}

export function operationId(): BrowserDynamicApproval["identity"]["operationId"] {
	return model.OperationIdSchema.parse(authorities.operation.issuer.mintOperationId());
}

export function parseApproval(value: Readonly<Record<string, unknown>>): BrowserApproval {
	return model.BrowserApprovalSchema.parse(value);
}

export function parseDynamicApproval(
	value: Readonly<Record<string, unknown>>,
): BrowserDynamicApproval {
	return model.BrowserDynamicApprovalSchema.parse(value);
}

export function approvalKey(approval: BrowserApproval): string {
	return `ordinary:${String(approval.requestId)}`;
}

export function executableLink(): BrowserSnapshot["threadLink"] {
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

export function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
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

export function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 4,
	};
}

export function approvalsInput(
	state: BrowserWorkbenchState,
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

export function commandTarget(): BrowserWorkbenchCommandTarget {
	return {
		commandId: COMMAND_ID,
		paneId: PANE,
		childId: CHILD,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
	};
}

export function commandIntent(): BrowserWorkbenchCommandIntent & {
	readonly authority: BrowserWorkbenchCommandTarget;
} {
	const captured = commandTarget();
	return { capturedThreadLink: captured.capturedThreadLink, authority: captured };
}

export interface RecordedCommand {
	readonly draft: unknown;
	readonly target: BrowserWorkbenchCommandIntent | BrowserWorkbenchCommandTarget | undefined;
}

export interface FakeTransport extends WorkbenchApprovalsTransport {
	readonly sent: RecordedCommand[];
}

export interface FakeTransportOptions {
	readonly canCommand?: boolean;
	readonly unsupported?: readonly BrowserCommandName[];
	readonly target?: BrowserWorkbenchCommandTarget | null;
	readonly result?: Partial<BrowserWorkbenchCommandResult>;
	readonly failure?: unknown;
}

export function fakeTransport(options: FakeTransportOptions = {}): FakeTransport {
	const sent: RecordedCommand[] = [];
	const target =
		options.target === undefined
			? commandIntent()
			: options.target === null
				? null
				: { capturedThreadLink: options.target.capturedThreadLink, authority: options.target };
	const canCommand = options.canCommand ?? true;
	const unsupported = new Set(options.unsupported ?? []);
	const capabilities = {
		connected: true,
		readiness: "thread_capable",
		canReadAccount: true,
		canClaimLease: true,
		canRenewLease: true,
		canReleaseLease: true,
		canCommand,
		canThreadCommands: canCommand,
		canRealtime: canCommand,
		supportsCommand: (name: BrowserCommandName): boolean => canCommand && !unsupported.has(name),
	} satisfies BrowserWorkbenchCapabilities;
	const dispatch = async (
		draft: BrowserCommandDraft,
		commandTargetValue?: BrowserWorkbenchCommandIntent | BrowserWorkbenchCommandTarget,
	): Promise<BrowserWorkbenchCommandResult> => {
		sent.push({ draft, target: commandTargetValue });
		if (options.failure !== undefined) throw options.failure;
		return {
			kind: "command_result",
			commandId: COMMAND_ID,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: snapshot(),
			...options.result,
		};
	};

	const transport: FakeTransport = {
		sent,
		executeCommand: dispatch,
		capabilities: () => capabilities,
		captureCommandIntent: () => {
			if (target === null) throw new Error("A browser command lease is required.");
			return target;
		},
		command: dispatch,
	};
	return transport;
}
